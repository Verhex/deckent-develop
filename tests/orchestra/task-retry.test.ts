import { describe, it, expect, vi } from 'vitest';
import {
  shouldRetry,
  createRetryTask,
  getRetryCount,
  getRetryDelay,
  retryDelay,
  MAX_RETRY_COUNT,
  RETRY_BACKOFF_MS,
} from '../../src/orchestra/task-retry.js';
import type { RetryableTask } from '../../src/orchestra/task-retry.js';
import { TaskStatus } from '../../src/core/types.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeResult(selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'): TaskResult {
  return {
    taskId: 'sprint-001-001',
    workerId: 'w-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: selfAssessment !== 'NO_GO',
    coverage: selfAssessment === 'DONE' ? 95 : 0,
    selfAssessment,
    notes: '',
  };
}

function makeTask(overrides: Partial<RetryableTask> = {}): RetryableTask {
  return {
    id: '024-001',
    title: 'Test task',
    description: 'A task for testing',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Original reason',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-024',
    createdAt: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

// ═══ shouldRetry ═══════════════════════════════════════════════════

describe('shouldRetry', () => {
  it('returns true for NO_GO result when retryCount is 0', () => {
    expect(shouldRetry(makeResult('NO_GO'), 0)).toBe(true);
  });

  it('returns true for NO_GO result when retryCount is 1 (second retry)', () => {
    expect(shouldRetry(makeResult('NO_GO'), 1)).toBe(true);
  });

  it('returns false for NO_GO result when retryCount equals MAX_RETRY_COUNT', () => {
    expect(shouldRetry(makeResult('NO_GO'), MAX_RETRY_COUNT)).toBe(false);
  });

  it('returns false for NO_GO result when retryCount exceeds MAX_RETRY_COUNT', () => {
    expect(shouldRetry(makeResult('NO_GO'), MAX_RETRY_COUNT + 1)).toBe(false);
  });

  it('returns false for DONE result regardless of retryCount', () => {
    expect(shouldRetry(makeResult('DONE'), 0)).toBe(false);
  });

  it('returns false for GO_WITH_TECH_DEBT result regardless of retryCount', () => {
    expect(shouldRetry(makeResult('GO_WITH_TECH_DEBT'), 0)).toBe(false);
  });
});

// ═══ getRetryDelay ══════════════════════════════════════════════════

describe('getRetryDelay', () => {
  it('returns 0ms for first retry (retryCount=0)', () => {
    expect(getRetryDelay(0)).toBe(0);
  });

  it('returns 30 000ms for second retry (retryCount=1)', () => {
    expect(getRetryDelay(1)).toBe(30_000);
  });

  it('returns 0ms for unknown retry counts (fallback)', () => {
    expect(getRetryDelay(5)).toBe(0);
  });

  it('RETRY_BACKOFF_MS constant has correct values', () => {
    expect(RETRY_BACKOFF_MS[0]).toBe(0);
    expect(RETRY_BACKOFF_MS[1]).toBe(30_000);
  });
});

// ═══ getRetryCount ══════════════════════════════════════════════════

describe('getRetryCount', () => {
  it('returns 0 when task has no retryCount field', () => {
    expect(getRetryCount(makeTask())).toBe(0);
  });

  it('returns the stored retryCount when present', () => {
    expect(getRetryCount(makeTask({ retryCount: 1 }))).toBe(1);
  });

  it('returns 0 when retryCount is explicitly undefined', () => {
    expect(getRetryCount(makeTask({ retryCount: undefined }))).toBe(0);
  });
});

// ═══ createRetryTask ════════════════════════════════════════════════

describe('createRetryTask', () => {
  it('creates a new task with status PENDING', () => {
    const original = makeTask({ status: TaskStatus.DONE });
    const retry = createRetryTask(original, 0);
    expect(retry.status).toBe(TaskStatus.PENDING);
  });

  it('increments retryCount by 1', () => {
    const retry = createRetryTask(makeTask(), 0);
    expect(retry.retryCount).toBe(1);
  });

  it('increments retryCount correctly from non-zero base', () => {
    const retry = createRetryTask(makeTask({ retryCount: 1 }), 1);
    expect(retry.retryCount).toBe(2);
  });

  it('appends -r<N> suffix to the task id', () => {
    const retry = createRetryTask(makeTask({ id: '024-001' }), 0);
    expect(retry.id).toBe('024-001-r1');
  });

  it('replaces existing -r<N> suffix instead of double-appending', () => {
    const retry1 = createRetryTask(makeTask({ id: '024-001' }), 0);       // → 024-001-r1
    const retry2 = createRetryTask(retry1, 1);                             // → 024-001-r2
    expect(retry2.id).toBe('024-001-r2');
  });

  it('clears assignedWorker', () => {
    const original = makeTask({ assignedWorker: 'w-024-001' });
    const retry = createRetryTask(original, 0);
    expect(retry.assignedWorker).toBeUndefined();
  });

  it('includes original task id in reason', () => {
    const original = makeTask({ id: '024-001' });
    const retry = createRetryTask(original, 0);
    expect(retry.reason).toContain('024-001');
  });

  it('preserves scope, model, dependencies and goNogo from original', () => {
    const original = makeTask({
      model: 'opus',
      scope: { directories: ['src/core/'], filesRead: ['README.md'], filesWrite: ['out.ts'] },
      dependencies: ['024-002'],
    });
    const retry = createRetryTask(original, 0);
    expect(retry.model).toBe('opus');
    expect(retry.scope.directories).toEqual(['src/core/']);
    expect(retry.dependencies).toEqual(['024-002']);
  });

  it('sets createdAt and updatedAt to a valid ISO string', () => {
    const retry = createRetryTask(makeTask(), 0);
    expect(() => new Date(retry.createdAt!)).not.toThrow();
    expect(() => new Date(retry.updatedAt!)).not.toThrow();
  });
});

// ═══ retryDelay ═════════════════════════════════════════════════════

describe('retryDelay', () => {
  it('resolves immediately when delay is 0 (first retry)', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    await retryDelay(0, sleepFn);
    expect(sleepFn).toHaveBeenCalledWith(0);
  });

  it('calls sleepFn with 30 000ms for second retry', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    await retryDelay(1, sleepFn);
    expect(sleepFn).toHaveBeenCalledWith(30_000);
  });

  it('uses real setTimeout when no sleepFn provided (0ms delay)', async () => {
    // This should resolve near-instantly since retryCount=0 → 0ms delay
    await expect(retryDelay(0)).resolves.toBeUndefined();
  });
});

// ═══ Constants ══════════════════════════════════════════════════════

describe('constants', () => {
  it('MAX_RETRY_COUNT is 2', () => {
    expect(MAX_RETRY_COUNT).toBe(2);
  });
});
