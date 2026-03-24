/**
 * Multi-IDE conflict prevention module.
 * Prevents concurrent sprint execution from different IDEs/processes
 * by using file-based PID locks in .deckent/sprint.lock.
 * @module
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectEnvironment } from './environment.js';

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
  env: string;
  sprintId: string;
  acquiredAt: string;
}

const LOCK_FILENAME = 'sprint.lock';
const DECKENT_DIR = '.deckent';

/**
 * Resolve the full path to the sprint lock file.
 * @param projectRoot - Absolute path to the project root
 * @returns Absolute path to .deckent/sprint.lock
 */
function lockPath(projectRoot: string): string {
  return join(projectRoot, DECKENT_DIR, LOCK_FILENAME);
}

/**
 * Check whether a process with the given PID is still running.
 * Uses process.kill(pid, 0) which sends no signal but throws if
 * the process does not exist.
 * @param pid - Process ID to check
 * @returns true if the process is alive
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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

      if (isPidAlive(existing.pid)) {
        // Lock is held by a live process
        return false;
      }

      // Stale lock — remove it
      unlinkSync(filePath);
    } catch {
      // Corrupt lock file — remove and proceed
      try { unlinkSync(filePath); } catch { /* ignore */ }
    }
  }

  const resolvedEnv = env ?? detectEnvironment();
  const data: LockFileData = {
    pid: process.pid,
    env: resolvedEnv,
    sprintId,
    acquiredAt: new Date().toISOString(),
  };

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return true;
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

    if (!isPidAlive(data.pid)) {
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
