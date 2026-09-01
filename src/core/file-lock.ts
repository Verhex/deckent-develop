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

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  readFileSync, writeFileSync, existsSync, unlinkSync, linkSync,
  mkdirSync, readdirSync, openSync, closeSync, renameSync, rmdirSync, lstatSync,
  realpathSync, fstatSync, readSync, fsyncSync, readlinkSync,
  statSync, constants as fsConstants,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { LOCKS_DIR } from './constants.js';
import {
  loadExecAuthorityNative,
  type ExecAuthorityNativeLegacyFacade,
} from './exec-authority-native.js';
import { trace } from './observability.js';
import { debugLog } from './utils.js';
import type { LockInfo } from './types.js';
import { DeckentError, ErrorRegistry } from './errors.js';

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
  /** Host PID that acquired the pre-spawn lock. Absent on legacy lock files. */
  ownerPid?: number;
}

export interface StaleSpawnLockCandidate {
  lockPath: string;
  lock: SpawnLockInfo & { ownerPid: number };
  mtimeMs: number;
  ageMs: number;
  inode: number;
  size: number;
}

export interface InspectStaleSpawnLocksOptions {
  maxAgeMs: number;
  maxFiles: number;
  nowMs?: number;
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
    ownerPid: process.pid,
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

/**
 * Inspect at most `maxFiles` spawnlocks and return only evidence-complete age
 * candidates. This helper never releases a lock: process and result authority
 * belong to the orchestration layer. Files without a valid owner PID are
 * intentionally ineligible so legacy/corrupt locks fail closed.
 */
export function inspectStaleSpawnLocks(
  projectRoot: string,
  options: InspectStaleSpawnLocksOptions,
): StaleSpawnLockCandidate[] {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return [];

  const maxFiles = Math.max(0, Math.floor(options.maxFiles));
  if (maxFiles === 0 || !Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0) return [];

  let files: string[];
  try {
    files = readdirSync(locksDir)
      .filter(file => file.endsWith('.spawnlock'))
      .sort()
      .slice(0, maxFiles);
  } catch {
    return [];
  }

  const nowMs = options.nowMs ?? Date.now();
  const candidates: StaleSpawnLockCandidate[] = [];
  for (const file of files) {
    const lockPath = join(locksDir, file);
    try {
      const stats = lstatSync(lockPath);
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as SpawnLockInfo;
      if (!Number.isInteger(lock.ownerPid) || lock.ownerPid! <= 0) continue;
      if (typeof lock.taskId !== 'string' || lock.taskId.length === 0) continue;
      if (typeof lock.filePath !== 'string' || lock.filePath.length === 0) continue;
      const ageMs = nowMs - stats.mtimeMs;
      if (ageMs <= options.maxAgeMs) continue;
      candidates.push({
        lockPath,
        lock: lock as SpawnLockInfo & { ownerPid: number },
        mtimeMs: stats.mtimeMs,
        ageMs,
        inode: stats.ino,
        size: stats.size,
      });
    } catch {
      // Concurrent deletion, malformed content, and stat/read errors fail closed.
    }
  }
  return candidates;
}

/**
 * Release an inspected candidate only if the same filesystem object and lock
 * identity are still present. This narrows the inspection→release race and
 * prevents a newly acquired replacement lock from being removed.
 */
export function releaseInspectedSpawnLock(candidate: StaleSpawnLockCandidate): boolean {
  try {
    const stats = lstatSync(candidate.lockPath);
    if (
      stats.ino !== candidate.inode
      || stats.size !== candidate.size
      || stats.mtimeMs !== candidate.mtimeMs
    ) return false;

    const current = JSON.parse(readFileSync(candidate.lockPath, 'utf-8')) as SpawnLockInfo;
    if (
      current.taskId !== candidate.lock.taskId
      || current.filePath !== candidate.lock.filePath
      || current.ownerPid !== candidate.lock.ownerPid
    ) return false;

    unlinkSync(candidate.lockPath);
    return true;
  } catch {
    return false;
  }
}

// ═══ Task Execution Authority ════════════════════════════════════════════
// Project-local BEGIN IMMEDIATE serialization plus a durable, inspectable
// `.executionlock` projection. This namespace is intentionally invisible to
// the legacy `.lock` and `.spawnlock` cleanup lifecycles.

export const EXECUTION_LOCK_SCHEMA_VERSION = 3 as const;
export const EXECUTION_LOCK_DB_META_VERSION = 4 as const;
export const EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_BOUNDARY_RESUME_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_ACTIVE_ADOPTION_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION = 1 as const;
export const EXECUTION_LOCK_COORDINATION_DB_FILENAME =
  'execution-lock-authority.sqlite3';
export const EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME =
  'execution-lock-authority.sentinel.json';
export const EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY =
  'execution-lock-authority-adoptions';
export const EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME =
  '.deckent-execution-lock-authority.anchor.json';
const EXECUTION_LOCK_ROOT_BINDING_PREFIX =
  '.deckent-execution-lock-root-binding';

/**
 * True when a `.locks/` entry belongs to canonical task-execution authority.
 * Generic sprint cleanup may remove legacy `.lock`/`.spawnlock` files, but
 * these artifacts are retired only by fenced execution-authority APIs.
 */
export function isExecutionLockAuthorityArtifactName(name: string): boolean {
  return name === EXECUTION_LOCK_COORDINATION_DB_FILENAME
    || name.startsWith(`${EXECUTION_LOCK_COORDINATION_DB_FILENAME}-`)
    || name === EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME
    || name === EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY
    || name.includes('.executionlock');
}
export const DEFAULT_EXECUTION_LOCK_LEASE_MS = 30_000;
export const DEFAULT_EXECUTION_LOCK_HEARTBEAT_MS = 10_000;
export const MAX_EXECUTION_LOCK_LEASE_MS = 86_400_000;
export const MAX_EXECUTION_LOCK_TASK_ID_BYTES = 512;
export const PROJECT_MAINTENANCE_LOCK_TASK_ID =
  '__deckent_project_maintenance__';

const MAX_EXECUTION_LOCK_PROJECTION_BYTES = 16_384;
const MAX_EXECUTION_LOCK_SENTINEL_BYTES = 1_024;
const MAX_EXECUTION_LOCK_ANCHOR_BYTES = 2_048;
const MAX_EXECUTION_LOCK_MOUNT_ADOPTION_BYTES = 8_192;
const MAX_EXECUTION_LOCK_DB_BYTES = 1_073_741_824;
const MAX_EXECUTION_LOCK_IDENTITY_BYTES = 128;
const EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS = 250;
const EXECUTION_LOCK_QUERY_PAGE_SIZE = 256;
const EXECUTION_LOCK_PROCESS_SESSION_ID = randomUUID();
const EXECUTION_LOCK_PINNED_LOCK_DIRECTORIES = new Map<string, string>();
const EXECUTION_LOCK_IDENTITY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const EXECUTION_LOCK_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EXECUTION_LOCK_FENCING_NONCE_PATTERN = /^[0-9a-f]{32}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_EXECUTION_LOCK_QUARANTINE_REASON_BYTES = 128;
const MAX_EXECUTION_LOCK_RECOVERY_OPERATOR_BYTES = 128;
const MAX_EXECUTION_LOCK_RECOVERY_JUSTIFICATION_BYTES = 2_048;
const MAX_EXECUTION_LOCK_EVIDENCE_REFS = 16;
const MAX_EXECUTION_LOCK_EVIDENCE_REF_BYTES = 1_024;
const MAX_EXECUTION_LOCK_EVIDENCE_TOTAL_BYTES = 8_192;
const MAX_EXECUTION_LOCK_BOUNDARY_RESUMES = 1_024;
const MAX_EXECUTION_LOCK_ACTIVE_ADOPTIONS = 1_024;
const MAX_EXECUTION_LOCK_RECOVERY_ATTESTATION_AGE_MS = 15 * 60 * 1_000;
const MAX_EXECUTION_LOCK_RECOVERY_FUTURE_SKEW_MS = 60 * 1_000;

export type ExecutionLockActor = 'dispatch' | 'settlement' | 'maintenance';
export type ExecutionLockProcessState =
  | 'alive'
  | 'dead'
  | 'unknown'
  | 'foreign-host';

export interface ExecutionLockRuntimeIdentity {
  readonly hostInstanceId: string;
  readonly bootSessionId: string;
  readonly processSessionId: string;
}

export interface ExecutionLockOwnerIdentity extends ExecutionLockRuntimeIdentity {
  readonly pid: number;
}

export interface ExecutionLockFencingToken {
  readonly epoch: string;
  readonly counter: number;
  readonly nonce: string;
}

export interface ExecutionLockInfo extends ExecutionLockOwnerIdentity {
  readonly schemaVersion: typeof EXECUTION_LOCK_SCHEMA_VERSION;
  readonly taskId: string;
  readonly actor: ExecutionLockActor;
  readonly ownerId: string;
  readonly fencingToken: ExecutionLockFencingToken;
  readonly acquiredAt: string;
  readonly renewedAt: string;
  readonly leaseDurationMs: number;
}

export type ExecutionLockQuarantineReason =
  | 'irreversible-boundary'
  | 'partial-mutation'
  | 'heartbeat-fault'
  | 'release-fault'
  | 'authority-uncertain'
  | 'legacy-v2-active';

export type ExecutionLockQuarantineState =
  | 'in-flight'
  | 'quarantined';

export interface ExecutionLockQuarantineInfo {
  readonly schemaVersion: typeof EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION;
  readonly quarantineId: string;
  readonly lock: ExecutionLockInfo;
  readonly state: ExecutionLockQuarantineState;
  readonly reason: ExecutionLockQuarantineReason;
  readonly evidenceRefs: readonly string[];
  readonly enteredAt: string;
  readonly quarantinedAt: string | null;
}

export interface ExecutionLockQuarantineRequest {
  readonly reason: ExecutionLockQuarantineReason;
  readonly evidenceRefs?: readonly string[];
}

export interface ExecutionLockIrreversibleBoundaryRequest {
  readonly evidenceRefs?: readonly string[];
  /**
   * Optional caller-derived idempotency identity for a durable boundary.
   * Callers must derive this from immutable transaction authority, never from
   * a mutable path or process-local counter. The default remains a fresh UUID
   * for existing admission callers.
   */
  readonly quarantineId?: string;
}

export interface ExecutionLockBoundaryCompletionRequest {
  readonly quarantineId: string;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionLockBoundaryResumeRequest {
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionLockActiveAdoptionRequest {
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionLockNoChangeCompletionRequest {
  readonly quarantineId: string;
  readonly boundaryEvidenceRefs: readonly string[];
  readonly completionEvidenceRefs: readonly string[];
}

export interface ExecutionLockBoundaryCompletion {
  readonly schemaVersion:
    typeof EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION;
  readonly quarantineId: string;
  readonly fencingToken: ExecutionLockFencingToken;
  readonly evidenceRefs: readonly string[];
  readonly completedAt: string;
}

export interface ExecutionLockBoundaryResumeAttestation {
  readonly schemaVersion:
    typeof EXECUTION_LOCK_BOUNDARY_RESUME_SCHEMA_VERSION;
  readonly quarantineId: string;
  readonly previousLock: ExecutionLockInfo;
  readonly resumedLock: ExecutionLockInfo;
  readonly evidenceRefs: readonly string[];
  readonly resumedAt: string;
}

export interface ExecutionLockActiveAdoptionAudit {
  readonly schemaVersion: typeof EXECUTION_LOCK_ACTIVE_ADOPTION_SCHEMA_VERSION;
  readonly eventId: string;
  readonly previousLock: ExecutionLockInfo;
  readonly adoptedLock: ExecutionLockInfo;
  readonly evidenceRefs: readonly string[];
  readonly adoptedAt: string;
}

export interface ExecutionLockRecoveryAttestation {
  readonly schemaVersion:
    typeof EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION;
  readonly quarantineId: string;
  readonly fencingToken: ExecutionLockFencingToken;
  readonly operatorId: string;
  readonly justification: string;
  readonly evidenceRefs: readonly string[];
  readonly attestedAt: string;
}

export interface ExecutionLockQuarantineAuditEvent {
  readonly schemaVersion:
    typeof EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION;
  readonly eventId: string;
  readonly action:
    | 'boundary-entered'
    | 'resumed'
    | 'quarantined'
    | 'completed'
    | 'recovered';
  readonly quarantineId: string;
  readonly taskId: string;
  readonly ownerId: string;
  readonly fencingToken: ExecutionLockFencingToken;
  readonly occurredAt: string;
  readonly payload:
    | ExecutionLockQuarantineInfo
    | ExecutionLockBoundaryResumeAttestation
    | ExecutionLockBoundaryCompletion
    | ExecutionLockRecoveryAttestation;
}

export interface ExecutionLockBoundaryCompletionResult {
  readonly completed: ExecutionLockQuarantineInfo;
  readonly audit: ExecutionLockQuarantineAuditEvent;
  readonly projectionCleanup: 'completed' | 'uncertain';
}

export interface ExecutionLockBoundaryResumeResult {
  readonly previous: ExecutionLockQuarantineInfo;
  readonly resumed: ExecutionLockQuarantineInfo;
  readonly audit: ExecutionLockQuarantineAuditEvent;
  readonly projectionPublication: 'completed' | 'uncertain';
}

export interface ExecutionLockActiveAdoptionResult {
  readonly previous: ExecutionLockInfo;
  readonly adopted: ExecutionLockInfo;
  readonly audit: ExecutionLockActiveAdoptionAudit;
  readonly projectionPublication: 'completed' | 'uncertain';
}

export interface ExecutionLockActiveAdoptionResolution {
  readonly previous: ExecutionLockInfo;
  readonly adopted: ExecutionLockInfo;
  readonly audit: ExecutionLockActiveAdoptionAudit;
  readonly lineage: readonly ExecutionLockActiveAdoptionAudit[];
}

export interface ExecutionLockBoundaryResumeResolution {
  readonly previous: ExecutionLockQuarantineInfo;
  readonly resumed: ExecutionLockQuarantineInfo;
  readonly audit: ExecutionLockQuarantineAuditEvent;
  readonly lineage: readonly ExecutionLockQuarantineAuditEvent[];
}

export interface ExecutionLockRecoveryResult {
  readonly recovered: ExecutionLockQuarantineInfo;
  readonly audit: ExecutionLockQuarantineAuditEvent;
  readonly projectionCleanup: 'completed' | 'uncertain';
}

export interface ExecutionLockMountIdentity {
  readonly projectDev: string;
  readonly projectIno: string;
  readonly locksDev: string;
  readonly locksIno: string;
  readonly mountId: string;
}

export interface ExecutionLockMountAdoptionOptions {
  /**
   * Dry-run by default. Apply reconciles only namespace-local observational
   * metadata; stable dev+ino authority and the authority epoch never change.
   */
  readonly apply?: boolean;
  readonly operatorId?: string;
  readonly justification?: string;
  readonly now?: () => number;
}

export interface ExecutionLockMountAdoptionResult {
  readonly schemaVersion: typeof EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION;
  readonly decision: 'not-required' | 'eligible' | 'adopted';
  readonly authorityEpoch: string;
  readonly previous: ExecutionLockMountIdentity;
  readonly current: ExecutionLockMountIdentity;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionLockRecoveryVerificationContext {
  readonly attestation: ExecutionLockRecoveryAttestation;
  readonly quarantine: ExecutionLockQuarantineInfo;
  readonly quarantineDigest: string;
}

export interface ExecutionLockTerminalCommit {
  readonly kind: 'completed' | 'recovered';
  readonly lock: ExecutionLockInfo;
  readonly quarantine: ExecutionLockQuarantineInfo;
  readonly audit: ExecutionLockQuarantineAuditEvent;
}

export interface ExecutionLockLivenessProbe {
  inspect(
    owner: ExecutionLockOwnerIdentity,
    localIdentity: ExecutionLockRuntimeIdentity,
  ): ExecutionLockProcessState;
}

/** Backwards-compatible alias while callers move to the owner-aware seam. */
export type ExecutionLockProcessProbe = ExecutionLockLivenessProbe;

export interface ExecutionLockPostOperationFault {
  readonly phase: 'heartbeat' | 'release';
  readonly reason: ExecutionLockFailureReason;
}

export type ExecutionLockOperationOutcome<T> =
  | {
    readonly status: 'completed';
    readonly authority: 'released';
    readonly value: T;
    readonly fencingToken: ExecutionLockFencingToken;
  }
  | {
    readonly status: 'completed';
    readonly authority: 'quarantined';
    readonly value: T;
    readonly fencingToken: ExecutionLockFencingToken;
    readonly lock: ExecutionLockInfo;
    readonly quarantine: ExecutionLockQuarantineInfo;
    readonly fault: ExecutionLockPostOperationFault;
  }
  | {
    readonly status: 'completed';
    readonly authority: 'uncertain';
    readonly value: T;
    readonly fencingToken: ExecutionLockFencingToken;
    readonly lock: ExecutionLockInfo;
    readonly evidenceRefs: readonly string[];
    readonly fault: ExecutionLockPostOperationFault;
  };

export interface ExecutionLockOperationContext {
  readonly lock: ExecutionLockInfo;
  readonly fencingToken: ExecutionLockFencingToken;
  readonly signal: AbortSignal;
  assertAuthority(): void;
}

export interface ExecutionLockOptions {
  readonly leaseDurationMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly livenessProbe?: ExecutionLockLivenessProbe;
  readonly processProbe?: ExecutionLockProcessProbe;
  readonly runtimeIdentity?: ExecutionLockRuntimeIdentity;
  readonly ownerPid?: number;
  readonly now?: () => number;
  readonly projectionPublisher?: (
    projectRoot: string,
    lock: ExecutionLockInfo,
    replace: boolean,
  ) => void;
  /** Observability seam invoked after canonical release commits. */
  readonly releaseCommitObserver?: (released: ExecutionLockInfo) => void;
  /**
   * Deterministic observability/test seam invoked after projection-publish
   * compensation removes the canonical row and before stale-projection
   * cleanup begins. It cannot change the committed canonical decision.
   */
  readonly compensationCommitObserver?: (
    compensated: ExecutionLockInfo,
  ) => void;
  /** Observability/test seam after terminal DB commit and before projection cleanup. */
  readonly terminalCommitObserver?: (
    terminal: ExecutionLockTerminalCommit,
  ) => void;
  readonly onOutcome?: (
    outcome: ExecutionLockOperationOutcome<unknown>,
  ) => void;
}

export interface ExecutionLockRecoveryOptions extends ExecutionLockOptions {
  readonly recoveryAttestationVerifier: (
    context: ExecutionLockRecoveryVerificationContext,
  ) => boolean;
}

export type ExecutionLockInspection =
  | { readonly state: 'absent' }
  | { readonly state: 'held'; readonly lock: ExecutionLockInfo }
  | {
    readonly state: 'quarantined';
    readonly lock: ExecutionLockInfo;
    readonly quarantine: ExecutionLockQuarantineInfo;
  }
  | {
    readonly state: 'malformed';
    readonly lockPath: string;
    readonly reason:
      | 'unsafe-directory'
      | 'unsafe-entry'
      | 'invalid-projection'
      | 'authority-state-missing'
      | 'authority-epoch-mismatch'
      | 'secure-open-unsupported';
  };

export type ExecutionLockFailureReason =
  | 'held'
  | 'maintenance-held'
  | 'project-active'
  | 'malformed'
  | 'foreign-host'
  | 'liveness-unknown'
  | 'ownership-lost'
  | 'authority-lost'
  | 'authority-state-missing'
  | 'authority-epoch-mismatch'
  | 'secure-open-unsupported'
  | 'quarantined'
  | 'mutation-conflict'
  | 'invalid-input';

export class ExecutionLockError extends Error {
  constructor(
    message: string,
    public readonly taskId: string,
    public readonly reason: ExecutionLockFailureReason,
    public readonly conflictingOwnerId?: string,
    public readonly recoveryLock?: ExecutionLockInfo,
    public readonly canonicalCommitState?:
      | 'not-committed'
      | 'committed'
      | 'uncertain',
  ) {
    super(message);
    this.name = 'ExecutionLockError';
  }
}

interface ExecutionLockMetaRow {
  singleton: number;
  meta_version: number;
  authority_epoch: string;
  fencing_counter: number;
}

interface ExecutionLockCounterRow {
  authority_epoch: string;
  fencing_counter: number;
}

interface ExecutionLockActiveRow {
  task_id: string;
  owner_id: string;
  fencing_epoch: string;
  fencing_counter: number;
  fencing_nonce: string;
  payload_json: string;
}

interface ExecutionLockActiveAdoptionAuditRow {
  event_id: string;
  task_id: string;
  previous_owner_id: string;
  previous_fencing_epoch: string;
  previous_fencing_counter: number;
  previous_fencing_nonce: string;
  adopted_owner_id: string;
  adopted_fencing_epoch: string;
  adopted_fencing_counter: number;
  adopted_fencing_nonce: string;
  occurred_at: string;
  payload_json: string;
}

interface ExecutionLockQuarantineRow {
  task_id: string;
  quarantine_id: string;
  owner_id: string;
  fencing_epoch: string;
  fencing_counter: number;
  fencing_nonce: string;
  state: string;
  reason: string;
  entered_at: string;
  quarantined_at: string | null;
  payload_json: string;
}

interface ExecutionLockQuarantineAuditRow {
  event_id: string;
  action: string;
  quarantine_id: string;
  task_id: string;
  owner_id: string;
  fencing_epoch: string;
  fencing_counter: number;
  fencing_nonce: string;
  occurred_at: string;
  payload_json: string;
}

interface ExecutionLockAuthoritySentinel {
  readonly schemaVersion:
    typeof EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION;
  readonly authorityEpoch: string;
  readonly createdAt: string;
}

interface ExecutionLockPathIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface ExecutionLockDirectoryIdentity {
  readonly dev: string;
  readonly ino: string;
  readonly mountId: string;
}

interface ExecutionLockAuthorityAnchor {
  readonly schemaVersion: 1;
  readonly authorityEpoch: string;
  readonly project: ExecutionLockDirectoryIdentity;
  readonly locks: ExecutionLockDirectoryIdentity;
  readonly createdAt: string;
}

interface ExecutionLockPinnedDirectories {
  readonly adapter: 'linux' | 'wsl';
  readonly inputProjectRoot: string;
  readonly parentFd: number;
  readonly rootFd: number;
  readonly locksFd: number;
  readonly stableParentPath: string;
  readonly stableRootPath: string;
  readonly stableLocksPath: string;
  readonly projectIdentity: ExecutionLockDirectoryIdentity;
  readonly locksIdentity: ExecutionLockDirectoryIdentity;
}

interface ExecutionLockAuthorityFiles {
  readonly pinned: ExecutionLockPinnedDirectories;
  readonly rootBindingPath: string;
  readonly rootBindingIdentity: ExecutionLockPathIdentity;
  readonly anchorPath: string;
  readonly anchorIdentity: ExecutionLockPathIdentity;
  readonly anchorRaw: string;
  readonly anchor: ExecutionLockAuthorityAnchor;
  readonly dbPath: string;
  readonly dbIdentity: ExecutionLockPathIdentity;
  readonly initializeDatabase: boolean;
  readonly sentinelPath: string;
  readonly sentinelIdentity: ExecutionLockPathIdentity;
  readonly sentinel: ExecutionLockAuthoritySentinel;
  readonly sentinelRaw: string;
}

function executionLockPathFor(projectRoot: string, taskId: string): string {
  const hash = createHash('sha256').update(taskId, 'utf8').digest('hex');
  const locksDir =
    EXECUTION_LOCK_PINNED_LOCK_DIRECTORIES.get(projectRoot)
      ?? join(projectRoot, LOCKS_DIR);
  return join(locksDir, `${hash}.executionlock`);
}

function executionLockNow(options: ExecutionLockOptions): number {
  const value = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) {
    throw new ExecutionLockError(
      'Execution lock clock is outside the supported range',
      'unknown',
      'invalid-input',
    );
  }
  return value;
}

function executionLockTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function canonicalPathEquals(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    : left === right;
}

function ensureExecutionLockDirectory(projectRoot: string): string {
  const pinnedLocksDir =
    EXECUTION_LOCK_PINNED_LOCK_DIRECTORIES.get(projectRoot);
  if (pinnedLocksDir) return pinnedLocksDir;
  let canonicalRoot: string;
  try {
    canonicalRoot = realpathSync(projectRoot);
    if (!lstatSync(canonicalRoot).isDirectory()) throw ErrorRegistry.createError('DECKENT_E098', { message: 'not-directory' });
  } catch {
    throw new ExecutionLockError(
      `Execution lock project root is unsafe: ${projectRoot}`,
      'unknown',
      'malformed',
    );
  }

  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) {
    try {
      mkdirSync(locksDir, { recursive: false, mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  try {
    const entry = lstatSync(locksDir);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw ErrorRegistry.createError('DECKENT_E098', { message: 'unsafe-entry' });
    const canonicalLocks = realpathSync(locksDir);
    const expectedLocks = join(canonicalRoot, LOCKS_DIR);
    if (!canonicalPathEquals(canonicalLocks, expectedLocks)) {
      throw ErrorRegistry.createError('DECKENT_E098', { message: 'reparse-target' });
    }
    return canonicalLocks;
  } catch {
    throw new ExecutionLockError(
      `Execution lock directory is unsafe: ${locksDir}`,
      'unknown',
      'malformed',
    );
  }
}

function readBoundedRegularFile(path: string, maxBytes: number): string | null {
  let before: ReturnType<typeof lstatSync>;
  try {
    before = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (!before.isFile()
    || before.isSymbolicLink()
    || before.nlink !== 1
    || before.size > maxBytes) {
    throw ErrorRegistry.createError('DECKENT_E098', { message: 'unsafe-entry' });
  }

  let fd: number | undefined;
  try {
    fd = openSync(
      path,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.size > maxBytes
      || opened.nlink !== 1
      || opened.dev !== before.dev
      || opened.ino !== before.ino) {
      throw ErrorRegistry.createError('DECKENT_E098', { message: 'entry-changed' });
    }

    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset <= maxBytes) {
      const count = readSync(fd, buffer, offset, maxBytes + 1 - offset, null);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(fd);
    if (offset > maxBytes
      || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs
      || after.nlink !== 1
      || after.dev !== opened.dev
      || after.ino !== opened.ino) {
      throw ErrorRegistry.createError('DECKENT_E098', { message: 'entry-changed' });
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset));
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function detectExecutionLockRuntimeIdentity(): ExecutionLockRuntimeIdentity {
  if (process.platform === 'linux') {
    try {
      const machineId = readBoundedRegularFile('/etc/machine-id', 256)?.trim();
      const bootId =
        readBoundedRegularFile('/proc/sys/kernel/random/boot_id', 256)?.trim();
      const pidNamespace = readlinkSync('/proc/self/ns/pid', 'utf8');
      if (machineId && bootId && pidNamespace.length <= 256) {
        return {
          hostInstanceId: createHash('sha256').update(machineId).digest('hex'),
          bootSessionId: createHash('sha256')
            .update(`${bootId}:${pidNamespace}`)
            .digest('hex'),
          processSessionId: EXECUTION_LOCK_PROCESS_SESSION_ID,
        };
      }
    } catch {
      // Unverifiable host identity falls back to process-local authority.
    }
  }
  const processLocalId =
    `process-local:${EXECUTION_LOCK_PROCESS_SESSION_ID}`;
  return {
    hostInstanceId: processLocalId,
    bootSessionId: processLocalId,
    processSessionId: EXECUTION_LOCK_PROCESS_SESSION_ID,
  };
}

const DEFAULT_EXECUTION_LOCK_RUNTIME_IDENTITY =
  Object.freeze(detectExecutionLockRuntimeIdentity());

function validExecutionLockIdentity(
  identity: ExecutionLockRuntimeIdentity,
): boolean {
  return [identity.hostInstanceId, identity.bootSessionId, identity.processSessionId]
    .every(value => (
      typeof value === 'string'
      && Buffer.byteLength(value, 'utf8') <= MAX_EXECUTION_LOCK_IDENTITY_BYTES
      && EXECUTION_LOCK_IDENTITY_PATTERN.test(value)
    ));
}

function resolveExecutionLockIdentity(
  options: ExecutionLockOptions,
): ExecutionLockRuntimeIdentity {
  const identity =
    options.runtimeIdentity ?? DEFAULT_EXECUTION_LOCK_RUNTIME_IDENTITY;
  if (!validExecutionLockIdentity(identity)) {
    throw new ExecutionLockError(
      'Execution lock runtime identity is invalid',
      'unknown',
      'invalid-input',
    );
  }
  return identity;
}

const defaultExecutionLockLivenessProbe: ExecutionLockLivenessProbe = {
  inspect(
    owner: ExecutionLockOwnerIdentity,
    localIdentity: ExecutionLockRuntimeIdentity,
  ): ExecutionLockProcessState {
    if (owner.hostInstanceId !== localIdentity.hostInstanceId
      || owner.bootSessionId !== localIdentity.bootSessionId) {
      return 'foreign-host';
    }
    if (localIdentity.hostInstanceId.startsWith('process-local:')
      && owner.processSessionId !== localIdentity.processSessionId) {
      return 'foreign-host';
    }
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) return 'unknown';

    if (process.platform === 'linux') {
      try {
        const processEntry = lstatSync(`/proc/${owner.pid}`);
        return processEntry.isDirectory() ? 'alive' : 'unknown';
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ESRCH') return 'dead';
        return 'unknown';
      }
    }

    try {
      process.kill(owner.pid, 0);
      return 'alive';
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') return 'dead';
      if (code === 'EPERM') return 'alive';
      return 'unknown';
    }
  },
};

function executionLockLivenessProbe(
  options: ExecutionLockOptions,
): ExecutionLockLivenessProbe {
  return options.livenessProbe
    ?? options.processProbe
    ?? defaultExecutionLockLivenessProbe;
}

function executionLockPathIdentity(
  path: string,
  maxBytes: number,
): ExecutionLockPathIdentity {
  const entry = lstatSync(path);
  if (!entry.isFile()
    || entry.isSymbolicLink()
    || entry.nlink !== 1
    || entry.size > maxBytes) {
    throw new ExecutionLockError(
      `Execution lock authority path is unsafe: ${path}`,
      'unknown',
      'malformed',
    );
  }
  if (!Number.isSafeInteger(entry.dev)
    || !Number.isSafeInteger(entry.ino)
    || (entry.dev === 0 && entry.ino === 0)) {
    throw new ExecutionLockError(
      `Secure execution lock path identity is unsupported: ${path}`,
      'unknown',
      'secure-open-unsupported',
    );
  }
  return { dev: entry.dev, ino: entry.ino };
}

function executionLockPathIdentityEquals(
  left: ExecutionLockPathIdentity,
  right: ExecutionLockPathIdentity,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function executionLockPathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertSecureExecutionLockFilesystem(locksDir: string): void {
  if (typeof fsConstants.O_NOFOLLOW !== 'number'
    || fsConstants.O_NOFOLLOW === 0) {
    throw new ExecutionLockError(
      'Secure no-follow execution lock opens are unsupported',
      'unknown',
      'secure-open-unsupported',
    );
  }
  const entry = lstatSync(locksDir);
  if (!Number.isSafeInteger(entry.dev)
    || !Number.isSafeInteger(entry.ino)
    || (entry.dev === 0 && entry.ino === 0)) {
    throw new ExecutionLockError(
      `Secure execution lock directory identity is unsupported: ${locksDir}`,
      'unknown',
      'secure-open-unsupported',
    );
  }
  // Preflight durability support before the first sentinel is ever created;
  // unsupported platforms fail without leaving half-initialized authority.
  fsyncExecutionLockDirectory(locksDir);
}

function fsyncExecutionLockDirectory(locksDir: string): void {
  let fd: number | undefined;
  try {
    fd = openSync(
      locksDir,
      fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0),
    );
    fsyncSync(fd);
  } catch {
    throw new ExecutionLockError(
      `Durable execution lock directory sync is unsupported: ${locksDir}`,
      'unknown',
      'secure-open-unsupported',
    );
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve sync failure */ }
    }
  }
}

/**
 * PLATFORM-EXEC-AUTH-W1-INTERFACE-001: the typed four-capability platform
 * surface of the identity-stable execution authority (design:
 * docs/analysis/platform-execution-authority-adapters-2026-08-05.md §3-4).
 * Exactly one implementation exists today — the Linux/WSL /proc adapter
 * below. Darwin/Windows implementations arrive behind this interface
 * (W3/W4, native capability module per approved D1-D3) and are granted only
 * with per-platform real-binary proof; absence stays fail-closed
 * (`secure-open-unsupported`), never a silent downgrade.
 */
export interface ExecutionAuthorityPlatformAdapter {
  /** Typed platform classification; throws `secure-open-unsupported` when the
   *  identity-stable capability set is absent on this host. */
  classify(): 'linux' | 'wsl';
  /** Stable path that resolves an open directory fd without re-walking the
   *  caller-supplied path (fd-stable traversal capability). */
  stableFdPath(fd: number): string;
  /** Mount-identity pin for an open fd (bind-mount aliasing defense). */
  pinnedMountId(fd: number): string;
  /** dev+ino+mount directory identity for an open fd. */
  directoryIdentity(fd: number): ExecutionLockDirectoryIdentity;
}

function executionLockPlatformAdapter(): 'linux' | 'wsl' {
  if (process.platform !== 'linux'
    || !existsSync('/proc/self/fd')
    || typeof fsConstants.O_DIRECTORY !== 'number'
    || typeof fsConstants.O_NOFOLLOW !== 'number'
    || fsConstants.O_NOFOLLOW === 0) {
    throw new ExecutionLockError(
      `Identity-stable execution authority is unsupported on ${process.platform}`,
      'unknown',
      'secure-open-unsupported',
    );
  }
  let release = '';
  try {
    release = readFileSync('/proc/sys/kernel/osrelease', 'utf8');
  } catch {
    // A Linux host without readable kernel identity is still handled by the
    // same fd adapter; WSL classification is observability, not authority.
  }
  return /microsoft|wsl/iu.test(release) ? 'wsl' : 'linux';
}

function executionLockPinnedMountId(fd: number): string {
  let raw: string;
  try {
    raw = readFileSync(`/proc/self/fdinfo/${fd}`, 'utf8');
  } catch {
    throw new ExecutionLockError(
      'Execution authority mount identity is unavailable',
      'unknown',
      'secure-open-unsupported',
    );
  }
  const match = /^mnt_id:\s*([1-9]\d*)$/mu.exec(raw);
  if (!match) {
    throw new ExecutionLockError(
      'Execution authority mount identity is invalid',
      'unknown',
      'secure-open-unsupported',
    );
  }
  return match[1]!;
}

function executionLockDirectoryIdentity(
  fd: number,
): ExecutionLockDirectoryIdentity {
  const entry = fstatSync(fd, { bigint: true });
  if (!entry.isDirectory() || entry.dev <= 0n || entry.ino <= 0n) {
    throw new ExecutionLockError(
      'Execution authority directory identity is unsupported',
      'unknown',
      'secure-open-unsupported',
    );
  }
  return {
    dev: entry.dev.toString(),
    ino: entry.ino.toString(),
    mountId: executionLockPinnedMountId(fd),
  };
}

function executionLockDirectoryIdentityEquals(
  left: ExecutionLockDirectoryIdentity,
  right: ExecutionLockDirectoryIdentity,
): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mountId === right.mountId;
}

function executionLockStatsIdentity(
  entry: ReturnType<typeof statSync>,
  mountId: string,
): ExecutionLockDirectoryIdentity {
  const value = entry as unknown as {
    readonly dev: bigint | number;
    readonly ino: bigint | number;
    isDirectory(): boolean;
  };
  if (!value.isDirectory()) {
    throw new ExecutionLockError(
      'Execution authority path is not a directory',
      'unknown',
      'malformed',
    );
  }
  return {
    dev: String(value.dev),
    ino: String(value.ino),
    mountId,
  };
}

/** The only granted implementation today (Linux/WSL /proc facility). */
export const linuxProcExecutionAuthorityAdapter: ExecutionAuthorityPlatformAdapter =
  Object.freeze({
    classify: executionLockPlatformAdapter,
    stableFdPath: (fd: number) => `/proc/self/fd/${fd}`,
    pinnedMountId: executionLockPinnedMountId,
    directoryIdentity: executionLockDirectoryIdentity,
  });

/**
 * W3-PR-B (PLATFORM-EXEC-AUTH-W3-DARWIN-001, design §10): the OP-BASED v2
 * surface. v1's `stableFdPath` is Linux-shaped — Darwin has no stable fd path,
 * so every capability consumers actually need is expressed as an operation on
 * an open handle. The Linux implementation routes each op through the /proc
 * facility (byte-equivalent to the pre-v2 path composition); the Darwin
 * implementation (slice-2) fills the same ops from the native addon, and W4
 * Windows fills them with handle-relative NT primitives.
 */
export interface ExecutionAuthorityOpsV2 {
  classify(): 'linux' | 'wsl' | 'darwin';
  /** Open a directory strictly relative to an already-pinned parent handle
   *  (or an absolute path when parentFd is null), O_NOFOLLOW at every step. */
  openDirAt(parentFd: number | null, name: string): number;
  closeFd(fd: number): void;
  readdirOf(fd: number): string[];
  unlinkAt(fd: number, name: string, removeDir: boolean): void;
  renameAt(fromFd: number, fromName: string, toFd: number, toName: string): void;
  identityOf(fd: number): ExecutionLockDirectoryIdentity;
  /** Kernel-verified current path of the handle (Linux: /proc realpath;
   *  Darwin slice-2: F_GETPATH). Consumers that must hand a PATH to a
   *  path-only API (SQLite) use this + post-open identity re-verification. */
  realPathOf(fd: number): string;
}

// Computed lazily: file-lock's contract is that fsConstants is only touched
// inside calls, never at module-eval — stale vi.mock('node:fs') fixtures
// without a `constants` export import this module transitively and must not
// explode at import time (the FAZ4 #1 root-cause class).
const executionDirOpenFlags = (): number =>
  fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;

export const linuxProcExecutionAuthorityOpsV2: ExecutionAuthorityOpsV2 =
  Object.freeze({
    classify: executionLockPlatformAdapter,
    openDirAt: (parentFd: number | null, name: string): number => (
      parentFd === null
        ? openSync(name, executionDirOpenFlags())
        : openSync(join(`/proc/self/fd/${parentFd}`, name), executionDirOpenFlags())
    ),
    closeFd: (fd: number): void => closeSync(fd),
    readdirOf: (fd: number): string[] => readdirSync(`/proc/self/fd/${fd}`).sort(),
    unlinkAt: (fd: number, name: string, removeDir: boolean): void => {
      const target = join(`/proc/self/fd/${fd}`, name);
      if (removeDir) rmdirSync(target);
      else unlinkSync(target);
    },
    renameAt: (fromFd: number, fromName: string, toFd: number, toName: string): void =>
      renameSync(
        join(`/proc/self/fd/${fromFd}`, fromName),
        join(`/proc/self/fd/${toFd}`, toName),
      ),
    identityOf: executionLockDirectoryIdentity,
    realPathOf: (fd: number): string => realpathSync(`/proc/self/fd/${fd}`),
  });

/**
 * W3-PR-B slice-2 (PLATFORM-EXEC-AUTH-W3-DARWIN-001, design §4.1/§10): the
 * Darwin implementation of the op surface, filled entirely from the native
 * addon (@deckent/exec-authority-native — openat family + F_GETPATH + f_fsid).
 * Binding absence is the same typed fail-closed boundary as every missing
 * capability (`secure-open-unsupported`, D3) — never a path-based fallback.
 * Consumer wiring (pinExecutionLockDirectories, clean.mjs twin) and the
 * real-Mac real-binary closure proof are slice-3 scope.
 */
function requireDarwinExecAuthorityNative(): ExecAuthorityNativeLegacyFacade {
  if (process.platform !== 'darwin') {
    throw new ExecutionLockError(
      `Darwin execution authority is unsupported on ${process.platform}`,
      'unknown',
      'secure-open-unsupported',
    );
  }
  const state = loadExecAuthorityNative();
  if (!state.available) {
    throw new ExecutionLockError(
      `Execution authority native capability is unavailable (${state.reason})`,
      'unknown',
      'secure-open-unsupported',
    );
  }
  if (!state.manifest.features.includes('legacy-posix-fd-v1')) {
    throw new ExecutionLockError(
      'Darwin execution authority native capability is unavailable',
      'unknown',
      'secure-open-unsupported',
    );
  }
  return state.legacy;
}

export const darwinNativeExecutionAuthorityOpsV2: ExecutionAuthorityOpsV2 =
  Object.freeze({
    classify: (): 'darwin' => {
      requireDarwinExecAuthorityNative();
      return 'darwin';
    },
    openDirAt: (parentFd: number | null, name: string): number =>
      requireDarwinExecAuthorityNative().openDirAt(parentFd, name),
    closeFd: (fd: number): void => requireDarwinExecAuthorityNative().closeFd(fd),
    // The C primitive returns directory order; the op contract (twin parity)
    // is sorted output.
    readdirOf: (fd: number): string[] =>
      [...requireDarwinExecAuthorityNative().readdirFd(fd)].sort(),
    unlinkAt: (fd: number, name: string, removeDir: boolean): void =>
      requireDarwinExecAuthorityNative().unlinkAt(fd, name, removeDir),
    renameAt: (fromFd: number, fromName: string, toFd: number, toName: string): void =>
      requireDarwinExecAuthorityNative().renameAt(fromFd, fromName, toFd, toName),
    identityOf: (fd: number): ExecutionLockDirectoryIdentity => {
      const native = requireDarwinExecAuthorityNative();
      const identity = native.fstatIdentity(fd);
      if (!identity.isDirectory) {
        throw new ExecutionLockError(
          'Execution authority directory identity is unsupported',
          'unknown',
          'secure-open-unsupported',
        );
      }
      const mount = native.mountIdentity(fd);
      if (!mount.available || !mount.fsid) {
        throw new ExecutionLockError(
          'Execution authority mount identity is unavailable',
          'unknown',
          'secure-open-unsupported',
        );
      }
      return { dev: identity.dev, ino: identity.ino, mountId: mount.fsid };
    },
    realPathOf: (fd: number): string => requireDarwinExecAuthorityNative().fdPath(fd),
  });

/**
 * Platform-resolved op surface. Linux/WSL keeps the /proc facility
 * byte-for-byte; Darwin resolves to the native-addon implementation whose
 * every op is fail-closed on binding absence. Anything else is a typed
 * unsupported boundary — never a guess (Law 2).
 */
export function resolveExecutionAuthorityOpsV2(): ExecutionAuthorityOpsV2 {
  if (process.platform === 'linux') return linuxProcExecutionAuthorityOpsV2;
  if (process.platform === 'darwin') return darwinNativeExecutionAuthorityOpsV2;
  throw new ExecutionLockError(
    `Identity-stable execution authority is unsupported on ${process.platform}`,
    'unknown',
    'secure-open-unsupported',
  );
}

function pinExecutionLockDirectories(
  projectRoot: string,
): ExecutionLockPinnedDirectories {
  const adapter = linuxProcExecutionAuthorityAdapter.classify();
  let parentFd: number | undefined;
  let rootFd: number | undefined;
  let locksFd: number | undefined;
  try {
    const canonicalRoot = realpathSync(projectRoot);
    // W3-PR-B slice-1: opens route through the op surface; behavior-identical
    // on Linux, and the locks handle below now opens RELATIVE to the pinned
    // root handle (no absolute re-walk) — the shape Darwin/Windows need.
    parentFd = linuxProcExecutionAuthorityOpsV2.openDirAt(null, dirname(canonicalRoot));
    rootFd = linuxProcExecutionAuthorityOpsV2.openDirAt(null, canonicalRoot);
    const stableRootPath = linuxProcExecutionAuthorityAdapter.stableFdPath(rootFd);
    const stableParentPath = linuxProcExecutionAuthorityAdapter.stableFdPath(parentFd);
    const projectIdentity = executionLockDirectoryIdentity(rootFd);
    const inputIdentity = executionLockStatsIdentity(
      statSync(projectRoot, { bigint: true }) as unknown as ReturnType<typeof statSync>,
      projectIdentity.mountId,
    );
    if (!executionLockDirectoryIdentityEquals(projectIdentity, inputIdentity)
      || !executionLockDirectoryIdentityEquals(
        projectIdentity,
        executionLockStatsIdentity(
          statSync(stableRootPath, { bigint: true }) as unknown as ReturnType<typeof statSync>,
          projectIdentity.mountId,
        ),
      )) {
      throw new ExecutionLockError(
        'Execution authority project root changed while it was pinned',
        'unknown',
        'malformed',
      );
    }

    const namedLocksPath = join(stableRootPath, LOCKS_DIR);
    if (!existsSync(namedLocksPath)) {
      try {
        mkdirSync(namedLocksPath, { recursive: false, mode: 0o700 });
        fsyncExecutionLockDirectory(stableRootPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const namedLocks = lstatSync(namedLocksPath, { bigint: true });
    if (!namedLocks.isDirectory() || namedLocks.isSymbolicLink()) {
      throw new ExecutionLockError(
        'Execution authority lock directory is unsafe',
        'unknown',
        'malformed',
      );
    }
    locksFd = linuxProcExecutionAuthorityOpsV2.openDirAt(rootFd, LOCKS_DIR);
    const stableLocksPath = linuxProcExecutionAuthorityAdapter.stableFdPath(locksFd);
    const locksIdentity = executionLockDirectoryIdentity(locksFd);
    if (locksIdentity.dev !== projectIdentity.dev
      || locksIdentity.mountId !== projectIdentity.mountId
      || String(namedLocks.dev) !== locksIdentity.dev
      || String(namedLocks.ino) !== locksIdentity.ino) {
      throw new ExecutionLockError(
        'Execution authority lock directory crossed an identity boundary',
        'unknown',
        'malformed',
      );
    }
    EXECUTION_LOCK_PINNED_LOCK_DIRECTORIES.set(
      stableRootPath,
      stableLocksPath,
    );
    return {
      adapter,
      inputProjectRoot: projectRoot,
      parentFd,
      rootFd,
      locksFd,
      stableParentPath,
      stableRootPath,
      stableLocksPath,
      projectIdentity,
      locksIdentity,
    };
  } catch (error) {
    if (locksFd !== undefined) {
      try { closeSync(locksFd); } catch { /* preserve pin failure */ }
    }
    if (rootFd !== undefined) {
      try { closeSync(rootFd); } catch { /* preserve pin failure */ }
    }
    if (parentFd !== undefined) {
      try { closeSync(parentFd); } catch { /* preserve pin failure */ }
    }
    if (error instanceof ExecutionLockError) throw error;
    throw new ExecutionLockError(
      'Execution authority directories could not be pinned',
      'unknown',
      'secure-open-unsupported',
    );
  }
}

function validatePinnedExecutionLockDirectories(
  pinned: ExecutionLockPinnedDirectories,
): void {
  const projectIdentity = executionLockDirectoryIdentity(pinned.rootFd);
  const locksIdentity = executionLockDirectoryIdentity(pinned.locksFd);
  let inputIdentity: ExecutionLockDirectoryIdentity;
  let namedLocks: ReturnType<typeof lstatSync> | undefined;
  try {
    const parentEntry = fstatSync(pinned.parentFd);
    if (!parentEntry.isDirectory()) throw new DeckentError('E_PARENT_NOT_DIRECTORY', 'parent-not-directory');
    inputIdentity = executionLockStatsIdentity(
      statSync(pinned.inputProjectRoot, { bigint: true }) as unknown as ReturnType<typeof statSync>,
      projectIdentity.mountId,
    );
    namedLocks = lstatSync(join(pinned.stableRootPath, LOCKS_DIR), {
      bigint: true,
    }) as unknown as ReturnType<typeof lstatSync>;
  } catch {
    throw new ExecutionLockError(
      'Execution authority directory binding is unavailable',
      'unknown',
      'authority-state-missing',
    );
  }
  if (!namedLocks) {
    throw new ExecutionLockError(
      'Execution authority lock-directory binding is unavailable',
      'unknown',
      'authority-state-missing',
    );
  }
  if (!executionLockDirectoryIdentityEquals(
    projectIdentity,
    pinned.projectIdentity,
  )
    || !executionLockDirectoryIdentityEquals(
      inputIdentity,
      pinned.projectIdentity,
    )
    || !executionLockDirectoryIdentityEquals(
      locksIdentity,
      pinned.locksIdentity,
    )
    || !namedLocks.isDirectory()
    || namedLocks.isSymbolicLink()
    || String(namedLocks.dev) !== pinned.locksIdentity.dev
    || String(namedLocks.ino) !== pinned.locksIdentity.ino) {
    throw new ExecutionLockError(
      'Execution authority directory generation changed',
      'unknown',
      'authority-epoch-mismatch',
    );
  }
}

function closePinnedExecutionLockDirectories(
  pinned: ExecutionLockPinnedDirectories,
): boolean {
  EXECUTION_LOCK_PINNED_LOCK_DIRECTORIES.delete(pinned.stableRootPath);
  let closed = true;
  for (const fd of [pinned.locksFd, pinned.rootFd, pinned.parentFd]) {
    try {
      closeSync(fd);
    } catch {
      closed = false;
    }
  }
  return closed;
}

function parseExecutionLockAuthoritySentinel(
  raw: string,
): ExecutionLockAuthoritySentinel | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (!exactKeys(record, [
      'schemaVersion',
      'authorityEpoch',
      'createdAt',
    ])
      || record.schemaVersion
        !== EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION
      || typeof record.authorityEpoch !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.authorityEpoch)
      || !canonicalExecutionLockTimestamp(record.createdAt)) {
      return null;
    }
    return {
      schemaVersion: EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION,
      authorityEpoch: record.authorityEpoch,
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}

function parseExecutionLockAuthorityAnchor(
  raw: string,
): ExecutionLockAuthorityAnchor | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const parseDirectory = (
      candidate: unknown,
    ): ExecutionLockDirectoryIdentity | null => {
      if (typeof candidate !== 'object'
        || candidate === null
        || Array.isArray(candidate)) return null;
      const directory = candidate as Record<string, unknown>;
      if (!exactKeys(directory, ['dev', 'ino', 'mountId'])
        || typeof directory.dev !== 'string'
        || !/^[1-9]\d*$/u.test(directory.dev)
        || typeof directory.ino !== 'string'
        || !/^[1-9]\d*$/u.test(directory.ino)
        || typeof directory.mountId !== 'string'
        || !/^[1-9]\d*$/u.test(directory.mountId)) return null;
      return {
        dev: directory.dev,
        ino: directory.ino,
        mountId: directory.mountId,
      };
    };
    const project = parseDirectory(record.project);
    const locks = parseDirectory(record.locks);
    if (!exactKeys(record, [
      'schemaVersion',
      'authorityEpoch',
      'project',
      'locks',
      'createdAt',
    ])
      || record.schemaVersion !== 1
      || typeof record.authorityEpoch !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.authorityEpoch)
      || !project
      || !locks
      || project.dev !== locks.dev
      || project.mountId !== locks.mountId
      || !canonicalExecutionLockTimestamp(record.createdAt)) {
      return null;
    }
    return {
      schemaVersion: 1,
      authorityEpoch: record.authorityEpoch,
      project,
      locks,
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}

function readExecutionLockAuthorityAnchor(
  anchorPath: string,
): {
  readonly anchor: ExecutionLockAuthorityAnchor;
  readonly raw: string;
  readonly identity: ExecutionLockPathIdentity;
} | null {
  if (!executionLockPathExists(anchorPath)) return null;
  const identity =
    executionLockPathIdentity(anchorPath, MAX_EXECUTION_LOCK_ANCHOR_BYTES);
  let raw: string | null;
  try {
    raw = readBoundedRegularFile(anchorPath, MAX_EXECUTION_LOCK_ANCHOR_BYTES);
  } catch {
    throw new ExecutionLockError(
      `Execution authority anchor is unsafe: ${anchorPath}`,
      'unknown',
      'malformed',
    );
  }
  const anchor = raw === null
    ? null
    : parseExecutionLockAuthorityAnchor(raw);
  if (!raw || !anchor) {
    throw new ExecutionLockError(
      `Execution authority anchor is invalid: ${anchorPath}`,
      'unknown',
      'malformed',
    );
  }
  const after =
    executionLockPathIdentity(anchorPath, MAX_EXECUTION_LOCK_ANCHOR_BYTES);
  if (!executionLockPathIdentityEquals(identity, after)) {
    throw new ExecutionLockError(
      `Execution authority anchor changed during read: ${anchorPath}`,
      'unknown',
      'malformed',
    );
  }
  return { anchor, raw, identity };
}

function createExecutionLockAuthorityAnchor(
  pinned: ExecutionLockPinnedDirectories,
  anchorPath: string,
  authorityEpoch: string,
  createdAt: string,
): boolean {
  const anchor: ExecutionLockAuthorityAnchor = {
    schemaVersion: 1,
    authorityEpoch,
    project: pinned.projectIdentity,
    locks: pinned.locksIdentity,
    createdAt,
  };
  const raw = JSON.stringify(anchor);
  let fd: number | undefined;
  try {
    fd = openSync(
      anchorPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, raw, 'utf8');
    fsyncSync(fd);
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.nlink !== 1
      || opened.size !== Buffer.byteLength(raw, 'utf8')) {
      throw new ExecutionLockError(
        'Execution authority anchor creation is unsafe',
        'unknown',
        'malformed',
      );
    }
    closeSync(fd);
    fd = undefined;
    fsyncExecutionLockDirectory(pinned.stableRootPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve creation failure */ }
    }
  }
}

function executionLockRootBindingPath(
  pinned: ExecutionLockPinnedDirectories,
): string {
  const rootName = basename(pinned.inputProjectRoot);
  const key = createHash('sha256').update(rootName, 'utf8').digest('hex');
  return join(
    pinned.stableParentPath,
    `${EXECUTION_LOCK_ROOT_BINDING_PREFIX}.${key}.json`,
  );
}

function createExecutionLockRootBinding(
  pinned: ExecutionLockPinnedDirectories,
  bindingPath: string,
  anchor: ExecutionLockAuthorityAnchor,
): boolean {
  const raw = JSON.stringify(anchor);
  let fd: number | undefined;
  try {
    fd = openSync(
      bindingPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, raw, 'utf8');
    fsyncSync(fd);
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.nlink !== 1
      || opened.size !== Buffer.byteLength(raw, 'utf8')) {
      throw new ExecutionLockError(
        'Execution authority root binding creation is unsafe',
        'unknown',
        'malformed',
      );
    }
    closeSync(fd);
    fd = undefined;
    fsyncExecutionLockDirectory(pinned.stableParentPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve creation failure */ }
    }
  }
}

function assertExecutionLockAnchorBinding(
  anchor: ExecutionLockAuthorityAnchor,
  pinned: ExecutionLockPinnedDirectories,
): void {
  // Linux mount ids are local to a mount namespace. The same project inode
  // legitimately has different mount ids in a host shell, sandbox, container,
  // or WSL process after remount. Persisting that namespace-local number as
  // cross-process authority causes healthy processes to invalidate each other.
  //
  // The durable generation boundary is dev+ino for both the project and
  // `.locks`; mountId remains mandatory for the pinned descriptors and every
  // within-process path comparison in validatePinnedExecutionLockDirectories().
  if (!executionLockStableDirectoryIdentityEquals(
    anchor.project,
    pinned.projectIdentity,
  )
    || !executionLockStableDirectoryIdentityEquals(
      anchor.locks,
      pinned.locksIdentity,
    )) {
    throw new ExecutionLockError(
      'Execution authority anchor rejects a replaced project or lock directory',
      'unknown',
      'authority-epoch-mismatch',
    );
  }
}

function executionLockAuthorityAnchorEquals(
  left: ExecutionLockAuthorityAnchor,
  right: ExecutionLockAuthorityAnchor,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.authorityEpoch === right.authorityEpoch
    && left.createdAt === right.createdAt
    && executionLockStableDirectoryIdentityEquals(left.project, right.project)
    && executionLockStableDirectoryIdentityEquals(left.locks, right.locks);
}

function readExecutionLockAuthoritySentinel(
  sentinelPath: string,
): {
  readonly sentinel: ExecutionLockAuthoritySentinel;
  readonly raw: string;
  readonly identity: ExecutionLockPathIdentity;
} {
  const identity = executionLockPathIdentity(
    sentinelPath,
    MAX_EXECUTION_LOCK_SENTINEL_BYTES,
  );
  let raw: string | null;
  try {
    raw = readBoundedRegularFile(
      sentinelPath,
      MAX_EXECUTION_LOCK_SENTINEL_BYTES,
    );
  } catch {
    throw new ExecutionLockError(
      `Execution lock authority sentinel is unsafe: ${sentinelPath}`,
      'unknown',
      'malformed',
    );
  }
  const sentinel = raw === null
    ? null
    : parseExecutionLockAuthoritySentinel(raw);
  if (!raw || !sentinel) {
    throw new ExecutionLockError(
      `Execution lock authority sentinel is invalid: ${sentinelPath}`,
      'unknown',
      'malformed',
    );
  }
  const afterRead = executionLockPathIdentity(
    sentinelPath,
    MAX_EXECUTION_LOCK_SENTINEL_BYTES,
  );
  if (!executionLockPathIdentityEquals(identity, afterRead)) {
    throw new ExecutionLockError(
      `Execution lock authority sentinel changed during read: ${sentinelPath}`,
      'unknown',
      'malformed',
    );
  }
  return { sentinel, raw, identity };
}

function createExecutionLockAuthoritySentinel(
  locksDir: string,
  sentinelPath: string,
  authorityEpoch: string = randomUUID(),
  createdAt: string = new Date().toISOString(),
): boolean {
  const sentinel: ExecutionLockAuthoritySentinel = {
    schemaVersion: EXECUTION_LOCK_AUTHORITY_SENTINEL_SCHEMA_VERSION,
    authorityEpoch,
    createdAt,
  };
  const raw = JSON.stringify(sentinel);
  let fd: number | undefined;
  try {
    fd = openSync(
      sentinelPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, raw, 'utf8');
    fsyncSync(fd);
    const opened = fstatSync(fd);
    if (!opened.isFile()
      || opened.nlink !== 1
      || opened.size !== Buffer.byteLength(raw, 'utf8')) {
      throw new ExecutionLockError(
        `Execution lock authority sentinel creation is unsafe: ${sentinelPath}`,
        'unknown',
        'malformed',
      );
    }
    closeSync(fd);
    fd = undefined;
    fsyncExecutionLockDirectory(locksDir);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve creation failure */ }
    }
  }
}

