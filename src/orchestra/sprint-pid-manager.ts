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
import { ErrorRegistry } from '../core/errors.js';
import { isPidAlive } from '../core/pid-liveness.js';
import {
  processStartToken,
  verifyPidOwnership,
  type OwnershipStatus,
} from '../core/pid-ownership.js';

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
      throw ErrorRegistry.createError('DECKENT_E055', {
        message: `Sprint ${sprintId} already has a live coordinator (PID ${existingPid}). Cannot start a new coordinator for the same sprint.`,
      });
    }
    // Old process is dead — safe to overwrite
  }

  atomicWriteSync(filePath, JSON.stringify({
    pid: process.pid,
    sprintId,
    startedAt: new Date().toISOString(),
    // Capture the kernel start token so a later kill can prove this exact
    // process (not a pid-reused impostor) before signalling. Additive — old
    // readers ignore it; old pid files without it degrade to 'unknown'.
    startToken: processStartToken(process.pid),
  }, null, 2));
}

/**
 * Read the full pid record (pid + startToken) for a sprint, or null. Used by the
 * ownership guard; readPid() stays for callers that only need the number.
 */
export function readPidRecord(
  root: string,
  sprintId: string,
): { pid: number; sprintId: string; startedAt?: string; startToken?: string | null } | null {
  const filePath = pidFilePath(root, sprintId);
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      pid?: number;
      sprintId?: string;
      startedAt?: string;
      startToken?: string | null;
    };
    if (typeof data.pid !== 'number') return null;
    return {
      pid: data.pid,
      sprintId: data.sprintId ?? sprintId,
      startedAt: data.startedAt,
      startToken: data.startToken ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Classify whether the coordinator recorded for `sprintId` is still that exact
 * live process: 'owned' / 'reused' (pid recycled — never signal) / 'dead' /
 * 'unknown' (alive but unprovable — old pid file or non-Linux).
 */
export function verifySprintOwnership(root: string, sprintId: string): OwnershipStatus {
  return verifyPidOwnership(readPidRecord(root, sprintId));
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

/** Injectable deps for {@link terminateOwnedSprintProcess} (test seam). */
export interface TerminateDeps {
  isAlive?: (pid: number) => boolean;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
}

export interface VerifiedTerminateDeps extends TerminateDeps {
  wait?: (ms: number) => Promise<void>;
  verifyOwnership?: typeof verifySprintOwnership;
}

export interface CoordinatorTerminationPolicy {
  readonly coordinator_termination_grace_ms: number;
  readonly termination_poll_interval_ms: number;
  readonly forced_termination_verify_ms: number;
}

export type VerifiedCoordinatorTermination =
  | {
      readonly action: 'terminated';
      readonly pid: number;
      readonly escalation: 'sigterm' | 'sigkill';
    }
  | {
      readonly action: 'already-stopped' | 'skipped-reused' | 'ownership-unverified' | 'self';
      readonly pid: number | null;
      readonly escalation: 'none';
    }
  | {
      readonly action: 'still-alive';
      readonly pid: number;
      readonly escalation: 'sigkill';
    };

async function waitForProcessExit(
  pid: number,
  timeoutMs: number,
  pollIntervalMs: number,
  isAlive: (pid: number) => boolean,
  wait: (ms: number) => Promise<void>,
): Promise<boolean> {
  if (!isAlive(pid)) return true;
  let elapsedMs = 0;
  while (elapsedMs < timeoutMs) {
    const sliceMs = Math.min(pollIntervalMs, timeoutMs - elapsedMs);
    await wait(sliceMs);
    elapsedMs += sliceMs;
    if (!isAlive(pid)) return true;
  }
  return !isAlive(pid);
}

/**
 * Ownership-fenced, bounded coordinator containment.
 *
 * Unlike the legacy best-effort helper below, this function does not report a
 * successful termination merely because SIGTERM was sent. It waits for death,
 * re-checks PID ownership before escalation, verifies SIGKILL outcome, and
 * leaves PID authority intact on every unverified outcome so callers cannot
 * stamp COMPLETE over a live/ambiguous process.
 */
export async function terminateOwnedSprintProcessAndWait(
  root: string,
  sprintId: string,
  policy: CoordinatorTerminationPolicy,
  deps: VerifiedTerminateDeps = {},
): Promise<VerifiedCoordinatorTermination> {
  const isAlive = deps.isAlive ?? isProcessAlive;
  const signal = deps.kill
    ?? ((pid: number, value: NodeJS.Signals): void => { process.kill(pid, value); });
  const wait = deps.wait
    ?? ((ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms); }));
  const verifyOwnership = deps.verifyOwnership ?? verifySprintOwnership;

  const pid = readPid(root, sprintId);
  if (pid === null || !isAlive(pid)) {
    return { action: 'already-stopped', pid, escalation: 'none' };
  }
  if (pid === process.pid) {
    return { action: 'self', pid, escalation: 'none' };
  }

  const initialOwnership = verifyOwnership(root, sprintId);
  if (initialOwnership === 'reused') {
    return { action: 'skipped-reused', pid, escalation: 'none' };
  }
  if (initialOwnership !== 'owned') {
    return { action: 'ownership-unverified', pid, escalation: 'none' };
  }

  try {
    signal(pid, 'SIGTERM');
  } catch {
    if (!isAlive(pid)) {
      return { action: 'terminated', pid, escalation: 'sigterm' };
    }
  }
  if (await waitForProcessExit(
    pid,
    policy.coordinator_termination_grace_ms,
    policy.termination_poll_interval_ms,
    isAlive,
    wait,
  )) {
    return { action: 'terminated', pid, escalation: 'sigterm' };
  }

  // The PID may have exited and been reused during the grace window. Never
  // escalate unless the original start-token still owns it.
  const escalationOwnership = verifyOwnership(root, sprintId);
  if (escalationOwnership === 'reused') {
    return { action: 'skipped-reused', pid, escalation: 'none' };
  }
  if (escalationOwnership !== 'owned') {
    return { action: 'ownership-unverified', pid, escalation: 'none' };
  }

  try {
    signal(pid, 'SIGKILL');
  } catch {
    if (!isAlive(pid)) {
      return { action: 'terminated', pid, escalation: 'sigkill' };
    }
  }
  if (await waitForProcessExit(
    pid,
    policy.forced_termination_verify_ms,
    policy.termination_poll_interval_ms,
    isAlive,
    wait,
  )) {
    return { action: 'terminated', pid, escalation: 'sigkill' };
  }
  return { action: 'still-alive', pid, escalation: 'sigkill' };
}

