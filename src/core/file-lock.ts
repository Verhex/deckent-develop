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
  readFileSync, writeFileSync, existsSync, unlinkSync, linkSync,
  mkdirSync, readdirSync, openSync, closeSync, constants as fsConstants,
} from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
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

// ═══ Spawn-Time File Locks (Sprint 156 Task 10) ══════════════════════════
// Distinct from worker-time locks above. These are acquired BEFORE the
// worker container starts, keyed by taskId (workerId is not yet known).
// Use the `.spawnlock` extension so existing `.lock` cleanup helpers
// (checkLocks / clearStaleLocks / clearOrphanLocks) ignore them.

export interface SpawnLockInfo {
  filePath: string;
  taskId: string;
  acquiredAt: string;
}

export class SpawnLockError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly conflictingTaskId: string,
  ) {
    super(message);
    this.name = 'SpawnLockError';
  }
}

function spawnLockPathFor(projectRoot: string, filePath: string): string {
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 32);
  return join(projectRoot, LOCKS_DIR, `${hash}.spawnlock`);
}

/**
 * Acquire a spawn-time lock for a single file.
 * Atomic via a tmp-write + hard-link publish (never a torn-read window).
 * Idempotent for the same taskId.
 * Throws SpawnLockError when a different task already holds the lock.
 */
