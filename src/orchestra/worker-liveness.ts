/**
 * Worker Liveness Check (Sprint 191 hotfix — pre-Sprint 192 W-INTEGRITY)
 *
 * Memory: [[feedback_no_synthetic_results]] — sentetik NO_GO YASAK; gerçekliği doğrula.
 *
 * Five-layer liveness signals consulted BEFORE writing a synthetic NO_GO:
 *   L1 spawn-attempted — task.assignedWorker set (dispatcher reached it)
 *   L2 process alive — docker container with deckent-w-<id> running
 *   L3 heartbeat fresh — .tasks/task-<id>.hb mtime within freshness window
 *   L4 log growing — .tasks/task-<id>.log mtime within freshness window
 *   L5 partial-result — .tasks/task-<id>.partial-result has bytes
 *
 * Returned status drives runEvaluatePhase decision:
 *   - 'never-spawned' → DEFERRED (skip synthetic NO_GO; emit audit-trail event)
 *   - 'alive'         → caller grants extra grace poll before NO_GO
 *   - 'dead'          → genuine timeout, synthetic NO_GO acceptable
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Task } from '../core/task-types.js';

export type WorkerLivenessStatus = 'alive' | 'dead' | 'never-spawned';

export interface WorkerLivenessSignals {
  /** L1 — task.assignedWorker is non-empty (dispatcher reached the task). */
  assignedWorker: boolean;
  /** L2 — docker container `deckent-w-<id>` currently running. */
  dockerRunning: boolean;
  /** L3 — heartbeat file mtime within freshness window. */
  heartbeatFresh: boolean;
  /** L4 — log file mtime within freshness window. */
  logGrowing: boolean;
  /** L5 — partial-result file present and non-empty. */
  partialResultExists: boolean;
}

export interface WorkerLivenessResult {
  status: WorkerLivenessStatus;
  signals: WorkerLivenessSignals;
  /** Diagnostic reason — always present, useful for debugLog and audit events. */
  reason: string;
}

/** Freshness threshold for HB/log mtime (90s matches RUNTIME_EXTENSION_HEARTBEAT_FRESH_S). */
export const LIVENESS_FRESHNESS_MS = 90_000;

/** Docker ps check timeout — short to keep evaluate loop responsive. */
const DOCKER_PROBE_TIMEOUT_MS = 3000;

/**
 * Test seam: override docker-running probe (e.g. for unit tests).
 * Defaults to spawnSync('docker', ['ps', '--filter', ...]) when undefined.
 */
export interface LivenessDeps {
  isDockerContainerRunning?: (containerName: string) => boolean;
  now?: () => number;
}

function defaultDockerProbe(containerName: string): boolean {
  try {
    const res = spawnSync(
      'docker',
      ['ps', '--filter', `name=${containerName}`, '--format', '{{.Names}}'],
      { encoding: 'utf-8', timeout: DOCKER_PROBE_TIMEOUT_MS },
    );
    if (res.status !== 0 || typeof res.stdout !== 'string') return false;
    return res.stdout.split('\n').some((line) => line.trim() === containerName);
  } catch {
    return false;
  }
}

/**
 * Inspect a task's runtime liveness signals.
 *
 * Pure with respect to disk reads only — never mutates files. Safe to call
 * during EVALUATE loop iteration.
 */
export function checkWorkerLiveness(
  task: Task,
  projectRoot: string,
  deps?: LivenessDeps,
): WorkerLivenessResult {
  const taskId = task.id;
  const now = deps?.now ?? (() => Date.now());
  const dockerProbe = deps?.isDockerContainerRunning ?? defaultDockerProbe;

  const signals: WorkerLivenessSignals = {
    assignedWorker: typeof task.assignedWorker === 'string' && task.assignedWorker.length > 0,
    dockerRunning: false,
    heartbeatFresh: false,
    logGrowing: false,
    partialResultExists: false,
  };

  // L1 — never-dispatched short-circuit
  if (!signals.assignedWorker) {
    return {
      status: 'never-spawned',
      signals,
      reason: 'task.assignedWorker not set — dispatcher never reached this task (max_workers saturation or wave-barrier hold)',
    };
  }

  // L2 — docker container check (only meaningful when docker backend in use;
  // probe returns false for non-docker backends, which is fine — other
  // signals still vote). Fail closed on any error.
  const containerName = `deckent-w-${taskId}`;
  try {
    signals.dockerRunning = dockerProbe(containerName);
  } catch { /* fail closed — treat as not running */ }

  // L3 — heartbeat freshness
  const hbPath = join(projectRoot, '.tasks', `task-${taskId}.hb`);
  if (existsSync(hbPath)) {
    try {
      const ageMs = now() - statSync(hbPath).mtimeMs;
      if (ageMs < LIVENESS_FRESHNESS_MS) signals.heartbeatFresh = true;
    } catch { /* stat error — treat as stale */ }
  }

  // L4 — log mtime
  const logPath = join(projectRoot, '.tasks', `task-${taskId}.log`);
  if (existsSync(logPath)) {
    try {
      const ageMs = now() - statSync(logPath).mtimeMs;
      if (ageMs < LIVENESS_FRESHNESS_MS) signals.logGrowing = true;
    } catch { /* ignore */ }
  }

  // L5 — partial-result presence (Sprint 151 safety net)
  const partialPath = join(projectRoot, '.tasks', `task-${taskId}.partial-result`);
  if (existsSync(partialPath)) {
    try {
      const content = readFileSync(partialPath, 'utf-8');
      if (content.trim().length > 0) signals.partialResultExists = true;
    } catch { /* ignore */ }
  }

  const liveVote = signals.dockerRunning || signals.heartbeatFresh || signals.logGrowing;
  if (liveVote) {
    return {
      status: 'alive',
      signals,
      reason: `worker still active — docker=${signals.dockerRunning} hb=${signals.heartbeatFresh} log=${signals.logGrowing} partial=${signals.partialResultExists}`,
    };
  }

  return {
    status: 'dead',
    signals,
    reason: `no liveness signal — docker=${signals.dockerRunning} hb=${signals.heartbeatFresh} log=${signals.logGrowing} partial=${signals.partialResultExists}`,
  };
}