function createExecutionLockDatabaseFile(
  locksDir: string,
  dbPath: string,
): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(
      dbPath,
      fsConstants.O_RDWR
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    fsyncExecutionLockDirectory(locksDir);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve creation failure */ }
    }
  }
}

function hasExecutionLockAuthorityArtifacts(locksDir: string): boolean {
  return readdirSync(locksDir).some(name =>
    name === EXECUTION_LOCK_COORDINATION_DB_FILENAME
    || name.startsWith(`${EXECUTION_LOCK_COORDINATION_DB_FILENAME}-`)
    || name === EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME
    || name.includes('.executionlock'),
  );
}

function executionLockAuthorityArtifactsAreUnsafe(locksDir: string): boolean {
  return readdirSync(locksDir, { withFileTypes: true }).some(entry => {
    const authorityArtifact =
      entry.name === EXECUTION_LOCK_COORDINATION_DB_FILENAME
      || entry.name.startsWith(`${EXECUTION_LOCK_COORDINATION_DB_FILENAME}-`)
      || entry.name === EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME
      || entry.name.includes('.executionlock');
    return authorityArtifact
      && (!entry.isFile() || entry.isSymbolicLink());
  });
}

function validateExecutionLockDatabaseSidecars(dbPath: string): void {
  for (const suffix of ['-wal', '-shm'] as const) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (executionLockPathExists(sidecarPath)) {
      throw new ExecutionLockError(
        `Unsupported execution lock database sidecar: ${sidecarPath}`,
        'unknown',
        'malformed',
      );
    }
  }
  const journalPath = `${dbPath}-journal`;
  if (executionLockPathExists(journalPath)) {
    executionLockPathIdentity(journalPath, MAX_EXECUTION_LOCK_DB_BYTES);
  }
}