/**
 * P0-C (orphan-on-finalize-force, sprint-323): terminate a sprint's recorded
 * start-process when it is provably (or unprovably-but-alive) still running, so a
 * `finalize --force` does not leave the hung `deckent start` racing the finalize
 * (re-clobbering results / re-finalizing on its own timeout). NEVER signals a
 * recycled PID ('reused' — the OS gave the number to an unrelated process).
 * Returns what it did so the caller can report + decide.
 */
export function terminateOwnedSprintProcess(
  root: string,
  sprintId: string,
  deps: TerminateDeps = {},
): { action: 'killed' | 'skipped-reused' | 'not-alive'; pid: number | null } {
  const isAlive = deps.isAlive ?? isProcessAlive;
  const kill = deps.kill ?? ((pid: number, signal: NodeJS.Signals): void => { process.kill(pid, signal); });
  const ownership = verifySprintOwnership(root, sprintId);
  const pid = readPid(root, sprintId);
  if (ownership === 'reused') return { action: 'skipped-reused', pid };
  if ((ownership === 'owned' || ownership === 'unknown') && pid !== null && isAlive(pid)) {
    try { kill(pid, 'SIGTERM'); } catch { /* best-effort */ }
    return { action: 'killed', pid };
  }
  return { action: 'not-alive', pid };
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
 *
 * Delegates to the portable {@link isPidAlive} helper (Sprint 178 Task 4).
 */
export function isProcessAlive(pid: number): boolean {
  return isPidAlive(pid);
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
  const archiveDir = join(root, BRAIN_DIR, 'archive', 'sprints');
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
