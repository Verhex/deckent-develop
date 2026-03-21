import { describe, it, expect, vi } from 'vitest';
import {
  shouldRetry,
  createRetryTask,
  getRetryDelay,
  getRetryCount,
  retryDelay,
  MAX_RETRY_COUNT,
  RETRY_BACKOFF_MS,
} from '../../src/orchestra/task-retry.js';
import type { RetryableTask } from '../../src/orchestra/task-retry.js';
import type { TaskResult } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '027-001',
    workerId: 'worker-1',
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: 'All good',
    ...overrides,
  };
}

function makeTask(overrides: Partial<RetryableTask> = {}): RetryableTask {
  return {
    id: '027-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'opus',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Tests fail', techDebtAcceptable: 'Minor issues' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-027',
    retryCount: 0,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('shouldRetry', () => {
  it('returns true for NO_GO result with retryCount 0', () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    expect(shouldRetry(result, 0)).toBe(true);
  });

  it('returns true for NO_GO result with retryCount 1', () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    expect(shouldRetry(result, 1)).toBe(true);
  });

  it('returns false for NO_GO result when retryCount >= MAX_RETRY_COUNT', () => {
    const result = makeResult({ selfAssessment: 'NO_GO' });
    expect(shouldRetry(result, MAX_RETRY_COUNT)).toBe(false);
  });

  it('returns false for DONE result', () => {
    const result = makeResult({ selfAssessment: 'DONE' });
    expect(shouldRetry(result, 0)).toBe(false);
  });

  it('returns false for GO_WITH_TECH_DEBT result', () => {
    const result = makeResult({ selfAssessment: 'GO_WITH_TECH_DEBT' });
    expect(shouldRetry(result, 0)).toBe(false);
  });

  it('returns false for DONE even with retryCount 0', () => {
    expect(shouldRetry(makeResult({ selfAssessment: 'DONE' }), 0)).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('returns 0 for first retry (retryCount=0)', () => {
    expect(getRetryDelay(0)).toBe(0);
  });

  it('returns 30000 for second retry (retryCount=1)', () => {
    expect(getRetryDelay(1)).toBe(30_000);
  });

  it('returns 0 for out-of-range retryCount (fallback)', () => {
    expect(getRetryDelay(99)).toBe(0);
  });

  it('matches RETRY_BACKOFF_MS constants', () => {
    expect(getRetryDelay(0)).toBe(RETRY_BACKOFF_MS[0]);
    expect(getRetryDelay(1)).toBe(RETRY_BACKOFF_MS[1]);
  });
});

describe('getRetryCount', () => {
  it('returns 0 when retryCount is undefined', () => {
    const task = makeTask({ retryCount: undefined });
    expect(getRetryCount(task)).toBe(0);
  });

  it('returns the actual retryCount when set', () => {
    const task = makeTask({ retryCount: 2 });
    expect(getRetryCount(task)).toBe(2);
  });
});

describe('createRetryTask', () => {
  it('appends -r1 suffix for first retry', () => {
    const task = makeTask({ id: '027-001' });
    const retry = createRetryTask(task, 0);
    expect(retry.id).toBe('027-001-r1');
  });

  it('appends -r2 suffix for second retry', () => {
    const task = makeTask({ id: '027-001' });
    const retry = createRetryTask(task, 1);
    expect(retry.id).toBe('027-001-r2');
  });

  it('replaces existing -rN suffix on re-retry', () => {
    const task = makeTask({ id: '027-001-r1' });
    const retry = createRetryTask(task, 1);
    expect(retry.id).toBe('027-001-r2');
  });

  it('sets status to PENDING', () => {
    const retry = createRetryTask(makeTask(), 0);
    expect(retry.status).toBe(TaskStatus.PENDING);
  });

  it('increments retryCount', () => {
    const retry = createRetryTask(makeTask(), 0);
    expect(retry.retryCount).toBe(1);
  });

  it('preserves original task fields (title, model, scope)', () => {
    const task = makeTask({ title: 'My Task', model: 'sonnet' });
    const retry = createRetryTask(task, 0);
    expect(retry.title).toBe('My Task');
    expect(retry.model).toBe('sonnet');
    expect(retry.scope).toEqual(task.scope);
  });

  it('clears assignedWorker', () => {
    const task = makeTask({ assignedWorker: 'worker-5' });
    const retry = createRetryTask(task, 0);
    expect(retry.assignedWorker).toBeUndefined();
  });

  it('updates reason with retry context', () => {
    const task = makeTask({ reason: 'Original reason' });
    const retry = createRetryTask(task, 0);
    expect(retry.reason).toContain('Retry 1/2');
    expect(retry.reason).toContain('Original reason');
  });

  it('sets new createdAt and updatedAt timestamps', () => {
    const task = makeTask({ createdAt: '2025-01-01T00:00:00.000Z' });
    const retry = createRetryTask(task, 0);
    expect(retry.createdAt).not.toBe('2025-01-01T00:00:00.000Z');
  });
});

describe('retryDelay', () => {
  it('resolves immediately for retryCount=0', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    await retryDelay(0, sleepFn);
    expect(sleepFn).toHaveBeenCalledWith(0);
  });

  it('waits 30s for retryCount=1', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    await retryDelay(1, sleepFn);
    expect(sleepFn).toHaveBeenCalledWith(30_000);
  });
});

describe('full retry scenario', () => {
  it('NO_GO → retry → NO_GO → retry → NO_GO → stops', () => {
    const task = makeTask({ id: '027-005' });
    const noGoResult = makeResult({ selfAssessment: 'NO_GO' });

    // First attempt fails
    let retryCount = getRetryCount(task);
    expect(shouldRetry(noGoResult, retryCount)).toBe(true);

    // Create first retry
    const retry1 = createRetryTask(task, retryCount);
    expect(retry1.id).toBe('027-005-r1');
    expect(retry1.retryCount).toBe(1);

    // Second attempt also fails
    retryCount = getRetryCount(retry1);
    expect(shouldRetry(noGoResult, retryCount)).toBe(true);

    // Create second retry
    const retry2 = createRetryTask(retry1, retryCount);
    expect(retry2.id).toBe('027-005-r2');
    expect(retry2.retryCount).toBe(2);

    // Third attempt fails — no more retries allowed
    retryCount = getRetryCount(retry2);
    expect(shouldRetry(noGoResult, retryCount)).toBe(false);
  });

  it('NO_GO → retry → DONE → stops retrying', () => {
    const task = makeTask({ id: '027-010' });

    const retryCount = getRetryCount(task);
    expect(shouldRetry(makeResult({ selfAssessment: 'NO_GO' }), retryCount)).toBe(true);

    const retry1 = createRetryTask(task, retryCount);
    // Second attempt succeeds
    const doneResult = makeResult({ selfAssessment: 'DONE' });
    expect(shouldRetry(doneResult, getRetryCount(retry1))).toBe(false);
  });

  it('MAX_RETRY_COUNT is exactly 2', () => {
    expect(MAX_RETRY_COUNT).toBe(2);
  });
});
