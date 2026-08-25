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
import { projectLogicalProgress, type LogicalProgressAttempt } from '../core/logical-progress-projection.js';

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

// Fix-attempt task ids follow the established `<logicalId>-fix(-fix)*` convention
// used throughout the orchestrator — e.g. the dynamic FIX worker fixture below
// (`290-001-fix`) and the residue-heartbeat case documented in readActiveWorkers
// above (`500-003-fix-fix-fix`). Stripping the trailing run of `-fix` segments
// recovers the logical/root task id a repair lineage shares.
const FIX_SUFFIX_RE = /(-fix)+$/;

function logicalTaskIdFor(taskId: string): string {
  return taskId.replace(FIX_SUFFIX_RE, '');
}

// Caller-context rationale (task 671-003): countCompletedTasks binds to the
// canonical logical-progress authority (`projectLogicalProgress`) instead of
// independently re-deriving a count from its own `.result` file enumeration —
// that old approach counted ATTEMPT-level artifacts, so a FIX attempt's own
// `.result` file inflated the number past the true logical-task total (the same
// defect being removed from the auditor's `scanResultFiles`/`resultCount`).
//
// Two canonical shapes are admissible: call `projectLogicalProgress` directly,
// or consume the published `CanonicalRunStatusReadModel` (run-status-read-model.ts).
// This function is reached from `getSprintStateSnapshot`, which per this file's
// header is a synchronous, IN-PROCESS snapshot builder invoked directly by
// NervousObserver via the `sprintStateProvider` callback wired in bootstrap.ts —
// there is no separate, out-of-process reader here waiting on an asynchronously
// published artifact. That in-process coordinator context is exactly what favours
// the direct `projectLogicalProgress` call: it needs the freshest possible
// snapshot on every invocation, not whatever the last async publish happened to
// persist, and it already has the raw `.result` artifacts on hand from the same
// `tasksDir` scan used elsewhere in this module.
function countCompletedTasks(tasksDir: string): number {
  if (!existsSync(tasksDir)) return 0;
  let files: string[];
  try {
    files = readdirSync(tasksDir);
  } catch {
    return 0;
  }
  const attempts: LogicalProgressAttempt[] = [];
  for (const file of files) {
    if (!file.startsWith('task-') || !file.endsWith('.result')) continue;
    const taskId = file.slice('task-'.length, -'.result'.length);
    if (!taskId) continue;
    attempts.push({
      id: taskId,
      logicalTaskId: logicalTaskIdFor(taskId),
      status: 'done',
    });
  }
  if (attempts.length === 0) return 0;
  const projected = projectLogicalProgress({ attempts });
  // Task filenames under tasksDir are unique by construction, so a rejection
  // diagnostic (e.g. duplicate-attempt-id) is defensive-only here — fail safe to
  // 0 rather than throw out of a snapshot builder that must never crash its caller.
  return projected.ok ? projected.projection.total : 0;
}

function countOpenDebt(projectRoot: string): number {
  // Task #4d: DB-first — was parseDebtTable(.brain/exports/debt.md).
  return getDebtItems(projectRoot, { activeOnly: true }).length;
}
