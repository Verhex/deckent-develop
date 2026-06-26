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

// ─── Transient (RUNTIME/AMBIGUOUS) exponential backoff ─────────────
// Used by the retry_transient_failures flag-gated re-queue path in sprint-spawner.
// Formula: min(TRANSIENT_RETRY_BASE_MS * TRANSIENT_RETRY_MULTIPLIER^retryCount, TRANSIENT_RETRY_CAP_MS)
// → retryCount=0: 5 000ms, retryCount=1: 30 000ms, retryCount≥2: 120 000ms (cap)
export const TRANSIENT_RETRY_BASE_MS = 5_000;
export const TRANSIENT_RETRY_MULTIPLIER = 6;
export const TRANSIENT_RETRY_CAP_MS = 120_000;

// ═══ Types ══════════════════════════════════════════════════════════

/** A Task with optional retry fields tracked in task JSON. */
export interface RetryableTask extends Task {
  retryCount?: number;
  /** Unix timestamp (ms) before which this retry task must not be spawned.
   *  Set by the transient-retry re-queue path (sprint-spawner) to enforce
   *  exponential backoff without blocking the event loop. */
  retryAfter?: number;
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
 * Returns the exponential backoff delay in ms for the transient-retry path.
 * Formula: min(TRANSIENT_RETRY_BASE_MS × TRANSIENT_RETRY_MULTIPLIER^retryCount, TRANSIENT_RETRY_CAP_MS)
 *   retryCount=0 → 5 000ms  (5s)
 *   retryCount=1 → 30 000ms (30s)
 *   retryCount≥2 → 120 000ms (120s, cap)
 *
 * Used exclusively by the retry_transient_failures flag-gated re-queue path.
 */
export function getTransientRetryDelayMs(retryCount: number): number {
  return Math.min(
    TRANSIENT_RETRY_BASE_MS * Math.pow(TRANSIENT_RETRY_MULTIPLIER, retryCount),
    TRANSIENT_RETRY_CAP_MS,
  );
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
