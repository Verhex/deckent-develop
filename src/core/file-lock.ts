// ═══ File Lock System ═══════════════════════════════════════════════
// Core file locking for concurrent worker coordination.
// Sprint 138 — Task 004: migrated from agents/worker.ts to core.
//
// Features:
//   - Atomic lock creation (O_EXCL)
//   - Idempotent re-lock by same worker
//   - Stale lock detection and cleanup
//   - TTL-based expiry (optional)
//   - Observability via trace instrumentation

import {
  readFileSync, writeFileSync, existsSync, unlinkSync,
  mkdirSync, readdirSync, openSync, closeSync, constants as fsConstants,
} from 'node:fs';
import { join } from 'node:path';
import { LOCKS_DIR } from './constants.js';
import { trace } from './observability.js';
import { debugLog } from './utils.js';
import type { LockInfo } from './types.js';

// ─── Error Classes ───────────────────────────────────────────────

export class LockError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'LockError';
  }
}

// ─── Internal Helpers ────────────────────────────────────────────

function lockFilePathFor(projectRoot: string, filePath: string): string {
  const lockName = filePath.replace(/[/\\]/g, '__') + '.lock';
  return join(projectRoot, LOCKS_DIR, lockName);
}

function now(): string {
  return new Date().toISOString();
}

function ensureLockDir(projectRoot: string): void {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) {
    mkdirSync(locksDir, { recursive: true });
  }
}

// ─── Core Lock Operations ────────────────────────────────────────

/**
 * Acquire a file lock. Atomic via O_EXCL.
 * Idempotent: same worker re-locking returns existing lock.
 * Throws LockError if file is locked by another worker.
 */
export function acquireLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string,
  ttl?: number,
): LockInfo {
  ensureLockDir(projectRoot);
  const lockPath = lockFilePathFor(projectRoot, filePath);

  // Check existing lock
  if (existsSync(lockPath)) {
    try {
      const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo & { ttl?: number };
      if (existing.ownerWorkerId === workerId) {
        return existing; // Idempotent — same worker already holds the lock
      }
      throw new LockError(
        `File ${filePath} is locked by ${existing.ownerWorkerId}`,
        filePath,
      );
    } catch (err) {
      if (err instanceof LockError) throw err;
      // Corrupted lock file — overwrite
    }
  }

  const lockInfo: LockInfo & { ttl?: number } = {
    filePath,
    ownerWorkerId: workerId,
    acquiredAt: now(),
    taskId,
  };
  if (ttl !== undefined) {
    lockInfo.ttl = ttl;
  }

  // Atomic lock creation — O_EXCL ensures only one process can create
  const data = JSON.stringify(lockInfo, null, 2);
  try {
    const fd = openSync(lockPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL);
    writeFileSync(fd, data, 'utf-8');
    closeSync(fd);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
      try {
        const actual = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
        throw new LockError(`File ${filePath} is locked by ${actual.ownerWorkerId}`, filePath);
      } catch (innerErr) {
        if (innerErr instanceof LockError) throw innerErr;
        throw new LockError(`File ${filePath} is locked by another worker`, filePath);
      }
    }
    throw err;
  }
  return lockInfo;
}

/**
 * Release a file lock.
 * Only the owning worker can release its lock.
 * No-op if lock does not exist.
 */
export function releaseLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
): void {
  const lockPath = lockFilePathFor(projectRoot, filePath);
  if (!existsSync(lockPath)) return;

  try {
    const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
    if (existing.ownerWorkerId !== workerId) {
      throw new LockError(
        `Cannot release lock on ${filePath}: owned by ${existing.ownerWorkerId}, not ${workerId}`,
        filePath,
      );
    }
  } catch (err) {
    if (err instanceof LockError) throw err;
    // Corrupted lock — allow deletion
  }

  unlinkSync(lockPath);
}

/**
 * Check if a file is locked.
 * Returns LockInfo if locked, null otherwise.
 */
export function checkLock(
  projectRoot: string,
  filePath: string,
): LockInfo | null {
  const lockPath = lockFilePathFor(projectRoot, filePath);
  if (!existsSync(lockPath)) return null;

  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
  } catch {
    return null;
  }
}

/**
 * List all active locks in the project.
 */
export function checkLocks(projectRoot: string): LockInfo[] {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return [];

  const files = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
  const locks: LockInfo[] = [];

  for (const file of files) {
    try {
      const lock = JSON.parse(readFileSync(join(locksDir, file), 'utf-8')) as LockInfo;
      locks.push(lock);
    } catch {
      // Skip corrupted lock files
    }
  }

  return locks;
}

/**
 * Release all locks owned by a specific worker.
 * Returns the number of locks released.
 */
export function releaseAllLocks(
  projectRoot: string,
  workerId: string,
): number {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return 0;

  const files = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
  let released = 0;

  for (const file of files) {
    const lockPath = join(locksDir, file);
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
      if (lock.ownerWorkerId === workerId) {
        unlinkSync(lockPath);
        released++;
      }
    } catch {
      // Skip corrupted lock files
    }
  }

  return released;
}

/**
 * Clear stale locks older than maxAgeMs.
 * Returns the number of stale locks removed.
 */
export function clearStaleLocks(
  projectRoot: string,
  maxAgeMs: number,
): number {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return 0;

  const files = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
  const nowMs = Date.now();
  let removed = 0;

  for (const file of files) {
    const lockPath = join(locksDir, file);
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo & { ttl?: number };
      const acquiredMs = new Date(lock.acquiredAt).getTime();

      // Check TTL if set, otherwise use maxAgeMs
      const effectiveMaxAge = lock.ttl ?? maxAgeMs;
      if (nowMs - acquiredMs > effectiveMaxAge) {
        unlinkSync(lockPath);
        removed++;
        debugLog('file-lock:clearStaleLocks', `Removed stale lock: ${lock.filePath} (worker: ${lock.ownerWorkerId})`);
      }
    } catch {
      // Skip corrupted lock files
    }
  }

  return removed;
}

/**
 * Release all locks whose owner worker ID is NOT in the given active worker set.
 * Used during coordinator restart recovery to clean up locks from dead workers.
 * Returns the list of released lock file paths.
 */
export function clearOrphanLocks(
  projectRoot: string,
  activeWorkerIds: Set<string>,
): string[] {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return [];

  const files = readdirSync(locksDir).filter(f => f.endsWith('.lock'));
  const released: string[] = [];

  for (const file of files) {
    const lockPath = join(locksDir, file);
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockInfo;
      if (!activeWorkerIds.has(lock.ownerWorkerId)) {
        unlinkSync(lockPath);
        released.push(lock.filePath);
        debugLog('file-lock:clearOrphanLocks', `Released orphan lock: ${lock.filePath} (dead worker: ${lock.ownerWorkerId})`);
      }
    } catch {
      // Skip corrupted or already-deleted lock files
    }
  }

  return released;
}

// ─── Observability Wrapper ───────────────────────────────────────

/**
 * Instrumented wrapper around acquireLock.
 * Records lock acquisition time as a `lock.wait` trace entry in metrics.jsonl.
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
