// ═══ Sprint Checkpoint ════════════════════════════════════════════════
// Sprint state persistence for long-running sprint resume capability.
// MVP: write/read checkpoint — resume from middle of sprint.
// Sprint 139 Task 030: dep graph embedded in checkpoint for resume restore.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.
// Sprint 145+ will add external state store.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR, TASKS_DIR } from '../core/constants.js';
import { debugLog, readJsonSafe } from '../core/utils.js';
import type { Sprint } from '../core/types.js';
import { SprintPhase, SprintStatus } from '../core/types.js';
import type { Task } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import type { Heartbeat } from '../core/types.js';
import { writeSprintState } from './sprint-utils.js';
import type { SerializedDependencyGraph } from './dependency-scheduler.js';
import {
  persistDependencyGraph,
  loadDependencyGraph,
  deserializeDependencyGraph,
  serializeDependencyGraph,
} from './dependency-scheduler.js';
import type { DependencyGraph } from './dependency-scheduler.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Minimal worker state snapshot for resume purposes. */
export interface WorkerState {
  workerId: string;
  taskId: string;
  status: 'EXECUTING' | 'DONE' | 'NO_GO';
  spawnedAt: string;
}

/**
 * Sprint checkpoint — persisted state for resume capability.
 * Written every N=5 task completions (DONE/GO_WITH_TECH_DEBT/NO_GO).
 *
 * Sprint 139 Task 030: `depGraph` field embeds the serialized dependency graph
 * so that resume can restore topological ordering without re-computing from scratch.
 */
export interface SprintCheckpoint {
  /** Sprint identifier (e.g. "sprint-138") */
  sprintId: string;
  /** Monotonically increasing checkpoint number (1, 2, 3...) */
  checkpointNumber: number;
  /** ISO 8601 timestamp of when this checkpoint was written */
  timestamp: string;
  /** Task IDs that have reached a terminal state */
  completedTasks: string[];
  /** Task IDs that have not yet started */
  pendingTasks: string[];
  /** Snapshot of currently executing workers at checkpoint time */
  activeWorkers: WorkerState[];
  /** Sprint lifecycle phase at checkpoint time */
  brainPhase: SprintPhase;
  /** Event stream sequence offset — used to resume from this point */
  eventStreamOffset: number;
  /**
   * Serialized dependency graph (Task 030).
   * Embedded so resume can restore topological ordering from checkpoint alone,
   * without re-reading all task files and re-running Kahn's algorithm.
   * Optional for backward compatibility with Sprint 138 checkpoints.
   */
  depGraph?: SerializedDependencyGraph;
}

// ─── Paths ───────────────────────────────────────────────────────────

function checkpointPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-checkpoint.json`);
}

function checkpointCounterPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-checkpoint-seq`);
}

// ─── Sequence Counter ────────────────────────────────────────────────

function readCheckpointCounter(projectRoot: string, sprintId: string): number {
  const counterPath = checkpointCounterPath(projectRoot, sprintId);
  if (!existsSync(counterPath)) return 0;
  try {
    const raw = readFileSync(counterPath, 'utf-8').trim();
    const num = parseInt(raw, 10);
    return Number.isNaN(num) ? 0 : num;
  } catch {
    return 0;
  }
}

function incrementCheckpointCounter(projectRoot: string, sprintId: string): number {
  const next = readCheckpointCounter(projectRoot, sprintId) + 1;
  const counterPath = checkpointCounterPath(projectRoot, sprintId);
  try {
    writeFileSync(counterPath, String(next), 'utf-8');
  } catch (e) {
    debugLog('sprint-checkpoint:incrementCounter', e);
  }
  return next;
}

// ─── Event Stream Offset (Sprint 161 T-002) ──────────────────────────

