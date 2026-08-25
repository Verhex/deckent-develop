/**
 * Multi-IDE conflict prevention module.
 * Prevents concurrent sprint execution from different IDEs/processes
 * by using file-based PID locks in .deckent/sprint.lock.
 * @module
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { detectEnvironment } from './environment.js';
import { isPidAlive } from './pid-liveness.js';
import {
  processStartToken,
  verifyPidOwnership,
  type OwnershipStatus,
} from './pid-ownership.js';
import { debugLog } from './utils.js';

/** Sprint lock information returned by isSprintLocked */
export interface SprintLockInfo {
  /** Whether the sprint is currently locked */
  locked: boolean;
  /** PID of the process holding the lock */
  pid: number;
  /** IDE/environment that holds the lock */
  env: string;
  /** Sprint ID the lock was acquired for */
  sprintId: string;
  /** ISO 8601 timestamp when the lock was acquired */
  acquiredAt: string;
}

/** On-disk lock file schema */
interface LockFileData {
  pid: number;
  /** Kernel process-start identity; absent on legacy lock files. */
  startToken?: string | null;
  env: string;
  sprintId: string;
  acquiredAt: string;
}

const LOCK_FILENAME = 'sprint.lock';
const DECKENT_DIR = '.deckent';

function lockOwnership(data: LockFileData): OwnershipStatus {
  // Missing tokens are deliberately kept on the historical liveness-only
  // path. This is both the on-disk compatibility contract and the safe
  // fallback on platforms where a kernel start token is unavailable.
  if (!data.startToken) {
    return isPidAlive(data.pid) ? 'unknown' : 'dead';
  }
  return verifyPidOwnership(data);
}

/**
 * Resolve the full path to the sprint lock file.
 * @param projectRoot - Absolute path to the project root
 * @returns Absolute path to .deckent/sprint.lock
 */
function lockPath(projectRoot: string): string {
  return join(projectRoot, DECKENT_DIR, LOCK_FILENAME);
}

// Local isPidAlive removed (Sprint 178 Task 4) — delegate to
// src/core/pid-liveness.ts for portability + EPERM handling.

/**
 * Acquire a sprint lock for the current process.
 * Creates .deckent/sprint.lock with PID, environment, and timestamp.
 * If a lock already exists and the owning process is still alive,
 * returns false. Stale locks (dead PID) are cleared automatically.
 *
 * @param projectRoot - Absolute path to the project root
 * @param sprintId - The sprint identifier to lock for
 * @param env - Optional environment override; auto-detected if omitted
 * @returns true if lock was acquired, false if already locked by another live process
 */
export function acquireSprintLock(projectRoot: string, sprintId: string, env?: string): boolean {
  const filePath = lockPath(projectRoot);
  const deckentDir = join(projectRoot, DECKENT_DIR);

  // Ensure .deckent/ directory exists
  if (!existsSync(deckentDir)) {
    mkdirSync(deckentDir, { recursive: true });
  }

  // Check existing lock
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const existing: LockFileData = JSON.parse(raw) as LockFileData;

      const ownership = lockOwnership(existing);
      if (ownership === 'owned' || ownership === 'unknown') {
        // A matching owner is live. Unknown preserves the legacy
        // liveness-only/conservative behavior: never delete without proof.
        return false;
      }

      // A dead owner or a live process with a different start token proves
      // that the recorded lease is stale.
      unlinkSync(filePath);
    } catch (e) {
      debugLog('acquireSprintLock:readLock', e);
      // Corrupt lock file — remove and proceed
      try { unlinkSync(filePath); } catch (e2) { debugLog('acquireSprintLock:unlinkStale', e2); }
    }
  }

  const resolvedEnv = env ?? detectEnvironment();
  const data: LockFileData = {
    pid: process.pid,
    startToken: processStartToken(process.pid),
    env: resolvedEnv,
    sprintId,
    acquiredAt: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
}

