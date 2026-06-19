/**
 * DATA-W1 — outputTokens NO_GO/timeout-branch fill
 *
 * Verifies that synthetic NO_GO results created on worker timeout carry a
 * populated `tokenUsage` field so `aggregateTokenUsage` counts failed-attempt
 * cost instead of silently skipping it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import type { Task, Sprint } from '../../src/core/types.js';
import { TaskStatus, SprintPhase, SprintStatus } from '../../src/core/types.js';
import { aggregateTokenUsage } from '../../src/orchestra/result-evaluator.js';

vi.mock('../../src/orchestra/tmux.js', () => ({
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
}));

vi.mock('../../src/orchestra/result-watcher.js', () => ({
  createResultWatcher: vi.fn(() => ({
    waitForChange: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/orchestra/task-builder.js', () => ({
  buildWorkerPrompt: vi.fn(() => 'mock prompt'),
}));

import { waitForResults, estimateTokenUsage } from '../../src/orchestra/result-collector.js';
import type { TaskResult } from '../../src/core/types.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `deckent-data-w1-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Test task ${id}`,
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    provider: 'claude',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'partial' },
    status: TaskStatus.EXECUTING,
    sprintId: 'sprint-test',
    createdAt: new Date().toISOString(),
    assignedAgent: 'generic',
    assignedSkills: [],
    ...overrides,
  } as Task;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-test',
    number: 1,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    phase: SprintPhase.EXECUTE,
    status: SprintStatus.ACTIVE,
    startedAt: new Date().toISOString(),
  } as Sprint;
}

describe('DATA-W1 — synthetic timeout result tokenUsage fill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('timeout (no disk evidence) → tokenUsage defined with outputTokens=0 (not null)', async () => {
    const task = makeTask('dw1-001');
    const sprint = makeSprint([task]);

    writeFileSync(join(tmpDir, '.tasks', 'task-dw1-001.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.selfAssessment).toBe('NO_GO');

    // tokenUsage must be defined — not skipped by aggregateTokenUsage
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.outputTokens).toBe(0);
    expect(result.tokenUsage!.outputTokens).not.toBeNull();
    expect(result.tokenUsage!.inputTokens).toBe(0);
  });

  it('timeout (no disk evidence) → provider carried from task', async () => {
    const task = makeTask('dw1-002', { provider: 'claude' });
    const sprint = makeSprint([task]);

    writeFileSync(join(tmpDir, '.tasks', 'task-dw1-002.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    const result = results[0]!;
    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.provider).toBe('claude');
  });

  it('estimateTokenUsage (disk-evidence heuristic) → outputTokens>0', () => {
    // verifyDiskAgainstClaim needs a real git repo and cannot be tested via
    // waitForResults in a tmpdir. Test estimateTokenUsage directly instead —
    // this IS the function called in the disk-evidence path.
    const task = makeTask('dw1-003', { provider: 'claude' });
    const partialResult: TaskResult = {
      taskId: 'dw1-003',
      workerId: 'w-dw1-003',
      filesChanged: ['src/foo.ts'],
      linesAdded: 50,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: '',
    };

    const usage = estimateTokenUsage(task, partialResult);

    // heuristic: outputTokens = max(linesAdded * 15, 500) → max(750, 500) = 750
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.provider).toBe('claude');
  });

  it('aggregateTokenUsage counts synthetic timeout result (failed-attempt cost visible)', async () => {
    const task = makeTask('dw1-004');
    const sprint = makeSprint([task]);

    writeFileSync(join(tmpDir, '.tasks', 'task-dw1-004.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);

    // aggregateTokenUsage must not skip this result
    const agg = aggregateTokenUsage(results);
    expect(agg.tasksWithTokenData).toBe(1);
    // zero-stub: totals are 0 but the task IS counted
    expect(agg.totalInputTokens).toBe(0);
    expect(agg.totalOutputTokens).toBe(0);
  });

  it('aggregateTokenUsage: mixed real+synthetic — synthetic failure is included', async () => {
    const task1 = makeTask('dw1-005');
    const task2 = makeTask('dw1-006');
    const sprint = makeSprint([task1, task2]);

    // task1: real DONE result with token data
    writeFileSync(
      join(tmpDir, '.tasks', 'task-dw1-005.result'),
      JSON.stringify({
        taskId: 'dw1-005',
        workerId: 'w-dw1-005',
        filesChanged: ['src/foo.ts'],
        linesAdded: 20,
        linesRemoved: 5,
        testsPassed: true,
        coverage: 90,
        selfAssessment: 'DONE',
        notes: 'done',
        tokenUsage: { inputTokens: 1000, outputTokens: 300, cacheReadTokens: 4000, provider: 'claude', model: 'sonnet' },
      }),
      'utf-8',
    );

    // task2: timed out (no-evidence zero-stub)
    writeFileSync(join(tmpDir, '.tasks', 'task-dw1-006.timeout'), 'WORKER_TIMEOUT', 'utf-8');

    const results = await waitForResults(tmpDir, sprint, 5000);
    expect(results).toHaveLength(2);

    const agg = aggregateTokenUsage(results);
    // Both tasks must be counted
    expect(agg.tasksWithTokenData).toBe(2);
    expect(agg.totalInputTokens).toBe(1000);
    expect(agg.totalOutputTokens).toBe(300);
  });
});