/**
 * Compute the current event stream offset by scanning `<sprintId>-events.jsonl`
 * and returning the maximum `sequence` field across all valid JSON lines.
 *
 * Source-of-truth: the on-disk event stream itself, not an in-memory counter.
 * Fail-safe: missing file, empty file, or unreadable file all return 0.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Sprint identifier (e.g. "sprint-160")
 * @returns Highest observed sequence number, or 0 if unavailable
 */
export function computeEventStreamOffset(
  projectRoot: string,
  sprintId: string,
): number {
  const filePath = join(projectRoot, DECKENT_DIR, `${sprintId}-events.jsonl`);
  if (!existsSync(filePath)) return 0;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    if (raw.trim().length === 0) return 0;
    let max = 0;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const evt = JSON.parse(trimmed) as { sequence?: number };
        if (typeof evt.sequence === 'number' && evt.sequence > max) {
          max = evt.sequence;
        }
      } catch {
        // Skip malformed lines — partial writes happen at the tail
      }
    }
    return max;
  } catch (e) {
    debugLog('sprint-checkpoint:computeEventStreamOffset', e);
    return 0;
  }
}

// ─── Core API ────────────────────────────────────────────────────────

/**
 * Write a checkpoint for the given sprint state.
 * Fail-safe: write errors are logged but do not crash the sprint.
 *
 * Atomic rename: writes to `<path>.tmp` then `renameSync()` to final path so
 * a crash mid-write never leaves a half-serialized checkpoint.json.
 *
 * @param projectRoot - Project root directory
 * @param sprint - Current sprint state
 * @param eventStreamOffset - Current event stream sequence number
 * @param graph - Optional dependency graph to embed (Task 030: sprint resume restore)
 */
export function writeCheckpoint(
  projectRoot: string,
  sprint: Sprint,
  eventStreamOffset: number,
  graph?: DependencyGraph,
): SprintCheckpoint | null {
  try {
    mkdirSync(join(projectRoot, DECKENT_DIR), { recursive: true });

    const checkpointNumber = incrementCheckpointCounter(projectRoot, sprint.id);

    const completedTasks = sprint.tasks
      .filter(t => isTerminalStatus(t.status))
      .map(t => t.id);

    // Pending: never-started tasks. EXECUTING/CLAIMED tasks are tracked
    // separately in `activeWorkers` so the three sets stay disjoint.
    // Resume logic should union pendingTasks ∪ activeWorkers.taskId to get
    // the full set of non-terminal work.
    const pendingTasks = sprint.tasks
      .filter(t => t.status === TaskStatus.PENDING)
      .map(t => t.id);

    const activeWorkers: WorkerState[] = sprint.tasks
      .filter(t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED)
      .map(t => ({
        workerId: `w-${t.id}`,
        taskId: t.id,
        status: 'EXECUTING' as const,
        spawnedAt: new Date().toISOString(),
      }));

    const checkpoint: SprintCheckpoint = {
      sprintId: sprint.id,
      checkpointNumber,
      timestamp: new Date().toISOString(),
      completedTasks,
      pendingTasks,
      activeWorkers,
      brainPhase: sprint.phase,
      eventStreamOffset,
    };

    // Task 030: embed serialized dep graph if provided
    if (graph) {
      checkpoint.depGraph = serializeDependencyGraph(graph, sprint.id);
      // Also persist separate JSON + Mermaid files for human inspection
      persistDependencyGraph(projectRoot, sprint.id, graph);
    }

    // Atomic write: tmp → rename. Cleans up tmp on rename failure.
    const filePath = checkpointPath(projectRoot, sprint.id);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    try {
      renameSync(tmpPath, filePath);
    } catch (renameErr) {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
      throw renameErr;
    }
    debugLog('sprint-checkpoint:write', `Checkpoint #${checkpointNumber} written for ${sprint.id}`);
    return checkpoint;
  } catch (e) {
    // Fail-safe: never crash sprint due to checkpoint I/O
    debugLog('sprint-checkpoint:write:error', e);
    return null;
  }
}