function prepareExecutionLockAuthority(
  projectRoot: string,
): ExecutionLockAuthorityFiles {
  const pinned = pinExecutionLockDirectories(projectRoot);
  try {
    validatePinnedExecutionLockDirectories(pinned);
    assertSecureExecutionLockFilesystem(pinned.stableLocksPath);
    // Prove both directory durability boundaries before creating the dual
    // anchor. Unsupported hosts leave zero authority artifacts.
    fsyncExecutionLockDirectory(pinned.stableRootPath);
    fsyncExecutionLockDirectory(pinned.stableLocksPath);
    const locksDir = pinned.stableLocksPath;
    const dbPath = join(locksDir, EXECUTION_LOCK_COORDINATION_DB_FILENAME);
    const sentinelPath =
      join(locksDir, EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME);
    const anchorPath =
      join(pinned.stableRootPath, EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME);
    const rootBindingPath = executionLockRootBindingPath(pinned);
    let dbExists = executionLockPathExists(dbPath);
    let sentinelExists = executionLockPathExists(sentinelPath);
    let initializeDatabase = false;
    let sentinelRead = sentinelExists
      ? readExecutionLockAuthoritySentinel(sentinelPath)
      : null;
    let anchorRead = readExecutionLockAuthorityAnchor(anchorPath);
    let createdAnchor = false;

    if (!anchorRead) {
      if (dbExists !== sentinelExists) {
        throw new ExecutionLockError(
          'Execution lock authority is incomplete before anchor migration',
          'unknown',
          'authority-state-missing',
        );
      }
      if (dbExists && sentinelRead) {
        createdAnchor = createExecutionLockAuthorityAnchor(
          pinned,
          anchorPath,
          sentinelRead.sentinel.authorityEpoch,
          sentinelRead.sentinel.createdAt,
        );
      } else {
        if (hasExecutionLockAuthorityArtifacts(locksDir)) {
          throw new ExecutionLockError(
            executionLockAuthorityArtifactsAreUnsafe(locksDir)
              ? 'Unsafe execution lock authority artifact exists without canonical state'
              : 'Execution lock authority artifacts exist without canonical state',
            'unknown',
            'malformed',
          );
        }
        createdAnchor = createExecutionLockAuthorityAnchor(
          pinned,
          anchorPath,
          randomUUID(),
          new Date().toISOString(),
        );
      }
      anchorRead = readExecutionLockAuthorityAnchor(anchorPath);
    }
    if (!anchorRead) {
      throw new ExecutionLockError(
        'Execution authority anchor creation could not be verified',
        'unknown',
        'authority-state-missing',
      );
    }
    assertExecutionLockAnchorBinding(anchorRead.anchor, pinned);
    const createdRootBinding = createExecutionLockRootBinding(
      pinned,
      rootBindingPath,
      anchorRead.anchor,
    );
    const rootBindingRead =
      readExecutionLockAuthorityAnchor(rootBindingPath);
    if (!rootBindingRead) {
      throw new ExecutionLockError(
        'Execution authority root binding is unavailable',
        'unknown',
        'authority-state-missing',
      );
    }
    assertExecutionLockAnchorBinding(rootBindingRead.anchor, pinned);
    if (!executionLockAuthorityAnchorEquals(
      rootBindingRead.anchor,
      anchorRead.anchor,
    )) {
      throw new ExecutionLockError(
        'Execution authority root binding disagrees with the project anchor',
        'unknown',
        'authority-epoch-mismatch',
      );
    }
    if (createdRootBinding) {
      fsyncExecutionLockDirectory(pinned.stableParentPath);
    }

    if (!dbExists && !sentinelExists && createdAnchor) {
      const createdSentinel = createExecutionLockAuthoritySentinel(
        locksDir,
        sentinelPath,
        anchorRead.anchor.authorityEpoch,
        anchorRead.anchor.createdAt,
      );
      sentinelExists = true;
      if (!createdSentinel) {
        throw new ExecutionLockError(
          'Execution lock sentinel appeared during anchored initialization',
          'unknown',
          'authority-state-missing',
        );
      }
      initializeDatabase =
        createExecutionLockDatabaseFile(locksDir, dbPath);
      dbExists = true;
      if (!initializeDatabase) {
        throw new ExecutionLockError(
          'Execution lock database appeared during anchored initialization',
          'unknown',
          'authority-state-missing',
        );
      }
    } else if (!dbExists || !sentinelExists) {
      const deadline = Date.now() + EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS;
      const waiter = new Int32Array(new SharedArrayBuffer(4));
      while (Date.now() < deadline && (!dbExists || !sentinelExists)) {
        Atomics.wait(waiter, 0, 0, 10);
        dbExists = executionLockPathExists(dbPath);
        sentinelExists = executionLockPathExists(sentinelPath);
      }
    }

    if (!sentinelExists || !dbExists) {
      throw new ExecutionLockError(
        'Execution lock authority database/sentinel state is incomplete',
        'unknown',
        'authority-state-missing',
      );
    }
    sentinelRead = readExecutionLockAuthoritySentinel(sentinelPath);
    if (sentinelRead.sentinel.authorityEpoch
      !== anchorRead.anchor.authorityEpoch) {
      throw new ExecutionLockError(
        'Execution lock sentinel and root anchor epochs disagree',
        'unknown',
        'authority-epoch-mismatch',
      );
    }
    validateExecutionLockDatabaseSidecars(dbPath);
    const dbIdentity =
      executionLockPathIdentity(dbPath, MAX_EXECUTION_LOCK_DB_BYTES);
    validatePinnedExecutionLockDirectories(pinned);
    return {
      pinned,
      rootBindingPath,
      rootBindingIdentity: rootBindingRead.identity,
      anchorPath,
      anchorIdentity: anchorRead.identity,
      anchorRaw: anchorRead.raw,
      anchor: anchorRead.anchor,
      dbPath,
      dbIdentity,
      initializeDatabase,
      sentinelPath,
      sentinelIdentity: sentinelRead.identity,
      sentinel: sentinelRead.sentinel,
      sentinelRaw: sentinelRead.raw,
    };
  } catch (error) {
    try {
      closePinnedExecutionLockDirectories(pinned);
    } catch {
      // Preserve the authority preparation failure.
    }
    throw error;
  }
}

function validateExecutionLockAuthorityFiles(
  files: ExecutionLockAuthorityFiles,
): void {
  validatePinnedExecutionLockDirectories(files.pinned);
  validateExecutionLockDatabaseSidecars(files.dbPath);
  const dbIdentity =
    executionLockPathIdentity(files.dbPath, MAX_EXECUTION_LOCK_DB_BYTES);
  const anchorRead =
    readExecutionLockAuthorityAnchor(files.anchorPath);
  const rootBindingRead =
    readExecutionLockAuthorityAnchor(files.rootBindingPath);
  const sentinelRead =
    readExecutionLockAuthoritySentinel(files.sentinelPath);
  if (!anchorRead
    || !rootBindingRead
    || !executionLockPathIdentityEquals(
      files.rootBindingIdentity,
      rootBindingRead.identity,
    )
    || rootBindingRead.raw !== files.anchorRaw
    || JSON.stringify(rootBindingRead.anchor)
      !== JSON.stringify(files.anchor)
    || !executionLockPathIdentityEquals(
      files.anchorIdentity,
      anchorRead.identity,
    )
    || anchorRead.raw !== files.anchorRaw
    || JSON.stringify(anchorRead.anchor) !== JSON.stringify(files.anchor)
    || !executionLockPathIdentityEquals(files.dbIdentity, dbIdentity)
    || !executionLockPathIdentityEquals(
      files.sentinelIdentity,
      sentinelRead.identity,
    )
    || sentinelRead.raw !== files.sentinelRaw
    || sentinelRead.sentinel.authorityEpoch !== files.anchor.authorityEpoch) {
    throw new ExecutionLockError(
      'Execution lock authority files changed during mutation',
      'unknown',
      'malformed',
    );
  }
}

function validateExecutionLockDatabaseReportedPath(
  db: DatabaseType,
  dbPath: string,
): void {
  const rows = db.pragma('database_list') as Array<{
    readonly name?: unknown;
    readonly file?: unknown;
  }>;
  const main = rows.find(row => row.name === 'main');
  if (!main
    || typeof main.file !== 'string'
    || !canonicalPathEquals(realpathSync(main.file), realpathSync(dbPath))) {
    throw new ExecutionLockError(
      'SQLite opened an unexpected execution lock authority path',
      'unknown',
      'malformed',
    );
  }
}

function createExecutionLockActiveAdoptionSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE execution_lock_active_adoption_audit (
      event_id TEXT NOT NULL PRIMARY KEY CHECK(length(event_id) = 36),
      task_id TEXT NOT NULL,
      previous_owner_id TEXT NOT NULL CHECK(length(previous_owner_id) = 36),
      previous_fencing_epoch TEXT NOT NULL CHECK(length(previous_fencing_epoch) = 36),
      previous_fencing_counter INTEGER NOT NULL CHECK(previous_fencing_counter > 0),
      previous_fencing_nonce TEXT NOT NULL CHECK(
        length(previous_fencing_nonce) = 32
        AND previous_fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      adopted_owner_id TEXT NOT NULL CHECK(length(adopted_owner_id) = 36),
      adopted_fencing_epoch TEXT NOT NULL CHECK(length(adopted_fencing_epoch) = 36),
      adopted_fencing_counter INTEGER NOT NULL CHECK(adopted_fencing_counter > 0),
      adopted_fencing_nonce TEXT NOT NULL CHECK(
        length(adopted_fencing_nonce) = 32
        AND adopted_fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      CHECK(previous_owner_id <> adopted_owner_id),
      CHECK(previous_fencing_epoch = adopted_fencing_epoch),
      CHECK(previous_fencing_counter < adopted_fencing_counter),
      CHECK(previous_fencing_nonce <> adopted_fencing_nonce),
      UNIQUE(
        task_id, previous_owner_id, previous_fencing_epoch,
        previous_fencing_counter, previous_fencing_nonce
      ),
      UNIQUE(
        task_id, adopted_owner_id, adopted_fencing_epoch,
        adopted_fencing_counter, adopted_fencing_nonce
      )
    ) STRICT, WITHOUT ROWID;
    CREATE TRIGGER execution_lock_active_adoption_requires_previous
    BEFORE INSERT ON execution_lock_active_adoption_audit
    WHEN NOT EXISTS (
      SELECT 1
        FROM execution_lock_active
       WHERE task_id = NEW.task_id
         AND owner_id = NEW.previous_owner_id
         AND fencing_epoch = NEW.previous_fencing_epoch
         AND fencing_counter = NEW.previous_fencing_counter
         AND fencing_nonce = NEW.previous_fencing_nonce
    ) OR EXISTS (
      SELECT 1
        FROM execution_lock_quarantine
       WHERE task_id = NEW.task_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'execution lock active adoption requires exact unquarantined authority');
    END;
    CREATE TRIGGER execution_lock_active_monotonic_update
    BEFORE UPDATE ON execution_lock_active
    WHEN NOT (
      NEW.task_id = OLD.task_id
      AND (
        (
          NEW.owner_id = OLD.owner_id
          AND NEW.fencing_epoch = OLD.fencing_epoch
          AND NEW.fencing_counter = OLD.fencing_counter
          AND NEW.fencing_nonce = OLD.fencing_nonce
        )
        OR
        (
          NEW.owner_id <> OLD.owner_id
          AND NEW.fencing_epoch = OLD.fencing_epoch
          AND NEW.fencing_counter > OLD.fencing_counter
          AND NEW.fencing_nonce <> OLD.fencing_nonce
          AND (
            EXISTS (
              SELECT 1
                FROM execution_lock_active_adoption_audit
               WHERE task_id = NEW.task_id
                 AND previous_owner_id = OLD.owner_id
                 AND previous_fencing_epoch = OLD.fencing_epoch
                 AND previous_fencing_counter = OLD.fencing_counter
                 AND previous_fencing_nonce = OLD.fencing_nonce
                 AND adopted_owner_id = NEW.owner_id
                 AND adopted_fencing_epoch = NEW.fencing_epoch
                 AND adopted_fencing_counter = NEW.fencing_counter
                 AND adopted_fencing_nonce = NEW.fencing_nonce
            )
            OR EXISTS (
              SELECT 1
                FROM execution_lock_quarantine AS quarantine
                JOIN execution_lock_quarantine_audit AS audit
                  ON audit.quarantine_id = quarantine.quarantine_id
               WHERE quarantine.task_id = OLD.task_id
                 AND quarantine.owner_id = OLD.owner_id
                 AND quarantine.fencing_epoch = OLD.fencing_epoch
                 AND quarantine.fencing_counter = OLD.fencing_counter
                 AND quarantine.fencing_nonce = OLD.fencing_nonce
                 AND quarantine.state = 'in-flight'
                 AND audit.action = 'resumed'
                 AND audit.task_id = NEW.task_id
                 AND audit.owner_id = NEW.owner_id
                 AND audit.fencing_epoch = NEW.fencing_epoch
                 AND audit.fencing_counter = NEW.fencing_counter
                 AND audit.fencing_nonce = NEW.fencing_nonce
            )
          )
        )
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'execution lock active transition is not monotonic');
    END;
    CREATE TRIGGER execution_lock_active_adoption_audit_no_update
    BEFORE UPDATE ON execution_lock_active_adoption_audit
    BEGIN
      SELECT RAISE(ABORT, 'execution lock active adoption audit is append-only');
    END;
    CREATE TRIGGER execution_lock_active_adoption_audit_no_delete
    BEFORE DELETE ON execution_lock_active_adoption_audit
    BEGIN
      SELECT RAISE(ABORT, 'execution lock active adoption audit is append-only');
    END;
  `);
}

function createExecutionLockQuarantineAuditSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE execution_lock_quarantine_audit (
      event_id TEXT NOT NULL PRIMARY KEY CHECK(length(event_id) = 36),
      action TEXT NOT NULL CHECK(action IN (
        'boundary-entered',
        'resumed',
        'quarantined',
        'completed',
        'recovered'
      )),
      quarantine_id TEXT NOT NULL CHECK(length(quarantine_id) = 36),
      task_id TEXT NOT NULL,
      owner_id TEXT NOT NULL CHECK(length(owner_id) = 36),
      fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
      fencing_nonce TEXT NOT NULL CHECK(
        length(fencing_nonce) = 32
        AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      occurred_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    ) STRICT, WITHOUT ROWID;
    CREATE UNIQUE INDEX execution_lock_quarantine_one_boundary
      ON execution_lock_quarantine_audit(quarantine_id)
      WHERE action = 'boundary-entered';
    CREATE UNIQUE INDEX execution_lock_quarantine_one_quarantined
      ON execution_lock_quarantine_audit(quarantine_id)
      WHERE action = 'quarantined';
    CREATE UNIQUE INDEX execution_lock_quarantine_one_resume_generation
      ON execution_lock_quarantine_audit(
        quarantine_id, fencing_epoch, fencing_counter, fencing_nonce
      ) WHERE action = 'resumed';
    CREATE UNIQUE INDEX execution_lock_quarantine_one_terminal
      ON execution_lock_quarantine_audit(quarantine_id)
      WHERE action IN ('completed', 'recovered');
    CREATE TRIGGER execution_lock_quarantine_monotonic_update
    BEFORE UPDATE ON execution_lock_quarantine
    WHEN NOT (
      NEW.task_id = OLD.task_id
      AND NEW.quarantine_id = OLD.quarantine_id
      AND NEW.entered_at = OLD.entered_at
      AND (
        (
          NEW.owner_id = OLD.owner_id
          AND NEW.fencing_epoch = OLD.fencing_epoch
          AND NEW.fencing_counter = OLD.fencing_counter
          AND NEW.fencing_nonce = OLD.fencing_nonce
          AND (
            (
              OLD.state = 'in-flight'
              AND NEW.state = 'in-flight'
              AND NEW.reason = OLD.reason
              AND OLD.quarantined_at IS NULL
              AND NEW.quarantined_at IS NULL
            )
            OR
            (
              OLD.state = 'in-flight'
              AND NEW.state = 'quarantined'
              AND OLD.quarantined_at IS NULL
              AND NEW.quarantined_at IS NOT NULL
            )
          )
        )
        OR
        (
          OLD.state = 'in-flight'
          AND NEW.state = 'in-flight'
          AND NEW.reason = OLD.reason
          AND OLD.quarantined_at IS NULL
          AND NEW.quarantined_at IS NULL
          AND NEW.owner_id <> OLD.owner_id
          AND NEW.fencing_epoch = OLD.fencing_epoch
          AND NEW.fencing_counter > OLD.fencing_counter
          AND NEW.fencing_nonce <> OLD.fencing_nonce
          AND EXISTS (
            SELECT 1
              FROM execution_lock_quarantine_audit
             WHERE quarantine_id = NEW.quarantine_id
               AND action = 'resumed'
               AND task_id = NEW.task_id
               AND owner_id = NEW.owner_id
               AND fencing_epoch = NEW.fencing_epoch
               AND fencing_counter = NEW.fencing_counter
               AND fencing_nonce = NEW.fencing_nonce
          )
        )
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine transition is not monotonic');
    END;
    CREATE TRIGGER execution_lock_quarantine_terminal_delete
    BEFORE DELETE ON execution_lock_quarantine
    WHEN NOT EXISTS (
      SELECT 1
        FROM execution_lock_quarantine_audit
       WHERE quarantine_id = OLD.quarantine_id
         AND task_id = OLD.task_id
         AND owner_id = OLD.owner_id
         AND fencing_epoch = OLD.fencing_epoch
         AND fencing_counter = OLD.fencing_counter
         AND fencing_nonce = OLD.fencing_nonce
         AND action IN ('completed', 'recovered')
    )
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine delete requires terminal audit');
    END;
    CREATE TRIGGER execution_lock_quarantine_audit_no_update
    BEFORE UPDATE ON execution_lock_quarantine_audit
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine audit is append-only');
    END;
    CREATE TRIGGER execution_lock_quarantine_audit_no_delete
    BEFORE DELETE ON execution_lock_quarantine_audit
    BEGIN
      SELECT RAISE(ABORT, 'execution lock quarantine audit is append-only');
    END;
  `);
}

function createExecutionLockQuarantineSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE execution_lock_quarantine (
      task_id TEXT NOT NULL PRIMARY KEY,
      quarantine_id TEXT NOT NULL UNIQUE CHECK(length(quarantine_id) = 36),
      owner_id TEXT NOT NULL UNIQUE CHECK(length(owner_id) = 36),
      fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
      fencing_nonce TEXT NOT NULL CHECK(
        length(fencing_nonce) = 32
        AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
      ),
      state TEXT NOT NULL CHECK(state IN ('in-flight', 'quarantined')),
      reason TEXT NOT NULL CHECK(reason IN (
        'irreversible-boundary',
        'partial-mutation',
        'heartbeat-fault',
        'release-fault',
        'authority-uncertain',
        'legacy-v2-active'
      )),
      entered_at TEXT NOT NULL,
      quarantined_at TEXT,
      payload_json TEXT NOT NULL,
      CHECK(
        (state = 'in-flight'
          AND reason = 'irreversible-boundary'
          AND quarantined_at IS NULL)
        OR
        (state = 'quarantined'
          AND reason <> 'irreversible-boundary'
          AND quarantined_at IS NOT NULL)
      ),
      UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
    ) STRICT, WITHOUT ROWID;
  `);
  createExecutionLockQuarantineAuditSchema(db);
}

function validateExecutionLockDatabaseSchema(db: DatabaseType): void {
  const required = new Map<string, {
    readonly type: string;
    readonly fragments: readonly string[];
  }>([
    ['execution_lock_meta', {
      type: 'table',
      fragments: [
        'check(singleton = 1)',
        'check(meta_version = 4)',
        'check(fencing_counter >= 0)',
        ') strict',
      ],
    }],
    ['execution_lock_active', {
      type: 'table',
      fragments: [
        'task_id text not null primary key',
        'owner_id text not null unique',
        'unique(fencing_epoch, fencing_counter, fencing_nonce)',
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_active_adoption_audit', {
      type: 'table',
      fragments: [
        'check(previous_owner_id <> adopted_owner_id)',
        'check(previous_fencing_epoch = adopted_fencing_epoch)',
        'check(previous_fencing_counter < adopted_fencing_counter)',
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_active_adoption_requires_previous', {
      type: 'trigger',
      fragments: [
        'before insert on execution_lock_active_adoption_audit',
        'from execution_lock_active',
        'from execution_lock_quarantine',
        "raise(abort, 'execution lock active adoption requires exact unquarantined authority')",
      ],
    }],
    ['execution_lock_active_monotonic_update', {
      type: 'trigger',
      fragments: [
        'before update on execution_lock_active',
        'new.fencing_counter > old.fencing_counter',
        'from execution_lock_active_adoption_audit',
        "raise(abort, 'execution lock active transition is not monotonic')",
      ],
    }],
    ['execution_lock_active_adoption_audit_no_update', {
      type: 'trigger',
      fragments: [
        'before update on execution_lock_active_adoption_audit',
        "raise(abort, 'execution lock active adoption audit is append-only')",
      ],
    }],
    ['execution_lock_active_adoption_audit_no_delete', {
      type: 'trigger',
      fragments: [
        'before delete on execution_lock_active_adoption_audit',
        "raise(abort, 'execution lock active adoption audit is append-only')",
      ],
    }],
    ['execution_lock_quarantine', {
      type: 'table',
      fragments: [
        "check(state in ('in-flight', 'quarantined'))",
        "reason text not null check(reason in ( 'irreversible-boundary'",
        "and reason = 'irreversible-boundary'",
        "and reason <> 'irreversible-boundary'",
        'unique(fencing_epoch, fencing_counter, fencing_nonce)',
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_quarantine_audit', {
      type: 'table',
      fragments: [
        "action text not null check(action in ( 'boundary-entered'",
        "'resumed'",
        ') strict, without rowid',
      ],
    }],
    ['execution_lock_quarantine_one_boundary', {
      type: 'index',
      fragments: [
        'on execution_lock_quarantine_audit(quarantine_id)',
        "where action = 'boundary-entered'",
      ],
    }],
    ['execution_lock_quarantine_one_quarantined', {
      type: 'index',
      fragments: [
        'on execution_lock_quarantine_audit(quarantine_id)',
        "where action = 'quarantined'",
      ],
    }],
    ['execution_lock_quarantine_one_resume_generation', {
      type: 'index',
      fragments: [
        'on execution_lock_quarantine_audit( quarantine_id, fencing_epoch, fencing_counter, fencing_nonce )',
        "where action = 'resumed'",
      ],
    }],
    ['execution_lock_quarantine_one_terminal', {
      type: 'index',
      fragments: [
        'on execution_lock_quarantine_audit(quarantine_id)',
        "where action in ('completed', 'recovered')",
      ],
    }],
    ['execution_lock_quarantine_monotonic_update', {
      type: 'trigger',
      fragments: [
        'before update on execution_lock_quarantine',
        "old.state = 'in-flight'",
        "new.state = 'quarantined'",
        "action = 'resumed'",
        'new.fencing_counter > old.fencing_counter',
        "raise(abort, 'execution lock quarantine transition is not monotonic')",
      ],
    }],
    ['execution_lock_quarantine_terminal_delete', {
      type: 'trigger',
      fragments: [
        'before delete on execution_lock_quarantine',
        "action in ('completed', 'recovered')",
        "raise(abort, 'execution lock quarantine delete requires terminal audit')",
      ],
    }],
    ['execution_lock_quarantine_audit_no_update', {
      type: 'trigger',
      fragments: [
        'before update on execution_lock_quarantine_audit',
        "raise(abort, 'execution lock quarantine audit is append-only')",
      ],
    }],
    ['execution_lock_quarantine_audit_no_delete', {
      type: 'trigger',
      fragments: [
        'before delete on execution_lock_quarantine_audit',
        "raise(abort, 'execution lock quarantine audit is append-only')",
      ],
    }],
  ]);
  const rows = db.prepare(`
    SELECT type, name, sql
      FROM sqlite_master
     WHERE name IN (${[...required].map(() => '?').join(', ')})
  `).all(...required.keys()) as Array<{
    readonly type?: unknown;
    readonly name?: unknown;
    readonly sql?: unknown;
  }>;
  if (rows.length !== required.size) {
    throw new ExecutionLockError(
      'Execution lock database schema objects are incomplete',
      'unknown',
      'malformed',
    );
  }
  for (const row of rows) {
    const contract = typeof row.name === 'string'
      ? required.get(row.name)
      : undefined;
    const sql = typeof row.sql === 'string'
      ? row.sql.replace(/\s+/gu, ' ').trim().toLowerCase()
      : '';
    if (!contract
      || row.type !== contract.type
      || contract.fragments.some(fragment => !sql.includes(fragment))) {
      throw new ExecutionLockError(
        `Execution lock database schema object is invalid: ${String(row.name)}`,
        'unknown',
        'malformed',
      );
    }
  }
}

function readExecutionLockMeta(
  db: DatabaseType,
  sentinel: ExecutionLockAuthoritySentinel,
  expectedVersion: number,
): ExecutionLockMetaRow {
  const rows = db.prepare(
    `SELECT singleton, meta_version, authority_epoch, fencing_counter
       FROM execution_lock_meta`,
  ).all() as ExecutionLockMetaRow[];
  const row = rows[0];
  if (rows.length !== 1
    || row?.singleton !== 1
    || row.meta_version !== expectedVersion
    || typeof row.authority_epoch !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(row.authority_epoch)
    || !Number.isSafeInteger(row.fencing_counter)
    || row.fencing_counter < 0) {
    throw new ExecutionLockError(
      'Execution lock coordination metadata is invalid',
      'unknown',
      'malformed',
    );
  }
  if (row.authority_epoch !== sentinel.authorityEpoch) {
    throw new ExecutionLockError(
      'Execution lock authority epoch does not match its sentinel',
      'unknown',
      'authority-epoch-mismatch',
    );
  }
  return row;
}

function deterministicExecutionLockUuid(
  namespace: string,
  lock: ExecutionLockInfo,
): string {
  const digest = createHash('sha256')
    .update(namespace)
    .update('\0')
    .update(lock.taskId)
    .update('\0')
    .update(lock.ownerId)
    .update('\0')
    .update(lock.fencingToken.epoch)
    .update('\0')
    .update(String(lock.fencingToken.counter))
    .update('\0')
    .update(lock.fencingToken.nonce)
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function migrateExecutionLockDatabaseV3ToV4(
  db: DatabaseType,
  sentinel: ExecutionLockAuthoritySentinel,
): void {
  readExecutionLockMeta(db, sentinel, 3);
  const auditSchema = db.prepare(`
    SELECT sql
      FROM sqlite_master
     WHERE type = 'table'
       AND name = 'execution_lock_quarantine_audit'
  `).get() as { readonly sql?: unknown } | undefined;
  const normalizedAuditSchema = typeof auditSchema?.sql === 'string'
    ? auditSchema.sql.replace(/\s+/gu, ' ').trim().toLowerCase()
    : '';
  if (!normalizedAuditSchema.includes(
    "action text not null check(action in ( 'boundary-entered'",
  )
    || !normalizedAuditSchema.includes('unique(quarantine_id, action)')
    || normalizedAuditSchema.includes("'resumed'")) {
    throw new ExecutionLockError(
      'Execution lock v3 audit schema is invalid',
      'unknown',
      'malformed',
    );
  }
  const rows = db.prepare(`
    SELECT event_id, action, quarantine_id, task_id, owner_id,
           fencing_epoch, fencing_counter, fencing_nonce, occurred_at,
           payload_json
      FROM execution_lock_quarantine_audit
     ORDER BY event_id
  `).all() as ExecutionLockQuarantineAuditRow[];
  rows.forEach(parseExecutionLockQuarantineAuditRow);

  db.exec(`
    DROP TRIGGER execution_lock_quarantine_monotonic_update;
    DROP TRIGGER execution_lock_quarantine_terminal_delete;
    DROP TRIGGER execution_lock_quarantine_audit_no_update;
    DROP TRIGGER execution_lock_quarantine_audit_no_delete;
    DROP INDEX execution_lock_quarantine_one_terminal;
    ALTER TABLE execution_lock_quarantine_audit
      RENAME TO execution_lock_quarantine_audit_v3;
  `);
  createExecutionLockQuarantineAuditSchema(db);
  db.exec(`
    INSERT INTO execution_lock_quarantine_audit(
      event_id, action, quarantine_id, task_id, owner_id, fencing_epoch,
      fencing_counter, fencing_nonce, occurred_at, payload_json
    )
    SELECT event_id, action, quarantine_id, task_id, owner_id, fencing_epoch,
           fencing_counter, fencing_nonce, occurred_at, payload_json
      FROM execution_lock_quarantine_audit_v3;
    DROP TABLE execution_lock_quarantine_audit_v3;

    ALTER TABLE execution_lock_meta
      RENAME TO execution_lock_meta_v3;
    CREATE TABLE execution_lock_meta (
      singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
      meta_version INTEGER NOT NULL CHECK(meta_version = 4),
      authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
      fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
    ) STRICT;
    INSERT INTO execution_lock_meta(
      singleton, meta_version, authority_epoch, fencing_counter
    )
    SELECT singleton, 4, authority_epoch, fencing_counter
      FROM execution_lock_meta_v3;
    DROP TABLE execution_lock_meta_v3;
  `);
  createExecutionLockActiveAdoptionSchema(db);
  const migratedCount = db.prepare(`
    SELECT COUNT(*) AS count
      FROM execution_lock_quarantine_audit
  `).get() as { readonly count?: unknown };
  if (migratedCount.count !== rows.length) {
    throw new ExecutionLockError(
      'Execution lock v3 audit migration lost rows',
      'unknown',
      'mutation-conflict',
    );
  }
  db.pragma(`user_version = ${EXECUTION_LOCK_DB_META_VERSION}`);
}

function initializeExecutionLockDatabase(
  db: DatabaseType,
  sentinel: ExecutionLockAuthoritySentinel,
  allowInitialization: boolean,
): boolean {
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion === 0 && !allowInitialization) {
    throw new ExecutionLockError(
      'Uninitialized execution lock database cannot be bootstrapped',
      'unknown',
      'authority-state-missing',
    );
  }
  if (userVersion !== 0
    && userVersion !== 2
    && userVersion !== 3
    && userVersion !== EXECUTION_LOCK_DB_META_VERSION) {
    throw new ExecutionLockError(
      `Unsupported execution lock database version: ${userVersion}`,
      'unknown',
      'malformed',
    );
  }
  if (userVersion === 0) {
    db.exec(`
      CREATE TABLE execution_lock_meta (
        singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
        meta_version INTEGER NOT NULL CHECK(meta_version = 4),
        authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
      ) STRICT;
      CREATE TABLE execution_lock_active (
        task_id TEXT NOT NULL PRIMARY KEY,
        owner_id TEXT NOT NULL UNIQUE,
        fencing_epoch TEXT NOT NULL CHECK(length(fencing_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter > 0),
        fencing_nonce TEXT NOT NULL CHECK(
          length(fencing_nonce) = 32
          AND fencing_nonce NOT GLOB '*[^0-9a-f]*'
        ),
        payload_json TEXT NOT NULL,
        UNIQUE(fencing_epoch, fencing_counter, fencing_nonce)
      ) STRICT, WITHOUT ROWID;
    `);
    createExecutionLockQuarantineSchema(db);
    createExecutionLockActiveAdoptionSchema(db);
    db.prepare(`
      INSERT INTO execution_lock_meta(
        singleton, meta_version, authority_epoch, fencing_counter
      ) VALUES (1, 4, ?, 0)
    `).run(sentinel.authorityEpoch);
    db.pragma(`user_version = ${EXECUTION_LOCK_DB_META_VERSION}`);
  }

  if (userVersion === 2) {
    readExecutionLockMeta(db, sentinel, 2);
    const legacyActive = loadLegacyV2ExecutionLockActiveRows(db);
    db.exec(`
      ALTER TABLE execution_lock_meta
        RENAME TO execution_lock_meta_v2;
      CREATE TABLE execution_lock_meta (
        singleton INTEGER NOT NULL PRIMARY KEY CHECK(singleton = 1),
        meta_version INTEGER NOT NULL CHECK(meta_version = 4),
        authority_epoch TEXT NOT NULL CHECK(length(authority_epoch) = 36),
        fencing_counter INTEGER NOT NULL CHECK(fencing_counter >= 0)
      ) STRICT;
      INSERT INTO execution_lock_meta(
        singleton, meta_version, authority_epoch, fencing_counter
      )
      SELECT singleton, 4, authority_epoch, fencing_counter
        FROM execution_lock_meta_v2;
      DROP TABLE execution_lock_meta_v2;
    `);
    createExecutionLockQuarantineSchema(db);
    createExecutionLockActiveAdoptionSchema(db);
    for (const legacy of legacyActive) {
      const { lock, originalPayload } = legacy;
      const normalizedPayload = JSON.stringify(lock);
      const normalized = db.prepare(`
        UPDATE execution_lock_active
           SET payload_json = ?
         WHERE task_id = ?
           AND owner_id = ?
           AND fencing_epoch = ?
           AND fencing_counter = ?
           AND fencing_nonce = ?
           AND payload_json = ?
      `).run(
        normalizedPayload,
        lock.taskId,
        lock.ownerId,
        lock.fencingToken.epoch,
        lock.fencingToken.counter,
        lock.fencingToken.nonce,
        originalPayload,
      );
      if (normalized.changes !== 1) {
        throw new ExecutionLockError(
          `Legacy v2 execution authority changed during migration for task ${lock.taskId}`,
          lock.taskId,
          'mutation-conflict',
        );
      }
      // V2 has no trustworthy migration clock. Use the generation's last
      // canonical renewal as a deterministic conservative hold boundary so a
      // rolled-back/replayed migration emits byte-identical authority records.
      const migratedAt = lock.renewedAt;
      const quarantine: ExecutionLockQuarantineInfo = {
        schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
        quarantineId:
          deterministicExecutionLockUuid('deckent:v2-quarantine', lock),
        lock,
        state: 'quarantined',
        reason: 'legacy-v2-active',
        evidenceRefs: [
          'effective-hold:legacy-last-renewal',
          'migration:execution-lock-db-v2',
          `payload-sha256:${createHash('sha256')
            .update(originalPayload)
            .digest('hex')}`,
        ],
        enteredAt: migratedAt,
        quarantinedAt: migratedAt,
      };
      insertExecutionLockQuarantineRow(db, quarantine);
      appendExecutionLockQuarantineAudit(
        db,
        createExecutionLockQuarantineAudit(
          'quarantined',
          quarantine,
          quarantine,
          migratedAt,
          deterministicExecutionLockUuid('deckent:v2-quarantine-audit', lock),
        ),
      );
    }
    db.pragma(`user_version = ${EXECUTION_LOCK_DB_META_VERSION}`);
  }

  if (userVersion === 3) {
    migrateExecutionLockDatabaseV3ToV4(db, sentinel);
  }

  readExecutionLockMeta(
    db,
    sentinel,
    EXECUTION_LOCK_DB_META_VERSION,
  );
  validateExecutionLockDatabaseSchema(db);
  return userVersion === 2 || userVersion === 3;
}

function withExecutionLockMutation<T>(
  projectRoot: string,
  operation: (db: DatabaseType, authorityRoot: string) => T,
): T {
  const files = prepareExecutionLockAuthority(projectRoot);
  let db: DatabaseType | undefined;
  let transactionOpen = false;
  let finalCommitAttempted = false;
  let finalCommitSucceeded = false;
  try {
    db = new Database(files.dbPath, {
      fileMustExist: true,
      timeout: EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS,
    });
    validateExecutionLockAuthorityFiles(files);
    validateExecutionLockDatabaseReportedPath(db, files.dbPath);
    db.pragma(`busy_timeout = ${EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS}`);
    const journalMode = db.pragma('journal_mode', { simple: true });
    if (journalMode !== 'delete') {
      throw new ExecutionLockError(
        `Execution lock database journal mode is unsafe: ${String(journalMode)}`,
        'unknown',
        'malformed',
      );
    }
    db.pragma('synchronous = FULL');
    db.pragma('trusted_schema = OFF');
    db.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    const migrated = initializeExecutionLockDatabase(
      db,
      files.sentinel,
      files.initializeDatabase,
    );
    if (migrated) {
      validateExecutionLockAuthorityFiles(files);
      db.exec('COMMIT');
      transactionOpen = false;
      validateExecutionLockAuthorityFiles(files);
      db.exec('BEGIN IMMEDIATE');
      transactionOpen = true;
      if (initializeExecutionLockDatabase(
        db,
        files.sentinel,
        false,
      )) {
        throw new ExecutionLockError(
          'Execution lock migration replayed unexpectedly',
          'unknown',
          'malformed',
        );
      }
    }
    const result = operation(db, files.pinned.stableRootPath);
    validateExecutionLockAuthorityFiles(files);
    finalCommitAttempted = true;
    db.exec('COMMIT');
    finalCommitSucceeded = true;
    transactionOpen = false;
    validateExecutionLockAuthorityFiles(files);
    db.close();
    db = undefined;
    validateExecutionLockAuthorityFiles(files);
    return result;
  } catch (error) {
    if (transactionOpen && db) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the authority error */ }
    }
    if (finalCommitAttempted) {
      const source = error instanceof ExecutionLockError ? error : undefined;
      throw new ExecutionLockError(
        source?.message
          ?? 'Execution lock canonical commit outcome requires reconciliation',
        source?.taskId ?? 'unknown',
        source?.reason ?? 'mutation-conflict',
        source?.conflictingOwnerId,
        source?.recoveryLock,
        finalCommitSucceeded ? 'committed' : 'uncertain',
      );
    }
    if (error instanceof ExecutionLockError) throw error;
    const code = (error as { code?: string }).code;
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
      throw new ExecutionLockError(
        'Execution lock mutation authority is busy',
        'unknown',
        'mutation-conflict',
      );
    }
    throw new ExecutionLockError(
      'Execution lock mutation authority failed closed',
      'unknown',
      'malformed',
    );
  } finally {
    try { db?.close(); } catch { /* transaction outcome is already authoritative */ }
    closePinnedExecutionLockDirectories(files.pinned);
  }
}

/**
 * Explicitly reconcile a Linux/WSL mount observation when the project and
 * `.locks` directories retain their exact dev+ino identities but this mount
 * namespace reports another mount id. Mount ids are namespace-local metadata,
 * not persistent execution authority; ordinary acquire/check paths authorize
 * the stable dev+ino generation and never require this seam.
 *
 * Apply is allowed only while the canonical DB is exclusively held and both
 * active and quarantine sets are empty. The old/new observation and hashed
 * operator attestation are durably published before the anchor replacement,
 * so a crash leaves either the old observation plus a replayable intent or the
 * new observation plus its immutable evidence. The authority epoch and stable
 * directory generation do not change. No task, lock, or authority artifact is
 * deleted.
 */
export function adoptExecutionLockAuthorityMount(
  projectRoot: string,
  options: ExecutionLockMountAdoptionOptions = {},
): ExecutionLockMountAdoptionResult {
  const pinned = pinExecutionLockDirectories(projectRoot);
  let db: DatabaseType | undefined;
  let transactionOpen = false;
  try {
    validatePinnedExecutionLockDirectories(pinned);
    assertSecureExecutionLockFilesystem(pinned.stableLocksPath);
    const anchorPath =
      join(pinned.stableRootPath, EXECUTION_LOCK_AUTHORITY_ANCHOR_FILENAME);
    const anchorRead = readExecutionLockAuthorityAnchor(anchorPath);
    if (!anchorRead) {
      throw new ExecutionLockError(
        'Execution authority mount adoption requires an existing root anchor',
        'unknown',
        'authority-state-missing',
      );
    }
    const sentinelPath = join(
      pinned.stableLocksPath,
      EXECUTION_LOCK_AUTHORITY_SENTINEL_FILENAME,
    );
    const dbPath = join(
      pinned.stableLocksPath,
      EXECUTION_LOCK_COORDINATION_DB_FILENAME,
    );
    if (!executionLockPathExists(sentinelPath)
      || !executionLockPathExists(dbPath)) {
      throw new ExecutionLockError(
        'Execution authority mount adoption requires complete canonical state',
        'unknown',
        'authority-state-missing',
      );
    }
    validateExecutionLockDatabaseSidecars(dbPath);
    const sentinelRead = readExecutionLockAuthoritySentinel(sentinelPath);
    const dbIdentity =
      executionLockPathIdentity(dbPath, MAX_EXECUTION_LOCK_DB_BYTES);
    if (sentinelRead.sentinel.authorityEpoch
      !== anchorRead.anchor.authorityEpoch) {
      throw new ExecutionLockError(
        'Execution authority mount adoption found an epoch disagreement',
        'unknown',
        'authority-epoch-mismatch',
      );
    }

    const previous = executionLockMountIdentity(
      anchorRead.anchor.project,
      anchorRead.anchor.locks,
    );
    const current = executionLockMountIdentity(
      pinned.projectIdentity,
      pinned.locksIdentity,
    );
    const baseEvidence = executionLockMountAdoptionEvidence(
      anchorRead.anchor.authorityEpoch,
      anchorRead.raw,
      sentinelRead.raw,
      dbIdentity,
    );
    if (executionLockDirectoryIdentityEquals(
      anchorRead.anchor.project,
      pinned.projectIdentity,
    )
      && executionLockDirectoryIdentityEquals(
        anchorRead.anchor.locks,
        pinned.locksIdentity,
      )) {
      return {
        schemaVersion: EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION,
        decision: 'not-required',
        authorityEpoch: anchorRead.anchor.authorityEpoch,
        previous,
        current,
        evidenceRefs: baseEvidence,
      };
    }
    if (!executionLockStableDirectoryIdentityEquals(
      anchorRead.anchor.project,
      pinned.projectIdentity,
    )
      || !executionLockStableDirectoryIdentityEquals(
        anchorRead.anchor.locks,
        pinned.locksIdentity,
      )
      || anchorRead.anchor.project.mountId
        !== anchorRead.anchor.locks.mountId
      || pinned.projectIdentity.mountId
        !== pinned.locksIdentity.mountId) {
      throw new ExecutionLockError(
        'Execution authority mount adoption rejects a directory generation change',
        'unknown',
        'authority-epoch-mismatch',
      );
    }

    db = new Database(dbPath, {
      readonly: !options.apply,
      fileMustExist: true,
      timeout: EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS,
    });
    validateExecutionLockDatabaseReportedPath(db, dbPath);
    db.pragma(`busy_timeout = ${EXECUTION_LOCK_SQLITE_BUSY_TIMEOUT_MS}`);
    db.pragma('trusted_schema = OFF');
    if (!options.apply) db.pragma('query_only = ON');
    const journalMode = db.pragma('journal_mode', { simple: true });
    if (journalMode !== 'delete') {
      throw new ExecutionLockError(
        `Execution lock database journal mode is unsafe: ${String(journalMode)}`,
        'unknown',
        'malformed',
      );
    }
    db.exec(options.apply ? 'BEGIN IMMEDIATE' : 'BEGIN');
    transactionOpen = true;
    readExecutionLockMeta(
      db,
      sentinelRead.sentinel,
      EXECUTION_LOCK_DB_META_VERSION,
    );
    validateExecutionLockDatabaseSchema(db);
    const activeCount = db.prepare(
      'SELECT COUNT(*) AS count FROM execution_lock_active',
    ).get() as { readonly count?: unknown } | undefined;
    const quarantineCount = db.prepare(
      'SELECT COUNT(*) AS count FROM execution_lock_quarantine',
    ).get() as { readonly count?: unknown } | undefined;
    if (activeCount?.count !== 0 || quarantineCount?.count !== 0) {
      throw new ExecutionLockError(
        'Execution authority mount adoption requires zero active or quarantined executions',
        'unknown',
        'project-active',
      );
    }
    const projectionPresent = readdirSync(pinned.stableLocksPath)
      .some(name => name.endsWith('.executionlock')
        || name.includes('.executionlock.tmp-'));
    if (projectionPresent) {
      throw new ExecutionLockError(
        'Execution authority mount adoption found unresolved lock projections',
        'unknown',
        'project-active',
      );
    }
    if (!options.apply) {
      db.exec('COMMIT');
      transactionOpen = false;
      return {
        schemaVersion: EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION,
        decision: 'eligible',
        authorityEpoch: anchorRead.anchor.authorityEpoch,
        previous,
        current,
        evidenceRefs: baseEvidence,
      };
    }

    if (!validBoundedExecutionLockText(
      options.operatorId,
      MAX_EXECUTION_LOCK_RECOVERY_OPERATOR_BYTES,
    )
      || !EXECUTION_LOCK_IDENTITY_PATTERN.test(options.operatorId!)
      || !validBoundedExecutionLockText(
        options.justification,
        MAX_EXECUTION_LOCK_RECOVERY_JUSTIFICATION_BYTES,
      )) {
      throw new ExecutionLockError(
        'Execution authority mount adoption requires a bounded operator attestation',
        'unknown',
        'invalid-input',
      );
    }
    const nowMs = options.now?.() ?? Date.now();
    if (!Number.isSafeInteger(nowMs)
      || !Number.isFinite(new Date(nowMs).getTime())) {
      throw new ExecutionLockError(
        'Execution authority mount adoption clock is outside the supported range',
        'unknown',
        'invalid-input',
      );
    }
    const adoptedAnchor: ExecutionLockAuthorityAnchor = {
      ...anchorRead.anchor,
      project: pinned.projectIdentity,
      locks: pinned.locksIdentity,
    };
    const adoptedAnchorRaw = JSON.stringify(adoptedAnchor);
    const operatorIdSha256 = createHash('sha256')
      .update(options.operatorId!)
      .digest('hex');
    const justificationSha256 = createHash('sha256')
      .update(options.justification!)
      .digest('hex');
    const adoptionId = createHash('sha256').update(JSON.stringify({
      schemaVersion: EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION,
      authorityEpoch: anchorRead.anchor.authorityEpoch,
      previous,
      current,
      operatorIdSha256,
      justificationSha256,
    })).digest('hex');
    const audit: ExecutionLockMountAdoptionAudit = {
      schemaVersion: EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION,
      adoptionId,
      authorityEpoch: anchorRead.anchor.authorityEpoch,
      previous,
      current,
      previousAnchorSha256: createHash('sha256')
        .update(anchorRead.raw)
        .digest('hex'),
      adoptedAnchorSha256: createHash('sha256')
        .update(adoptedAnchorRaw)
        .digest('hex'),
      operatorIdSha256,
      justificationSha256,
      occurredAt: executionLockTimestamp(nowMs),
    };

    const auditDirectoryPath = join(
      pinned.stableLocksPath,
      EXECUTION_LOCK_MOUNT_ADOPTION_DIRECTORY,
    );
    if (!executionLockPathExists(auditDirectoryPath)) {
      try {
        mkdirSync(auditDirectoryPath, { recursive: false, mode: 0o700 });
        fsyncExecutionLockDirectory(pinned.stableLocksPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const auditDirectoryEntry = lstatSync(auditDirectoryPath);
    if (!auditDirectoryEntry.isDirectory()
      || auditDirectoryEntry.isSymbolicLink()) {
      throw new ExecutionLockError(
        'Execution authority mount adoption audit directory is unsafe',
        'unknown',
        'malformed',
      );
    }
    let auditDirectoryFd: number | undefined;
    let auditRef: string;
    try {
      auditDirectoryFd = openSync(
        auditDirectoryPath,
        fsConstants.O_RDONLY
          | fsConstants.O_DIRECTORY
          | fsConstants.O_NOFOLLOW,
      );
      const auditDirectoryIdentity =
        executionLockDirectoryIdentity(auditDirectoryFd);
      if (auditDirectoryIdentity.dev !== pinned.locksIdentity.dev
        || auditDirectoryIdentity.mountId !== pinned.locksIdentity.mountId) {
        throw new ExecutionLockError(
          'Execution authority mount adoption audit crossed a filesystem boundary',
          'unknown',
          'malformed',
        );
      }
      const stableAuditDirectory = `/proc/self/fd/${auditDirectoryFd}`;
      const auditPath = join(stableAuditDirectory, `${adoptionId}.json`);
      let auditRaw = JSON.stringify(audit);
      let auditFd: number | undefined;
      try {
        try {
          auditFd = openSync(
            auditPath,
            fsConstants.O_WRONLY
              | fsConstants.O_CREAT
              | fsConstants.O_EXCL
              | fsConstants.O_NOFOLLOW,
            0o600,
          );
          writeFileSync(auditFd, auditRaw, 'utf8');
          fsyncSync(auditFd);
          closeSync(auditFd);
          auditFd = undefined;
          fsyncExecutionLockDirectory(stableAuditDirectory);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const existingRaw = readBoundedRegularFile(
            auditPath,
            MAX_EXECUTION_LOCK_MOUNT_ADOPTION_BYTES,
          );
          const existing = existingRaw
            ? parseExecutionLockMountAdoptionAudit(existingRaw)
            : null;
          if (!existing
            || existing.adoptionId !== audit.adoptionId
            || existing.authorityEpoch !== audit.authorityEpoch
            || JSON.stringify(existing.previous)
              !== JSON.stringify(audit.previous)
            || JSON.stringify(existing.current)
              !== JSON.stringify(audit.current)
            || existing.previousAnchorSha256
              !== audit.previousAnchorSha256
            || existing.adoptedAnchorSha256
              !== audit.adoptedAnchorSha256
            || existing.operatorIdSha256 !== audit.operatorIdSha256
            || existing.justificationSha256
              !== audit.justificationSha256) {
            throw new ExecutionLockError(
              'Execution authority mount adoption audit conflicts with canonical intent',
              'unknown',
              'mutation-conflict',
            );
          }
          auditRaw = existingRaw!;
        }
      } finally {
        if (auditFd !== undefined) {
          try { closeSync(auditFd); } catch { /* preserve audit failure */ }
        }
      }
      executionLockPathIdentity(
        auditPath,
        MAX_EXECUTION_LOCK_MOUNT_ADOPTION_BYTES,
      );
      auditRef = `execution-lock-mount-adoption:sha256:${createHash('sha256')
        .update(auditRaw)
        .digest('hex')}`;
    } finally {
      if (auditDirectoryFd !== undefined) {
        try { closeSync(auditDirectoryFd); } catch { /* preserve adoption failure */ }
      }
    }

    const anchorBeforeReplace = readExecutionLockAuthorityAnchor(anchorPath);
    if (!anchorBeforeReplace
      || !executionLockPathIdentityEquals(
        anchorRead.identity,
        anchorBeforeReplace.identity,
      )
      || anchorBeforeReplace.raw !== anchorRead.raw) {
      throw new ExecutionLockError(
        'Execution authority root anchor changed during mount adoption',
        'unknown',
        'mutation-conflict',
      );
    }
    const stagingPath =
      `${anchorPath}.mount-adoption-${process.pid}-${randomBytes(6).toString('hex')}`;
    let stagingFd: number | undefined;
    try {
      stagingFd = openSync(
        stagingPath,
        fsConstants.O_WRONLY
          | fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_NOFOLLOW,
        0o600,
      );
      writeFileSync(stagingFd, adoptedAnchorRaw, 'utf8');
      fsyncSync(stagingFd);
      closeSync(stagingFd);
      stagingFd = undefined;
      executionLockPathIdentity(stagingPath, MAX_EXECUTION_LOCK_ANCHOR_BYTES);
      renameSync(stagingPath, anchorPath);
      fsyncExecutionLockDirectory(pinned.stableRootPath);
    } finally {
      if (stagingFd !== undefined) {
        try { closeSync(stagingFd); } catch { /* preserve adoption failure */ }
      }
      try { unlinkSync(stagingPath); } catch { /* renamed or never published */ }
    }

    // The parent-directory root binding (62aafff34) is a byte-identical copy of the
    // anchor and validateExecutionLockAuthorityFiles enforces raw equality on every
    // acquire. Adoption that rewrites only the anchor leaves the stale binding behind
    // and permanently fail-closes the root (mount-adoption broken end-to-end) — the
    // binding must be republished atomically with the SAME adopted bytes.
    const bindingPath = executionLockRootBindingPath(pinned);
    const bindingStagingPath =
      `${bindingPath}.mount-adoption-${process.pid}-${randomBytes(6).toString('hex')}`;
    let bindingStagingFd: number | undefined;
    try {
      bindingStagingFd = openSync(
        bindingStagingPath,
        fsConstants.O_WRONLY
          | fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_NOFOLLOW,
        0o600,
      );
      writeFileSync(bindingStagingFd, adoptedAnchorRaw, 'utf8');
      fsyncSync(bindingStagingFd);
      closeSync(bindingStagingFd);
      bindingStagingFd = undefined;
      executionLockPathIdentity(bindingStagingPath, MAX_EXECUTION_LOCK_ANCHOR_BYTES);
      renameSync(bindingStagingPath, bindingPath);
      fsyncExecutionLockDirectory(pinned.stableParentPath);
    } finally {
      if (bindingStagingFd !== undefined) {
        try { closeSync(bindingStagingFd); } catch { /* preserve adoption failure */ }
      }
      try { unlinkSync(bindingStagingPath); } catch { /* renamed or never published */ }
    }

    const anchorAfterReplace = readExecutionLockAuthorityAnchor(anchorPath);
    const sentinelAfter =
      readExecutionLockAuthoritySentinel(sentinelPath);
    const dbAfter =
      executionLockPathIdentity(dbPath, MAX_EXECUTION_LOCK_DB_BYTES);
    validatePinnedExecutionLockDirectories(pinned);
    if (!anchorAfterReplace
      || anchorAfterReplace.raw !== adoptedAnchorRaw
      || !executionLockDirectoryIdentityEquals(
        anchorAfterReplace.anchor.project,
        pinned.projectIdentity,
      )
      || !executionLockDirectoryIdentityEquals(
        anchorAfterReplace.anchor.locks,
        pinned.locksIdentity,
      )
      || !executionLockPathIdentityEquals(
        sentinelRead.identity,
        sentinelAfter.identity,
      )
      || sentinelAfter.raw !== sentinelRead.raw
      || !executionLockPathIdentityEquals(dbIdentity, dbAfter)) {
      throw new ExecutionLockError(
        'Execution authority mount adoption could not verify its canonical commit',
        'unknown',
        'mutation-conflict',
        undefined,
        undefined,
        'uncertain',
      );
    }
    db.exec('COMMIT');
    transactionOpen = false;
    return {
      schemaVersion: EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION,
      decision: 'adopted',
      authorityEpoch: anchorRead.anchor.authorityEpoch,
      previous,
      current,
      evidenceRefs: Object.freeze([
        ...baseEvidence,
        auditRef!,
        `anchor-after:sha256:${createHash('sha256')
          .update(adoptedAnchorRaw)
          .digest('hex')}`,
      ]),
    };
  } catch (error) {
    if (transactionOpen && db) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the adoption error */ }
    }
    if (error instanceof ExecutionLockError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    throw new ExecutionLockError(
      code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED'
        ? 'Execution authority mount adoption is busy'
        : 'Execution authority mount adoption failed closed',
      'unknown',
      code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED'
        ? 'mutation-conflict'
        : 'malformed',
    );
  } finally {
    try { db?.close(); } catch { /* canonical result was already classified */ }
    closePinnedExecutionLockDirectories(pinned);
  }
}

function withExecutionLockPinnedAuthorityRoot<T>(
  projectRoot: string,
  operation: (authorityRoot: string) => T,
): T {
  const files = prepareExecutionLockAuthority(projectRoot);
  try {
    validateExecutionLockAuthorityFiles(files);
    const result = operation(files.pinned.stableRootPath);
    validateExecutionLockAuthorityFiles(files);
    return result;
  } finally {
    closePinnedExecutionLockDirectories(files.pinned);
  }
}

function allocateExecutionLockFencingToken(
  db: DatabaseType,
): ExecutionLockFencingToken {
  const row = db.prepare(`
    UPDATE execution_lock_meta
       SET fencing_counter = fencing_counter + 1
     WHERE singleton = 1
       AND fencing_counter < 9007199254740991
    RETURNING authority_epoch, fencing_counter
  `).get() as ExecutionLockCounterRow | undefined;
  if (!row
    || typeof row.authority_epoch !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(row.authority_epoch)
    || !Number.isSafeInteger(row.fencing_counter)
    || row.fencing_counter <= 0) {
    throw new ExecutionLockError(
      'Execution lock fencing token space is exhausted',
      'unknown',
      'mutation-conflict',
    );
  }
  return {
    epoch: row.authority_epoch,
    counter: row.fencing_counter,
    nonce: randomBytes(16).toString('hex'),
  };
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length
    && actual.every((key, index) => key === required[index]);
}

function canonicalExecutionLockTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) && new Date(epochMs).toISOString() === value;
}

interface ExecutionLockMountAdoptionAudit {
  readonly schemaVersion: typeof EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION;
  readonly adoptionId: string;
  readonly authorityEpoch: string;
  readonly previous: ExecutionLockMountIdentity;
  readonly current: ExecutionLockMountIdentity;
  readonly previousAnchorSha256: string;
  readonly adoptedAnchorSha256: string;
  readonly operatorIdSha256: string;
  readonly justificationSha256: string;
  readonly occurredAt: string;
}

function executionLockMountIdentity(
  project: ExecutionLockDirectoryIdentity,
  locks: ExecutionLockDirectoryIdentity,
): ExecutionLockMountIdentity {
  return {
    projectDev: project.dev,
    projectIno: project.ino,
    locksDev: locks.dev,
    locksIno: locks.ino,
    mountId: project.mountId,
  };
}

function executionLockStableDirectoryIdentityEquals(
  left: ExecutionLockDirectoryIdentity,
  right: ExecutionLockDirectoryIdentity,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function executionLockMountAdoptionEvidence(
  authorityEpoch: string,
  previousAnchorRaw: string,
  sentinelRaw: string,
  dbIdentity: ExecutionLockPathIdentity,
): readonly string[] {
  return Object.freeze([
    `authority-epoch:${authorityEpoch}`,
    `anchor-before:sha256:${createHash('sha256').update(previousAnchorRaw).digest('hex')}`,
    `sentinel:sha256:${createHash('sha256').update(sentinelRaw).digest('hex')}`,
    `authority-db:${dbIdentity.dev}:${dbIdentity.ino}`,
  ]);
}

function parseExecutionLockMountAdoptionAudit(
  raw: string,
): ExecutionLockMountAdoptionAudit | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const parseIdentity = (candidate: unknown): ExecutionLockMountIdentity | null => {
      if (typeof candidate !== 'object'
        || candidate === null
        || Array.isArray(candidate)) return null;
      const identity = candidate as Record<string, unknown>;
      if (!exactKeys(identity, [
        'projectDev',
        'projectIno',
        'locksDev',
        'locksIno',
        'mountId',
      ])) return null;
      for (const key of [
        'projectDev',
        'projectIno',
        'locksDev',
        'locksIno',
        'mountId',
      ] as const) {
        if (typeof identity[key] !== 'string'
          || !/^[1-9]\d*$/u.test(identity[key] as string)) return null;
      }
      return {
        projectDev: identity.projectDev as string,
        projectIno: identity.projectIno as string,
        locksDev: identity.locksDev as string,
        locksIno: identity.locksIno as string,
        mountId: identity.mountId as string,
      };
    };
    const previous = parseIdentity(record.previous);
    const current = parseIdentity(record.current);
    if (!exactKeys(record, [
      'schemaVersion',
      'adoptionId',
      'authorityEpoch',
      'previous',
      'current',
      'previousAnchorSha256',
      'adoptedAnchorSha256',
      'operatorIdSha256',
      'justificationSha256',
      'occurredAt',
    ])
      || record.schemaVersion !== EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION
      || typeof record.adoptionId !== 'string'
      || !SHA256_HEX_PATTERN.test(record.adoptionId)
      || typeof record.authorityEpoch !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.authorityEpoch)
      || !previous
      || !current
      || typeof record.previousAnchorSha256 !== 'string'
      || !SHA256_HEX_PATTERN.test(record.previousAnchorSha256)
      || typeof record.adoptedAnchorSha256 !== 'string'
      || !SHA256_HEX_PATTERN.test(record.adoptedAnchorSha256)
      || typeof record.operatorIdSha256 !== 'string'
      || !SHA256_HEX_PATTERN.test(record.operatorIdSha256)
      || typeof record.justificationSha256 !== 'string'
      || !SHA256_HEX_PATTERN.test(record.justificationSha256)
      || !canonicalExecutionLockTimestamp(record.occurredAt)) {
      return null;
    }
    return {
      schemaVersion: EXECUTION_LOCK_MOUNT_ADOPTION_SCHEMA_VERSION,
      adoptionId: record.adoptionId,
      authorityEpoch: record.authorityEpoch,
      previous,
      current,
      previousAnchorSha256: record.previousAnchorSha256,
      adoptedAnchorSha256: record.adoptedAnchorSha256,
      operatorIdSha256: record.operatorIdSha256,
      justificationSha256: record.justificationSha256,
      occurredAt: record.occurredAt,
    };
  } catch {
    return null;
  }
}

function parseExecutionLockFencingToken(
  value: unknown,
): ExecutionLockFencingToken | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ['epoch', 'counter', 'nonce'])
    || typeof record.epoch !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(record.epoch)
    || !Number.isSafeInteger(record.counter)
    || (record.counter as number) <= 0
    || typeof record.nonce !== 'string'
    || !EXECUTION_LOCK_FENCING_NONCE_PATTERN.test(record.nonce)) {
    return null;
  }
  return {
    epoch: record.epoch,
    counter: record.counter as number,
    nonce: record.nonce,
  };
}

function executionLockFencingTokenEquals(
  left: ExecutionLockFencingToken,
  right: ExecutionLockFencingToken,
): boolean {
  return left.epoch === right.epoch
    && left.counter === right.counter
    && left.nonce === right.nonce;
}

/**
 * Canonical sink guard: tokens from different epochs are incomparable and a
 * candidate within one epoch must advance the durable counter strictly.
 */
export function assertExecutionLockFencingProgression(
  previous: ExecutionLockFencingToken,
  candidate: ExecutionLockFencingToken,
  taskId = 'unknown',
): void {
  if (!parseExecutionLockFencingToken(previous)
    || !parseExecutionLockFencingToken(candidate)) {
    throw new ExecutionLockError(
      'Execution lock fencing progression contains an invalid token',
      taskId,
      'invalid-input',
    );
  }
  if (previous.epoch !== candidate.epoch) {
    throw new ExecutionLockError(
      'Execution lock fencing epochs are not comparable',
      taskId,
      'authority-epoch-mismatch',
    );
  }
  if (candidate.counter <= previous.counter) {
    throw new ExecutionLockError(
      'Execution lock fencing counter did not advance',
      taskId,
      'authority-lost',
    );
  }
}

function parseExecutionLock(
  raw: string,
  expectedTaskId?: string,
): ExecutionLockInfo | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!exactKeys(record, [
      'schemaVersion',
      'taskId',
      'actor',
      'ownerId',
      'pid',
      'hostInstanceId',
      'bootSessionId',
      'processSessionId',
      'fencingToken',
      'acquiredAt',
      'renewedAt',
      'leaseDurationMs',
    ])) return null;
    if (record.schemaVersion !== EXECUTION_LOCK_SCHEMA_VERSION) return null;
    if (typeof record.taskId !== 'string'
      || record.taskId.length === 0
      || Buffer.byteLength(record.taskId, 'utf8') > MAX_EXECUTION_LOCK_TASK_ID_BYTES
      || (expectedTaskId !== undefined && record.taskId !== expectedTaskId)) return null;
    if (record.actor !== 'dispatch'
      && record.actor !== 'settlement'
      && record.actor !== 'maintenance') return null;
    const maintenanceTask =
      record.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID;
    if (maintenanceTask !== (record.actor === 'maintenance')) return null;
    if (typeof record.ownerId !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.ownerId)) return null;
    if (!Number.isSafeInteger(record.pid) || (record.pid as number) <= 0) return null;
    const identity = {
      hostInstanceId: record.hostInstanceId,
      bootSessionId: record.bootSessionId,
      processSessionId: record.processSessionId,
    };
    if (typeof identity.hostInstanceId !== 'string'
      || typeof identity.bootSessionId !== 'string'
      || typeof identity.processSessionId !== 'string'
      || !validExecutionLockIdentity(identity as ExecutionLockRuntimeIdentity)) return null;
    const fencingToken =
      parseExecutionLockFencingToken(record.fencingToken);
    if (!fencingToken) return null;
    if (!canonicalExecutionLockTimestamp(record.acquiredAt)
      || !canonicalExecutionLockTimestamp(record.renewedAt)) return null;
    if (!Number.isSafeInteger(record.leaseDurationMs)
      || (record.leaseDurationMs as number) <= 0
      || (record.leaseDurationMs as number) > MAX_EXECUTION_LOCK_LEASE_MS) return null;
    const acquiredMs = Date.parse(record.acquiredAt);
    const renewedMs = Date.parse(record.renewedAt);
    const expiresAtMs = renewedMs + (record.leaseDurationMs as number);
    if (renewedMs < acquiredMs
      || !Number.isSafeInteger(expiresAtMs)
      || !Number.isFinite(new Date(expiresAtMs).getTime())) return null;

    return {
      schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
      taskId: record.taskId,
      actor: record.actor,
      ownerId: record.ownerId,
      pid: record.pid as number,
      hostInstanceId: identity.hostInstanceId,
      bootSessionId: identity.bootSessionId,
      processSessionId: identity.processSessionId,
      fencingToken,
      acquiredAt: record.acquiredAt,
      renewedAt: record.renewedAt,
      leaseDurationMs: record.leaseDurationMs as number,
    };
  } catch {
    return null;
  }
}

function parseLegacyV2ExecutionLock(
  raw: string,
  expectedTaskId?: string,
): ExecutionLockInfo | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 2
      && record.schemaVersion !== EXECUTION_LOCK_SCHEMA_VERSION) {
      return null;
    }
    return parseExecutionLock(
      JSON.stringify({
        ...record,
        schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
      }),
      expectedTaskId,
    );
  } catch {
    return null;
  }
}

function isExecutionLockQuarantineReason(
  value: unknown,
): value is ExecutionLockQuarantineReason {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8')
      <= MAX_EXECUTION_LOCK_QUARANTINE_REASON_BYTES
    && (value === 'irreversible-boundary'
    || value === 'partial-mutation'
    || value === 'heartbeat-fault'
    || value === 'release-fault'
    || value === 'authority-uncertain'
    || value === 'legacy-v2-active');
}

function parseExecutionLockEvidenceRefs(
  value: unknown,
): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_EXECUTION_LOCK_EVIDENCE_REFS) {
    return null;
  }
  let totalBytes = 0;
  const refs: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string'
      || candidate.length === 0
      || candidate !== candidate.trim()
      || /[\u0000-\u001f\u007f]/u.test(candidate)
      || Buffer.byteLength(candidate, 'utf8')
        > MAX_EXECUTION_LOCK_EVIDENCE_REF_BYTES
      || (refs.length > 0 && refs[refs.length - 1]! >= candidate)) {
      return null;
    }
    totalBytes += Buffer.byteLength(candidate, 'utf8');
    if (totalBytes > MAX_EXECUTION_LOCK_EVIDENCE_TOTAL_BYTES) return null;
    refs.push(candidate);
  }
  return refs;
}

function normalizeExecutionLockEvidenceRefs(
  value: readonly string[] | undefined,
  taskId: string,
): readonly string[] {
  const parsed = parseExecutionLockEvidenceRefs(value ?? []);
  if (!parsed) {
    throw new ExecutionLockError(
      `Execution lock evidence is invalid for task ${taskId}`,
      taskId,
      'invalid-input',
    );
  }
  return parsed;
}

function parseExecutionLockQuarantine(
  raw: string,
  expectedTaskId?: string,
): ExecutionLockQuarantineInfo | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (!exactKeys(record, [
      'schemaVersion',
      'quarantineId',
      'lock',
      'state',
      'reason',
      'evidenceRefs',
      'enteredAt',
      'quarantinedAt',
    ])
      || record.schemaVersion !== EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION
      || typeof record.quarantineId !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.quarantineId)
      || (record.state !== 'in-flight' && record.state !== 'quarantined')
      || !isExecutionLockQuarantineReason(record.reason)
      || !canonicalExecutionLockTimestamp(record.enteredAt)) {
      return null;
    }
    const lock = parseExecutionLock(
      JSON.stringify(record.lock),
      expectedTaskId,
    );
    const evidenceRefs =
      parseExecutionLockEvidenceRefs(record.evidenceRefs);
    if (!lock || !evidenceRefs) return null;
    if (record.state === 'in-flight') {
      if (record.reason !== 'irreversible-boundary'
        || record.quarantinedAt !== null) {
        return null;
      }
    } else if (record.reason === 'irreversible-boundary'
      || !canonicalExecutionLockTimestamp(record.quarantinedAt)) {
      return null;
    }
    const enteredMs = Date.parse(record.enteredAt);
    const quarantinedMs = record.quarantinedAt === null
      ? null
      : Date.parse(record.quarantinedAt as string);
    // A fenced resume intentionally preserves the original boundary time
    // while its successor generation has a later acquiredAt. Cross-record
    // audit lineage validates that exception; this structural parser only
    // enforces the quarantine's own monotonic timestamps.
    if (quarantinedMs !== null && quarantinedMs < enteredMs) {
      return null;
    }
    return {
      schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
      quarantineId: record.quarantineId,
      lock,
      state: record.state,
      reason: record.reason,
      evidenceRefs,
      enteredAt: record.enteredAt,
      quarantinedAt: record.quarantinedAt as string | null,
    };
  } catch {
    return null;
  }
}

function validBoundedExecutionLockText(
  value: unknown,
  maxBytes: number,
): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && Buffer.byteLength(value, 'utf8') <= maxBytes;
}

function normalizeExecutionLockRecoveryAttestation(
  value: ExecutionLockRecoveryAttestation,
  quarantine: ExecutionLockQuarantineInfo,
  nowMs: number,
): ExecutionLockRecoveryAttestation {
  const record = value as unknown as Record<string, unknown>;
  if (!exactKeys(record, [
    'schemaVersion',
    'quarantineId',
    'fencingToken',
    'operatorId',
    'justification',
    'evidenceRefs',
    'attestedAt',
  ])
    || record.schemaVersion
      !== EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION
    || record.quarantineId !== quarantine.quarantineId
    || !validBoundedExecutionLockText(
      record.operatorId,
      MAX_EXECUTION_LOCK_RECOVERY_OPERATOR_BYTES,
    )
    || !EXECUTION_LOCK_IDENTITY_PATTERN.test(record.operatorId)
    || !validBoundedExecutionLockText(
      record.justification,
      MAX_EXECUTION_LOCK_RECOVERY_JUSTIFICATION_BYTES,
    )
    || !canonicalExecutionLockTimestamp(record.attestedAt)) {
    throw new ExecutionLockError(
      `Execution lock recovery attestation is invalid for task ${quarantine.lock.taskId}`,
      quarantine.lock.taskId,
      'invalid-input',
    );
  }
  const fencingToken =
    parseExecutionLockFencingToken(record.fencingToken);
  const evidenceRefs =
    parseExecutionLockEvidenceRefs(record.evidenceRefs);
  const attestedAtMs = Date.parse(record.attestedAt);
  const recoveryBoundaryMs = Date.parse(
    quarantine.quarantinedAt ?? quarantine.enteredAt,
  );
  if (!fencingToken
    || !executionLockFencingTokenEquals(
      fencingToken,
      quarantine.lock.fencingToken,
    )
    || !evidenceRefs
    || evidenceRefs.length === 0
    || attestedAtMs < recoveryBoundaryMs
    || attestedAtMs < nowMs - MAX_EXECUTION_LOCK_RECOVERY_ATTESTATION_AGE_MS
    || attestedAtMs > nowMs + MAX_EXECUTION_LOCK_RECOVERY_FUTURE_SKEW_MS) {
    throw new ExecutionLockError(
      `Execution lock recovery attestation is stale or mismatched for task ${quarantine.lock.taskId}`,
      quarantine.lock.taskId,
      'invalid-input',
    );
  }
  return {
    schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
    quarantineId: quarantine.quarantineId,
    fencingToken,
    operatorId: record.operatorId,
    justification: record.justification,
    evidenceRefs,
    attestedAt: record.attestedAt,
  };
}

function parseExecutionLockBoundaryCompletion(
  value: unknown,
): ExecutionLockBoundaryCompletion | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    'schemaVersion',
    'quarantineId',
    'fencingToken',
    'evidenceRefs',
    'completedAt',
  ])
    || record.schemaVersion
      !== EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION
    || typeof record.quarantineId !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(record.quarantineId)
    || !canonicalExecutionLockTimestamp(record.completedAt)) {
    return null;
  }
  const fencingToken =
    parseExecutionLockFencingToken(record.fencingToken);
  const evidenceRefs =
    parseExecutionLockEvidenceRefs(record.evidenceRefs);
  if (!fencingToken || !evidenceRefs || evidenceRefs.length === 0) return null;
  return {
    schemaVersion: EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION,
    quarantineId: record.quarantineId,
    fencingToken,
    evidenceRefs,
    completedAt: record.completedAt,
  };
}

function parseExecutionLockBoundaryResumeAttestation(
  value: unknown,
): ExecutionLockBoundaryResumeAttestation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    'schemaVersion',
    'quarantineId',
    'previousLock',
    'resumedLock',
    'evidenceRefs',
    'resumedAt',
  ])
    || record.schemaVersion !== EXECUTION_LOCK_BOUNDARY_RESUME_SCHEMA_VERSION
    || typeof record.quarantineId !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(record.quarantineId)
    || !canonicalExecutionLockTimestamp(record.resumedAt)) {
    return null;
  }
  const previousLock = parseExecutionLock(JSON.stringify(record.previousLock));
  const resumedLock = parseExecutionLock(JSON.stringify(record.resumedLock));
  const evidenceRefs = parseExecutionLockEvidenceRefs(record.evidenceRefs);
  if (!previousLock
    || !resumedLock
    || !evidenceRefs
    || evidenceRefs.length === 0
    || previousLock.taskId !== resumedLock.taskId
    || previousLock.actor !== resumedLock.actor
    || previousLock.ownerId === resumedLock.ownerId
    || previousLock.fencingToken.epoch !== resumedLock.fencingToken.epoch
    || resumedLock.fencingToken.counter
      <= previousLock.fencingToken.counter
    || previousLock.fencingToken.nonce === resumedLock.fencingToken.nonce
    || resumedLock.acquiredAt !== record.resumedAt
    || resumedLock.renewedAt !== record.resumedAt
    || Date.parse(record.resumedAt) < Date.parse(previousLock.renewedAt)) {
    return null;
  }
  return {
    schemaVersion: EXECUTION_LOCK_BOUNDARY_RESUME_SCHEMA_VERSION,
    quarantineId: record.quarantineId,
    previousLock,
    resumedLock,
    evidenceRefs,
    resumedAt: record.resumedAt,
  };
}

function parseExecutionLockActiveAdoptionAudit(
  value: unknown,
): ExecutionLockActiveAdoptionAudit | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    'schemaVersion',
    'eventId',
    'previousLock',
    'adoptedLock',
    'evidenceRefs',
    'adoptedAt',
  ])
    || record.schemaVersion !== EXECUTION_LOCK_ACTIVE_ADOPTION_SCHEMA_VERSION
    || typeof record.eventId !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(record.eventId)
    || !canonicalExecutionLockTimestamp(record.adoptedAt)) {
    return null;
  }
  const previousLock = parseExecutionLock(JSON.stringify(record.previousLock));
  const adoptedLock = parseExecutionLock(JSON.stringify(record.adoptedLock));
  const evidenceRefs = parseExecutionLockEvidenceRefs(record.evidenceRefs);
  if (!previousLock
    || !adoptedLock
    || !evidenceRefs
    || evidenceRefs.length === 0
    || previousLock.taskId !== adoptedLock.taskId
    || previousLock.actor !== adoptedLock.actor
    || previousLock.ownerId === adoptedLock.ownerId
    || previousLock.fencingToken.epoch !== adoptedLock.fencingToken.epoch
    || adoptedLock.fencingToken.counter
      <= previousLock.fencingToken.counter
    || previousLock.fencingToken.nonce === adoptedLock.fencingToken.nonce
    || adoptedLock.acquiredAt !== record.adoptedAt
    || adoptedLock.renewedAt !== record.adoptedAt
    || Date.parse(record.adoptedAt) < Date.parse(previousLock.renewedAt)) {
    return null;
  }
  return {
    schemaVersion: EXECUTION_LOCK_ACTIVE_ADOPTION_SCHEMA_VERSION,
    eventId: record.eventId,
    previousLock,
    adoptedLock,
    evidenceRefs,
    adoptedAt: record.adoptedAt,
  };
}

function parseExecutionLockRecoveryAttestationPayload(
  value: unknown,
): ExecutionLockRecoveryAttestation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, [
    'schemaVersion',
    'quarantineId',
    'fencingToken',
    'operatorId',
    'justification',
    'evidenceRefs',
    'attestedAt',
  ])
    || record.schemaVersion
      !== EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION
    || typeof record.quarantineId !== 'string'
    || !EXECUTION_LOCK_UUID_PATTERN.test(record.quarantineId)
    || !validBoundedExecutionLockText(
      record.operatorId,
      MAX_EXECUTION_LOCK_RECOVERY_OPERATOR_BYTES,
    )
    || !EXECUTION_LOCK_IDENTITY_PATTERN.test(record.operatorId)
    || !validBoundedExecutionLockText(
      record.justification,
      MAX_EXECUTION_LOCK_RECOVERY_JUSTIFICATION_BYTES,
    )
    || !canonicalExecutionLockTimestamp(record.attestedAt)) {
    return null;
  }
  const fencingToken =
    parseExecutionLockFencingToken(record.fencingToken);
  const evidenceRefs =
    parseExecutionLockEvidenceRefs(record.evidenceRefs);
  if (!fencingToken || !evidenceRefs || evidenceRefs.length === 0) return null;
  return {
    schemaVersion: EXECUTION_LOCK_RECOVERY_ATTESTATION_SCHEMA_VERSION,
    quarantineId: record.quarantineId,
    fencingToken,
    operatorId: record.operatorId,
    justification: record.justification,
    evidenceRefs,
    attestedAt: record.attestedAt,
  };
}

function parseExecutionLockQuarantineAudit(
  raw: string,
): ExecutionLockQuarantineAuditEvent | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (!exactKeys(record, [
      'schemaVersion',
      'eventId',
      'action',
      'quarantineId',
      'taskId',
      'ownerId',
      'fencingToken',
      'occurredAt',
      'payload',
    ])
      || record.schemaVersion !== EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION
      || typeof record.eventId !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.eventId)
      || (record.action !== 'boundary-entered'
        && record.action !== 'resumed'
        && record.action !== 'quarantined'
        && record.action !== 'completed'
        && record.action !== 'recovered')
      || typeof record.quarantineId !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.quarantineId)
      || typeof record.taskId !== 'string'
      || record.taskId.length === 0
      || Buffer.byteLength(record.taskId, 'utf8')
        > MAX_EXECUTION_LOCK_TASK_ID_BYTES
      || typeof record.ownerId !== 'string'
      || !EXECUTION_LOCK_UUID_PATTERN.test(record.ownerId)
      || !canonicalExecutionLockTimestamp(record.occurredAt)) {
      return null;
    }
    const fencingToken =
      parseExecutionLockFencingToken(record.fencingToken);
    if (!fencingToken) return null;

    let payload:
      | ExecutionLockQuarantineInfo
      | ExecutionLockBoundaryResumeAttestation
      | ExecutionLockBoundaryCompletion
      | ExecutionLockRecoveryAttestation
      | null;
    if (record.action === 'boundary-entered'
      || record.action === 'quarantined') {
      payload = parseExecutionLockQuarantine(
        JSON.stringify(record.payload),
        record.taskId,
      );
      if (!payload
        || payload.quarantineId !== record.quarantineId
        || payload.lock.ownerId !== record.ownerId
        || !executionLockFencingTokenEquals(
          payload.lock.fencingToken,
          fencingToken,
        )
        || (record.action === 'boundary-entered'
          ? payload.state !== 'in-flight'
          : payload.state !== 'quarantined')) {
        return null;
      }
      if (record.action === 'boundary-entered'
        && Date.parse(payload.enteredAt)
          < Date.parse(payload.lock.acquiredAt)) return null;
    } else if (record.action === 'resumed') {
      payload = parseExecutionLockBoundaryResumeAttestation(record.payload);
      if (!payload
        || payload.quarantineId !== record.quarantineId
        || payload.resumedLock.taskId !== record.taskId
        || payload.resumedLock.ownerId !== record.ownerId
        || !executionLockFencingTokenEquals(
          payload.resumedLock.fencingToken,
          fencingToken,
        )) {
        return null;
      }
    } else if (record.action === 'completed') {
      payload = parseExecutionLockBoundaryCompletion(record.payload);
      if (!payload
        || payload.quarantineId !== record.quarantineId
        || !executionLockFencingTokenEquals(
          payload.fencingToken,
          fencingToken,
        )) {
        return null;
      }
    } else {
      payload =
        parseExecutionLockRecoveryAttestationPayload(record.payload);
      if (!payload
        || payload.quarantineId !== record.quarantineId
        || !executionLockFencingTokenEquals(
          payload.fencingToken,
          fencingToken,
        )) {
        return null;
      }
    }
    return {
      schemaVersion: EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION,
      eventId: record.eventId,
      action: record.action,
      quarantineId: record.quarantineId,
      taskId: record.taskId,
      ownerId: record.ownerId,
      fencingToken,
      occurredAt: record.occurredAt,
      payload,
    };
  } catch {
    return null;
  }
}

function readExecutionLockProjection(
  projectRoot: string,
  taskId: string,
): { readonly raw: string; readonly lock: ExecutionLockInfo; readonly path: string } | null {
  const locksDir = ensureExecutionLockDirectory(projectRoot);
  const path = join(locksDir, basename(executionLockPathFor(projectRoot, taskId)));
  let raw: string | null;
  try {
    raw = readBoundedRegularFile(path, MAX_EXECUTION_LOCK_PROJECTION_BYTES);
  } catch {
    throw new ExecutionLockError(
      `Execution lock projection is unsafe for task ${taskId}`,
      taskId,
      'malformed',
    );
  }
  if (raw === null) return null;
  const lock = parseExecutionLock(raw, taskId);
  if (!lock) {
    throw new ExecutionLockError(
      `Execution lock projection is invalid for task ${taskId}`,
      taskId,
      'malformed',
    );
  }
  return { raw, lock, path };
}

function writeExecutionLockProjection(
  projectRoot: string,
  lock: ExecutionLockInfo,
  replace: boolean,
): void {
  const locksDir = ensureExecutionLockDirectory(projectRoot);
  const path = join(locksDir, basename(executionLockPathFor(projectRoot, lock.taskId)));
  const stagingPath = `${path}.tmp-${lock.ownerId}`;
  let fd: number | undefined;
  try {
    fd = openSync(
      stagingPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fd, JSON.stringify(lock), 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (replace) renameSync(stagingPath, path);
    else linkSync(stagingPath, path);
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* preserve original projection error */ }
    }
    try { unlinkSync(stagingPath); } catch { /* linked/renamed or cleanup */ }
  }
}

function publishExecutionLockProjection(
  projectRoot: string,
  lock: ExecutionLockInfo,
  replace: boolean,
  options: ExecutionLockOptions,
): void {
  const publisher = options.projectionPublisher ?? writeExecutionLockProjection;
  publisher(projectRoot, lock, replace);
}

function validateExecutionLockAcquireInput(
  taskId: string,
  actor: ExecutionLockActor,
  options: ExecutionLockOptions,
): {
  readonly nowMs: number;
  readonly leaseDurationMs: number;
  readonly identity: ExecutionLockRuntimeIdentity;
  readonly ownerPid: number;
} {
  const maintenancePair =
    taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID && actor === 'maintenance';
  const taskPair =
    taskId !== PROJECT_MAINTENANCE_LOCK_TASK_ID && actor !== 'maintenance';
  if (taskId.length === 0
    || Buffer.byteLength(taskId, 'utf8') > MAX_EXECUTION_LOCK_TASK_ID_BYTES
    || (!maintenancePair && !taskPair)) {
    throw new ExecutionLockError(
      'Execution lock task/actor authority is invalid',
      taskId || 'unknown',
      'invalid-input',
    );
  }
  const leaseDurationMs =
    options.leaseDurationMs ?? DEFAULT_EXECUTION_LOCK_LEASE_MS;
  const nowMs = executionLockNow(options);
  if (!Number.isSafeInteger(leaseDurationMs)
    || leaseDurationMs <= 0
    || leaseDurationMs > MAX_EXECUTION_LOCK_LEASE_MS
    || !Number.isSafeInteger(nowMs + leaseDurationMs)
    || !Number.isFinite(new Date(nowMs + leaseDurationMs).getTime())) {
    throw new ExecutionLockError(
      `Execution lock lease is invalid for task ${taskId}`,
      taskId,
      'invalid-input',
    );
  }
  const ownerPid = options.ownerPid ?? process.pid;
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) {
    throw new ExecutionLockError(
      `Execution lock owner PID is invalid for task ${taskId}`,
      taskId,
      'invalid-input',
    );
  }
  return {
    nowMs,
    leaseDurationMs,
    identity: resolveExecutionLockIdentity(options),
    ownerPid,
  };
}

function staleExecutionLockCanRetire(
  lock: ExecutionLockInfo,
  nowMs: number,
  options: ExecutionLockOptions,
): boolean {
  if (nowMs < Date.parse(lock.renewedAt) + lock.leaseDurationMs) return false;
  const localIdentity = resolveExecutionLockIdentity(options);
  const state = executionLockLivenessProbe(options).inspect(lock, localIdentity);
  if (state === 'dead') return true;
  const reason: ExecutionLockFailureReason =
    state === 'foreign-host'
      ? 'foreign-host'
      : state === 'unknown'
        ? 'liveness-unknown'
        : 'held';
  throw new ExecutionLockError(
    `Expired execution lock owner is ${state} for task ${lock.taskId}`,
    lock.taskId,
    reason,
    lock.ownerId,
  );
}

function scanExecutionLockProjections(
  projectRoot: string,
  activeByTask: ReadonlyMap<string, ExecutionLockInfo>,
  activeByOwner: ReadonlyMap<string, ExecutionLockInfo>,
  options: ExecutionLockOptions,
): Array<{ readonly raw: string; readonly lock: ExecutionLockInfo; readonly path: string }> {
  const locksDir = ensureExecutionLockDirectory(projectRoot);
  const entries = readdirSync(locksDir, { withFileTypes: true })
    .filter(entry => entry.name.includes('.executionlock'));
  const projections: Array<{
    readonly raw: string;
    readonly lock: ExecutionLockInfo;
    readonly path: string;
  }> = [];
  for (const entry of entries) {
    const staging = entry.name.match(
      /^[0-9a-f]{64}\.executionlock\.tmp-([0-9a-f-]{36})$/iu,
    );
    if (staging) {
      const owner = activeByOwner.get(staging[1]!);
      if (!owner) {
        if (!entry.isFile() || entry.isSymbolicLink()) {
          throw new ExecutionLockError(
            `Unsafe orphan execution staging artifact: ${entry.name}`,
            'unknown',
            'malformed',
          );
        }
        unlinkSync(join(locksDir, entry.name));
        continue;
      }
      const state = executionLockLivenessProbe(options).inspect(
        owner,
        resolveExecutionLockIdentity(options),
      );
      if (state === 'dead') {
        unlinkSync(join(locksDir, entry.name));
        continue;
      }
      throw new ExecutionLockError(
        `Execution projection publish is ${state}: ${entry.name}`,
        owner.taskId,
        state === 'foreign-host'
          ? 'foreign-host'
          : state === 'unknown'
            ? 'liveness-unknown'
            : 'held',
        owner.ownerId,
      );
    }
    if (!entry.name.endsWith('.executionlock')
      || !entry.isFile()
      || entry.isSymbolicLink()
      || !/^[0-9a-f]{64}\.executionlock$/u.test(entry.name)) {
      throw new ExecutionLockError(
        `Unsafe execution authority artifact: ${entry.name}`,
        'unknown',
        'malformed',
      );
    }
    const path = join(locksDir, entry.name);
    let raw: string | null;
    try {
      raw = readBoundedRegularFile(path, MAX_EXECUTION_LOCK_PROJECTION_BYTES);
    } catch {
      throw new ExecutionLockError(
        `Unsafe execution lock projection: ${entry.name}`,
        'unknown',
        'malformed',
      );
    }
    let lock = raw === null ? null : parseExecutionLock(raw);
    if (raw !== null && lock === null) {
      const legacy = parseLegacyV2ExecutionLock(raw);
      if (legacy) {
        const canonical = activeByTask.get(legacy.taskId);
        lock = canonical
          && executionLockGenerationEquals(canonical, legacy)
          && JSON.stringify(canonical) === JSON.stringify(legacy)
          ? canonical
          : null;
      }
    }
    if (!raw || !lock
      || basename(executionLockPathFor(projectRoot, lock.taskId)) !== entry.name) {
      throw new ExecutionLockError(
        `Invalid execution lock projection: ${entry.name}`,
        lock?.taskId ?? 'unknown',
        'malformed',
      );
    }
    projections.push({ raw, lock, path });
  }
  return projections;
}

function loadExecutionLockActivePage(
  db: DatabaseType,
  afterTaskId: string,
): ExecutionLockInfo[] {
  const rows = db.prepare(`
    SELECT task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
           payload_json
      FROM execution_lock_active
     WHERE task_id > ?
     ORDER BY task_id
     LIMIT ?
  `).all(afterTaskId, EXECUTION_LOCK_QUERY_PAGE_SIZE) as ExecutionLockActiveRow[];
  return rows.map(parseExecutionLockActiveRow);
}

function loadExecutionLockActiveRows(
  db: DatabaseType,
): ExecutionLockInfo[] {
  const active: ExecutionLockInfo[] = [];
  let afterTaskId = '';
  while (true) {
    const page = loadExecutionLockActivePage(db, afterTaskId);
    active.push(...page);
    if (page.length < EXECUTION_LOCK_QUERY_PAGE_SIZE) return active;
    afterTaskId = page[page.length - 1]!.taskId;
  }
}

function parseExecutionLockActiveRow(
  row: ExecutionLockActiveRow,
): ExecutionLockInfo {
  const lock = parseExecutionLock(row.payload_json, row.task_id);
  if (!lock
    || lock.ownerId !== row.owner_id
    || lock.fencingToken.epoch !== row.fencing_epoch
    || lock.fencingToken.counter !== row.fencing_counter
    || lock.fencingToken.nonce !== row.fencing_nonce
    || JSON.stringify(lock) !== row.payload_json) {
    throw new ExecutionLockError(
      `Canonical execution authority row is invalid for task ${row.task_id}`,
      row.task_id,
      'malformed',
    );
  }
  return lock;
}

function loadExecutionLockActiveRow(
  db: DatabaseType,
  taskId: string,
): ExecutionLockInfo | undefined {
  const row = db.prepare(`
    SELECT task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
           payload_json
      FROM execution_lock_active
     WHERE task_id = ?
  `).get(taskId) as ExecutionLockActiveRow | undefined;
  return row ? parseExecutionLockActiveRow(row) : undefined;
}

function parseExecutionLockActiveAdoptionAuditRow(
  row: ExecutionLockActiveAdoptionAuditRow,
): ExecutionLockActiveAdoptionAudit {
  let raw: unknown;
  try {
    raw = JSON.parse(row.payload_json) as unknown;
  } catch {
    raw = null;
  }
  const audit = parseExecutionLockActiveAdoptionAudit(raw);
  if (!audit
    || audit.eventId !== row.event_id
    || audit.previousLock.taskId !== row.task_id
    || audit.previousLock.ownerId !== row.previous_owner_id
    || audit.previousLock.fencingToken.epoch !== row.previous_fencing_epoch
    || audit.previousLock.fencingToken.counter !== row.previous_fencing_counter
    || audit.previousLock.fencingToken.nonce !== row.previous_fencing_nonce
    || audit.adoptedLock.ownerId !== row.adopted_owner_id
    || audit.adoptedLock.fencingToken.epoch !== row.adopted_fencing_epoch
    || audit.adoptedLock.fencingToken.counter !== row.adopted_fencing_counter
    || audit.adoptedLock.fencingToken.nonce !== row.adopted_fencing_nonce
    || audit.adoptedAt !== row.occurred_at
    || JSON.stringify(audit) !== row.payload_json) {
    throw new ExecutionLockError(
      `Execution active adoption audit row is invalid: ${row.event_id}`,
      typeof row.task_id === 'string' ? row.task_id : 'unknown',
      'malformed',
    );
  }
  return audit;
}

function loadExecutionLockActiveAdoptionForPrevious(
  db: DatabaseType,
  previous: ExecutionLockInfo,
): ExecutionLockActiveAdoptionAudit | undefined {
  const row = db.prepare(`
    SELECT event_id, task_id, previous_owner_id, previous_fencing_epoch,
           previous_fencing_counter, previous_fencing_nonce,
           adopted_owner_id, adopted_fencing_epoch,
           adopted_fencing_counter, adopted_fencing_nonce, occurred_at,
           payload_json
      FROM execution_lock_active_adoption_audit
     WHERE task_id = ?
       AND previous_owner_id = ?
       AND previous_fencing_epoch = ?
       AND previous_fencing_counter = ?
       AND previous_fencing_nonce = ?
  `).get(
    previous.taskId,
    previous.ownerId,
    previous.fencingToken.epoch,
    previous.fencingToken.counter,
    previous.fencingToken.nonce,
  ) as ExecutionLockActiveAdoptionAuditRow | undefined;
  return row ? parseExecutionLockActiveAdoptionAuditRow(row) : undefined;
}

function loadExecutionLockActiveAdoptionForAdopted(
  db: DatabaseType,
  adopted: ExecutionLockInfo,
): ExecutionLockActiveAdoptionAudit | undefined {
  const row = db.prepare(`
    SELECT event_id, task_id, previous_owner_id, previous_fencing_epoch,
           previous_fencing_counter, previous_fencing_nonce,
           adopted_owner_id, adopted_fencing_epoch,
           adopted_fencing_counter, adopted_fencing_nonce, occurred_at,
           payload_json
      FROM execution_lock_active_adoption_audit
     WHERE task_id = ?
       AND adopted_owner_id = ?
       AND adopted_fencing_epoch = ?
       AND adopted_fencing_counter = ?
       AND adopted_fencing_nonce = ?
  `).get(
    adopted.taskId,
    adopted.ownerId,
    adopted.fencingToken.epoch,
    adopted.fencingToken.counter,
    adopted.fencingToken.nonce,
  ) as ExecutionLockActiveAdoptionAuditRow | undefined;
  return row ? parseExecutionLockActiveAdoptionAuditRow(row) : undefined;
}

function loadExecutionLockActiveAdoptionLineage(
  db: DatabaseType,
  current: ExecutionLockInfo,
): ExecutionLockActiveAdoptionAudit[] {
  const reversed: ExecutionLockActiveAdoptionAudit[] = [];
  let cursor = current;
  while (true) {
    const audit = loadExecutionLockActiveAdoptionForAdopted(db, cursor);
    if (!audit) break;
    if (JSON.stringify(audit.adoptedLock) !== JSON.stringify(cursor)) {
      throw new ExecutionLockError(
        `Execution active adoption lineage is invalid for task ${current.taskId}`,
        current.taskId,
        'malformed',
      );
    }
    reversed.push(audit);
    if (reversed.length > MAX_EXECUTION_LOCK_ACTIVE_ADOPTIONS) {
      throw new ExecutionLockError(
        `Execution active adoption lineage exceeds its durable limit for task ${current.taskId}`,
        current.taskId,
        'malformed',
      );
    }
    cursor = audit.previousLock;
  }
  return reversed.reverse();
}

function loadLegacyV2ExecutionLockActivePage(
  db: DatabaseType,
  afterTaskId: string,
): Array<{
  readonly lock: ExecutionLockInfo;
  readonly originalPayload: string;
}> {
  const rows = db.prepare(`
    SELECT task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
           payload_json
      FROM execution_lock_active
     WHERE task_id > ?
     ORDER BY task_id
     LIMIT ?
  `).all(
    afterTaskId,
    EXECUTION_LOCK_QUERY_PAGE_SIZE,
  ) as ExecutionLockActiveRow[];
  return rows.map(row => {
    const lock = parseLegacyV2ExecutionLock(row.payload_json, row.task_id);
    if (!lock
      || lock.ownerId !== row.owner_id
      || lock.fencingToken.epoch !== row.fencing_epoch
      || lock.fencingToken.counter !== row.fencing_counter
      || lock.fencingToken.nonce !== row.fencing_nonce) {
      throw new ExecutionLockError(
        `Legacy v2 execution authority row is invalid for task ${row.task_id}`,
        row.task_id,
        'malformed',
      );
    }
    return { lock, originalPayload: row.payload_json };
  });
}

function loadLegacyV2ExecutionLockActiveRows(
  db: DatabaseType,
): Array<{
  readonly lock: ExecutionLockInfo;
  readonly originalPayload: string;
}> {
  const active: Array<{
    readonly lock: ExecutionLockInfo;
    readonly originalPayload: string;
  }> = [];
  let afterTaskId = '';
  while (true) {
    const page =
      loadLegacyV2ExecutionLockActivePage(db, afterTaskId);
    active.push(...page);
    if (page.length < EXECUTION_LOCK_QUERY_PAGE_SIZE) return active;
    afterTaskId = page[page.length - 1]!.lock.taskId;
  }
}

function executionLockGenerationEquals(
  left: Pick<ExecutionLockInfo, 'taskId' | 'ownerId' | 'fencingToken'>,
  right: Pick<ExecutionLockInfo, 'taskId' | 'ownerId' | 'fencingToken'>,
): boolean {
  return left.taskId === right.taskId
    && left.ownerId === right.ownerId
    && executionLockFencingTokenEquals(
      left.fencingToken,
      right.fencingToken,
    );
}

function executionLockIsExactRenewalOf(
  previous: ExecutionLockInfo,
  candidate: ExecutionLockInfo,
): boolean {
  return previous.schemaVersion === candidate.schemaVersion
    && previous.taskId === candidate.taskId
    && previous.actor === candidate.actor
    && previous.ownerId === candidate.ownerId
    && previous.pid === candidate.pid
    && previous.hostInstanceId === candidate.hostInstanceId
    && previous.bootSessionId === candidate.bootSessionId
    && previous.processSessionId === candidate.processSessionId
    && executionLockFencingTokenEquals(
      previous.fencingToken,
      candidate.fencingToken,
    )
    && previous.acquiredAt === candidate.acquiredAt
    && previous.leaseDurationMs === candidate.leaseDurationMs
    && Date.parse(candidate.renewedAt) >= Date.parse(previous.renewedAt);
}

function parseExecutionLockQuarantineAuditRow(
  row: ExecutionLockQuarantineAuditRow,
): ExecutionLockQuarantineAuditEvent {
  const event = parseExecutionLockQuarantineAudit(row.payload_json);
  if (!event
    || event.eventId !== row.event_id
    || event.action !== row.action
    || event.quarantineId !== row.quarantine_id
    || event.taskId !== row.task_id
    || event.ownerId !== row.owner_id
    || event.fencingToken.epoch !== row.fencing_epoch
    || event.fencingToken.counter !== row.fencing_counter
    || event.fencingToken.nonce !== row.fencing_nonce
    || event.occurredAt !== row.occurred_at
    || JSON.stringify(event) !== row.payload_json) {
    throw new ExecutionLockError(
      `Execution lock quarantine audit row is invalid: ${row.event_id}`,
      typeof row.task_id === 'string' ? row.task_id : 'unknown',
      'malformed',
    );
  }
  return event;
}

interface ExecutionLockBoundaryAuditLineage {
  readonly boundary: ExecutionLockQuarantineAuditEvent;
  readonly resumes: readonly ExecutionLockQuarantineAuditEvent[];
  readonly currentLock: ExecutionLockInfo;
}

function loadExecutionLockQuarantineAuditChain(
  db: DatabaseType,
  quarantineId: string,
): ExecutionLockQuarantineAuditEvent[] {
  const rows = db.prepare(`
    SELECT event_id, action, quarantine_id, task_id, owner_id,
           fencing_epoch, fencing_counter, fencing_nonce, occurred_at,
           payload_json
      FROM execution_lock_quarantine_audit
     WHERE quarantine_id = ?
     ORDER BY fencing_counter, occurred_at, event_id
     LIMIT ?
  `).all(
    quarantineId,
    MAX_EXECUTION_LOCK_BOUNDARY_RESUMES + 4,
  ) as ExecutionLockQuarantineAuditRow[];
  if (rows.length > MAX_EXECUTION_LOCK_BOUNDARY_RESUMES + 3) {
    throw new ExecutionLockError(
      'Execution boundary resume chain exceeds its durable limit',
      typeof rows[0]?.task_id === 'string' ? rows[0].task_id : 'unknown',
      'malformed',
    );
  }
  return rows.map(parseExecutionLockQuarantineAuditRow);
}

function executionLockBoundaryAuditLineage(
  events: readonly ExecutionLockQuarantineAuditEvent[],
  quarantineId: string,
): ExecutionLockBoundaryAuditLineage | null {
  const boundaries = events.filter(event => event.action === 'boundary-entered');
  const resumes = events.filter(event => event.action === 'resumed');
  if (boundaries.length !== 1
    || resumes.length > MAX_EXECUTION_LOCK_BOUNDARY_RESUMES) return null;
  const boundary = boundaries[0]!;
  if (!('lock' in boundary.payload)
    || boundary.payload.quarantineId !== quarantineId
    || boundary.payload.state !== 'in-flight'
    || boundary.payload.reason !== 'irreversible-boundary') return null;
  let currentLock = boundary.payload.lock;
  let previousAt = boundary.occurredAt;
  const orderedResumes = [...resumes].sort((left, right) => (
    left.fencingToken.counter - right.fencingToken.counter
      || (left.eventId < right.eventId
        ? -1
        : left.eventId > right.eventId ? 1 : 0)
  ));
  for (const event of orderedResumes) {
    if (!('previousLock' in event.payload)
      || event.quarantineId !== quarantineId
      || event.taskId !== boundary.taskId
      || !executionLockIsExactRenewalOf(
        currentLock,
        event.payload.previousLock,
      )
      || event.payload.resumedAt < previousAt
      || event.occurredAt !== event.payload.resumedAt
      || event.ownerId !== event.payload.resumedLock.ownerId
      || !executionLockFencingTokenEquals(
        event.fencingToken,
        event.payload.resumedLock.fencingToken,
      )) return null;
    currentLock = event.payload.resumedLock;
    previousAt = event.occurredAt;
  }
  return { boundary, resumes: orderedResumes, currentLock };
}

function assertExecutionLockActiveQuarantineAuditChain(
  db: DatabaseType,
  quarantine: ExecutionLockQuarantineInfo,
): void {
  const events = loadExecutionLockQuarantineAuditChain(
    db,
    quarantine.quarantineId,
  );
  const lineage = executionLockBoundaryAuditLineage(
    events,
    quarantine.quarantineId,
  );
  if (!lineage) {
    const only = events[0];
    if (quarantine.state === 'quarantined'
      && events.length === 1
      && only?.action === 'quarantined'
      && 'lock' in only.payload
      && Date.parse(quarantine.enteredAt)
        >= Date.parse(quarantine.lock.acquiredAt)
      && JSON.stringify(only.payload) === JSON.stringify(quarantine)) return;
    throw new ExecutionLockError(
      `Execution quarantine audit chain is invalid for task ${quarantine.lock.taskId}`,
      quarantine.lock.taskId,
      'malformed',
    );
  }
  const nonLineage = events.filter(event => (
    event.action !== 'boundary-entered' && event.action !== 'resumed'
  ));
  const currentMatches =
    executionLockIsExactRenewalOf(lineage.currentLock, quarantine.lock);
  const quarantineAudit = nonLineage[0];
  const terminallyQuarantined = quarantine.state === 'quarantined'
    && nonLineage.length === 1
    && quarantineAudit?.action === 'quarantined'
    && 'lock' in quarantineAudit.payload
    && JSON.stringify(quarantineAudit.payload) === JSON.stringify(quarantine)
    && quarantineAudit.occurredAt >= lineage.boundary.occurredAt;
  if (!currentMatches
    || (quarantine.state === 'in-flight'
      ? nonLineage.length !== 0
      : !terminallyQuarantined)) {
    throw new ExecutionLockError(
      `Execution quarantine audit chain does not end at current authority for task ${quarantine.lock.taskId}`,
      quarantine.lock.taskId,
      'malformed',
    );
  }
}

function loadExecutionLockQuarantineAuditPage(
  db: DatabaseType,
  afterTaskId: string,
): ExecutionLockQuarantineAuditEvent[] {
  const rows = db.prepare(`
    SELECT audit.event_id, audit.action, audit.quarantine_id, audit.task_id,
           audit.owner_id, audit.fencing_epoch, audit.fencing_counter,
           audit.fencing_nonce, audit.occurred_at, audit.payload_json
      FROM execution_lock_quarantine_audit AS audit
      JOIN execution_lock_quarantine AS quarantine
        ON quarantine.quarantine_id = audit.quarantine_id
     WHERE quarantine.task_id > ?
       AND (
         (
           quarantine.state = 'in-flight'
           AND audit.action IN ('boundary-entered', 'resumed')
         ) OR (
           quarantine.state = 'quarantined'
           AND audit.action = 'quarantined'
         )
       )
       AND audit.owner_id = quarantine.owner_id
       AND audit.fencing_epoch = quarantine.fencing_epoch
       AND audit.fencing_counter = quarantine.fencing_counter
       AND audit.fencing_nonce = quarantine.fencing_nonce
     ORDER BY quarantine.task_id
     LIMIT ?
  `).all(
    afterTaskId,
    EXECUTION_LOCK_QUERY_PAGE_SIZE,
  ) as ExecutionLockQuarantineAuditRow[];
  return rows.map(parseExecutionLockQuarantineAuditRow);
}

function loadExecutionLockQuarantineAuditRows(
  db: DatabaseType,
): ExecutionLockQuarantineAuditEvent[] {
  const audits: ExecutionLockQuarantineAuditEvent[] = [];
  let afterTaskId = '';
  while (true) {
    const page =
      loadExecutionLockQuarantineAuditPage(db, afterTaskId);
    audits.push(...page);
    if (page.length < EXECUTION_LOCK_QUERY_PAGE_SIZE) return audits;
    afterTaskId = page[page.length - 1]!.taskId;
  }
}

function loadExecutionLockQuarantinePage(
  db: DatabaseType,
  afterTaskId: string,
): ExecutionLockQuarantineRow[] {
  return db.prepare(`
    SELECT task_id, quarantine_id, owner_id, fencing_epoch, fencing_counter,
           fencing_nonce, state, reason, entered_at, quarantined_at,
           payload_json
      FROM execution_lock_quarantine
     WHERE task_id > ?
     ORDER BY task_id
     LIMIT ?
  `).all(
    afterTaskId,
    EXECUTION_LOCK_QUERY_PAGE_SIZE,
  ) as ExecutionLockQuarantineRow[];
}

function loadExecutionLockQuarantineRows(
  db: DatabaseType,
  active: readonly ExecutionLockInfo[],
): ExecutionLockQuarantineInfo[] {
  const activeByTask = new Map(active.map(lock => [lock.taskId, lock]));
  const quarantines: ExecutionLockQuarantineInfo[] = [];
  let afterTaskId = '';
  while (true) {
    const page = loadExecutionLockQuarantinePage(db, afterTaskId);
    for (const row of page) {
      const quarantine =
        parseExecutionLockQuarantine(row.payload_json, row.task_id);
      const activeLock = activeByTask.get(row.task_id);
      if (!quarantine
        || quarantine.quarantineId !== row.quarantine_id
        || quarantine.lock.ownerId !== row.owner_id
        || quarantine.lock.fencingToken.epoch !== row.fencing_epoch
        || quarantine.lock.fencingToken.counter !== row.fencing_counter
        || quarantine.lock.fencingToken.nonce !== row.fencing_nonce
        || quarantine.state !== row.state
        || quarantine.reason !== row.reason
        || quarantine.enteredAt !== row.entered_at
        || quarantine.quarantinedAt !== row.quarantined_at
        || JSON.stringify(quarantine) !== row.payload_json
        || !activeLock
        || !executionLockGenerationEquals(quarantine.lock, activeLock)
        || JSON.stringify(quarantine.lock) !== JSON.stringify(activeLock)) {
        throw new ExecutionLockError(
          `Canonical execution quarantine row is invalid for task ${row.task_id}`,
          row.task_id,
          'malformed',
        );
      }
      quarantines.push(quarantine);
    }
    if (page.length < EXECUTION_LOCK_QUERY_PAGE_SIZE) break;
    afterTaskId = page[page.length - 1]!.task_id;
  }
  const audits = loadExecutionLockQuarantineAuditRows(db);
  const auditsByQuarantineId = new Map(
    audits.map(audit => [audit.quarantineId, audit]),
  );
  for (const quarantine of quarantines) {
    const audit = auditsByQuarantineId.get(quarantine.quarantineId);
    const actionMatches = quarantine.state === 'in-flight'
      ? audit?.action === 'boundary-entered' || audit?.action === 'resumed'
      : audit?.action === 'quarantined';
    if (!audit
      || !actionMatches
      || audit.taskId !== quarantine.lock.taskId
      || audit.ownerId !== quarantine.lock.ownerId
      || !executionLockFencingTokenEquals(
        audit.fencingToken,
        quarantine.lock.fencingToken,
      )) {
      throw new ExecutionLockError(
        `Execution quarantine has no durable current-generation audit for task ${quarantine.lock.taskId}`,
        quarantine.lock.taskId,
        'malformed',
      );
    }
    assertExecutionLockActiveQuarantineAuditChain(db, quarantine);
  }
  return quarantines;
}

function loadExecutionLockQuarantineForLock(
  db: DatabaseType,
  lock: ExecutionLockInfo,
): ExecutionLockQuarantineInfo | undefined {
  const row = db.prepare(`
    SELECT task_id, quarantine_id, owner_id, fencing_epoch, fencing_counter,
           fencing_nonce, state, reason, entered_at, quarantined_at,
           payload_json
      FROM execution_lock_quarantine
     WHERE task_id = ?
  `).get(lock.taskId) as ExecutionLockQuarantineRow | undefined;
  if (!row) return undefined;
  const quarantine =
    parseExecutionLockQuarantine(row.payload_json, row.task_id);
  if (!quarantine
    || quarantine.quarantineId !== row.quarantine_id
    || quarantine.lock.ownerId !== row.owner_id
    || quarantine.lock.fencingToken.epoch !== row.fencing_epoch
    || quarantine.lock.fencingToken.counter !== row.fencing_counter
    || quarantine.lock.fencingToken.nonce !== row.fencing_nonce
    || quarantine.state !== row.state
    || quarantine.reason !== row.reason
    || quarantine.enteredAt !== row.entered_at
    || quarantine.quarantinedAt !== row.quarantined_at
    || JSON.stringify(quarantine) !== row.payload_json
    || !executionLockGenerationEquals(quarantine.lock, lock)
    || JSON.stringify(quarantine.lock) !== JSON.stringify(lock)) {
    throw new ExecutionLockError(
      `Canonical execution quarantine row is invalid for task ${lock.taskId}`,
      lock.taskId,
      'malformed',
    );
  }
  const actions = quarantine.state === 'in-flight'
    ? ['boundary-entered', 'resumed'] as const
    : ['quarantined'] as const;
  const auditRow = db.prepare(`
    SELECT event_id, action, quarantine_id, task_id, owner_id, fencing_epoch,
           fencing_counter, fencing_nonce, occurred_at, payload_json
      FROM execution_lock_quarantine_audit
     WHERE quarantine_id = ?
       AND action IN (${actions.map(() => '?').join(', ')})
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
  `).get(
    quarantine.quarantineId,
    ...actions,
    quarantine.lock.ownerId,
    quarantine.lock.fencingToken.epoch,
    quarantine.lock.fencingToken.counter,
    quarantine.lock.fencingToken.nonce,
  ) as
    | ExecutionLockQuarantineAuditRow
    | undefined;
  const audit = auditRow
    ? parseExecutionLockQuarantineAudit(auditRow.payload_json)
    : null;
  if (!auditRow
    || !audit
    || audit.eventId !== auditRow.event_id
    || audit.action !== auditRow.action
    || audit.quarantineId !== auditRow.quarantine_id
    || audit.taskId !== auditRow.task_id
    || audit.ownerId !== auditRow.owner_id
    || audit.fencingToken.epoch !== auditRow.fencing_epoch
    || audit.fencingToken.counter !== auditRow.fencing_counter
    || audit.fencingToken.nonce !== auditRow.fencing_nonce
    || audit.occurredAt !== auditRow.occurred_at
    || JSON.stringify(audit) !== auditRow.payload_json) {
    throw new ExecutionLockError(
        `Execution quarantine has no durable current-generation audit for task ${lock.taskId}`,
      lock.taskId,
      'malformed',
    );
  }
  assertExecutionLockActiveQuarantineAuditChain(db, quarantine);
  return quarantine;
}

function createExecutionLockQuarantineAudit(
  action: ExecutionLockQuarantineAuditEvent['action'],
  quarantine: ExecutionLockQuarantineInfo,
  payload: ExecutionLockQuarantineAuditEvent['payload'],
  occurredAt: string,
  eventId: string = randomUUID(),
): ExecutionLockQuarantineAuditEvent {
  return {
    schemaVersion: EXECUTION_LOCK_QUARANTINE_AUDIT_SCHEMA_VERSION,
    eventId,
    action,
    quarantineId: quarantine.quarantineId,
    taskId: quarantine.lock.taskId,
    ownerId: quarantine.lock.ownerId,
    fencingToken: quarantine.lock.fencingToken,
    occurredAt,
    payload,
  };
}

function appendExecutionLockQuarantineAudit(
  db: DatabaseType,
  event: ExecutionLockQuarantineAuditEvent,
): void {
  const result = db.prepare(`
    INSERT INTO execution_lock_quarantine_audit(
      event_id, action, quarantine_id, task_id, owner_id, fencing_epoch,
      fencing_counter, fencing_nonce, occurred_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.action,
    event.quarantineId,
    event.taskId,
    event.ownerId,
    event.fencingToken.epoch,
    event.fencingToken.counter,
    event.fencingToken.nonce,
    event.occurredAt,
    JSON.stringify(event),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Execution lock quarantine audit append failed for task ${event.taskId}`,
      event.taskId,
      'mutation-conflict',
    );
  }
}

function insertExecutionLockQuarantineRow(
  db: DatabaseType,
  quarantine: ExecutionLockQuarantineInfo,
): void {
  const result = db.prepare(`
    INSERT INTO execution_lock_quarantine(
      task_id, quarantine_id, owner_id, fencing_epoch, fencing_counter,
      fencing_nonce, state, reason, entered_at, quarantined_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quarantine.lock.taskId,
    quarantine.quarantineId,
    quarantine.lock.ownerId,
    quarantine.lock.fencingToken.epoch,
    quarantine.lock.fencingToken.counter,
    quarantine.lock.fencingToken.nonce,
    quarantine.state,
    quarantine.reason,
    quarantine.enteredAt,
    quarantine.quarantinedAt,
    JSON.stringify(quarantine),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Execution quarantine insert failed for task ${quarantine.lock.taskId}`,
      quarantine.lock.taskId,
      'mutation-conflict',
    );
  }
}

function reconcileExecutionLockProjections(
  projectRoot: string,
  db: DatabaseType,
  options: ExecutionLockOptions = {},
): ExecutionLockInfo[] {
  const active = loadExecutionLockActiveRows(db);
  loadExecutionLockQuarantineRows(db, active);
  const activeByTask = new Map(active.map(lock => [lock.taskId, lock]));
  const activeByOwner = new Map(active.map(lock => [lock.ownerId, lock]));
  const projections = scanExecutionLockProjections(
    projectRoot,
    activeByTask,
    activeByOwner,
    options,
  );
  const projectionByTask =
    new Map(projections.map(projection => [projection.lock.taskId, projection]));

  for (const projection of projections) {
    if (!activeByTask.has(projection.lock.taskId)) {
      unlinkSync(projection.path);
    }
  }
  for (const lock of active) {
    const projection = projectionByTask.get(lock.taskId);
    const canonicalRaw = JSON.stringify(lock);
    if (!projection) {
      writeExecutionLockProjection(projectRoot, lock, false);
    } else if (projection.raw !== canonicalRaw) {
      writeExecutionLockProjection(projectRoot, lock, true);
    }
  }
  return active;
}

function reconcileExecutionLockProjectionForTask(
  projectRoot: string,
  db: DatabaseType,
  taskId: string,
  options: ExecutionLockOptions = {},
): {
  readonly lock: ExecutionLockInfo | undefined;
  readonly quarantine: ExecutionLockQuarantineInfo | undefined;
} {
  const lock = loadExecutionLockActiveRow(db, taskId);
  const quarantine = lock
    ? loadExecutionLockQuarantineForLock(db, lock)
    : undefined;
  const path = executionLockPathFor(projectRoot, taskId);
  if (lock) {
    const stagingPath = `${path}.tmp-${lock.ownerId}`;
    try {
      const staging = lstatSync(stagingPath);
      if (!staging.isFile()
        || staging.isSymbolicLink()
        || staging.nlink !== 1) {
        throw new ExecutionLockError(
          `Execution projection staging is unsafe for task ${taskId}`,
          taskId,
          'malformed',
        );
      }
      const state = executionLockLivenessProbe(options).inspect(
        lock,
        resolveExecutionLockIdentity(options),
      );
      if (state === 'dead') {
        unlinkSync(stagingPath);
        fsyncExecutionLockDirectory(dirname(stagingPath));
      } else {
        throw new ExecutionLockError(
          `Execution projection publish is ${state} for task ${taskId}`,
          taskId,
          state === 'foreign-host'
            ? 'foreign-host'
            : state === 'unknown'
              ? 'liveness-unknown'
              : 'held',
          lock.ownerId,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  let raw: string | null;
  try {
    raw = readBoundedRegularFile(path, MAX_EXECUTION_LOCK_PROJECTION_BYTES);
  } catch {
    throw new ExecutionLockError(
      `Execution lock projection is unsafe for task ${taskId}`,
      taskId,
      'malformed',
    );
  }
  if (!lock) {
    if (raw !== null) {
      const projection = parseExecutionLock(raw, taskId);
      if (!projection) {
        throw new ExecutionLockError(
          `Orphan execution projection is malformed for task ${taskId}`,
          taskId,
          'malformed',
        );
      }
      unlinkSync(path);
    }
    return { lock: undefined, quarantine: undefined };
  }
  let projection = raw === null ? null : parseExecutionLock(raw, taskId);
  if (raw !== null && !projection) {
    const legacy = parseLegacyV2ExecutionLock(raw, taskId);
    if (legacy
      && executionLockGenerationEquals(legacy, lock)
      && JSON.stringify(legacy) === JSON.stringify(lock)) {
      projection = lock;
    }
  }
  if (raw !== null && !projection) {
    throw new ExecutionLockError(
      `Execution projection is malformed for task ${taskId}`,
      taskId,
      'malformed',
    );
  }
  const canonicalRaw = JSON.stringify(lock);
  if (raw === null) {
    writeExecutionLockProjection(projectRoot, lock, false);
  } else if (raw !== canonicalRaw) {
    writeExecutionLockProjection(projectRoot, lock, true);
  }
  return { lock, quarantine };
}

function insertExecutionLockActiveRow(
  db: DatabaseType,
  lock: ExecutionLockInfo,
): void {
  db.prepare(`
    INSERT INTO execution_lock_active(
      task_id, owner_id, fencing_epoch, fencing_counter, fencing_nonce,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    lock.taskId,
    lock.ownerId,
    lock.fencingToken.epoch,
    lock.fencingToken.counter,
    lock.fencingToken.nonce,
    JSON.stringify(lock),
  );
}

function updateExecutionLockActiveRow(
  db: DatabaseType,
  lock: ExecutionLockInfo,
): void {
  const result = db.prepare(`
    UPDATE execution_lock_active
       SET payload_json = ?
     WHERE task_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
  `).run(
    JSON.stringify(lock),
    lock.taskId,
    lock.ownerId,
    lock.fencingToken.epoch,
    lock.fencingToken.counter,
    lock.fencingToken.nonce,
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Canonical execution authority ownership lost for task ${lock.taskId}`,
      lock.taskId,
      'ownership-lost',
    );
  }
}

function transferExecutionLockActiveRow(
  db: DatabaseType,
  previous: ExecutionLockInfo,
  candidate: ExecutionLockInfo,
): void {
  const result = db.prepare(`
    UPDATE execution_lock_active
       SET owner_id = ?,
           fencing_epoch = ?,
           fencing_counter = ?,
           fencing_nonce = ?,
           payload_json = ?
     WHERE task_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND payload_json = ?
  `).run(
    candidate.ownerId,
    candidate.fencingToken.epoch,
    candidate.fencingToken.counter,
    candidate.fencingToken.nonce,
    JSON.stringify(candidate),
    previous.taskId,
    previous.ownerId,
    previous.fencingToken.epoch,
    previous.fencingToken.counter,
    previous.fencingToken.nonce,
    JSON.stringify(previous),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Canonical execution authority transfer lost exact ownership for task ${previous.taskId}`,
      previous.taskId,
      'ownership-lost',
    );
  }
}

function appendExecutionLockActiveAdoptionAudit(
  db: DatabaseType,
  audit: ExecutionLockActiveAdoptionAudit,
): void {
  const result = db.prepare(`
    INSERT INTO execution_lock_active_adoption_audit(
      event_id, task_id, previous_owner_id, previous_fencing_epoch,
      previous_fencing_counter, previous_fencing_nonce, adopted_owner_id,
      adopted_fencing_epoch, adopted_fencing_counter, adopted_fencing_nonce,
      occurred_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    audit.eventId,
    audit.previousLock.taskId,
    audit.previousLock.ownerId,
    audit.previousLock.fencingToken.epoch,
    audit.previousLock.fencingToken.counter,
    audit.previousLock.fencingToken.nonce,
    audit.adoptedLock.ownerId,
    audit.adoptedLock.fencingToken.epoch,
    audit.adoptedLock.fencingToken.counter,
    audit.adoptedLock.fencingToken.nonce,
    audit.adoptedAt,
    JSON.stringify(audit),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Execution active adoption audit append failed for task ${audit.previousLock.taskId}`,
      audit.previousLock.taskId,
      'mutation-conflict',
    );
  }
}

function deleteExecutionLockActiveRow(
  db: DatabaseType,
  lock: Pick<ExecutionLockInfo, 'taskId' | 'ownerId' | 'fencingToken'>,
): void {
  const result = db.prepare(`
    DELETE FROM execution_lock_active
     WHERE task_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
  `).run(
    lock.taskId,
    lock.ownerId,
    lock.fencingToken.epoch,
    lock.fencingToken.counter,
    lock.fencingToken.nonce,
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Canonical execution authority ownership lost for task ${lock.taskId}`,
      lock.taskId,
      'ownership-lost',
    );
  }
}

function deleteExecutionLockQuarantineRow(
  db: DatabaseType,
  quarantine: ExecutionLockQuarantineInfo,
): void {
  const result = db.prepare(`
    DELETE FROM execution_lock_quarantine
     WHERE task_id = ?
       AND quarantine_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND state = ?
       AND payload_json = ?
  `).run(
    quarantine.lock.taskId,
    quarantine.quarantineId,
    quarantine.lock.ownerId,
    quarantine.lock.fencingToken.epoch,
    quarantine.lock.fencingToken.counter,
    quarantine.lock.fencingToken.nonce,
    quarantine.state,
    JSON.stringify(quarantine),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Execution quarantine generation changed for task ${quarantine.lock.taskId}`,
      quarantine.lock.taskId,
      'ownership-lost',
    );
  }
}

