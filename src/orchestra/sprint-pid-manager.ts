// ═══ Sprint PID Manager ═══════════════════════════════════════════
// Coordinator resilience: PID tracking, state snapshots, orphan detection.
// Prevents zombie sprints when the coordinator process silently dies.
// Uses atomic writes (temp + rename) to prevent corrupted state files.

import {
  writeFileSync, readFileSync, existsSync, unlinkSync,
  mkdirSync, renameSync, readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { DECKENT_DIR, BRAIN_DIR } from '../core/constants.js';

// ─── Types ────────────────────────────────────────────────────────

export interface SprintStateSnapshot {
  sprintId: string;
  pid: number;
  startedAt: string;
  currentWave: number;
  taskStatuses: Record<string, string>;
  metricsJsonlSize: number;
  lastHeartbeat: string;
}

export interface OrphanInfo {
  sprintId: string;
  pid: number;
  pidFilePath: string;
  snapshotPath: string | null;
  lastSnapshot: SprintStateSnapshot | null;
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────

const PID_DIR = join(DECKENT_DIR, 'pids');

function pidFilePath(root: string, sprintId: string): string {
  return join(root, PID_DIR, `${sprintId}.pid`);
}

function snapshotFilePath(root: string, sprintId: string): string {
  return join(root, PID_DIR, `${sprintId}.snapshot.json`);
}

// ─── Atomic Write Helper ──────────────────────────────────────────

function atomicWriteSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}`;
  writeFileSync(tempPath, data, 'utf-8');
  renameSync(tempPath, filePath);
}

// ─── PID File Operations ──────────────────────────────────────────

/**
 * Write a PID file for the given sprint. Includes collision detection:
 * if a PID file already exists for this sprint, checks liveness before overwriting.
 */
export function writePid(root: string, sprintId: string): void {
  const filePath = pidFilePath(root, sprintId);

  // Collision check: if PID file already exists, verify the old process is dead
  if (existsSync(filePath)) {
    const existingPid = readPid(root, sprintId);
    if (existingPid !== null && isProcessAlive(existingPid)) {
      throw new Error(
        `Sprint ${sprintId} already has a live coordinator (PID ${existingPid}). ` +
        'Cannot start a new coordinator for the same sprint.',
      );
    }
    // Old process is dead — safe to overwrite
  }

  atomicWriteSync(filePath, JSON.stringify({
    pid: process.pid,
    sprintId,
    startedAt: new Date().toISOString(),
  }, null, 2));
}

/**
 * Read the PID from a sprint's PID file. Returns null if the file doesn't exist
 * or cannot be parsed.
 */
export function readPid(root: string, sprintId: string): number | null {
  const filePath = pidFilePath(root, sprintId);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as { pid?: number };
    return typeof data.pid === 'number' ? data.pid : null;
  } catch {
    return null;
  }
}

/**
 * Remove the PID file for a sprint (called on clean shutdown).
 */
export function clearPid(root: string, sprintId: string): void {
  const filePath = pidFilePath(root, sprintId);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch { /* non-fatal */ }

  // Also clean up snapshot file
  const snapPath = snapshotFilePath(root, sprintId);
  try {
    if (existsSync(snapPath)) {
      unlinkSync(snapPath);
    }
  } catch { /* non-fatal */ }
}

// ─── State Snapshot Operations ────────────────────────────────────

/**
 * Write a state snapshot atomically. Called periodically (every 30s) by the
 * coordinator to persist its current view of the sprint.
 */
export function writeStateSnapshot(
  root: string,
  sprintId: string,
  snap: SprintStateSnapshot,
): void {
  const filePath = snapshotFilePath(root, sprintId);
  atomicWriteSync(filePath, JSON.stringify(snap, null, 2));
}

/**
 * Read the last state snapshot for a sprint. Returns null if not found or corrupt.
 */
export function readStateSnapshot(
  root: string,
  sprintId: string,
): SprintStateSnapshot | null {
  const filePath = snapshotFilePath(root, sprintId);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as SprintStateSnapshot;
  } catch {
    return null;
  }
}

// ─── Orphan Detection ─────────────────────────────────────────────

/**
 * Check if a process is alive using kill(pid, 0).
 * Returns true if the process exists (even if we don't own it).
 * POSIX: ESRCH = dead, EPERM = alive but not ours.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true; // No error = process exists and we own it
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM') {
      return true; // Process exists but we don't have permission (still alive)
    }
    // ESRCH or any other error = process does not exist
    return false;
  }
}

/**
 * Detect an orphaned sprint: a sprint whose PID file exists but whose
 * coordinator process is no longer running.
 * Returns null if no orphan is detected (no PID file, or process is alive).
 */
export function detectOrphan(root: string, sprintId: string): OrphanInfo | null {
  const filePath = pidFilePath(root, sprintId);
  if (!existsSync(filePath)) return null;

  const pid = readPid(root, sprintId);
  if (pid === null) return null;

  // If the process is alive, this is NOT an orphan
  if (isProcessAlive(pid)) return null;

  // Process is dead — this sprint is orphaned
  const snapPath = snapshotFilePath(root, sprintId);
  const snapshot = readStateSnapshot(root, sprintId);

  return {
    sprintId,
    pid,
    pidFilePath: filePath,
    snapshotPath: existsSync(snapPath) ? snapPath : null,
    lastSnapshot: snapshot,
    reason: `Coordinator PID ${pid} is no longer running (ESRCH). Sprint ${sprintId} is orphaned.`,
  };
}

// ─── Archive Helper ───────────────────────────────────────────────

/**
 * Archive orphaned sprint artifacts to .brain/archive/.
 * Moves PID file, snapshot, and sprint state to the archive directory.
 */
export function archiveOrphan(root: string, orphan: OrphanInfo): void {
  const archiveDir = join(root, BRAIN_DIR, 'archive');
  mkdirSync(archiveDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${orphan.sprintId}_${timestamp}`;

  // Move PID file
  try {
    if (existsSync(orphan.pidFilePath)) {
      const content = readFileSync(orphan.pidFilePath, 'utf-8');
      writeFileSync(join(archiveDir, `${prefix}.pid`), content, 'utf-8');
      unlinkSync(orphan.pidFilePath);
    }
  } catch { /* non-fatal */ }

  // Move snapshot
  if (orphan.snapshotPath) {
    try {
      if (existsSync(orphan.snapshotPath)) {
        const content = readFileSync(orphan.snapshotPath, 'utf-8');
        writeFileSync(join(archiveDir, `${prefix}.snapshot.json`), content, 'utf-8');
        unlinkSync(orphan.snapshotPath);
      }
    } catch { /* non-fatal */ }
  }

  // Move sprint state file if it exists
  const sprintStatePath = join(root, DECKENT_DIR, 'sprint-state.json');
  try {
    if (existsSync(sprintStatePath)) {
      const content = readFileSync(sprintStatePath, 'utf-8');
      writeFileSync(join(archiveDir, `${prefix}.sprint-state.json`), content, 'utf-8');
      unlinkSync(sprintStatePath);
    }
  } catch { /* non-fatal */ }
}

/**
 * List all PID files in the pids directory.
 * Returns sprint IDs that have PID files.
 */
export function listPidFiles(root: string): string[] {
  const dir = join(root, PID_DIR);
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter(f => f.endsWith('.pid'))
      .map(f => f.replace('.pid', ''));
  } catch {
    return [];
  }
}
