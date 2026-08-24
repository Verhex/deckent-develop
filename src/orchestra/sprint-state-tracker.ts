// ═══ Sprint State Tracker ════════════════════════════════════════════
// Sprint 180 W1-1 (NERVOUS-TODO §11.2 Step B), Sprint 181 recovery.
// Single-source snapshot builder consumed by NervousObserver via the
// sprintStateProvider callback wired in W1-2 (bootstrap.ts).
//
// Inputs:
//   - .deckent/sprint-state.json   → sprintId, currentPhase, totalTasks
//   - .tasks/task-<id>.hb           → activeWorkers
//   - .tasks/task-<id>.result       → completedTasks
//   - .brain/memory.db              → openDebtCount (DB-first, Task #4d)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readSprintState } from './sprint-utils.js';
import { getDebtItems } from '../core/debt-store.js';
import type { SprintStateSnapshot } from '../core/nervous-types.js';
import { parseWorkerActivityHeartbeat } from '../core/worker-activity-heartbeat.js';
import { WorkerHeartbeatAuthorityStore } from '../core/worker-heartbeat-authority-store.js';
import type { WorkerHeartbeatAuthorityState } from '../core/worker-heartbeat-authority.js';
import type { HostPrimaryLiveness } from '../core/monitoring-types.js';

export type { HostPrimaryLiveness } from '../core/monitoring-types.js';

export type TrackedActiveWorker = {
  readonly id: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly backend: 'docker' | 'tmux' | 'subprocess';
  readonly status: string;
  readonly currentAction: string;
  readonly lastHeartbeat: string;
  readonly liveness: HostPrimaryLiveness;
};

type ActiveWorker = TrackedActiveWorker;

const TASKS_DIR = '.tasks';
const VALID_PHASES = new Set([
  'IDLE', 'PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'CLEANUP',
]);

type Phase = SprintStateSnapshot['currentPhase'];

/**
 * Frozen snapshot returned when no sprint is active.
 */
export const IDLE_SNAPSHOT: SprintStateSnapshot = Object.freeze({
  sprintId: null,
  currentPhase: 'IDLE' as Phase,
  activeWorkers: Object.freeze([]) as readonly ActiveWorker[] as ActiveWorker[],
  openDebtCount: 0,
  totalTasks: 0,
  completedTasks: 0,
}) as SprintStateSnapshot;

/**
 * Build a fresh SprintStateSnapshot for the given project root.
 */
export function getSprintStateSnapshot(projectRoot: string): SprintStateSnapshot {
  const state = readSprintState(projectRoot) as
    | { sprintId?: string; phase?: string; taskIds?: string[] }
    | null;
  if (!state) return IDLE_SNAPSHOT;
  const tasksDir = join(projectRoot, TASKS_DIR);
  const phase = normalizePhase(state.phase);
  const taskIds = Array.isArray(state.taskIds) ? state.taskIds : [];
  return {
    sprintId: state.sprintId ?? null,
    currentPhase: phase,
    activeWorkers: readActiveWorkers(tasksDir),
    openDebtCount: countOpenDebt(projectRoot),
    totalTasks: taskIds.length,
    completedTasks: countCompletedTasks(tasksDir),
  };
}

function normalizePhase(raw: unknown): Phase {
  const candidate = String(raw ?? '').toUpperCase();
  return (VALID_PHASES.has(candidate) ? candidate : 'IDLE') as Phase;
}

