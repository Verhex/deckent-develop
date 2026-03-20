// ─── Task Retry Mechanism ───────────────────────────────────────────
// Handles retry logic for failed tasks: shouldRetry, createRetryTask,
// retry backoff delays, and brain.ts integration helpers.

import type { Task, TaskResult } from '../core/types.js';
import { TaskStatus } from '../core/types.js';

// ═══ Constants ═════════════════════════════════════════════════════

export const MAX_RETRY_COUNT = 2;

/** Delay in ms before each retry attempt (indexed by retryCount before the attempt).
 *  retryCount=0 → 1st retry: immediate (0ms)
 *  retryCount=1 → 2nd retry: 30 seconds
 */
export const RETRY_BACKOFF_MS: Record<number, number> = {
  0: 0,
  1: 30_000,
};

// ═══ Types ══════════════════════════════════════════════════════════

/** A Task with an optional retryCount field tracked in task JSON. */
export interface RetryableTask extends Task {
  retryCount?: number;
}

// ═══ Functions ══════════════════════════════════════════════════════

/**
 * Returns true if the task result warrants a retry.
 * Only NO_GO self-assessment results are retried; max 2 retries total.
 */
export function shouldRetry(result: TaskResult, retryCount: number): boolean {
  if (result.selfAssessment !== 'NO_GO') return false;
  return retryCount < MAX_RETRY_COUNT;
}

/**
 * Returns the backoff delay in ms for the given retry attempt.
 * 1st retry (retryCount=0) → 0ms (immediate)
 * 2nd retry (retryCount=1) → 30 000ms
 * Any subsequent count → 0ms (capped at MAX_RETRY_COUNT anyway)
 */
export function getRetryDelay(retryCount: number): number {
  return RETRY_BACKOFF_MS[retryCount] ?? 0;
}

/**
 * Returns the current retryCount from a task (defaults to 0 if absent).
 */
export function getRetryCount(task: RetryableTask): number {
  return task.retryCount ?? 0;
}

/**
 * Creates a new retry task derived from the original failed task.
 * The new task has:
 *  - an updated id suffixed with `-r<N>` (e.g. "025-001-r1")
 *  - status reset to PENDING
 *  - retryCount incremented
 *  - reason updated to document the retry context
 *  - assignedWorker cleared
 */
export function createRetryTask(originalTask: RetryableTask, retryCount: number): RetryableTask {
  const newRetryCount = retryCount + 1;
  const newId = originalTask.id.replace(/-r\d+$/, '') + `-r${newRetryCount}`;
  const ts = new Date().toISOString();

  return {
    ...originalTask,
    id: newId,
    status: TaskStatus.PENDING,
    retryCount: newRetryCount,
    reason: `Retry ${newRetryCount}/${MAX_RETRY_COUNT} for failed task ${originalTask.id}. Original reason: ${originalTask.reason}`,
    assignedWorker: undefined,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Async helper that resolves after the appropriate backoff for the given retryCount.
 * Uses setTimeout internally; pass a fake timer implementation for testing.
 */
export function retryDelay(
  retryCount: number,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise(r => setTimeout(r, ms)),
): Promise<void> {
  const ms = getRetryDelay(retryCount);
  return sleepFn(ms);
}