function transitionExecutionLockQuarantineRow(
  db: DatabaseType,
  previous: ExecutionLockQuarantineInfo,
  candidate: ExecutionLockQuarantineInfo,
): void {
  const result = db.prepare(`
    UPDATE execution_lock_quarantine
       SET state = ?,
           reason = ?,
           quarantined_at = ?,
           payload_json = ?
     WHERE task_id = ?
       AND quarantine_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND state = 'in-flight'
       AND payload_json = ?
  `).run(
    candidate.state,
    candidate.reason,
    candidate.quarantinedAt,
    JSON.stringify(candidate),
    previous.lock.taskId,
    previous.quarantineId,
    previous.lock.ownerId,
    previous.lock.fencingToken.epoch,
    previous.lock.fencingToken.counter,
    previous.lock.fencingToken.nonce,
    JSON.stringify(previous),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Execution quarantine transition lost exact authority for task ${previous.lock.taskId}`,
      previous.lock.taskId,
      'ownership-lost',
    );
  }
}

function resumeExecutionLockQuarantineRow(
  db: DatabaseType,
  previous: ExecutionLockQuarantineInfo,
  candidate: ExecutionLockQuarantineInfo,
): void {
  const result = db.prepare(`
    UPDATE execution_lock_quarantine
       SET owner_id = ?,
           fencing_epoch = ?,
           fencing_counter = ?,
           fencing_nonce = ?,
           payload_json = ?
     WHERE task_id = ?
       AND quarantine_id = ?
       AND owner_id = ?
       AND fencing_epoch = ?
       AND fencing_counter = ?
       AND fencing_nonce = ?
       AND state = 'in-flight'
       AND reason = 'irreversible-boundary'
       AND payload_json = ?
  `).run(
    candidate.lock.ownerId,
    candidate.lock.fencingToken.epoch,
    candidate.lock.fencingToken.counter,
    candidate.lock.fencingToken.nonce,
    JSON.stringify(candidate),
    previous.lock.taskId,
    previous.quarantineId,
    previous.lock.ownerId,
    previous.lock.fencingToken.epoch,
    previous.lock.fencingToken.counter,
    previous.lock.fencingToken.nonce,
    JSON.stringify(previous),
  );
  if (result.changes !== 1) {
    throw new ExecutionLockError(
      `Execution boundary resume lost exact authority for task ${previous.lock.taskId}`,
      previous.lock.taskId,
      'ownership-lost',
    );
  }
}

function executionLockForExactGeneration(
  active: readonly ExecutionLockInfo[],
  expected: ExecutionLockInfo,
): ExecutionLockInfo | undefined {
  return active.find(candidate =>
    executionLockGenerationEquals(candidate, expected)
    && JSON.stringify(candidate) === JSON.stringify(expected));
}

function assertExactLiveExecutionLockOwner(
  lock: ExecutionLockInfo,
  options: ExecutionLockOptions,
): void {
  const runtimeIdentity = resolveExecutionLockIdentity(options);
  const callerPid = options.ownerPid ?? process.pid;
  const exactRuntime = lock.pid === callerPid
    && lock.hostInstanceId === runtimeIdentity.hostInstanceId
    && lock.bootSessionId === runtimeIdentity.bootSessionId
    && lock.processSessionId === runtimeIdentity.processSessionId;
  const state = exactRuntime
    ? executionLockLivenessProbe(options).inspect(lock, runtimeIdentity)
    : 'foreign-host';
  if (!exactRuntime || state !== 'alive') {
    throw new ExecutionLockError(
      `Irreversible execution boundary owner is not the exact live runtime for task ${lock.taskId}`,
      lock.taskId,
      state === 'foreign-host'
        ? 'foreign-host'
        : state === 'unknown'
          ? 'liveness-unknown'
          : 'authority-lost',
      lock.ownerId,
    );
  }
}

function retireCanonicalExecutionLockIfDead(
  projectRoot: string,
  db: DatabaseType,
  lock: ExecutionLockInfo,
  nowMs: number,
  options: ExecutionLockOptions,
  knownQuarantine?: ExecutionLockQuarantineInfo | null,
): boolean {
  const quarantine = knownQuarantine === undefined
    ? loadExecutionLockQuarantineForLock(db, lock)
    : knownQuarantine ?? undefined;
  if (quarantine) {
    throw new ExecutionLockError(
      `Execution authority is protected by a durable ${quarantine.state} boundary for task ${lock.taskId}`,
      lock.taskId,
      'quarantined',
      lock.ownerId,
      lock,
    );
  }
  if (!staleExecutionLockCanRetire(lock, nowMs, options)) return false;
  deleteExecutionLockActiveRow(db, lock);
  const projection = readExecutionLockProjection(projectRoot, lock.taskId);
  if (projection) unlinkSync(projection.path);
  return true;
}

function heldExecutionLockReason(
  lock: ExecutionLockInfo,
  options: ExecutionLockOptions,
  localReason: ExecutionLockFailureReason,
): ExecutionLockFailureReason {
  const local = resolveExecutionLockIdentity(options);
  return lock.hostInstanceId !== local.hostInstanceId
    || lock.bootSessionId !== local.bootSessionId
    ? 'foreign-host'
    : localReason;
}

function normalizeExecutionLockHandle(
  value: ExecutionLockInfo,
): ExecutionLockInfo {
  const parsed = parseExecutionLock(JSON.stringify(value), value.taskId);
  if (!parsed) {
    throw new ExecutionLockError(
      'Execution lock exact-generation handle is invalid',
      typeof value.taskId === 'string' ? value.taskId : 'unknown',
      'invalid-input',
    );
  }
  return parsed;
}

function normalizeExecutionLockQuarantineHandle(
  value: ExecutionLockQuarantineInfo,
): ExecutionLockQuarantineInfo {
  const parsed = parseExecutionLockQuarantine(
    JSON.stringify(value),
    value.lock.taskId,
  );
  if (!parsed || JSON.stringify(parsed) !== JSON.stringify(value)) {
    throw new ExecutionLockError(
      'Execution quarantine exact-generation handle is invalid',
      typeof value.lock?.taskId === 'string' ? value.lock.taskId : 'unknown',
      'invalid-input',
    );
  }
  return parsed;
}

function readCommittedExecutionLockQuarantine(
  projectRoot: string,
  expected: ExecutionLockQuarantineInfo,
): ExecutionLockQuarantineInfo {
  const inspected = checkExecutionLock(projectRoot, expected.lock.taskId);
  if (inspected.state !== 'quarantined'
    || inspected.quarantine.quarantineId !== expected.quarantineId
    || inspected.quarantine.state !== expected.state
    || JSON.stringify(inspected.quarantine) !== JSON.stringify(expected)) {
    throw new ExecutionLockError(
      `Committed execution quarantine could not be verified for task ${expected.lock.taskId}`,
      expected.lock.taskId,
      'mutation-conflict',
      expected.lock.ownerId,
      expected.lock,
    );
  }
  return inspected.quarantine;
}

/**
 * Inspect without collapsing unsafe/malformed bytes into absence.
 * All callers must treat `malformed` as HOLD.
 */
export function checkExecutionLock(
  projectRoot: string,
  taskId: string,
): ExecutionLockInspection {
  try {
    const inspected = withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
      return reconcileExecutionLockProjectionForTask(
        authorityRoot,
        db,
        taskId,
      );
    });
    return inspected.lock && inspected.quarantine
      ? {
        state: 'quarantined',
        lock: inspected.lock,
        quarantine: inspected.quarantine,
      }
      : inspected.lock
        ? { state: 'held', lock: inspected.lock }
      : { state: 'absent' };
  } catch (error) {
    const lockPath = executionLockPathFor(projectRoot, taskId);
    return {
      state: 'malformed',
      lockPath,
      reason: error instanceof ExecutionLockError
        && (error.reason === 'authority-state-missing'
          || error.reason === 'authority-epoch-mismatch'
          || error.reason === 'secure-open-unsupported')
        ? error.reason
        : error instanceof ExecutionLockError
          && error.message.toLowerCase().includes('directory')
          ? 'unsafe-directory'
          : error instanceof ExecutionLockError
            && error.message.toLowerCase().includes('unsafe')
            ? 'unsafe-entry'
            : 'invalid-projection',
    };
  }
}

export function beginExecutionLockIrreversibleBoundary(
  projectRoot: string,
  exactLock: ExecutionLockInfo,
  request: ExecutionLockIrreversibleBoundaryRequest = {},
  options: ExecutionLockOptions = {},
): ExecutionLockQuarantineInfo {
  const expected = normalizeExecutionLockHandle(exactLock);
  if (request.quarantineId !== undefined
    && !EXECUTION_LOCK_UUID_PATTERN.test(request.quarantineId)) {
    throw new ExecutionLockError(
      `Execution boundary id is invalid for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const evidenceRefs =
    normalizeExecutionLockEvidenceRefs(request.evidenceRefs, expected.taskId);
  const nowMs = executionLockNow(options);
  const quarantine = withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    const current = reconcileExecutionLockProjectionForTask(
      authorityRoot,
      db,
      expected.taskId,
      options,
    );
    const canonical = current.lock
      && executionLockForExactGeneration([current.lock], expected);
    if (!canonical) {
      throw new ExecutionLockError(
        `Execution boundary ownership lost for task ${expected.taskId}`,
        expected.taskId,
        'ownership-lost',
      );
    }
    const existing = current.quarantine;
    assertExactLiveExecutionLockOwner(canonical, options);
    if (existing) {
      if (existing.state === 'in-flight'
        && (request.quarantineId === undefined
          || existing.quarantineId === request.quarantineId)
        && JSON.stringify(existing.evidenceRefs)
          === JSON.stringify(evidenceRefs)) {
        return existing;
      }
      throw new ExecutionLockError(
        existing.state === 'in-flight'
          ? `Execution boundary replay conflicts for task ${expected.taskId}`
          : `Execution generation is already quarantined for task ${expected.taskId}`,
        expected.taskId,
        existing.state === 'in-flight' ? 'mutation-conflict' : 'quarantined',
        canonical.ownerId,
        canonical,
      );
    }
    const enteredAt = executionLockTimestamp(
      Math.max(nowMs, Date.parse(canonical.renewedAt)),
    );
    const candidate: ExecutionLockQuarantineInfo = {
      schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
      quarantineId: request.quarantineId ?? randomUUID(),
      lock: canonical,
      state: 'in-flight',
      reason: 'irreversible-boundary',
      evidenceRefs,
      enteredAt,
      quarantinedAt: null,
    };
    insertExecutionLockQuarantineRow(db, candidate);
    appendExecutionLockQuarantineAudit(
      db,
      createExecutionLockQuarantineAudit(
        'boundary-entered',
        candidate,
        candidate,
        enteredAt,
      ),
    );
    return candidate;
  });
  return readCommittedExecutionLockQuarantine(projectRoot, quarantine);
}