/**
 * Read the latest checkpoint for a sprint.
 * Returns null if no checkpoint exists or if the file is malformed.
 */
export function readCheckpoint(
  projectRoot: string,
  sprintId: string,
): SprintCheckpoint | null {
  const filePath = checkpointPath(projectRoot, sprintId);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as SprintCheckpoint;
    // Basic structural validation
    if (!parsed.sprintId || !parsed.checkpointNumber || !parsed.brainPhase) {
      debugLog('sprint-checkpoint:read', `Malformed checkpoint for ${sprintId}`);
      return null;
    }
    return parsed;
  } catch (e) {
    debugLog('sprint-checkpoint:read:error', e);
    return null;
  }
}

/**
 * Determine which tasks are still pending based on a checkpoint.
 * Used by resume logic to skip already-completed tasks.
 */
export function getResumableTasks(
  checkpoint: SprintCheckpoint,
  allTasks: Task[],
): Task[] {
  const completedSet = new Set(checkpoint.completedTasks);
  return allTasks.filter(t => !completedSet.has(t.id));
}

/**
 * Check if a checkpoint exists for the given sprint.
 */
export function hasCheckpoint(projectRoot: string, sprintId: string): boolean {
  return existsSync(checkpointPath(projectRoot, sprintId));
}

// ─── Dep Graph Resume (Task 030) ─────────────────────────────────────

/**
 * Restore a DependencyGraph from a checkpoint.
 *
 * Priority order:
 * 1. Embedded `checkpoint.depGraph` — fastest, no extra I/O
 * 2. Separate `.deckent/sprint-NNN-depgraph.json` file — fallback
 * 3. `null` — caller must rebuild graph from tasks
 *
 * @param projectRoot - Project root directory
 * @param checkpoint - Sprint checkpoint containing optional embedded graph
 * @returns Restored DependencyGraph, or null if not available
 */
export function restoreDepGraph(
  projectRoot: string,
  checkpoint: SprintCheckpoint,
): DependencyGraph | null {
  // Priority 1: use embedded graph from checkpoint
  if (checkpoint.depGraph) {
    try {
      const graph = deserializeDependencyGraph(checkpoint.depGraph);
      debugLog('sprint-checkpoint:restoreDepGraph', `Restored from embedded checkpoint #${checkpoint.checkpointNumber}`);
      return graph;
    } catch (e) {
      debugLog('sprint-checkpoint:restoreDepGraph:warn', `Embedded graph malformed, trying file fallback: ${String(e)}`);
    }
  }

  // Priority 2: load from separate depgraph.json file
  const graph = loadDependencyGraph(projectRoot, checkpoint.sprintId);
  if (graph) {
    debugLog('sprint-checkpoint:restoreDepGraph', `Restored from depgraph.json for ${checkpoint.sprintId}`);
    return graph;
  }

  // Priority 3: caller must rebuild
  debugLog('sprint-checkpoint:restoreDepGraph', `No graph available for ${checkpoint.sprintId} — caller must rebuild`);
  return null;
}

// Re-export persistence utilities so callers don't need to import dependency-scheduler directly
export { persistDependencyGraph, loadDependencyGraph } from './dependency-scheduler.js';

// ─── Stale Heartbeat Detection ──────────────────────────────────────

/** Default stale threshold: 5 minutes in ms */
export const STALE_HEARTBEAT_THRESHOLD_MS = 5 * 60 * 1000;

/** Result of stale heartbeat check for a single worker. */
export interface StaleWorkerInfo {
  workerId: string;
  taskId: string;
  lastHeartbeat: string | null;
  ageMs: number;
  reason: 'no_heartbeat' | 'stale' | 'missing_file';
}

/**
 * Read a heartbeat file and return parsed content.
 * Returns null if file is missing or malformed.
 */
