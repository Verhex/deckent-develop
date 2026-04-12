// ═══ File Lock Observability Facade ══════════════════════════════════
// Wraps acquireLock from agents/worker.ts with trace instrumentation.
// Sprint 135 — Task 011: secondary observability instrument points.

import { trace } from './observability.js';
import { acquireLock } from '../agents/worker.js';
import type { LockInfo } from './types.js';

/**
 * Instrumented wrapper around acquireLock.
 * Records lock acquisition time as a `lock.wait` trace entry in metrics.jsonl.
 *
 * @param projectRoot - Project root directory
 * @param filePath - File path to lock
 * @param workerId - Worker ID requesting the lock
 * @param taskId - Task ID associated with the lock
 * @returns LockInfo for the acquired lock
 */
export async function claimTaskLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string,
): Promise<LockInfo> {
  return trace('lock.wait', async () => {
    return acquireLock(projectRoot, filePath, workerId, taskId);
  });
}

export { acquireLock } from '../agents/worker.js';