/**
 * Atomically bind a planning-time project leadership lease to the canonical
 * execution id once planning materializes it. Only the owning process may
 * mutate the lease; another process receives false and must not proceed as the
 * execution owner.
 */
export function bindSprintLockToExecution(
  projectRoot: string,
  sprintId: string,
): boolean {
  const filePath = lockPath(projectRoot);
  if (!existsSync(filePath)) return false;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as LockFileData;
    if (data.pid !== process.pid) return false;
    const next: LockFileData = { ...data, sprintId };
    const tempPath = `${filePath}.tmp.${process.pid}`;
    writeFileSync(tempPath, JSON.stringify(next, null, 2), 'utf-8');
    renameSync(tempPath, filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a sprint lock exists and is still valid.
 * Detects stale locks (PID no longer running) and clears them automatically.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Lock info with locked=true if an active lock exists, locked=false otherwise
 */
export function isSprintLocked(projectRoot: string): SprintLockInfo {
  const filePath = lockPath(projectRoot);
  const unlocked: SprintLockInfo = { locked: false, pid: 0, env: '', sprintId: '', acquiredAt: '' };

  if (!existsSync(filePath)) {
    return unlocked;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data: LockFileData = JSON.parse(raw) as LockFileData;

    const ownership = lockOwnership(data);
    if (ownership === 'dead' || ownership === 'reused') {
      // Stale lock — clear it
      try { unlinkSync(filePath); } catch { /* ignore */ }
      return unlocked;
    }

    return {
      locked: true,
      pid: data.pid,
      env: data.env,
      sprintId: data.sprintId,
      acquiredAt: data.acquiredAt,
    };
  } catch {
    // Corrupt lock file — remove
    try { unlinkSync(filePath); } catch { /* ignore */ }
    return unlocked;
  }
}

export type SprintLockReconciliationResult =
  | {
      readonly state: 'cleared-stale';
      readonly sprintId: string;
      readonly ownership: 'dead' | 'reused' | 'unknown';
      readonly coordinator: 'dead' | 'absent' | 'unknown';
    }
  | {
      readonly state: 'preserved';
      readonly sprintId: string | null;
      readonly ownership: OwnershipStatus | 'unreadable';
      readonly coordinator: 'alive' | 'dead' | 'absent' | 'unknown';
      readonly reason: 'live-owner' | 'insufficient-evidence' | 'identity-mismatch' | 'unreadable';
    }
  | { readonly state: 'absent' };

/**
 * Reconcile a failed acquisition against the canonical coordinator projection.
 * This is intentionally narrower than normal acquisition: both ownership and
 * the durable projection must positively prove staleness. `unknown` ownership
 * and `absent`/`unknown` coordinator projections never authorize deletion. The
 * observed sprint label is compared before unlinking, including the special
 * planning lease label.
 */
export function reconcileSprintLockAfterAcquireFailure(
  projectRoot: string,
  expectedSprintId: string,
  coordinator: 'alive' | 'dead' | 'absent' | 'unknown',
): SprintLockReconciliationResult {
  const filePath = lockPath(projectRoot);
  if (!existsSync(filePath)) return { state: 'absent' };

  let data: LockFileData;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8')) as LockFileData;
  } catch (error) {
    debugLog('reconcileSprintLockAfterAcquireFailure:read', error);
    return {
      state: 'preserved',
      sprintId: null,
      ownership: 'unreadable',
      coordinator,
      reason: 'unreadable',
    };
  }

  const ownership = lockOwnership(data);
  if (data.sprintId !== expectedSprintId) {
    return {
      state: 'preserved',
      sprintId: data.sprintId,
      ownership,
      coordinator,
      reason: 'identity-mismatch',
    };
  }
  if (ownership === 'owned') {
    return {
      state: 'preserved',
      sprintId: data.sprintId,
      ownership,
      coordinator,
      reason: 'live-owner',
    };
  }

  const stale = (ownership === 'dead' || ownership === 'reused')
    && coordinator === 'dead';
  if (!stale) {
    return {
      state: 'preserved',
      sprintId: data.sprintId,
      ownership,
      coordinator,
      reason: 'insufficient-evidence',
    };
  }

  try {
    unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
    debugLog('reconcileSprintLockAfterAcquireFailure:unlink', error);
    return {
      state: 'preserved',
      sprintId: data.sprintId,
      ownership,
      coordinator,
      reason: 'insufficient-evidence',
    };
  }
  return {
    state: 'cleared-stale',
    sprintId: data.sprintId,
    ownership,
    coordinator,
  };
}

/**
 * Release the sprint lock. Only releases if the current process (PID) owns the lock.
 * If another process owns the lock, this is a no-op.
 * If no lock exists, this is a no-op.
 *
 * @param projectRoot - Absolute path to the project root
 */
export function releaseSprintLock(projectRoot: string): void {
  const filePath = lockPath(projectRoot);

  if (!existsSync(filePath)) {
    return;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data: LockFileData = JSON.parse(raw) as LockFileData;

    // Only release if we own the lock
    if (data.pid === process.pid) {
      unlinkSync(filePath);
    }
  } catch {
    // Corrupt file — safe to remove
    try { unlinkSync(filePath); } catch { /* ignore */ }
  }
}

/**
 * Typed outcome of a terminal-aware sprint lock release (671-006).
 * Discriminates exactly what happened — no throw, no undifferentiated success:
 * - `released`     — the lock recorded the terminated sprint's id and was unlinked
 * - `not-matching` — a lock exists but its recorded sprintId does not (provably)
 *                    match the requested sprintId, so it was left untouched
 * - `absent`       — no lock file exists (including the unlink ENOENT race)
 */
export type TerminatedSprintLockReleaseResult =
  | { readonly state: 'released'; readonly recordedSprintId: string }
  | { readonly state: 'not-matching'; readonly recordedSprintId: string | null }
  | { readonly state: 'absent' };

/**
 * Release the sprint lock for a sprint that has reached a terminal state
 * (COMPLETE/ABORTED), regardless of which PID acquired it.
 *
 * `releaseSprintLock` above is owner-PID-only: a finalize running in a
 * different process can never clear the lock, so it survives as a stale
 * lease. Here the caller's finalizer context is the terminal evidence; the
 * ONLY deletion criteria are file existence plus the sprintId recorded in
 * the lock file matching the requested sprintId. Everything else — a foreign
 * live PID included — is deliberately not consulted: a live foreign PID
 * whose sprint has terminated is exactly the stale-lease hole being closed,
 * while a lock recorded for ANY other sprint is never touched. Unlike
 * `acquireSprintLock`, a corrupt/unreadable lock is NOT blindly removed —
 * without a provable sprintId match this function has no deletion authority.
 *
 * @param root - Absolute path to the project root
 * @param sprintId - The terminated sprint whose lease may be released
 */
export function releaseSprintLockForTerminatedSprint(
  root: string,
  sprintId: string,
): TerminatedSprintLockReleaseResult {
  const filePath = lockPath(root);
  if (!existsSync(filePath)) return { state: 'absent' };

  let recorded: string | null;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<LockFileData>;
    recorded = typeof data.sprintId === 'string' ? data.sprintId : null;
  } catch (e) {
    // Unreadable/corrupt lock: a sprintId match cannot be proven, so nothing
    // is deleted on this path.
    debugLog('releaseSprintLockForTerminatedSprint:read', e);
    return { state: 'not-matching', recordedSprintId: null };
  }
  if (recorded !== sprintId) return { state: 'not-matching', recordedSprintId: recorded };

  try {
    unlinkSync(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
    // The lock provably matched but could not be unlinked — report it as
    // still standing rather than throwing or claiming success.
    debugLog('releaseSprintLockForTerminatedSprint:unlink', e);
    return { state: 'not-matching', recordedSprintId: recorded };
  }
  return { state: 'released', recordedSprintId: recorded };
}