export function readHeartbeat(
  projectRoot: string,
  taskId: string,
): Heartbeat | null {
  const hbPath = join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
  if (!existsSync(hbPath)) return null;
  try {
    const raw = readFileSync(hbPath, 'utf-8');
    return JSON.parse(raw) as Heartbeat;
  } catch {
    return null;
  }
}

/**
 * Check if a heartbeat is stale (timestamp older than thresholdMs from now).
 */
export function isStaleHeartbeat(
  hb: Heartbeat | null,
  thresholdMs: number = STALE_HEARTBEAT_THRESHOLD_MS,
  nowMs: number = Date.now(),
): boolean {
  if (!hb) return true;
  const hbTime = new Date(hb.timestamp).getTime();
  if (Number.isNaN(hbTime)) return true;
  return (nowMs - hbTime) > thresholdMs;
}

/**
 * Detect stale workers from a checkpoint's activeWorkers list.
 * Checks each active worker's heartbeat file — if missing or older than
 * thresholdMs, the worker is considered stale and should be respawned.
 *
 * @returns Array of stale worker info (empty if all workers are fresh)
 */
export function detectStaleWorkers(
  projectRoot: string,
  checkpoint: SprintCheckpoint,
  thresholdMs: number = STALE_HEARTBEAT_THRESHOLD_MS,
  nowMs: number = Date.now(),
): StaleWorkerInfo[] {
  const stale: StaleWorkerInfo[] = [];

  for (const worker of checkpoint.activeWorkers) {
    const hb = readHeartbeat(projectRoot, worker.taskId);

    if (!hb) {
      stale.push({
        workerId: worker.workerId,
        taskId: worker.taskId,
        lastHeartbeat: null,
        ageMs: nowMs - new Date(worker.spawnedAt).getTime(),
        reason: 'missing_file',
      });
      continue;
    }

    if (isStaleHeartbeat(hb, thresholdMs, nowMs)) {
      const hbTime = new Date(hb.timestamp).getTime();
      stale.push({
        workerId: worker.workerId,
        taskId: worker.taskId,
        lastHeartbeat: hb.timestamp,
        ageMs: Number.isNaN(hbTime) ? Infinity : nowMs - hbTime,
        reason: 'stale',
      });
    }
  }

  return stale;
}

/**
 * Convenience: write a checkpoint at a phase transition boundary.
 * Wraps writeCheckpoint with phase-specific logging.
 *
 * Sprint 161 T-002: caller no longer has to pass the event stream offset.
 * If `eventStreamOffset` is omitted or 0, the offset is computed from the
 * on-disk events.jsonl (source of truth) so the checkpoint reflects real
 * progress even when callers forget to thread the counter.
 *
 * The `brainPhase` parameter is explicit and authoritative — callers can
 * pass `sprint.phase` for the current transition. It is set on the resulting
 * checkpoint via the temporary phase swap below (avoids requiring writeCheckpoint
 * to learn about an extra parameter for backward compatibility).
 */
export function writePhaseCheckpoint(
  projectRoot: string,
  sprint: Sprint,
  brainPhase: SprintPhase,
  eventStreamOffset?: number,
  graph?: DependencyGraph,
): SprintCheckpoint | null {
  debugLog('sprint-checkpoint:phaseTransition', `Phase ${String(brainPhase)} → writing checkpoint`);

  const offset = (typeof eventStreamOffset === 'number' && eventStreamOffset > 0)
    ? eventStreamOffset
    : computeEventStreamOffset(projectRoot, sprint.id);

  // Reflect the authoritative brainPhase on the sprint object passed to writeCheckpoint
  // without mutating the caller's state permanently.
  const originalPhase = sprint.phase;
  if (brainPhase !== originalPhase) {
    sprint.phase = brainPhase;
  }
  try {
    return writeCheckpoint(projectRoot, sprint, offset, graph);
  } finally {
    if (brainPhase !== originalPhase) {
      sprint.phase = originalPhase;
    }
  }
}