function readCompletedExecutionLockBoundaryFromDb(
  db: DatabaseType,
  quarantineId: string,
): ExecutionLockQuarantineAuditEvent | null {
  const events = loadExecutionLockQuarantineAuditChain(db, quarantineId);
  if (events.length === 0) return null;
  const lineage = executionLockBoundaryAuditLineage(events, quarantineId);
  const completed = events.filter(event => event.action === 'completed');
  const allowedCount = 2 + (lineage?.resumes.length ?? 0);
  const event = completed[0];
  const latestBoundaryAt = lineage
    ? [lineage.boundary, ...lineage.resumes]
      .reduce((latest, candidate) => (
        candidate.occurredAt > latest ? candidate.occurredAt : latest
      ), lineage.boundary.occurredAt)
    : '';
  if (!lineage
    || events.length !== allowedCount
    || completed.length !== 1
    || !event
    || event.taskId !== lineage.boundary.taskId
    || event.ownerId !== lineage.currentLock.ownerId
    || !executionLockFencingTokenEquals(
      event.fencingToken,
      lineage.currentLock.fencingToken,
    )
    || !('completedAt' in event.payload)
    || event.payload.quarantineId !== quarantineId
    || event.occurredAt !== event.payload.completedAt
    || event.occurredAt < latestBoundaryAt) {
    throw new ExecutionLockError(
      `Execution boundary terminal audit chain is invalid for task ${event?.taskId ?? lineage?.boundary.taskId ?? 'unknown'}`,
      event?.taskId ?? lineage?.boundary.taskId ?? 'unknown',
      'malformed',
    );
  }
  const quarantine = db.prepare(`
    SELECT quarantine_id
      FROM execution_lock_quarantine
     WHERE quarantine_id = ?
  `).get(quarantineId) as { readonly quarantine_id?: unknown } | undefined;
  if (quarantine !== undefined) {
    throw new ExecutionLockError(
      `Completed execution boundary remains active for task ${event.taskId}`,
      event.taskId,
      'malformed',
    );
  }
  const active = loadExecutionLockActiveRow(db, event.taskId);
  if (active
    && active.ownerId === event.ownerId
    && executionLockFencingTokenEquals(active.fencingToken, event.fencingToken)) {
    throw new ExecutionLockError(
      `Completed execution boundary retains its fencing generation for task ${event.taskId}`,
      event.taskId,
      'malformed',
    );
  }
  return event;
}