function readActiveWorkers(tasksDir: string): ActiveWorker[] {
  if (!existsSync(tasksDir)) return [];
  let files: string[];
  try {
    files = readdirSync(tasksDir);
  } catch {
    return [];
  }
  const out: ActiveWorker[] = [];
  for (const file of files) {
    if (!file.endsWith('.hb')) continue;
    // A worker that has already written its .result is FINISHED, not active —
    // its heartbeat simply stopped on normal exit, so its .hb ages out and
    // (without this guard) reads as "stale". Skipping it here keeps
    // activeWorkers genuinely-active, so StaleWorkerDetector never proposes a
    // spurious WORKER_RESPAWN for a DONE worker (the false-positive root).
    try {
      const hbPath = join(tasksDir, file);
      const raw: unknown = JSON.parse(readFileSync(hbPath, 'utf-8'));
      const parsed = parseWorkerActivityHeartbeat(raw);
      if (parsed.state !== 'VALID') continue;
      const hb = parsed.heartbeat;
      const { workerId, taskId } = hb;
      // Identity comes from the heartbeat's OWN taskId, never from its filename.
      // Measured 2026-08-10: a residue heartbeat named `500-003-fix-fix-fix.hb`
      // (no `task-` prefix, producer still unidentified) made the finished-worker
      // guard look for `500-003-fix-fix-fix.result` — a name nothing ever writes.
      // The guard missed, the file read as an active worker, its 6-hour-old mtime
      // read as stale, and StaleWorkerDetector fired WORKER_RESPAWN twice on a
      // sprint that had been settled and cleaned hours earlier.
      if (existsSync(join(tasksDir, `task-${taskId}.result`))) continue;
      // A live worker always has its task JSON on disk — that file is the claim
      // surface it operates on, and cleanup removes it when the sprint settles.
      // Its absence therefore proves this heartbeat is residue, whatever the file
      // is called. This holds even if some path writes a misnamed artifact again:
      // the check is on evidence, not on a filename convention.
      if (!existsSync(join(tasksDir, `task-${taskId}.json`))) continue;
      out.push({
        id: workerId,
        taskId,
        attemptId: hb.attemptId,
        backend: hb.backend,
        status: hb.status,
        currentAction: hb.currentAction,
        // Activity time is retained for UI/identity projection only. It never
        // participates in the liveness verdict below.
        lastHeartbeat: hb.observedAt,
        liveness: readExactAttemptLiveness(tasksDir, hb),
      });
    } catch {
      // malformed .hb / stat error — skip silently
    }
  }
  return out;
}

function readExactAttemptLiveness(
  tasksDir: string,
  hb: { taskId: string; workerId: string; attemptId: string },
): HostPrimaryLiveness {
  const root = join(tasksDir, 'worker-heartbeat-authority');
  if (!existsSync(root)) {
    return { state: 'unknown', attemptId: hb.attemptId, hostSequence: null, reason: 'host authority unavailable' };
  }
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return { state: 'unknown', attemptId: hb.attemptId, hostSequence: null, reason: 'host authority unreadable' };
  }
  const store = new WorkerHeartbeatAuthorityStore(root);
  const matches: WorkerHeartbeatAuthorityState[] = [];
  for (const entry of entries) {
    try {
      const record = JSON.parse(readFileSync(join(root, entry, 'identity.json'), 'utf8')) as {
        identity?: WorkerHeartbeatAuthorityState['identity'];
      };
      const identity = record.identity;
      if (!identity || identity.taskId !== hb.taskId || identity.attemptId !== hb.attemptId) continue;
      const authority = store.read(identity);
      if (authority) matches.push(authority);
    } catch {
      // An unreadable sibling attempt is not evidence that this attempt is dead.
    }
  }
  if (matches.length !== 1) {
    return {
      state: matches.length > 1 ? 'HOLD' : 'unknown',
      attemptId: hb.attemptId,
      hostSequence: null,
      reason: matches.length > 1 ? 'multiple exact-attempt authorities' : 'exact-attempt authority unavailable',
    };
  }
  const authority = matches[0]!;
  if (authority.holds.length > 0) {
    return { state: 'HOLD', attemptId: hb.attemptId, hostSequence: authority.latest?.hostSequence ?? null, reason: 'authority contains HOLD' };
  }
  const latest = authority.latest;
  if (!latest || latest.liveness === 'unknown') {
    return { state: 'unknown', attemptId: hb.attemptId, hostSequence: latest?.hostSequence ?? null, reason: 'host liveness unavailable' };
  }
  if (latest.workerTaskVerdict === 'done') {
    return { state: 'alive', attemptId: hb.attemptId, hostSequence: latest.hostSequence, reason: 'attempt settled done' };
  }
  return {
    state: latest.liveness === 'alive' ? 'alive' : 'dead',
    attemptId: hb.attemptId,
    hostSequence: latest.hostSequence,
    reason: `host process ${latest.hostProcessOutcome.state}`,
  };
}

function countCompletedTasks(tasksDir: string): number {
  if (!existsSync(tasksDir)) return 0;
  try {
    return readdirSync(tasksDir).filter((f) => f.startsWith('task-') && f.endsWith('.result')).length;
  } catch {
    return 0;
  }
}

function countOpenDebt(projectRoot: string): number {
  // Task #4d: DB-first — was parseDebtTable(.brain/exports/debt.md).
  return getDebtItems(projectRoot, { activeOnly: true }).length;
}