/**
 * Get tasks that need to be respawned on resume.
 * Filters out DONE/NO_GO tasks and identifies tasks that were EXECUTING
 * but whose workers are now stale (need respawn).
 */
export function getTasksForResume(
  checkpoint: SprintCheckpoint,
  allTasks: Task[],
  projectRoot: string,
  thresholdMs: number = STALE_HEARTBEAT_THRESHOLD_MS,
): { pendingTasks: Task[]; staleExecutingTasks: Task[] } {
  const completedSet = new Set(checkpoint.completedTasks);
  const activeTaskIds = new Set(checkpoint.activeWorkers.map(w => w.taskId));

  // Tasks never started
  const pendingTasks = allTasks.filter(
    t => !completedSet.has(t.id) && !activeTaskIds.has(t.id),
  );

  // Tasks that were executing but worker is now stale
  const staleWorkers = detectStaleWorkers(projectRoot, checkpoint, thresholdMs);
  const staleTaskIds = new Set(staleWorkers.map(w => w.taskId));
  const staleExecutingTasks = allTasks.filter(
    t => staleTaskIds.has(t.id) && !completedSet.has(t.id),
  );

  // Check if any "active" worker actually has a .result file now (completed during crash)
  const resultCompletedIds = new Set<string>();
  for (const worker of checkpoint.activeWorkers) {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${worker.taskId}.result`);
    if (existsSync(resultPath)) {
      resultCompletedIds.add(worker.taskId);
    }
  }

  return {
    pendingTasks: pendingTasks.filter(t => !resultCompletedIds.has(t.id)),
    staleExecutingTasks: staleExecutingTasks.filter(t => !resultCompletedIds.has(t.id)),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isTerminalStatus(status: TaskStatus): boolean {
  return (
    status === TaskStatus.DONE ||
    status === TaskStatus.NO_GO
  );
}

// ─── State Recovery on Brain Restart (Sprint 162 — Task T-004) ───────
// Sprint 159 forensic: durationMs:-106 proved startedAt was lost on restart.
// Sprint 160/161 stalled task forensic: stale EXECUTING tasks never reached
// handleEvaluation because runSprint always re-entered PLAN→SPAWN→EXECUTE.
// This helper pairs with T-002 (checkpoint loop) and T-001 (exception
// handler) so a crashed Brain can resume from the latest checkpoint.

/** Action restoreSprintFromCheckpoint recommends to runSprint. */
export type RestoreAction = 'fresh' | 'complete' | 'resume-evaluate';

/** Outcome of a restore attempt. */
export interface RestoreResult {
  /** True if a checkpoint was found and processed. False ⇒ fresh path. */
  restored: boolean;
  /** Recommended next action for the runSprint pipeline. */
  action: RestoreAction;
  /** Reconstructed Sprint object — present only when `restored` is true. */
  restoredSprint?: Sprint;
  /** Stale EXECUTING task IDs that already produced a .result on disk. */
  staleTasksWithResult: string[];
  /** Stale EXECUTING task IDs that had no .result and were marked NO_GO on disk. */
  staleTasksMarkedNoGo: string[];
}

function parseSprintNumber(sprintId: string): number {
  const m = /sprint-(\d+)/.exec(sprintId);
  if (!m) return 0;
  const parsed = parseInt(m[1] ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Restore a sprint from its latest checkpoint after a Brain restart.
 *
 * Flow:
 *   1. Read `.deckent/<sprintId>-checkpoint.json`. Missing → action 'fresh'.
 *   2. Rebuild `sprint.tasks` by reading every task.json referenced in the
 *      checkpoint (completed ∪ pending ∪ activeWorkers).
 *   3. Preserve `startedAt` from `cp.sprintStartedAt ?? cp.timestamp` — Sprint
 *      159 forensic showed restart was clobbering this with the new wall clock,
 *      producing negative durations.
 *   4. Classify activeWorkers:
 *        - `.result` exists → push to `staleTasksWithResult` (EVALUATE can consume it)
 *        - `.result` missing → mark task.json status=NO_GO on disk and push to `staleTasksMarkedNoGo`
 *   5. Decide action:
 *        - No pending tasks AND no active workers → 'complete'
 *        - Otherwise → 'resume-evaluate'
 *   6. Sync `.deckent/sprint-state.json` via writeSprintState so external observers
 *      see the resumed phase immediately.
 *
 * Fail-soft on every I/O step — a malformed task.json or unwritable state file
 * never crashes Brain restart.
 */
export function restoreSprintFromCheckpoint(
  projectRoot: string,
  sprintId: string,
): RestoreResult {
  const cp = readCheckpoint(projectRoot, sprintId);
  if (!cp) {
    return {
      restored: false,
      action: 'fresh',
      staleTasksWithResult: [],
      staleTasksMarkedNoGo: [],
    };
  }

  // Rebuild task list: union of all three task buckets in the checkpoint.
  const taskIds = new Set<string>();
  for (const id of cp.completedTasks ?? []) taskIds.add(id);
  for (const id of cp.pendingTasks ?? []) taskIds.add(id);
  for (const w of cp.activeWorkers ?? []) taskIds.add(w.taskId);

  const tasks: Task[] = [];
  for (const id of taskIds) {
    const taskPath = join(projectRoot, TASKS_DIR, `task-${id}.json`);
    const t = readJsonSafe<Task>(taskPath);
    if (t) tasks.push(t);
  }

  // Sprint 159 forensic: preserve startedAt across restart.
  const startedAt = (cp as SprintCheckpoint & { sprintStartedAt?: string }).sprintStartedAt
    ?? cp.timestamp;

  // Classify active workers against the .result file on disk.
  const staleTasksWithResult: string[] = [];
  const staleTasksMarkedNoGo: string[] = [];

  for (const worker of cp.activeWorkers ?? []) {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${worker.taskId}.result`);
    if (existsSync(resultPath)) {
      staleTasksWithResult.push(worker.taskId);
      continue;
    }
    // No .result — mark task NO_GO on disk so EVALUATE has a deterministic input.
    staleTasksMarkedNoGo.push(worker.taskId);
    const taskPath = join(projectRoot, TASKS_DIR, `task-${worker.taskId}.json`);
    const t = readJsonSafe<Task>(taskPath);
    if (!t) continue;
    t.status = TaskStatus.NO_GO;
    const inMemory = tasks.find(x => x.id === worker.taskId);
    if (inMemory) inMemory.status = TaskStatus.NO_GO;
    try {
      writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8');
    } catch (e) {
      debugLog('restoreSprintFromCheckpoint:writeTask', e);
    }
  }

  const hasActiveWorkers = (cp.activeWorkers ?? []).length > 0;
  const hasPending = (cp.pendingTasks ?? []).length > 0;
  const action: RestoreAction = !hasPending && !hasActiveWorkers
    ? 'complete'
    : 'resume-evaluate';

  const resumedPhase = action === 'complete' ? SprintPhase.COMPLETE : SprintPhase.EVALUATE;
  const resumedStatus = action === 'complete' ? SprintStatus.COMPLETE : SprintStatus.EVALUATING;

  const restoredSprint: Sprint = {
    id: sprintId,
    number: parseSprintNumber(sprintId),
    status: resumedStatus,
    phase: resumedPhase,
    tasks,
    workers: [],
    startedAt,
  };

  // Sync sprint-state.json so observers see the resumed phase.
  try {
    writeSprintState(projectRoot, restoredSprint);
  } catch (e) {
    debugLog('restoreSprintFromCheckpoint:writeSprintState', e);
  }

  return {
    restored: true,
    action,
    restoredSprint,
    staleTasksWithResult,
    staleTasksMarkedNoGo,
  };
}
