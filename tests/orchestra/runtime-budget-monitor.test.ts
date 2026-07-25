import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeBudgetMonitor,
  applyRuntimeBudgetStopToResult,
  readRuntimeBudgetExhaustion,
  readRuntimeBudgetLandingRequest,
  readRuntimeBudgetObservations,
  readRuntimeBudgetStop,
  readRuntimeBudgetUsage,
  resolveRuntimeBudgetLedgerDir,
  resolveHostExecutionBudget,
} from '../../src/orchestra/runtime-budget-monitor.js';
import type { TaskResult } from '../../src/core/task-types.js';

function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'deckent-budget-monitor-'));
  mkdirSync(join(path, '.tasks'));
  process.env.DECKENT_HOME = join(path, 'host-state');
  return path;
}

describe('RuntimeBudgetMonitor', () => {
  it('persists an immutable exact-delta chain and marks repeated cache-read observations', () => {
    const projectRoot = root();
    const attemptId = '019b8cf0-3c16-7f53-8f1c-965f97016720';
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'observation-chain',
      attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 1_000 },
      now: () => '2026-07-24T15:00:00.000Z',
      onStop: vi.fn(),
    });
    const first = {
      type: 'text' as const,
      content: {
        type: 'assistant',
        message: {
          id: 'observation-1',
          usage: { input_tokens: 2, cache_read_input_tokens: 100 },
          content: [],
        },
      },
    };
    monitor.observe(first, 10);
    monitor.observe(first, 11);
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'observation-2',
          usage: { output_tokens: 3, cache_read_input_tokens: 200 },
          content: [],
        },
      },
    }, 12);
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'observation-3',
          usage: { input_tokens: 1 },
          content: [],
        },
      },
    }, 13);

    const observations = readRuntimeBudgetObservations(
      projectRoot,
      'observation-chain',
      attemptId,
    );
    expect(observations).toHaveLength(3);
    expect(readRuntimeBudgetObservations(projectRoot, 'observation-chain'))
      .toEqual(observations);
    expect(observations[0]).toMatchObject({
      observationIndex: 1,
      providerSequence: 10,
      previousObservationDigest: null,
      appliedDelta: { inputTokens: 2, cacheReadTokens: 100 },
      countersAfter: { cacheReadTokens: 100 },
      consecutiveCacheReadEvents: 1,
      repeatedReadDetected: false,
    });
    expect(observations[1]).toMatchObject({
      observationIndex: 2,
      providerSequence: 12,
      previousObservationDigest: observations[0]!.observationDigest,
      appliedDelta: { outputTokens: 3, cacheReadTokens: 200 },
      countersAfter: { cacheReadTokens: 300 },
      consecutiveCacheReadEvents: 2,
      repeatedReadDetected: true,
    });
    expect(observations[2]).toMatchObject({
      observationIndex: 3,
      providerSequence: 13,
      previousObservationDigest: observations[1]!.observationDigest,
      appliedDelta: { inputTokens: 1, cacheReadTokens: 0 },
      consecutiveCacheReadEvents: 0,
      repeatedReadDetected: false,
    });
    expect(observations.every(item => /^[a-f0-9]{64}$/.test(item.observationDigest)))
      .toBe(true);
  });

  it('continues the observation chain after exact-attempt restart without duplicating replay', () => {
    const projectRoot = root();
    const attemptId = '019b8cf0-3c16-7f53-8f1c-965f97016721';
    const firstEvent = {
      type: 'text' as const,
      content: {
        type: 'assistant',
        message: {
          id: 'restart-observation-1',
          usage: { cache_read_input_tokens: 4 },
          content: [],
        },
      },
    };
    const first = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'observation-restart',
      attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 20 },
      onStop: vi.fn(),
    });
    first.observe(firstEvent);

    const resumed = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'observation-restart',
      attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 20 },
      onStop: vi.fn(),
    });
    resumed.observe(firstEvent);
    resumed.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'restart-observation-2',
          usage: { cache_read_input_tokens: 5 },
          content: [],
        },
      },
    });

    const observations = readRuntimeBudgetObservations(
      projectRoot,
      'observation-restart',
      attemptId,
    );
    expect(observations).toHaveLength(2);
    expect(observations[1]).toMatchObject({
      observationIndex: 2,
      previousObservationDigest: observations[0]!.observationDigest,
      appliedDelta: { cacheReadTokens: 5 },
      repeatedReadDetected: true,
    });
  });

  it('recovers exact counters and dedupe state when the observation journal wins the crash window', () => {
    const projectRoot = root();
    const attemptId = '019b8cf0-3c16-7f53-8f1c-965f97016723';
    const firstEvent = {
      type: 'text' as const,
      content: {
        type: 'assistant',
        message: {
          id: 'journal-ahead-1',
          usage: { cache_read_input_tokens: 6 },
          content: [],
        },
      },
    };
    const first = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'journal-ahead',
      attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: vi.fn(),
    });
    first.observe(firstEvent);

    const ledger = resolveRuntimeBudgetLedgerDir(projectRoot);
    const mutableFiles = readdirSync(ledger, { recursive: true, encoding: 'utf-8' })
      .filter(path => path.endsWith('usage.budget-usage.json') || path.endsWith('current.json'));
    expect(mutableFiles).toHaveLength(2);
    for (const file of mutableFiles) unlinkSync(join(ledger, file));

    const resumedStop = vi.fn();
    const resumed = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'journal-ahead',
      attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: resumedStop,
    });
    expect(resumed.observe(firstEvent)).toMatchObject({
      state: 'within-budget',
      counters: { cacheReadTokens: 6 },
    });
    expect(resumed.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'journal-ahead-2',
          usage: { cache_read_input_tokens: 5 },
          content: [],
        },
      },
    })).toMatchObject({
      state: 'exceeded',
      counters: { cacheReadTokens: 11 },
    });
    expect(resumedStop).toHaveBeenCalledOnce();
    expect(readRuntimeBudgetObservations(
      projectRoot,
      'journal-ahead',
      attemptId,
    )).toHaveLength(2);
  });

  it('rejects a corrupt or non-contiguous observation chain', () => {
    const projectRoot = root();
    const attemptId = '019b8cf0-3c16-7f53-8f1c-965f97016722';
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'observation-corrupt',
      attemptId,
      backend: 'docker',
      budget: { maxInputTokens: 100 },
      onStop: vi.fn(),
    });
    for (let index = 1; index <= 3; index += 1) {
      monitor.observe({
        type: 'text',
        content: {
          type: 'assistant',
          message: {
            id: `corrupt-observation-${index}`,
            usage: { input_tokens: index },
            content: [],
          },
        },
      });
    }
    const ledger = resolveRuntimeBudgetLedgerDir(projectRoot);
    const observationFiles = readdirSync(ledger, { recursive: true, encoding: 'utf-8' })
      .filter(path => path.endsWith('.budget-observation.json'))
      .sort();
    expect(observationFiles).toHaveLength(3);

    const secondPath = join(ledger, observationFiles[1]!);
    const second = JSON.parse(readFileSync(secondPath, 'utf-8'));
    writeFileSync(secondPath, JSON.stringify({
      ...second,
      repeatedReadDetected: true,
    }));
    expect(() => readRuntimeBudgetObservations(
      projectRoot,
      'observation-corrupt',
      attemptId,
    )).toThrow('invalid at index 2');

    writeFileSync(secondPath, JSON.stringify(second));
    unlinkSync(secondPath);
    expect(() => readRuntimeBudgetObservations(
      projectRoot,
      'observation-corrupt',
      attemptId,
    )).toThrow('non-contiguous at index 2');
  });

  it('binds usage and landing evidence to the host settlement attempt id', () => {
    const projectRoot = root();
    const attemptId = '019b8cf0-3c16-7f53-8f1c-965f9701672a';
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'attempt-bound',
      attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 100 },
      landingPolicy: { reserve_ratio: 0.25 },
      onLandingRequested: vi.fn(),
      onStop: vi.fn(),
    });

    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'attempt-bound-event',
          usage: { cache_read_input_tokens: 75 },
          content: [],
        },
      },
    });

    expect(readRuntimeBudgetUsage(projectRoot, 'attempt-bound')?.attemptId).toBe(attemptId);
    expect(readRuntimeBudgetLandingRequest(projectRoot, 'attempt-bound')?.attemptId).toBe(attemptId);
  });

  it('persists landing-requested evidence without invoking hard containment', () => {
    const projectRoot = root();
    const onStop = vi.fn();
    const onLandingRequested = vi.fn((evidence) => {
      expect(readRuntimeBudgetLandingRequest(projectRoot, 'landing')).toEqual(evidence);
    });
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'landing',
      backend: 'docker',
      budget: { maxCacheReadTokens: 1_000 },
      landingPolicy: { reserve_ratio: 0.25 },
      now: () => '2026-07-23T18:00:00.000Z',
      onLandingRequested,
      onStop,
    });
    const landingEvent = {
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'landing-msg',
          usage: { cache_read_input_tokens: 750 },
          content: [],
        },
      },
    } as const;
    const decision = monitor.observe(landingEvent);
    expect(decision.state).toBe('landing-requested');
    monitor.observe(landingEvent);
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'landing-below-hard',
          usage: { cache_read_input_tokens: 100 },
          content: [],
        },
      },
    });
    expect(onLandingRequested).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
    expect(readRuntimeBudgetLandingRequest(projectRoot, 'landing')).toMatchObject({
      version: 2,
      state: 'landing-requested',
      requestedAt: '2026-07-23T18:00:00.000Z',
      providerSequence: {
        firstSequence: 1,
        lastSequence: 1,
        eventCount: 1,
      },
      decision: {
        state: 'landing-requested',
        counters: { cacheReadTokens: 750 },
      },
    });
    expect(readRuntimeBudgetUsage(projectRoot, 'landing')).toMatchObject({
      terminal: false,
      decision: {
        state: 'landing-requested',
        consecutiveCacheReadEvents: 2,
        appliedDelta: { cacheReadTokens: 100 },
      },
      guardState: {
        version: 2,
        consecutiveCacheReadEvents: 2,
      },
    });

    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'landing-above-hard',
          usage: { cache_read_input_tokens: 200 },
          content: [],
        },
      },
    });
    expect(onLandingRequested).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('rejects a corrupt durable landing-request marker', () => {
    const projectRoot = root();
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'landing-corrupt',
      backend: 'docker',
      budget: { maxCacheReadTokens: 100 },
      landingPolicy: { reserve_ratio: 0.25 },
      onLandingRequested: vi.fn(),
      onStop: vi.fn(),
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'landing-corrupt-event',
          usage: { cache_read_input_tokens: 75 },
          content: [],
        },
      },
    });
    const ledger = resolveRuntimeBudgetLedgerDir(projectRoot);
    const landingRelative = readdirSync(ledger, { recursive: true, encoding: 'utf-8' })
      .find(path => path.endsWith('landing.budget-landing.json'));
    expect(landingRelative).toBeDefined();
    writeFileSync(join(ledger, landingRelative!), JSON.stringify({
      ...readRuntimeBudgetLandingRequest(projectRoot, 'landing-corrupt'),
      state: 'exceeded',
    }));
    expect(readRuntimeBudgetLandingRequest(projectRoot, 'landing-corrupt')).toBeNull();
  });

  it('uses the landed reserve for continuation without requesting a second soft landing', () => {
    const projectRoot = root();
    const onLandingRequested = vi.fn();
    const onStop = vi.fn();
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'continuation-reserve',
      backend: 'docker',
      budget: { maxCacheReadTokens: 100 },
      landingPolicy: { reserve_ratio: 0.25 },
      landingAlreadySatisfied: true,
      onLandingRequested,
      onStop,
    });
    expect(monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'continuation-at-soft-threshold',
          usage: { cache_read_input_tokens: 75 },
          content: [],
        },
      },
    }).state).toBe('within-budget');
    expect(onLandingRequested).not.toHaveBeenCalled();

    expect(monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'continuation-over-hard',
          usage: { cache_read_input_tokens: 26 },
          content: [],
        },
      },
    }).state).toBe('exceeded');
    expect(onLandingRequested).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('does not apply parent counters twice to a checkpoint-subtracted continuation budget', () => {
    const projectRoot = root();
    const parentAttemptId = '019b8cf0-3c16-7f53-8f1c-965f9701672a';
    const continuationAttemptId = '019b8cf0-3c16-7f53-8f1c-965f9701672b';
    const parent = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'continuation-counter-scope',
      attemptId: parentAttemptId,
      backend: 'docker',
      budget: { maxTurns: 4 },
      onStop: vi.fn(),
    });
    for (let turn = 1; turn <= 3; turn += 1) {
      expect(parent.observe({
        type: 'text',
        content: {
          type: 'assistant',
          message: { id: `parent-turn-${turn}`, usage: { input_tokens: 1 }, content: [] },
        },
      }).state).toBe('within-budget');
    }

    const continuationStop = vi.fn();
    const continuation = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'continuation-counter-scope',
      attemptId: continuationAttemptId,
      backend: 'docker',
      budget: { maxTurns: 1 },
      landingAlreadySatisfied: true,
      counterScope: 'attempt',
      onStop: continuationStop,
    });
    expect(continuation.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: { id: 'continuation-turn-1', usage: { input_tokens: 1 }, content: [] },
      },
    })).toMatchObject({
      state: 'within-budget',
      counters: { turns: 1 },
    });
    expect(continuationStop).not.toHaveBeenCalled();

    expect(continuation.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: { id: 'continuation-turn-2', usage: { input_tokens: 1 }, content: [] },
      },
    })).toMatchObject({
      state: 'exceeded',
      counters: { turns: 2 },
    });
    expect(continuationStop).toHaveBeenCalledOnce();
  });

  it('restores counters when the same continuation attempt restarts', () => {
    const projectRoot = root();
    const attemptId = '019b8cf0-3c16-7f53-8f1c-965f9701672c';
    const first = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'continuation-restart',
      attemptId,
      backend: 'docker',
      budget: { maxTurns: 1 },
      landingAlreadySatisfied: true,
      counterScope: 'attempt',
      onStop: vi.fn(),
    });
    const firstEvent = {
      type: 'text' as const,
      content: {
        type: 'assistant' as const,
        message: { id: 'continuation-restart-turn-1', usage: { input_tokens: 1 }, content: [] },
      },
    };
    expect(first.observe(firstEvent)).toMatchObject({
      state: 'within-budget',
      counters: { turns: 1 },
    });

    const resumedStop = vi.fn();
    const resumed = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'continuation-restart',
      attemptId,
      backend: 'docker',
      budget: { maxTurns: 1 },
      landingAlreadySatisfied: true,
      counterScope: 'attempt',
      onStop: resumedStop,
    });
    expect(resumed.observe(firstEvent)).toMatchObject({
      state: 'within-budget',
      counters: { turns: 1 },
    });
    expect(resumed.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: { id: 'continuation-restart-turn-2', usage: { input_tokens: 1 }, content: [] },
      },
    })).toMatchObject({
      state: 'exceeded',
      counters: { turns: 2 },
    });
    expect(resumedStop).toHaveBeenCalledOnce();
  });

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

  it('accepts only the explicit host budget and ignores worker-writable Task JSON', () => {
    const projectRoot = root();
    const taskPath = join(projectRoot, '.tasks', 'task-t2.json');
    writeFileSync(taskPath, JSON.stringify({ id: 't2', budget: { maxTurns: 4, maxCacheReadTokens: 5_000_000 } }));
    expect(resolveHostExecutionBudget(projectRoot, 't2')).toBeUndefined();
    expect(resolveHostExecutionBudget(projectRoot, 't2', { maxTurns: 2 })).toEqual({ maxTurns: 2 });
    writeFileSync(taskPath, JSON.stringify({ id: 't2', budget: { maxTurns: -1 } }));
    expect(resolveHostExecutionBudget(projectRoot, 't2')).toBeUndefined();
    expect(() => resolveHostExecutionBudget(projectRoot, 't2', { maxTurns: -1 }))
      .toThrow('non-negative finite number');
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
    expect(resolveHostExecutionBudget(projectRoot, 'exhausted')).toBeUndefined();
    expect(() => resolveHostExecutionBudget(projectRoot, 'exhausted', budget))
      .toThrow('already exhausted');
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
    expect(() => resolveHostExecutionBudget(projectRoot, 'marker-loss', budget))
      .toThrow('already exhausted');

    const result: TaskResult = {
      taskId: 'marker-loss', workerId: 'worker', filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: '',
    };
    expect(applyRuntimeBudgetStopToResult(projectRoot, 'marker-loss', result)?.evidenceSource)
      .toBe('terminal-usage-fallback');
    expect(result.selfAssessment).toBe('NO_GO');
  });

  it('projects exact later terminal counters without mutating stop-marker truth', () => {
    const projectRoot = root();
    const monitor = new RuntimeBudgetMonitor({
      projectRoot,
      taskId: 'terminal-after-stop',
      backend: 'docker',
      budget: { maxCacheReadTokens: 10 },
      onStop: vi.fn(),
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'hard-stop-event',
          usage: { output_tokens: 2, cache_read_input_tokens: 11 },
          content: [],
        },
      },
    });
    monitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'provider-exit-event',
          usage: { output_tokens: 5, cache_read_input_tokens: 7 },
          content: [],
        },
      },
    });
    monitor.settle();

    expect(readRuntimeBudgetStop(projectRoot, 'terminal-after-stop')).toMatchObject({
      decision: { counters: { outputTokens: 2, cacheReadTokens: 11 } },
    });
    expect(readRuntimeBudgetUsage(projectRoot, 'terminal-after-stop')).toMatchObject({
      terminal: true,
      decision: { counters: { outputTokens: 7, cacheReadTokens: 18 } },
    });
    expect(readRuntimeBudgetExhaustion(projectRoot, 'terminal-after-stop')).toMatchObject({
      evidenceSource: 'stop-marker',
      counterEvidenceSource: 'terminal-usage',
      decision: {
        reasons: ['cache-read token budget exceeded (11 > 10)'],
        counters: { outputTokens: 7, cacheReadTokens: 18 },
      },
    });
  });
});