/**
 * Reread one exact completed irreversible-boundary audit from canonical lock
 * storage. This is intentionally keyed by the durable boundary UUID rather
 * than task projection state: terminal completion removes the active and
 * quarantine rows, while the append-only audit remains the restart authority.
 */
export function readCompletedExecutionLockBoundary(
  projectRoot: string,
  quarantineId: string,
): ExecutionLockQuarantineAuditEvent | null {
  if (!EXECUTION_LOCK_UUID_PATTERN.test(quarantineId)) {
    throw new ExecutionLockError(
      'Execution boundary id is invalid',
      'unknown',
      'invalid-input',
    );
  }
  return withExecutionLockMutation(
    projectRoot,
    db => readCompletedExecutionLockBoundaryFromDb(db, quarantineId),
  );
}

function completedExecutionLockBoundaryResultFromDb(
  db: DatabaseType,
  quarantineId: string,
): Omit<ExecutionLockBoundaryCompletionResult, 'projectionCleanup'> | null {
  const audit = readCompletedExecutionLockBoundaryFromDb(db, quarantineId);
  if (!audit) return null;
  const lineage = executionLockBoundaryAuditLineage(
    loadExecutionLockQuarantineAuditChain(db, quarantineId),
    quarantineId,
  );
  const completed = lineage?.boundary.payload;
  if (!lineage
    || lineage.resumes.length !== 0
    || !completed
    || !('lock' in completed)
    || completed.state !== 'in-flight'
    || completed.reason !== 'irreversible-boundary') {
    throw new ExecutionLockError(
      `Execution boundary terminal payload is invalid for task ${audit.taskId}`,
      audit.taskId,
      'malformed',
    );
  }
  return { completed, audit };
}

/**
 * Resolve a committed active-generation adoption from the exact canonical
 * successor. This never searches by transaction text: callers must already
 * possess the current fenced handle and the exact evidence identity, then may
 * derive their higher-level prior-lease digest from the validated previousLock.
 */