export function acquireSpawnLock(
  projectRoot: string,
  taskId: string,
  filePath: string,
): SpawnLockInfo {
  ensureLockDir(projectRoot);
  const lockPath = spawnLockPathFor(projectRoot, filePath);

  if (existsSync(lockPath)) {
    try {
      const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
      if (existing.taskId === taskId) {
        return existing;
      }
      throw new SpawnLockError(
        `Spawn lock conflict on ${filePath}: held by task ${existing.taskId}`,
        filePath,
        existing.taskId,
      );
    } catch (err) {
      if (err instanceof SpawnLockError) throw err;
      // Corrupted spawnlock file — let the atomic publish below recreate it.
      // Safe to unlink here: the publish path never leaves lockPath visible
      // mid-write (see below), so an unparseable file here can only be
      // genuine corruption, not a concurrent in-flight write.
      try { unlinkSync(lockPath); } catch { /* best-effort */ }
    }
  }

  const info: SpawnLockInfo = {
    filePath,
    taskId,
    acquiredAt: now(),
  };
  const data = JSON.stringify(info, null, 2);

  // Publish atomically (born-428): write the full content to a private
  // staging file first, then hard-link it into place. link(2) keeps the
  // same exclusivity guarantee as O_EXCL (EEXIST if lockPath already
  // exists) but — unlike open+write — lockPath is never visible in a
  // partially-written state. A concurrent reader can only ever observe
  // "absent" or "fully valid", closing the window where a mid-write read
  // was mistaken for corruption and the real owner's lock got unlinked.
  const stagingPath = `${lockPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    writeFileSync(stagingPath, data, { encoding: 'utf-8', flag: 'wx' });
    try {
      linkSync(stagingPath, lockPath);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EEXIST') {
        try {
          const actual = JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
          if (actual.taskId === taskId) return actual;
          throw new SpawnLockError(
            `Spawn lock conflict on ${filePath}: held by task ${actual.taskId}`,
            filePath,
            actual.taskId,
          );
        } catch (innerErr) {
          if (innerErr instanceof SpawnLockError) throw innerErr;
          throw new SpawnLockError(
            `Spawn lock conflict on ${filePath}: held by another task`,
            filePath,
            'unknown',
          );
        }
      }
      throw err;
    }
  } finally {
    try { unlinkSync(stagingPath); } catch { /* best-effort cleanup */ }
  }

  return info;
}

/**
 * Release a single spawn lock owned by `taskId`.
 * No-op if the lock does not exist.
 * Refuses to delete a lock owned by a different task (defensive).
 */
export function releaseSpawnLock(
  projectRoot: string,
  taskId: string,
  filePath: string,
): void {
  const lockPath = spawnLockPathFor(projectRoot, filePath);
  if (!existsSync(lockPath)) return;

  try {
    const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
    if (existing.taskId !== taskId) {
      debugLog(
        'file-lock:releaseSpawnLock',
        `Refusing to release spawn lock on ${filePath}: owned by ${existing.taskId}, not ${taskId}`,
      );
      return;
    }
  } catch {
    // Corrupted spawnlock — fall through and unlink
  }

  try { unlinkSync(lockPath); } catch { /* already gone */ }
}

/**
 * Acquire spawn locks for a batch of files. Atomic at the batch level:
 * if any file conflicts, every previously-acquired lock in this call is
 * released before the error is rethrown — partial-lock state never leaks.
 */
export function acquireSpawnLocks(
  projectRoot: string,
  taskId: string,
  filePaths: readonly string[],
): SpawnLockInfo[] {
  const acquired: SpawnLockInfo[] = [];
  for (const fp of filePaths) {
    try {
      acquired.push(acquireSpawnLock(projectRoot, taskId, fp));
    } catch (err) {
      // Roll back everything this call obtained
      for (const info of acquired) {
        releaseSpawnLock(projectRoot, taskId, info.filePath);
      }
      throw err;
    }
  }
  return acquired;
}

/**
 * Release a batch of spawn locks for `taskId`. Best-effort: missing or
 * non-owned locks are silently skipped.
 */
export function releaseSpawnLocks(
  projectRoot: string,
  taskId: string,
  filePaths: readonly string[],
): void {
  for (const fp of filePaths) {
    releaseSpawnLock(projectRoot, taskId, fp);
  }
}

/**
 * Release every `.spawnlock` in the project owned by `taskId`.
 * Used during container exit / kill paths where we don't want to track
 * the original filesWrite list. Returns the number released.
 */
export function releaseAllSpawnLocks(
  projectRoot: string,
  taskId: string,
): number {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return 0;

  let files: string[];
  try {
    const all = readdirSync(locksDir);
    if (!Array.isArray(all)) return 0;
    files = all.filter(f => typeof f === 'string' && f.endsWith('.spawnlock'));
  } catch {
    return 0;
  }

  let released = 0;
  for (const file of files) {
    const lockPath = join(locksDir, file);
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
      if (lock.taskId === taskId) {
        unlinkSync(lockPath);
        released++;
      }
    } catch {
      // Skip corrupted spawnlock files
    }
  }
  return released;
}

// ═══ Spawn-Time Lock Cleanup Helpers (Sprint 168 C0b — RC4 Bug E) ═════════
// Sprint 156 T-10 introduced `.spawnlock` as a distinct namespace to keep
// regular `.lock` cleanup helpers from touching them. The cleanup helpers
// for spawn locks themselves were never added — 11 sprints later Sprint 167
// crashed in SPAWN phase because orphan/stale spawnlocks accumulated and
// blocked the next acquire. Phase 2 §141 enumerated the 5 missing helpers
// (checkSpawnLock, checkSpawnLocks, clearStaleSpawnLocks,
// clearOrphanSpawnLocks, releaseStaleSpawnLocksForTask). These mirror the
// regular-lock symmetric API around acquireSpawnLock / releaseSpawnLock.

/**
 * Check a single spawn lock. Returns SpawnLockInfo when held, null otherwise.
 * Symmetric with checkLock() for regular `.lock` files.
 */
export function checkSpawnLock(
  projectRoot: string,
  filePath: string,
): SpawnLockInfo | null {
  const lockPath = spawnLockPathFor(projectRoot, filePath);
  if (!existsSync(lockPath)) return null;
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
  } catch {
    return null;
  }
}

/**
 * List every active spawn lock in the project's `.locks/` directory.
 * Skips corrupted lock files silently. Symmetric with checkLocks().
 */
export function checkSpawnLocks(projectRoot: string): SpawnLockInfo[] {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return [];

  const out: SpawnLockInfo[] = [];
  let files: string[];
  try {
    const all = readdirSync(locksDir);
    if (!Array.isArray(all)) return [];
    files = all.filter(f => typeof f === 'string' && f.endsWith('.spawnlock'));
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const lock = JSON.parse(readFileSync(join(locksDir, file), 'utf-8')) as SpawnLockInfo;
      out.push(lock);
    } catch {
      // Skip corrupted spawnlock files
    }
  }
  return out;
}

/**
 * Clear spawn locks older than `maxAgeMs` (TTL-based stale cleanup).
 * Default 5 minutes — Auditor scan loop calls this every 30 seconds.
 * Symmetric with clearStaleLocks() for regular `.lock` files.
 * Returns the number of stale spawn locks removed.
 */
export function clearStaleSpawnLocks(
  projectRoot: string,
  maxAgeMs = 300_000,
): number {
  const locks = checkSpawnLocks(projectRoot);
  if (locks.length === 0) return 0;

  const nowMs = Date.now();
  let cleared = 0;
  for (const lock of locks) {
    const acquiredMs = new Date(lock.acquiredAt).getTime();
    if (Number.isNaN(acquiredMs)) continue;
    if (nowMs - acquiredMs > maxAgeMs) {
      releaseSpawnLock(projectRoot, lock.taskId, lock.filePath);
      cleared++;
      debugLog(
        'file-lock:clearStaleSpawnLocks',
        `Released stale spawn lock: ${lock.filePath} (taskId=${lock.taskId}, age=${Math.round((nowMs - acquiredMs) / 1000)}s)`,
      );
    }
  }
  return cleared;
}

/**
 * Clear orphan spawn locks — locks whose `taskId` is not in `activeTaskIds`.
 * Used by Auditor scan loop after worker crashes / Brain stalls leave behind
 * locks for tasks that no longer exist. Symmetric with clearOrphanLocks()
 * for regular `.lock` files. Returns the count released.
 */
export function clearOrphanSpawnLocks(
  projectRoot: string,
  activeTaskIds: readonly string[],
): number {
  const locks = checkSpawnLocks(projectRoot);
  if (locks.length === 0) return 0;

  const activeSet = new Set(activeTaskIds);
  let cleared = 0;
  for (const lock of locks) {
    if (!activeSet.has(lock.taskId)) {
      releaseSpawnLock(projectRoot, lock.taskId, lock.filePath);
      cleared++;
      debugLog(
        'file-lock:clearOrphanSpawnLocks',
        `Released orphan spawn lock: ${lock.filePath} (taskId=${lock.taskId})`,
      );
    }
  }
  return cleared;
}

/**
 * Release every spawn lock owned by `taskId`. Sad-path cleanup helper used
 * by spawn backends on container exit / kill — covers paths where
 * releaseAllSpawnLocks may have been bypassed (e.g. abrupt worker errors).
 * No-op when no spawn locks for the task exist.
 */
export function releaseStaleSpawnLocksForTask(
  projectRoot: string,
  taskId: string,
): void {
  const locks = checkSpawnLocks(projectRoot);
  for (const lock of locks) {
    if (lock.taskId === taskId) {
      releaseSpawnLock(projectRoot, taskId, lock.filePath);
    }
  }
}
