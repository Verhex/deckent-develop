import { existsSync, mkdtempSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeBudgetMonitor,
  applyRuntimeBudgetStopToResult,
  readRuntimeBudgetExhaustion,
  readRuntimeBudgetStop,
  readRuntimeBudgetUsage,
  resolveRuntimeBudgetLedgerDir,
  resolveTaskExecutionBudget,
} from '../../src/orchestra/runtime-budget-monitor.js';
import type { TaskResult } from '../../src/core/task-types.js';

function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'deckent-budget-monitor-'));
  mkdirSync(join(path, '.tasks'));
  process.env.DECKENT_HOME = join(path, 'host-state');
  return path;
}

describe('RuntimeBudgetMonitor', () => {
  it('persists evidence before exactly-once stop and vetoes a DONE result', () => {
    const projectRoot = root();
    const onStop = vi.fn((evidence) => {
      expect(readRuntimeBudgetStop(projectRoot, 't1')).toEqual(evidence);
    });
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 't1',
      backend: 'subprocess',
      budget: { maxCacheReadTokens: 10 },
      now: () => '2026-07-20T12:00:00.000Z',
      onStop,
    });
    const event = {
      type: 'text' as const,
      content: {
        type: 'assistant',
        message: { id: 'msg-1', usage: { cache_read_input_tokens: 11 }, content: [] },
      },
    };
    monitor.observe(event);
    monitor.observe(event);
    expect(onStop).toHaveBeenCalledTimes(1);

    const result: TaskResult = {
      taskId: 't1', workerId: 'w-t1', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: 'worker claimed success',
    };
    expect(applyRuntimeBudgetStopToResult(projectRoot, 't1', result)?.state).toBe('exceeded');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.testsPassed).toBe(false);
    expect(result.notes).toContain('cache-read token budget exceeded');
    expect(readRuntimeBudgetStop(projectRoot, 't1')?.version).toBe(2);
    expect(resolveRuntimeBudgetLedgerDir(projectRoot)).toContain(join(projectRoot, 'host-state'));
    expect(existsSync(join(projectRoot, '.tasks', 'task-t1.budget-stop.json'))).toBe(false);
  });

  it('resolves and validates a persisted task budget at the execution boundary', () => {
    const projectRoot = root();
    const taskPath = join(projectRoot, '.tasks', 'task-t2.json');
    writeFileSync(taskPath, JSON.stringify({ id: 't2', budget: { maxTurns: 4, maxCacheReadTokens: 5_000_000 } }));
    expect(resolveTaskExecutionBudget(projectRoot, 't2')).toEqual({ maxTurns: 4, maxCacheReadTokens: 5_000_000 });
    writeFileSync(taskPath, JSON.stringify({ id: 't2', budget: { maxTurns: -1 } }));
    expect(() => resolveTaskExecutionBudget(projectRoot, 't2')).toThrow('non-negative finite number');
  });

  it('ignores worker-writable forged evidence under .tasks', () => {
    const projectRoot = root();
    writeFileSync(
      join(projectRoot, '.tasks', 'task-forged.budget-stop.json'),
      JSON.stringify({ version: 2, taskId: 'forged', state: 'exceeded' }),
    );
    const result: TaskResult = {
      taskId: 'forged', workerId: 'w-forged', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: '',
    };
    expect(applyRuntimeBudgetStopToResult(projectRoot, 'forged', result)).toBeNull();
    expect(result.selfAssessment).toBe('DONE');
  });

  it('persists a terminal within-budget usage summary on settle', () => {
    const projectRoot = root();
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 't3',
      backend: 'docker',
      budget: { maxTurns: 5, maxContextTokens: 1_000 },
      onStop: vi.fn(),
    });
    const repeated = {
      type: 'text',
      content: {
        type: 'assistant' as const,
        message: {
          id: 'msg-1',
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 3,
          },
          content: [],
        },
      },
    } as const;
    monitor.observe(repeated);
    monitor.observe(repeated);
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'msg-2',
          usage: {
            input_tokens: 5,
            output_tokens: 4,
            cache_read_input_tokens: 7,
            cache_creation_input_tokens: 6,
          },
          content: [],
        },
      },
    });
    expect(readRuntimeBudgetUsage(projectRoot, 't3')?.terminal).toBe(false);
    monitor.settle();
    expect(readRuntimeBudgetUsage(projectRoot, 't3')).toMatchObject({
      terminal: true,
      decision: {
        state: 'within-budget',
        counters: {
          turns: 2,
          inputTokens: 15,
          outputTokens: 6,
          cacheReadTokens: 27,
          cacheCreationTokens: 9,
          totalTokens: 57,
          maxContextTokens: 33,
        },
      },
    });
  });

  it('keeps partial usage terminally unmeasurable after observer loss', () => {
    const projectRoot = root();
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'observer-loss',
      backend: 'docker',
      budget: { maxTurns: 5 },
      onStop: vi.fn(),
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: { id: 'msg-partial', usage: { input_tokens: 7, output_tokens: 3 }, content: [] },
      },
    });

    monitor.failObservation(new Error('docker log stream disconnected'));
    monitor.settle();

    expect(readRuntimeBudgetUsage(projectRoot, 'observer-loss')).toMatchObject({
      terminal: true,
      decision: {
        state: 'unmeasurable',
        reasons: [expect.stringContaining('docker log stream disconnected')],
        counters: { inputTokens: 7, outputTokens: 3 },
      },
    });
  });

  it('restores non-terminal counters and dedupe keys after coordinator restart', () => {
    const projectRoot = root();
    const firstStop = vi.fn();
    const first = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'restart',
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: firstStop,
    });
    const firstEvent = {
      type: 'text' as const,
      content: { type: 'assistant', message: { id: 'msg-1', usage: { cache_read_input_tokens: 6 }, content: [] } },
    };
    first.observe(firstEvent);

    const resumedStop = vi.fn();
    const resumed = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'restart',
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: resumedStop,
    });
    resumed.observe(firstEvent);
    resumed.observe({
      type: 'text',
      content: { type: 'assistant', message: { id: 'msg-2', usage: { cache_read_input_tokens: 5 }, content: [] } },
    });
    expect(firstStop).not.toHaveBeenCalled();
    expect(resumedStop).toHaveBeenCalledOnce();
    expect(readRuntimeBudgetStop(projectRoot, 'restart')?.decision.counters.cacheReadTokens).toBe(11);
  });

  it('blocks a same-budget retry after a terminal exceeded attempt', () => {
    const projectRoot = root();
    const taskPath = join(projectRoot, '.tasks', 'task-exhausted.json');
    const budget = { maxCacheReadTokens: 10 };
    writeFileSync(taskPath, JSON.stringify({ id: 'exhausted', budget }));
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'exhausted',
      backend: 'docker',
      budget,
      onStop: vi.fn(),
    });
    monitor.observe({
      type: 'text',
      content: { type: 'assistant', message: { id: 'msg-1', usage: { cache_read_input_tokens: 11 }, content: [] } },
    });
    expect(() => resolveTaskExecutionBudget(projectRoot, 'exhausted')).toThrow('already exhausted');
  });

  it('uses terminal exceeded usage when the stop marker is missing', () => {
    const projectRoot = root();
    const budget = { maxCacheReadTokens: 10 };
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'marker-loss',
      backend: 'docker',
      budget,
      onStop: vi.fn(),
    });
    monitor.observe({
      type: 'text',
      content: { type: 'assistant', message: { id: 'msg-1', usage: { cache_read_input_tokens: 11 }, content: [] } },
    });

    const ledger = resolveRuntimeBudgetLedgerDir(projectRoot);
    const stopRelative = readdirSync(ledger, { recursive: true, encoding: 'utf-8' })
      .find(path => path.endsWith('stop.budget-stop.json'));
    expect(stopRelative).toBeDefined();
    unlinkSync(join(ledger, stopRelative!));
    expect(readRuntimeBudgetStop(projectRoot, 'marker-loss')).toBeNull();
    expect(readRuntimeBudgetExhaustion(projectRoot, 'marker-loss')?.evidenceSource)
      .toBe('terminal-usage-fallback');
    expect(() => resolveTaskExecutionBudget(projectRoot, 'marker-loss', budget))
      .toThrow('already exhausted');

    const result: TaskResult = {
      taskId: 'marker-loss', workerId: 'worker', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: '',
    };
    expect(applyRuntimeBudgetStopToResult(projectRoot, 'marker-loss', result)?.evidenceSource)
      .toBe('terminal-usage-fallback');
    expect(result.selfAssessment).toBe('NO_GO');
  });
});