export function readExecutionLockActiveAdoption(
  projectRoot: string,
  exactAdoptedLock: ExecutionLockInfo,
  request: ExecutionLockActiveAdoptionRequest,
): ExecutionLockActiveAdoptionResolution | null {
  const expected = normalizeExecutionLockHandle(exactAdoptedLock);
  const evidenceRefs = normalizeExecutionLockEvidenceRefs(
    request.evidenceRefs,
    expected.taskId,
  );
  if (evidenceRefs.length === 0) {
    throw new ExecutionLockError(
      `Execution active adoption evidence is required for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  return withExecutionLockMutation(projectRoot, db => {
    const current = loadExecutionLockActiveRow(db, expected.taskId);
    const canonical = current
      && executionLockForExactGeneration([current], expected);
    if (!canonical) {
      throw new ExecutionLockError(
        `Exact adopted execution generation is not canonical for task ${expected.taskId}`,
        expected.taskId,
        'ownership-lost',
        current?.ownerId,
        current,
      );
    }
    if (loadExecutionLockQuarantineForLock(db, canonical)) {
      throw new ExecutionLockError(
        `Quarantined execution generation is not an active adoption for task ${expected.taskId}`,
        expected.taskId,
        'quarantined',
        canonical.ownerId,
        canonical,
      );
    }
    const lineage = loadExecutionLockActiveAdoptionLineage(db, canonical);
    const audit = lineage[lineage.length - 1];
    if (!audit) return null;
    if (JSON.stringify(audit.adoptedLock) !== JSON.stringify(canonical)
      || lineage.some(candidate => (
        JSON.stringify(candidate.evidenceRefs)
          !== JSON.stringify(evidenceRefs)
      ))) {
      throw new ExecutionLockError(
        `Execution active adoption evidence conflicts for task ${expected.taskId}`,
        expected.taskId,
        'mutation-conflict',
        canonical.ownerId,
        canonical,
      );
    }
    return {
      previous: audit.previousLock,
      adopted: canonical,
      audit,
      lineage,
    };
  });
}

/**
 * Resolve the final durable resume hop from the exact current in-flight
 * quarantine. The complete boundary lineage is validated before exposing the
 * previous lock, so restart logic cannot manufacture a predecessor from a
 * weak transaction identifier or stale projection.
 */
export function readExecutionLockBoundaryResume(
  projectRoot: string,
  exactResumedQuarantine: ExecutionLockQuarantineInfo,
  request: ExecutionLockBoundaryResumeRequest,
): ExecutionLockBoundaryResumeResolution | null {
  const expected = normalizeExecutionLockQuarantineHandle(
    exactResumedQuarantine,
  );
  const evidenceRefs = normalizeExecutionLockEvidenceRefs(
    request.evidenceRefs,
    expected.lock.taskId,
  );
  if (evidenceRefs.length === 0) {
    throw new ExecutionLockError(
      `Execution boundary resume evidence is required for task ${expected.lock.taskId}`,
      expected.lock.taskId,
      'invalid-input',
    );
  }
  return withExecutionLockMutation(projectRoot, db => {
    const current = loadExecutionLockActiveRow(db, expected.lock.taskId);
    const canonical = current
      && executionLockForExactGeneration([current], expected.lock);
    const quarantine = canonical
      ? loadExecutionLockQuarantineForLock(db, canonical)
      : undefined;
    if (!canonical
      || !quarantine
      || JSON.stringify(quarantine) !== JSON.stringify(expected)) {
      throw new ExecutionLockError(
        `Exact resumed execution boundary is not canonical for task ${expected.lock.taskId}`,
        expected.lock.taskId,
        quarantine?.state === 'quarantined'
          ? 'quarantined'
          : 'ownership-lost',
        current?.ownerId,
        current,
      );
    }
    if (quarantine.state !== 'in-flight') {
      throw new ExecutionLockError(
        `Terminal execution quarantine has no resumable lineage for task ${expected.lock.taskId}`,
        expected.lock.taskId,
        'quarantined',
        canonical.ownerId,
        canonical,
      );
    }
    const lineage = executionLockBoundaryAuditLineage(
      loadExecutionLockQuarantineAuditChain(db, quarantine.quarantineId),
      quarantine.quarantineId,
    );
    if (!lineage
      || !executionLockIsExactRenewalOf(lineage.currentLock, canonical)) {
      throw new ExecutionLockError(
        `Execution boundary resume lineage is malformed for task ${expected.lock.taskId}`,
        expected.lock.taskId,
        'malformed',
      );
    }
    const audit = lineage.resumes[lineage.resumes.length - 1];
    if (!audit) return null;
    if (!('previousLock' in audit.payload)
      || lineage.resumes.some(candidate => (
        !('previousLock' in candidate.payload)
        || JSON.stringify(candidate.payload.evidenceRefs)
          !== JSON.stringify(evidenceRefs)
      ))) {
      throw new ExecutionLockError(
        `Execution boundary resume evidence conflicts for task ${expected.lock.taskId}`,
        expected.lock.taskId,
        'mutation-conflict',
        canonical.ownerId,
        canonical,
      );
    }
    const previous = normalizeExecutionLockQuarantineHandle({
      ...quarantine,
      lock: audit.payload.previousLock,
    });
    return {
      previous,
      resumed: quarantine,
      audit,
      lineage: lineage.resumes,
    };
  });
}

/**
 * Adopt one exact expired unquarantined generation after positive owner-death
 * proof. The append-only previous-to-successor audit is written before the
 * SQL-triggered fence transfer in the same transaction, and also supplies the
 * exact crash/restart replay identity for callers retaining the old handle.
 */
export function adoptExecutionLockActiveGeneration(
  projectRoot: string,
  exactLock: ExecutionLockInfo,
  request: ExecutionLockActiveAdoptionRequest,
  options: ExecutionLockOptions = {},
): ExecutionLockActiveAdoptionResult {
  const expected = normalizeExecutionLockHandle(exactLock);
  const evidenceRefs = normalizeExecutionLockEvidenceRefs(
    request.evidenceRefs,
    expected.taskId,
  );
  if (evidenceRefs.length === 0) {
    throw new ExecutionLockError(
      `Execution active adoption evidence is required for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const validated = validateExecutionLockAcquireInput(
    expected.taskId,
    expected.actor,
    options,
  );
  let candidateResult: Omit<
    ExecutionLockActiveAdoptionResult,
    'projectionPublication'
  > | undefined;
  let committed: Omit<
    ExecutionLockActiveAdoptionResult,
    'projectionPublication'
  >;
  const reconcileCandidate = (
    db: DatabaseType,
    authorityRoot: string,
  ): Omit<ExecutionLockActiveAdoptionResult, 'projectionPublication'> | null => {
    const current = reconcileExecutionLockProjectionForTask(
      authorityRoot,
      db,
      expected.taskId,
      options,
    );
    const existingAudit = loadExecutionLockActiveAdoptionForPrevious(
      db,
      expected,
    );
    if (!existingAudit) return null;
    if (JSON.stringify(existingAudit.previousLock) !== JSON.stringify(expected)
      || JSON.stringify(existingAudit.evidenceRefs)
        !== JSON.stringify(evidenceRefs)
      || !current.lock
      || current.quarantine
      || JSON.stringify(current.lock)
        !== JSON.stringify(existingAudit.adoptedLock)) {
      throw new ExecutionLockError(
        `Execution active adoption replay conflicts for task ${expected.taskId}`,
        expected.taskId,
        current.quarantine ? 'quarantined' : 'mutation-conflict',
        current.lock?.ownerId,
        current.lock,
      );
    }
    return {
      previous: expected,
      adopted: existingAudit.adoptedLock,
      audit: existingAudit,
    };
  };
  try {
    committed = withExecutionLockMutation(
      projectRoot,
      (db, authorityRoot) => {
        const replay = reconcileCandidate(db, authorityRoot);
        if (replay) {
          candidateResult = replay;
          return replay;
        }
        const current = reconcileExecutionLockProjectionForTask(
          authorityRoot,
          db,
          expected.taskId,
          options,
        );
        const previous = current.lock
          && executionLockForExactGeneration([current.lock], expected);
        if (!previous || current.quarantine) {
          throw new ExecutionLockError(
            `Exact unquarantined execution generation is unavailable for adoption of task ${expected.taskId}`,
            expected.taskId,
            current.quarantine ? 'quarantined' : 'ownership-lost',
            current.lock?.ownerId,
            current.lock,
          );
        }
        const priorLineage = loadExecutionLockActiveAdoptionLineage(
          db,
          previous,
        );
        if (priorLineage.length >= MAX_EXECUTION_LOCK_ACTIVE_ADOPTIONS) {
          throw new ExecutionLockError(
            `Execution active adoption limit is exhausted for task ${expected.taskId}`,
            expected.taskId,
            'mutation-conflict',
          );
        }
        if (priorLineage.some(candidate => (
          JSON.stringify(candidate.evidenceRefs)
            !== JSON.stringify(evidenceRefs)
        ))) {
          throw new ExecutionLockError(
            `Execution active adoption evidence lineage conflicts for task ${expected.taskId}`,
            expected.taskId,
            'mutation-conflict',
            previous.ownerId,
            previous,
          );
        }
        if (!staleExecutionLockCanRetire(
          previous,
          validated.nowMs,
          options,
        )) {
          throw new ExecutionLockError(
            `Execution active owner lease is still held for task ${expected.taskId}`,
            expected.taskId,
            'held',
            previous.ownerId,
            previous,
          );
        }
        const adoptedAt = executionLockTimestamp(Math.max(
          validated.nowMs,
          Date.parse(previous.renewedAt),
        ));
        const adopted: ExecutionLockInfo = {
          schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
          taskId: previous.taskId,
          actor: previous.actor,
          ownerId: randomUUID(),
          pid: validated.ownerPid,
          hostInstanceId: validated.identity.hostInstanceId,
          bootSessionId: validated.identity.bootSessionId,
          processSessionId: validated.identity.processSessionId,
          fencingToken: allocateExecutionLockFencingToken(db),
          acquiredAt: adoptedAt,
          renewedAt: adoptedAt,
          leaseDurationMs: validated.leaseDurationMs,
        };
        assertExecutionLockFencingProgression(
          previous.fencingToken,
          adopted.fencingToken,
          previous.taskId,
        );
        const audit: ExecutionLockActiveAdoptionAudit = {
          schemaVersion: EXECUTION_LOCK_ACTIVE_ADOPTION_SCHEMA_VERSION,
          eventId: randomUUID(),
          previousLock: previous,
          adoptedLock: adopted,
          evidenceRefs,
          adoptedAt,
        };
        appendExecutionLockActiveAdoptionAudit(db, audit);
        transferExecutionLockActiveRow(db, previous, adopted);
        candidateResult = { previous, adopted, audit };
        return candidateResult;
      },
    );
  } catch (error) {
    if (error instanceof ExecutionLockError
      && error.canonicalCommitState
      && candidateResult) {
      committed = withExecutionLockMutation(
        projectRoot,
        (db, authorityRoot) => {
          const reconciled = reconcileCandidate(db, authorityRoot);
          if (!reconciled) {
            throw new ExecutionLockError(
              `Execution active adoption commit requires exact reconciliation for task ${expected.taskId}`,
              expected.taskId,
              error.reason,
              candidateResult!.adopted.ownerId,
              candidateResult!.adopted,
              error.canonicalCommitState,
            );
          }
          return reconciled;
        },
      );
    } else {
      throw error;
    }
  }
  let projectionPublication: 'completed' | 'uncertain' = 'completed';
  try {
    withExecutionLockPinnedAuthorityRoot(projectRoot, authorityRoot => {
      publishExecutionLockProjection(
        authorityRoot,
        committed.adopted,
        true,
        options,
      );
    });
    const inspected = checkExecutionLock(projectRoot, expected.taskId);
    if (inspected.state !== 'held'
      || JSON.stringify(inspected.lock)
        !== JSON.stringify(committed.adopted)) {
      projectionPublication = 'uncertain';
    }
  } catch {
    projectionPublication = 'uncertain';
  }
  return { ...committed, projectionPublication };
}

/**
 * Transfer an abandoned in-flight irreversible boundary to a fresh fenced
 * generation. Only an expired owner whose death is positively established is
 * adoptable; alive, unknown, foreign-host and terminal quarantine states stay
 * fail-closed for typed operator recovery.
 */
export function resumeExecutionLockIrreversibleBoundary(
  projectRoot: string,
  exactQuarantine: ExecutionLockQuarantineInfo,
  request: ExecutionLockBoundaryResumeRequest,
  options: ExecutionLockOptions = {},
): ExecutionLockBoundaryResumeResult {
  const expected = normalizeExecutionLockQuarantineHandle(exactQuarantine);
  if (expected.state !== 'in-flight'
    || expected.reason !== 'irreversible-boundary') {
    throw new ExecutionLockError(
      `Only an in-flight execution boundary can resume for task ${expected.lock.taskId}`,
      expected.lock.taskId,
      'quarantined',
      expected.lock.ownerId,
      expected.lock,
    );
  }
  const evidenceRefs = normalizeExecutionLockEvidenceRefs(
    request.evidenceRefs,
    expected.lock.taskId,
  );
  if (evidenceRefs.length === 0) {
    throw new ExecutionLockError(
      `Execution boundary resume evidence is required for task ${expected.lock.taskId}`,
      expected.lock.taskId,
      'invalid-input',
    );
  }
  const validated = validateExecutionLockAcquireInput(
    expected.lock.taskId,
    expected.lock.actor,
    options,
  );
  let candidateResult: Omit<
    ExecutionLockBoundaryResumeResult,
    'projectionPublication'
  > | undefined;
  let committed: Omit<
    ExecutionLockBoundaryResumeResult,
    'projectionPublication'
  >;
  try {
    committed = withExecutionLockMutation(
      projectRoot,
      (db, authorityRoot) => {
        const current = reconcileExecutionLockProjectionForTask(
          authorityRoot,
          db,
          expected.lock.taskId,
          options,
        );
        const previousLock = current.lock
          && executionLockForExactGeneration([current.lock], expected.lock);
        const previous = previousLock ? current.quarantine : undefined;
        if (!previousLock
          || !previous
          || JSON.stringify(previous) !== JSON.stringify(expected)) {
          throw new ExecutionLockError(
            `Exact in-flight execution boundary is unavailable for resume of task ${expected.lock.taskId}`,
            expected.lock.taskId,
            previous?.state === 'quarantined'
              ? 'quarantined'
              : 'ownership-lost',
            current.lock?.ownerId,
            current.lock,
          );
        }
        if (previous.state !== 'in-flight') {
          throw new ExecutionLockError(
            `Terminal execution quarantine cannot resume for task ${expected.lock.taskId}`,
            expected.lock.taskId,
            'quarantined',
            previousLock.ownerId,
            previousLock,
          );
        }
        if (!staleExecutionLockCanRetire(
          previousLock,
          validated.nowMs,
          options,
        )) {
          throw new ExecutionLockError(
            `Execution boundary owner lease is still active for task ${expected.lock.taskId}`,
            expected.lock.taskId,
            'held',
            previousLock.ownerId,
            previousLock,
          );
        }
        const lineage = executionLockBoundaryAuditLineage(
          loadExecutionLockQuarantineAuditChain(db, previous.quarantineId),
          previous.quarantineId,
        );
        if (!lineage
          || !executionLockIsExactRenewalOf(
            lineage.currentLock,
            previousLock,
          )) {
          throw new ExecutionLockError(
            `Execution boundary resume lineage is invalid for task ${expected.lock.taskId}`,
            expected.lock.taskId,
            'malformed',
          );
        }
        if (lineage.resumes.some(candidate => (
          !('previousLock' in candidate.payload)
          || JSON.stringify(candidate.payload.evidenceRefs)
            !== JSON.stringify(evidenceRefs)
        ))) {
          throw new ExecutionLockError(
            `Execution boundary resume evidence lineage conflicts for task ${expected.lock.taskId}`,
            expected.lock.taskId,
            'mutation-conflict',
            previousLock.ownerId,
            previousLock,
          );
        }
        if (lineage.resumes.length >= MAX_EXECUTION_LOCK_BOUNDARY_RESUMES) {
          throw new ExecutionLockError(
            `Execution boundary resume limit is exhausted for task ${expected.lock.taskId}`,
            expected.lock.taskId,
            'mutation-conflict',
          );
        }
        const resumedAt = executionLockTimestamp(Math.max(
          validated.nowMs,
          Date.parse(previousLock.renewedAt),
          Date.parse(previous.enteredAt),
        ));
        const resumedLock: ExecutionLockInfo = {
          schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
          taskId: previousLock.taskId,
          actor: previousLock.actor,
          ownerId: randomUUID(),
          pid: validated.ownerPid,
          hostInstanceId: validated.identity.hostInstanceId,
          bootSessionId: validated.identity.bootSessionId,
          processSessionId: validated.identity.processSessionId,
          fencingToken: allocateExecutionLockFencingToken(db),
          acquiredAt: resumedAt,
          renewedAt: resumedAt,
          leaseDurationMs: validated.leaseDurationMs,
        };
        assertExecutionLockFencingProgression(
          previousLock.fencingToken,
          resumedLock.fencingToken,
          previousLock.taskId,
        );
        const resumed: ExecutionLockQuarantineInfo = {
          ...previous,
          lock: resumedLock,
        };
        const attestation: ExecutionLockBoundaryResumeAttestation = {
          schemaVersion: EXECUTION_LOCK_BOUNDARY_RESUME_SCHEMA_VERSION,
          quarantineId: previous.quarantineId,
          previousLock,
          resumedLock,
          evidenceRefs,
          resumedAt,
        };
        const audit = createExecutionLockQuarantineAudit(
          'resumed',
          resumed,
          attestation,
          resumedAt,
        );
        // The trigger requires this exact successor audit before the
        // quarantine generation can advance. All three writes share one
        // BEGIN IMMEDIATE transaction, so partial transfer cannot commit.
        appendExecutionLockQuarantineAudit(db, audit);
        transferExecutionLockActiveRow(db, previousLock, resumedLock);
        resumeExecutionLockQuarantineRow(db, previous, resumed);
        candidateResult = { previous, resumed, audit };
        return candidateResult;
      },
    );
  } catch (error) {
    if (error instanceof ExecutionLockError
      && error.canonicalCommitState
      && candidateResult) {
      const reconciled = readCommittedExecutionLockQuarantine(
        projectRoot,
        candidateResult.resumed,
      );
      if (JSON.stringify(reconciled)
        !== JSON.stringify(candidateResult.resumed)) {
        throw new ExecutionLockError(
          `Execution boundary resume commit requires exact reconciliation for task ${expected.lock.taskId}`,
          expected.lock.taskId,
          error.reason,
          candidateResult.resumed.lock.ownerId,
          candidateResult.resumed.lock,
          error.canonicalCommitState,
        );
      }
      committed = candidateResult;
    } else {
      throw error;
    }
  }
  let projectionPublication: 'completed' | 'uncertain' = 'completed';
  try {
    withExecutionLockPinnedAuthorityRoot(projectRoot, authorityRoot => {
      publishExecutionLockProjection(
        authorityRoot,
        committed.resumed.lock,
        true,
        options,
      );
    });
    readCommittedExecutionLockQuarantine(projectRoot, committed.resumed);
  } catch {
    projectionPublication = 'uncertain';
  }
  return { ...committed, projectionPublication };
}

export function quarantineExecutionLock(
  projectRoot: string,
  exactLock: ExecutionLockInfo,
  request: ExecutionLockQuarantineRequest,
  options: ExecutionLockOptions = {},
): ExecutionLockQuarantineInfo {
  const expected = normalizeExecutionLockHandle(exactLock);
  if (request.reason === 'irreversible-boundary'
    || request.reason === 'legacy-v2-active'
    || !isExecutionLockQuarantineReason(request.reason)) {
    throw new ExecutionLockError(
      `Execution quarantine reason is invalid for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const requestedEvidence =
    normalizeExecutionLockEvidenceRefs(request.evidenceRefs, expected.taskId);
  const nowMs = executionLockNow(options);
  const quarantine = withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    const current = reconcileExecutionLockProjectionForTask(
      authorityRoot,
      db,
      expected.taskId,
      options,
    );
    const canonical = current.lock
      && executionLockForExactGeneration([current.lock], expected);
    if (!canonical) {
      throw new ExecutionLockError(
        `Execution quarantine ownership lost for task ${expected.taskId}`,
        expected.taskId,
        'ownership-lost',
      );
    }
    const existing = current.quarantine;
    assertExactLiveExecutionLockOwner(canonical, options);
    if (existing?.state === 'quarantined') return existing;

    const timestamp = executionLockTimestamp(Math.max(
      nowMs,
      Date.parse(existing?.enteredAt ?? canonical.renewedAt),
    ));
    const evidenceRefs = normalizeExecutionLockEvidenceRefs(
      [...new Set([
        ...(existing?.evidenceRefs ?? []),
        ...requestedEvidence,
      ])].sort(),
      canonical.taskId,
    );
    const candidate: ExecutionLockQuarantineInfo = {
      schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
      quarantineId: existing?.quarantineId ?? randomUUID(),
      lock: canonical,
      state: 'quarantined',
      reason: request.reason,
      evidenceRefs,
      enteredAt: existing?.enteredAt ?? timestamp,
      quarantinedAt: timestamp,
    };
    const audit = createExecutionLockQuarantineAudit(
      'quarantined',
      candidate,
      candidate,
      timestamp,
    );
    if (existing) {
      appendExecutionLockQuarantineAudit(db, audit);
      transitionExecutionLockQuarantineRow(db, existing, candidate);
    } else {
      insertExecutionLockQuarantineRow(db, candidate);
      appendExecutionLockQuarantineAudit(db, audit);
    }
    return candidate;
  });
  return readCommittedExecutionLockQuarantine(projectRoot, quarantine);
}

/**
 * Atomically records an irreversible boundary and its no-change completion.
 * This avoids the crash window of two public calls for transactions that have
 * conclusively proved there is no durable effect to land. The append-only
 * boundary/completion pair and both canonical-row removals commit together.
 */
export function completeExecutionLockNoChangeBoundary(
  projectRoot: string,
  exactLock: ExecutionLockInfo,
  request: ExecutionLockNoChangeCompletionRequest,
  options: ExecutionLockOptions = {},
): ExecutionLockBoundaryCompletionResult {
  const expected = normalizeExecutionLockHandle(exactLock);
  if (!EXECUTION_LOCK_UUID_PATTERN.test(request.quarantineId)) {
    throw new ExecutionLockError(
      `Execution no-change boundary id is invalid for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const boundaryEvidenceRefs = normalizeExecutionLockEvidenceRefs(
    request.boundaryEvidenceRefs,
    expected.taskId,
  );
  const completionEvidenceRefs = normalizeExecutionLockEvidenceRefs(
    request.completionEvidenceRefs,
    expected.taskId,
  );
  if (boundaryEvidenceRefs.length === 0
    || completionEvidenceRefs.length === 0) {
    throw new ExecutionLockError(
      `Execution no-change boundary requires durable evidence for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const nowMs = executionLockNow(options);
  let candidateResult: Omit<
    ExecutionLockBoundaryCompletionResult,
    'projectionCleanup'
  > | undefined;
  let wasReplay = false;
  let committed: Omit<
    ExecutionLockBoundaryCompletionResult,
    'projectionCleanup'
  >;

  const assertExactReplay = (
    result: Omit<ExecutionLockBoundaryCompletionResult, 'projectionCleanup'>,
  ): void => {
    const payload = result.audit.payload;
    if (JSON.stringify(result.completed.lock) !== JSON.stringify(expected)
      || JSON.stringify(result.completed.evidenceRefs)
        !== JSON.stringify(boundaryEvidenceRefs)
      || !('completedAt' in payload)
      || JSON.stringify(payload.evidenceRefs)
        !== JSON.stringify(completionEvidenceRefs)) {
      throw new ExecutionLockError(
        `Execution no-change boundary replay conflicts for task ${expected.taskId}`,
        expected.taskId,
        'mutation-conflict',
      );
    }
  };

  try {
    committed = withExecutionLockMutation(
      projectRoot,
      (db, authorityRoot) => {
        const existing = completedExecutionLockBoundaryResultFromDb(
          db,
          request.quarantineId,
        );
        if (existing) {
          assertExactReplay(existing);
          wasReplay = true;
          candidateResult = existing;
          return existing;
        }
        const current = reconcileExecutionLockProjectionForTask(
          authorityRoot,
          db,
          expected.taskId,
          options,
        );
        const canonical = current.lock
          && executionLockForExactGeneration([current.lock], expected);
        if (!canonical || current.quarantine) {
          throw new ExecutionLockError(
            `Exact unbounded execution generation is unavailable for no-change completion of task ${expected.taskId}`,
            expected.taskId,
            current.quarantine ? 'quarantined' : 'ownership-lost',
            current.lock?.ownerId,
            current.lock,
          );
        }
        assertExactLiveExecutionLockOwner(canonical, options);
        const terminalAt = executionLockTimestamp(Math.max(
          nowMs,
          Date.parse(canonical.renewedAt),
        ));
        const boundary: ExecutionLockQuarantineInfo = {
          schemaVersion: EXECUTION_LOCK_QUARANTINE_SCHEMA_VERSION,
          quarantineId: request.quarantineId,
          lock: canonical,
          state: 'in-flight',
          reason: 'irreversible-boundary',
          evidenceRefs: boundaryEvidenceRefs,
          enteredAt: terminalAt,
          quarantinedAt: null,
        };
        const boundaryAudit = createExecutionLockQuarantineAudit(
          'boundary-entered',
          boundary,
          boundary,
          terminalAt,
        );
        const completion: ExecutionLockBoundaryCompletion = {
          schemaVersion: EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION,
          quarantineId: boundary.quarantineId,
          fencingToken: canonical.fencingToken,
          evidenceRefs: completionEvidenceRefs,
          completedAt: terminalAt,
        };
        const completionAudit = createExecutionLockQuarantineAudit(
          'completed',
          boundary,
          completion,
          terminalAt,
        );
        insertExecutionLockQuarantineRow(db, boundary);
        appendExecutionLockQuarantineAudit(db, boundaryAudit);
        appendExecutionLockQuarantineAudit(db, completionAudit);
        deleteExecutionLockQuarantineRow(db, boundary);
        deleteExecutionLockActiveRow(db, canonical);
        candidateResult = { completed: boundary, audit: completionAudit };
        return candidateResult;
      },
    );
  } catch (error) {
    if (error instanceof ExecutionLockError
      && error.canonicalCommitState
      && candidateResult) {
      const reconciled = withExecutionLockMutation(
        projectRoot,
        db => completedExecutionLockBoundaryResultFromDb(
          db,
          request.quarantineId,
        ),
      );
      if (!reconciled) {
        throw new ExecutionLockError(
          `Execution no-change completion commit requires exact reconciliation for task ${expected.taskId}`,
          expected.taskId,
          error.reason,
          expected.ownerId,
          expected,
          error.canonicalCommitState,
        );
      }
      assertExactReplay(reconciled);
      committed = reconciled;
    } else {
      throw error;
    }
  }
  if (!wasReplay) {
    try {
      options.terminalCommitObserver?.({
        kind: 'completed',
        lock: committed.completed.lock,
        quarantine: committed.completed,
        audit: committed.audit,
      });
    } catch {
      // Observability cannot change the committed terminal decision.
    }
  }
  let projectionCleanup: 'completed' | 'uncertain' = 'completed';
  try {
    removeReleasedExecutionLockProjection(projectRoot, committed.completed.lock);
  } catch {
    projectionCleanup = 'uncertain';
  }
  return { ...committed, projectionCleanup };
}

export function completeExecutionLockIrreversibleBoundary(
  projectRoot: string,
  exactLock: ExecutionLockInfo,
  request: ExecutionLockBoundaryCompletionRequest,
  options: ExecutionLockOptions = {},
): ExecutionLockBoundaryCompletionResult {
  const expected = normalizeExecutionLockHandle(exactLock);
  if (!EXECUTION_LOCK_UUID_PATTERN.test(request.quarantineId)) {
    throw new ExecutionLockError(
      `Execution boundary completion id is invalid for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const evidenceRefs =
    normalizeExecutionLockEvidenceRefs(request.evidenceRefs, expected.taskId);
  if (evidenceRefs.length === 0) {
    throw new ExecutionLockError(
      `Execution boundary completion evidence is required for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const nowMs = executionLockNow(options);
  const result = withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    const current = reconcileExecutionLockProjectionForTask(
      authorityRoot,
      db,
      expected.taskId,
      options,
    );
    const canonical = current.lock
      && executionLockForExactGeneration([current.lock], expected);
    const quarantine = canonical ? current.quarantine : undefined;
    if (!canonical
      || !quarantine
      || quarantine.quarantineId !== request.quarantineId
      || quarantine.state !== 'in-flight') {
      throw new ExecutionLockError(
        `Exact in-flight execution boundary is unavailable for task ${expected.taskId}`,
        expected.taskId,
        quarantine?.state === 'quarantined'
          ? 'quarantined'
          : 'ownership-lost',
        canonical?.ownerId,
      );
    }
    assertExactLiveExecutionLockOwner(canonical, options);
    const completedAt = executionLockTimestamp(
      Math.max(nowMs, Date.parse(quarantine.enteredAt)),
    );
    const completion: ExecutionLockBoundaryCompletion = {
      schemaVersion: EXECUTION_LOCK_BOUNDARY_COMPLETION_SCHEMA_VERSION,
      quarantineId: quarantine.quarantineId,
      fencingToken: canonical.fencingToken,
      evidenceRefs,
      completedAt,
    };
    const audit = createExecutionLockQuarantineAudit(
      'completed',
      quarantine,
      completion,
      completedAt,
    );
    // Append first. Any following exact-CAS failure rolls the audit back.
    appendExecutionLockQuarantineAudit(db, audit);
    deleteExecutionLockQuarantineRow(db, quarantine);
    deleteExecutionLockActiveRow(db, canonical);
    return { completed: quarantine, audit };
  });
  try {
    options.terminalCommitObserver?.({
      kind: 'completed',
      lock: result.completed.lock,
      quarantine: result.completed,
      audit: result.audit,
    });
  } catch {
    // Observability cannot change the committed terminal decision.
  }
  let projectionCleanup: 'completed' | 'uncertain' = 'completed';
  try {
    removeReleasedExecutionLockProjection(projectRoot, result.completed.lock);
  } catch {
    projectionCleanup = 'uncertain';
  }
  return { ...result, projectionCleanup };
}

export function recoverQuarantinedExecutionLock(
  projectRoot: string,
  exactLock: ExecutionLockInfo,
  attestation: ExecutionLockRecoveryAttestation,
  options: ExecutionLockRecoveryOptions,
): ExecutionLockRecoveryResult {
  const expected = normalizeExecutionLockHandle(exactLock);
  if (typeof options?.recoveryAttestationVerifier !== 'function') {
    throw new ExecutionLockError(
      `Execution quarantine recovery verifier is required for task ${expected.taskId}`,
      expected.taskId,
      'invalid-input',
    );
  }
  const nowMs = executionLockNow(options);
  const result = withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    const current = reconcileExecutionLockProjectionForTask(
      authorityRoot,
      db,
      expected.taskId,
      options,
    );
    const canonical = current.lock
      && executionLockForExactGeneration([current.lock], expected);
    const quarantine = canonical ? current.quarantine : undefined;
    if (!canonical || !quarantine) {
      throw new ExecutionLockError(
        `Exact execution quarantine is unavailable for task ${expected.taskId}`,
        expected.taskId,
        'ownership-lost',
        canonical?.ownerId,
      );
    }
    const normalizedAttestation =
      normalizeExecutionLockRecoveryAttestation(
        attestation,
        quarantine,
        nowMs,
      );
    const quarantineSnapshot = JSON.stringify(quarantine);
    const attestationSnapshot = JSON.stringify(normalizedAttestation);
    const quarantineDigest = createHash('sha256')
      .update(quarantineSnapshot)
      .digest('hex');
    let verified = false;
    try {
      verified = options.recoveryAttestationVerifier({
        attestation: normalizedAttestation,
        quarantine,
        quarantineDigest,
      }) === true;
    } catch {
      verified = false;
    }
    if (!verified
      || JSON.stringify(quarantine) !== quarantineSnapshot
      || JSON.stringify(normalizedAttestation) !== attestationSnapshot) {
      throw new ExecutionLockError(
        `Execution quarantine recovery authority was not verified for task ${expected.taskId}`,
        expected.taskId,
        'invalid-input',
      );
    }
    const audit = createExecutionLockQuarantineAudit(
      'recovered',
      quarantine,
      normalizedAttestation,
      normalizedAttestation.attestedAt,
    );
    // Append first. Exact-CAS deletion and the audit commit atomically.
    appendExecutionLockQuarantineAudit(db, audit);
    deleteExecutionLockQuarantineRow(db, quarantine);
    deleteExecutionLockActiveRow(db, canonical);
    return { recovered: quarantine, audit };
  });
  try {
    options.terminalCommitObserver?.({
      kind: 'recovered',
      lock: result.recovered.lock,
      quarantine: result.recovered,
      audit: result.audit,
    });
  } catch {
    // Observability cannot change the committed terminal decision.
  }
  let projectionCleanup: 'completed' | 'uncertain' = 'completed';
  try {
    removeReleasedExecutionLockProjection(projectRoot, result.recovered.lock);
  } catch {
    projectionCleanup = 'uncertain';
  }
  return { ...result, projectionCleanup };
}

export function checkProjectMaintenanceLock(
  projectRoot: string,
): ExecutionLockInspection {
  return checkExecutionLock(projectRoot, PROJECT_MAINTENANCE_LOCK_TASK_ID);
}

function removeCompensatedExecutionLockProjection(
  projectRoot: string,
  compensated: ExecutionLockInfo,
): boolean {
  return withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    // Canonical compensation and projection cleanup are separate commits.
    // Re-enter BEGIN IMMEDIATE before compare/unlink so a same-task successor
    // either already exists (and is preserved) or cannot publish until this
    // exact-generation cleanup commits.
    const successor =
      loadExecutionLockActiveRow(db, compensated.taskId);
    if (successor) return true;
    const projection =
      readExecutionLockProjection(authorityRoot, compensated.taskId);
    if (!projection) return true;
    if (projection.lock.ownerId === compensated.ownerId
      && executionLockFencingTokenEquals(
        projection.lock.fencingToken,
        compensated.fencingToken,
    )) {
      unlinkSync(projection.path);
      fsyncExecutionLockDirectory(dirname(projection.path));
      return true;
    }
    return false;
  });
}

export function acquireExecutionLock(
  projectRoot: string,
  taskId: string,
  actor: ExecutionLockActor,
  options: ExecutionLockOptions = {},
): ExecutionLockInfo {
  const validated =
    validateExecutionLockAcquireInput(taskId, actor, options);
  let lock: ExecutionLockInfo;
  try {
    lock = withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    let existing: ExecutionLockInfo | undefined;
    if (actor === 'maintenance') {
      const active =
        reconcileExecutionLockProjections(authorityRoot, db, options);
      const quarantines =
        loadExecutionLockQuarantineRows(db, active);
      const quarantineByTask = new Map(
        quarantines.map(value => [value.lock.taskId, value]),
      );
      for (const candidate of active) {
        if (candidate.taskId === PROJECT_MAINTENANCE_LOCK_TASK_ID) continue;
        if (retireCanonicalExecutionLockIfDead(
          authorityRoot,
          db,
          candidate,
          validated.nowMs,
          options,
          quarantineByTask.get(candidate.taskId) ?? null,
        )) continue;
        throw new ExecutionLockError(
          `Project has active execution authority: ${candidate.taskId}`,
          candidate.taskId,
          heldExecutionLockReason(candidate, options, 'project-active'),
          candidate.ownerId,
        );
      }
      existing = active.find(candidate => candidate.taskId === taskId);
    } else {
      const maintenanceState = reconcileExecutionLockProjectionForTask(
        authorityRoot,
        db,
        PROJECT_MAINTENANCE_LOCK_TASK_ID,
        options,
      );
      const maintenance = maintenanceState.lock;
      if (maintenance && !retireCanonicalExecutionLockIfDead(
        authorityRoot,
        db,
        maintenance,
        validated.nowMs,
        options,
        maintenanceState.quarantine ?? null,
      )) {
        throw new ExecutionLockError(
          'Project maintenance authority is held',
          taskId,
          heldExecutionLockReason(maintenance, options, 'maintenance-held'),
          maintenance.ownerId,
        );
      }
      existing = reconcileExecutionLockProjectionForTask(
        authorityRoot,
        db,
        taskId,
        options,
      ).lock;
    }

    if (existing) {
      if (!retireCanonicalExecutionLockIfDead(
        authorityRoot,
        db,
        existing,
        validated.nowMs,
        options,
      )) {
        throw new ExecutionLockError(
          `Execution authority is held for task ${taskId}`,
          taskId,
          heldExecutionLockReason(existing, options, 'held'),
          existing.ownerId,
        );
      }
    }

    const timestamp = executionLockTimestamp(validated.nowMs);
    const candidate: ExecutionLockInfo = {
      schemaVersion: EXECUTION_LOCK_SCHEMA_VERSION,
      taskId,
      actor,
      ownerId: randomUUID(),
      pid: validated.ownerPid,
      ...validated.identity,
      fencingToken: allocateExecutionLockFencingToken(db),
      acquiredAt: timestamp,
      renewedAt: timestamp,
      leaseDurationMs: validated.leaseDurationMs,
    };
    insertExecutionLockActiveRow(db, candidate);
      return candidate;
    });
  } catch (error) {
    if (error instanceof ExecutionLockError
      && (error.canonicalCommitState === 'committed'
        || error.canonicalCommitState === 'uncertain')) {
      const inspected = checkExecutionLock(projectRoot, taskId);
      const recoveryLock =
        inspected.state === 'held' || inspected.state === 'quarantined'
          ? inspected.lock
          : undefined;
      throw new ExecutionLockError(
        'Execution authority acquisition commit requires exact reconciliation',
        taskId,
        error.reason,
        recoveryLock?.ownerId,
        recoveryLock,
        error.canonicalCommitState,
      );
    }
    throw error;
  }
  try {
    withExecutionLockPinnedAuthorityRoot(projectRoot, authorityRoot => {
      const projection = readExecutionLockProjection(authorityRoot, taskId);
      publishExecutionLockProjection(
        authorityRoot,
        lock,
        projection !== null,
        options,
      );
    });
  } catch {
    let canonicalCompensated = false;
    let projectionCompensated = false;
    try {
      canonicalCompensated = withExecutionLockMutation(projectRoot, db => {
        const canonical = loadExecutionLockActiveRow(db, lock.taskId);
        if (!canonical
          || canonical.ownerId !== lock.ownerId
          || !executionLockFencingTokenEquals(
            canonical.fencingToken,
            lock.fencingToken,
          )) return false;
        if (loadExecutionLockQuarantineForLock(db, canonical)) {
          return false;
        }
        deleteExecutionLockActiveRow(db, canonical);
        return true;
      });
      if (canonicalCompensated) {
        try {
          options.compensationCommitObserver?.(lock);
        } catch {
          // Observability cannot change the committed canonical compensation.
        }
        projectionCompensated =
          removeCompensatedExecutionLockProjection(projectRoot, lock);
      }
    } catch {
      // Caller receives the complete recovery handle below.
    }
    const compensated =
      canonicalCompensated && projectionCompensated;
    throw new ExecutionLockError(
      compensated
        ? `Execution authority projection publish was compensated for task ${taskId}`
        : `Execution authority projection publish is quarantined for task ${taskId}`,
      taskId,
      'mutation-conflict',
      lock.ownerId,
      compensated ? undefined : lock,
    );
  }
  return lock;
}

export function acquireProjectMaintenanceLock(
  projectRoot: string,
  options: ExecutionLockOptions = {},
): ExecutionLockInfo {
  return acquireExecutionLock(
    projectRoot,
    PROJECT_MAINTENANCE_LOCK_TASK_ID,
    'maintenance',
    options,
  );
}

export function renewExecutionLock(
  projectRoot: string,
  taskId: string,
  ownerId: string,
  options: ExecutionLockOptions = {},
): ExecutionLockInfo {
  const nowMs = executionLockNow(options);
  let renewedCandidate: ExecutionLockInfo | undefined;
  let renewed: ExecutionLockInfo;
  try {
    renewed = withExecutionLockMutation(
      projectRoot,
      (db, authorityRoot) => {
        const current = reconcileExecutionLockProjectionForTask(
          authorityRoot,
          db,
          taskId,
          options,
        );
        const existing = current.lock;
        if (!existing || existing.ownerId !== ownerId) {
          throw new ExecutionLockError(
            `Execution authority ownership lost for task ${taskId}`,
            taskId,
            'ownership-lost',
            existing?.ownerId,
          );
        }
        assertExactLiveExecutionLockOwner(existing, options);
        const quarantine = current.quarantine;
        if (quarantine?.state === 'quarantined') {
          throw new ExecutionLockError(
            `Quarantined execution authority cannot renew task ${taskId}`,
            taskId,
            'quarantined',
            existing.ownerId,
            existing,
          );
        }
        const renewedAt = executionLockTimestamp(
          Math.max(nowMs, Date.parse(existing.renewedAt)),
        );
        if (!Number.isSafeInteger(
          Date.parse(renewedAt) + existing.leaseDurationMs,
        )
          || !Number.isFinite(
            new Date(
              Date.parse(renewedAt) + existing.leaseDurationMs,
            ).getTime(),
          )) {
          throw new ExecutionLockError(
            `Execution authority renewal is outside clock range for task ${taskId}`,
            taskId,
            'invalid-input',
          );
        }
        const candidate: ExecutionLockInfo = { ...existing, renewedAt };
        renewedCandidate = candidate;
        updateExecutionLockActiveRow(db, candidate);
        if (quarantine) {
          transitionExecutionLockQuarantineRow(
            db,
            quarantine,
            { ...quarantine, lock: candidate },
          );
        }
        return candidate;
      },
    );
  } catch (error) {
    if (error instanceof ExecutionLockError
      && error.canonicalCommitState
      && renewedCandidate) {
      const inspected = checkExecutionLock(projectRoot, taskId);
      if ((inspected.state === 'held'
        || inspected.state === 'quarantined')
        && JSON.stringify(inspected.lock)
          === JSON.stringify(renewedCandidate)) {
        renewed = inspected.lock;
      } else {
        throw new ExecutionLockError(
          'Execution authority renewal commit requires exact reconciliation',
          taskId,
          error.reason,
          renewedCandidate.ownerId,
          renewedCandidate,
          error.canonicalCommitState,
        );
      }
    } else {
      throw error;
    }
  }
  try {
    withExecutionLockPinnedAuthorityRoot(projectRoot, authorityRoot => {
      publishExecutionLockProjection(authorityRoot, renewed, true, options);
    });
  } catch (error) {
    const inspected = checkExecutionLock(projectRoot, taskId);
    const recoveryLock = (inspected.state === 'held'
      || inspected.state === 'quarantined')
      ? inspected.lock
      : undefined;
    const committed = recoveryLock !== undefined
      && JSON.stringify(recoveryLock) === JSON.stringify(renewed);
    if (!committed) {
      throw new ExecutionLockError(
        'Execution authority renewal committed but projection reconciliation is uncertain',
        taskId,
        error instanceof ExecutionLockError
          ? error.reason
          : 'mutation-conflict',
        renewed.ownerId,
        renewed,
        'committed',
      );
    }
    throw new ExecutionLockError(
      'Execution authority renewal committed but projection publication failed',
      taskId,
      error instanceof ExecutionLockError
        ? error.reason
        : 'mutation-conflict',
      renewed.ownerId,
      recoveryLock,
      'committed',
    );
  }
  return renewed;
}

function removeReleasedExecutionLockProjection(
  projectRoot: string,
  released: ExecutionLockInfo,
): void {
  withExecutionLockMutation(projectRoot, (db, authorityRoot) => {
    // A second canonical transaction closes the read/compare/unlink TOCTOU:
    // either a successor is already authoritative, or it cannot publish until
    // this exact-generation cleanup commits.
    const successor = loadExecutionLockActiveRow(db, released.taskId);
    if (successor) return;
    const projection =
      readExecutionLockProjection(authorityRoot, released.taskId);
    if (projection?.lock.ownerId === released.ownerId
      && executionLockFencingTokenEquals(
        projection.lock.fencingToken,
        released.fencingToken,
      )) {
      unlinkSync(projection.path);
      fsyncExecutionLockDirectory(dirname(projection.path));
    }
  });
}

export function releaseExecutionLock(
  projectRoot: string,
  taskId: string,
  ownerId: string,
  options: ExecutionLockOptions = {},
): boolean {
  let releaseCandidate: ExecutionLockInfo | undefined;
  let released: ExecutionLockInfo | null;
  try {
    released = withExecutionLockMutation(
      projectRoot,
      (db, authorityRoot) => {
        const current = reconcileExecutionLockProjectionForTask(
          authorityRoot,
          db,
          taskId,
          options,
        );
        const existing = current.lock;
        if (!existing) return null;
        if (existing.ownerId !== ownerId) {
          throw new ExecutionLockError(
            `Execution authority ownership lost for task ${taskId}`,
            taskId,
            'ownership-lost',
            existing.ownerId,
          );
        }
        const quarantine = current.quarantine;
        if (quarantine) {
          throw new ExecutionLockError(
            `Execution authority has a durable ${quarantine.state} boundary and requires exact completion or recovery for task ${taskId}`,
            taskId,
            'quarantined',
            existing.ownerId,
            existing,
          );
        }
        assertExactLiveExecutionLockOwner(existing, options);
        releaseCandidate = existing;
        deleteExecutionLockActiveRow(db, existing);
        return existing;
      },
    );
  } catch (error) {
    if (error instanceof ExecutionLockError
      && error.canonicalCommitState
      && releaseCandidate) {
      const inspected = checkExecutionLock(projectRoot, taskId);
      if (inspected.state === 'absent') return true;
      throw new ExecutionLockError(
        'Execution authority release commit requires exact reconciliation',
        taskId,
        error.reason,
        releaseCandidate.ownerId,
        releaseCandidate,
        error.canonicalCommitState,
      );
    }
    throw error;
  }
  if (!released) return false;
  try {
    options.releaseCommitObserver?.(released);
  } catch {
    // Observability cannot change the committed canonical release.
  }
  try {
    removeReleasedExecutionLockProjection(projectRoot, released);
  } catch (error) {
    const inspected = checkExecutionLock(projectRoot, taskId);
    if (inspected.state !== 'absent') {
      throw new ExecutionLockError(
        'Execution authority release committed but projection reconciliation is uncertain',
        taskId,
        error instanceof ExecutionLockError
          ? error.reason
          : 'mutation-conflict',
        released.ownerId,
        released,
        'committed',
      );
    }
  }
  return true;
}

export function assertExecutionLockAuthority(
  projectRoot: string,
  lock: Pick<ExecutionLockInfo, 'taskId' | 'ownerId' | 'fencingToken'>,
  options: ExecutionLockOptions = {},
): void {
  const inspected = checkExecutionLock(projectRoot, lock.taskId);
  const exact = (inspected.state === 'held'
    || inspected.state === 'quarantined')
    && inspected.lock.ownerId === lock.ownerId
    && executionLockFencingTokenEquals(
      inspected.lock.fencingToken,
      lock.fencingToken,
    );
  if (exact
    && inspected.state === 'quarantined'
    && inspected.quarantine.state === 'in-flight') {
    assertExactLiveExecutionLockOwner(inspected.lock, options);
    return;
  }
  if (!exact || inspected.state !== 'held') {
    throw new ExecutionLockError(
      `Execution authority fencing generation is no longer current for task ${lock.taskId}`,
      lock.taskId,
      'authority-lost',
      inspected.state === 'held' || inspected.state === 'quarantined'
        ? inspected.lock.ownerId
        : undefined,
    );
  }
}

function executionLockFaultReason(error: unknown): ExecutionLockFailureReason {
  return error instanceof ExecutionLockError
    ? error.reason
    : 'mutation-conflict';
}

/**
 * Outcome-preserving execution wrapper. Once `operation` completes, heartbeat
 * or release cleanup cannot turn its result into an ordinary retryable error.
 * A lost heartbeat aborts the cooperative signal and preserves the projection
 * as quarantine; `fencingToken` remains available to downstream consumers.
 */
export async function withExecutionLockOutcome<T>(
  projectRoot: string,
  taskId: string,
  actor: ExecutionLockActor,
  operation: (context: ExecutionLockOperationContext) => Promise<T> | T,
  options: ExecutionLockOptions = {},
): Promise<ExecutionLockOperationOutcome<T>> {
  const leaseDurationMs =
    options.leaseDurationMs ?? DEFAULT_EXECUTION_LOCK_LEASE_MS;
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? DEFAULT_EXECUTION_LOCK_HEARTBEAT_MS;
  if (!Number.isSafeInteger(heartbeatIntervalMs)
    || heartbeatIntervalMs <= 0
    || heartbeatIntervalMs >= leaseDurationMs) {
    throw new ExecutionLockError(
      `Execution heartbeat interval is invalid for task ${taskId}`,
      taskId,
      'invalid-input',
    );
  }

  const lock = acquireExecutionLock(projectRoot, taskId, actor, options);
  let liveLock = lock;
  const abortController = new AbortController();
  let heartbeatFailure: unknown;
  let heartbeatFailed = false;
  const heartbeat = setInterval(() => {
    if (heartbeatFailed) return;
    try {
      liveLock =
        renewExecutionLock(projectRoot, taskId, liveLock.ownerId, options);
    } catch (error) {
      heartbeatFailed = true;
      heartbeatFailure = error;
      abortController.abort(error);
      clearInterval(heartbeat);
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  let operationFailed = false;
  let operationFailure: unknown;
  let value: T | undefined;
  try {
    value = await operation({
      get lock() { return liveLock; },
      get fencingToken() { return liveLock.fencingToken; },
      signal: abortController.signal,
      assertAuthority: () =>
        assertExecutionLockAuthority(projectRoot, liveLock, options),
    });
  } catch (error) {
    operationFailed = true;
    operationFailure = error;
  } finally {
    clearInterval(heartbeat);
  }

  if (operationFailed) {
    if (!heartbeatFailed) {
      const inspected = checkExecutionLock(projectRoot, taskId);
      if (inspected.state === 'quarantined'
        && inspected.quarantine.state === 'in-flight'
        && executionLockGenerationEquals(inspected.lock, liveLock)) {
        try {
          quarantineExecutionLock(
            projectRoot,
            liveLock,
            {
              reason: 'authority-uncertain',
              evidenceRefs: ['operation:failed'],
            },
            options,
          );
        } catch {
          // The pre-boundary in-flight row remains durable HOLD authority.
        }
      } else {
        try {
          releaseExecutionLock(projectRoot, taskId, liveLock.ownerId, options);
        } catch {
          // The operation failure remains authoritative; authority stays HOLD.
        }
      }
    }
    throw operationFailure;
  }

  if (heartbeatFailed) {
    const fault = {
      phase: 'heartbeat' as const,
      reason: executionLockFaultReason(heartbeatFailure),
    };
    const evidenceRefs = [
      `fault:heartbeat:${fault.reason}`,
      'recovery:exact-lock-handle',
    ].sort();
    try {
      const quarantine = quarantineExecutionLock(
        projectRoot,
        liveLock,
        { reason: 'heartbeat-fault', evidenceRefs },
        options,
      );
      return {
        status: 'completed',
        authority: 'quarantined',
        value: value as T,
        fencingToken: liveLock.fencingToken,
        lock: liveLock,
        quarantine,
        fault,
      };
    } catch {
      return {
        status: 'completed',
        authority: 'uncertain',
        value: value as T,
        fencingToken: liveLock.fencingToken,
        lock: liveLock,
        evidenceRefs,
        fault,
      };
    }
  }

  try {
    releaseExecutionLock(projectRoot, taskId, liveLock.ownerId, options);
    return {
      status: 'completed',
      authority: 'released',
      value: value as T,
      fencingToken: liveLock.fencingToken,
    };
  } catch (error) {
    const inspected = checkExecutionLock(projectRoot, taskId);
    if (inspected.state === 'absent') {
      return {
        status: 'completed',
        authority: 'released',
        value: value as T,
        fencingToken: liveLock.fencingToken,
      };
    }
    const fault = {
      phase: 'release' as const,
      reason: executionLockFaultReason(error),
    };
    const evidenceRefs = [
      `fault:release:${fault.reason}`,
      'recovery:exact-lock-handle',
    ].sort();
    try {
      const quarantine = quarantineExecutionLock(
        projectRoot,
        liveLock,
        { reason: 'release-fault', evidenceRefs },
        options,
      );
      return {
        status: 'completed',
        authority: 'quarantined',
        value: value as T,
        fencingToken: liveLock.fencingToken,
        lock: liveLock,
        quarantine,
        fault,
      };
    } catch {
      return {
        status: 'completed',
        authority: 'uncertain',
        value: value as T,
        fencingToken: liveLock.fencingToken,
        lock: liveLock,
        evidenceRefs,
        fault,
      };
    }
  }
}

/**
 * Compatibility surface for existing dispatch/settlement callers.
 * Use `withExecutionLockOutcome` when the caller needs typed quarantine data.
 */
export async function withExecutionLock<T>(
  projectRoot: string,
  taskId: string,
  actor: ExecutionLockActor,
  operation: (lock: ExecutionLockInfo) => Promise<T> | T,
  options: ExecutionLockOptions = {},
): Promise<T> {
  const outcome = await withExecutionLockOutcome(
    projectRoot,
    taskId,
    actor,
    context => operation(context.lock),
    options,
  );
  try {
    options.onOutcome?.(outcome as ExecutionLockOperationOutcome<unknown>);
  } catch {
    // Observability callbacks cannot invalidate a completed operation.
  }
  return outcome.value;
}
