// ═══ Sprint Checkpoint ════════════════════════════════════════════════
// Sprint state persistence for long-running sprint resume capability.
// MVP: write/read checkpoint — resume from middle of sprint.
// Sprint 139 Task 030: dep graph embedded in checkpoint for resume restore.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.
// Sprint 145+ will add external state store.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR, TASKS_DIR, BRAIN_DIR, RECENT_WORKS_DIR } from '../core/constants.js';
import { debugLog, readJsonSafe } from '../core/utils.js';
import type { Sprint } from '../core/types.js';
import { SprintPhase, SprintStatus } from '../core/types.js';
import type { Task } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import type { Heartbeat } from '../core/types.js';
import type { TaskResult } from '../core/types.js';
import { writeSprintState, readSprintState } from './sprint-utils.js';
// SCHED2 checkpoint-v2 (born-634/635 dilim-2) — cascade-skip on restore reuses
// the sprint-411 scheduler-state helper (fix-aggregation-aware terminal-failure
// set) instead of re-deriving the born-610 vocabulary locally.
import { computeEffectiveDependencyState } from './scheduler-state.js';
import type { SerializedDependencyGraph } from './dependency-scheduler.js';
import {
  persistDependencyGraph,
  loadDependencyGraph,
  deserializeDependencyGraph,
  serializeDependencyGraph,
} from './dependency-scheduler.js';
import type { DependencyGraph } from './dependency-scheduler.js';
// Sprint 195 195-001 (W-INTEGRITY) — disk-verify gate before recovery NO_GO.
import { verifyDiskAgainstClaim, DISK_VS_CLAIM_MISMATCH_CHANNEL } from './disk-verify.js';
import { writeEvent } from './event-stream.js';
// TT553 adoption (task 420-001) — the checkpoint kill-path defers to the canonical
// host-primary liveness decision via its single adopter, instead of judging solely
// from the worker's own `.hb` timestamp (the 412-003 wrong-kill).
import { voteWorkerLivenessFromRecord } from './heartbeat-monitor.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Minimal worker state snapshot for resume purposes. */
export interface WorkerState {
  workerId: string;
  taskId: string;
  status: 'EXECUTING' | 'DONE' | 'NO_GO';
  spawnedAt: string;
}

/**
 * v2 (SCHED2 checkpoint-v2, born-634/635 dilim-2): one entry per task in the
 * sprint at checkpoint time — the COMPLETE status snapshot. Unlike
 * completedTasks/pendingTasks/activeWorkers (three DISJOINT buckets that only
 * ever captured DONE|NO_GO / PENDING / EXECUTING|CLAIMED), this includes every
 * status, notably MANUAL_REVIEW_REQUIRED and PAUSED — the statuses that used
 * to fall through all three buckets and vanish on restore.
 */
export interface CheckpointTaskState {
  id: string;
  status: TaskStatus;
  fixForTaskId?: string;
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
  /**
   * v2 schema marker. Absent ⇒ legacy v1 checkpoint (dual-reader path in
   * `restoreSprintFromCheckpoint` applies). Written by default; suppressed
   * when `DECKENT_CHECKPOINT_V1=1` (ACİL-ROLLBACK to the pre-v2 writer shape).
   */
  schemaVersion?: 2;
  /**
   * v2: full ordered per-task status snapshot — sprint.tasks order preserved.
   * The fix for "already-MRR task vanishes on restore"
   * (docs/analysis/scheduler-unify-design-2026-07-11.md, "Checkpoint-restore
   * MRR semantiği"): completedTasks/pendingTasks/activeWorkers above stay
   * unchanged (existing consumers depend on their exact bucket semantics) —
   * this is the additive superset restore now reads from when present.
   */
  taskStates?: CheckpointTaskState[];
  /**
   * v2: ordered PENDING task IDs — a proxy for the live in-memory dispatch
   * queue (`remainingQueue` in result-collector.ts), which this slice does
   * NOT thread through (wiring the actual queue into the checkpoint is
   * born-634/635 dilim-6, out of scope here). Same order as `taskStates`.
   */
  remainingQueue?: string[];
  /**
   * v2: last applied SchedulerDecision sequence number. The reducer/journal
   * (dilim-4+) doesn't exist yet, so this is always 0 in this slice — the
   * field is reserved now so v2 won't need a breaking schema change later.
   * Use `getCheckpointDecisionSeq()` to read with the "absent ⇒ 0" default.
   */
  lastDecisionSeq?: number;
}

/**
 * v2: `lastDecisionSeq` with the "yoksa 0" (absent ⇒ 0) default applied.
 * Always 0 today (no live reducer/journal yet — dilim-4+); exists so future
 * consumers never hand-roll the `?? 0` fallback differently.
 */
export function getCheckpointDecisionSeq(checkpoint: SprintCheckpoint): number {
  return checkpoint.lastDecisionSeq ?? 0;
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
  const filePath = join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
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

    // ─── v2 schema (SCHED2 checkpoint-v2, born-634/635 dilim-2) ─────────
    // ACİL-ROLLBACK: DECKENT_CHECKPOINT_V1=1 reverts the WRITER to the exact
    // pre-v2 shape (no schemaVersion/taskStates/remainingQueue/
    // lastDecisionSeq). The dual-reader in restoreSprintFromCheckpoint always
    // stays on regardless of this env — it must keep reading both shapes.
    if (process.env.DECKENT_CHECKPOINT_V1 !== '1') {
      checkpoint.schemaVersion = 2;
      checkpoint.taskStates = sprint.tasks.map(t => {
        const state: CheckpointTaskState = { id: t.id, status: t.status };
        if (t.fixForTaskId) state.fixForTaskId = t.fixForTaskId;
        return state;
      });
      // Live queue wiring is dilim-6 — this is a best-effort proxy.
      checkpoint.remainingQueue = pendingTasks;
      checkpoint.lastDecisionSeq = 0;
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

// ─── Terminal Cleanup (Sprint 272 272-001 — GHOST-FINALIZE) ──────────

/**
 * Remove all on-disk checkpoint artifacts for a sprint:
 *   - `.deckent/<sprintId>-checkpoint.json`
 *   - `.deckent/<sprintId>-checkpoint.json.tmp` (orphaned atomic-write temp)
 *   - `.deckent/<sprintId>-checkpoint-seq` (monotonic counter)
 *
 * GHOST-FINALIZE fix (Sprint 272 272-001): finalize/cleanup previously left
 * these files behind, so the next `deckent start` read the stale checkpoint
 * and ran a phantom 0/0 "complete" restore for the already-finished sprint —
 * exiting before the new sprint started. Terminal-state code paths
 * (persistFinalSprintState, the restore ghost-finalize guard) now purge them.
 *
 * Idempotent + fail-safe: a missing or locked file never throws.
 */
export function cleanupCheckpointFiles(projectRoot: string, sprintId: string): void {
  const base = checkpointPath(projectRoot, sprintId);
  const targets = [base, `${base}.tmp`, checkpointCounterPath(projectRoot, sprintId)];
  for (const p of targets) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch (e) {
      debugLog('sprint-checkpoint:cleanupCheckpointFiles', e);
    }
  }
}

/**
 * Heuristic: has the given sprint already completed its finalize cycle?
 *
 * A finalized sprint that left a checkpoint behind must never re-trigger the
 * "complete" restore path (the ghost-finalize bug). Signals — any one wins:
 *   1. `.deckent/sprint-state.json` is stamped COMPLETE for this sprint —
 *      written by persistFinalSprintState at the end of finalizeSprint.
 *   2. The sprint-log `.brain/sprints/<sprintId>.md` exists — writeRetrospective
 *      produces it alongside the memory.db `retro` entry, so its presence is
 *      the on-disk mirror of "retro written / sprint finalized".
 *
 * Fail-safe: any read error is treated as "not finalized" (false) so a genuine
 * crash-recovery (sprint-state still ACTIVE/EVALUATING, no sprint-log yet) is
 * never mistaken for a finished sprint and keeps its existing recovery path.
 */
export function isSprintFinalized(projectRoot: string, sprintId: string): boolean {
  // Signal 1: sprint-state.json COMPLETE for THIS sprint
  try {
    const state = readSprintState(projectRoot);
    if (state && state.sprintId === sprintId && state.status === SprintStatus.COMPLETE) {
      return true;
    }
  } catch (e) { debugLog('sprint-checkpoint:isSprintFinalized:state', e); }

  // Signal 2: sprint-log markdown exists (on-disk mirror of memory.db retro)
  try {
    const sprintLogPath = join(projectRoot, BRAIN_DIR, 'sprints', `${sprintId}.md`);
    if (existsSync(sprintLogPath)) return true;
  } catch (e) { debugLog('sprint-checkpoint:isSprintFinalized:log', e); }

  return false;
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

    // TT553 adoption (task 420-001): consult the canonical HOST-PRIMARY decision
    // (via the single `voteWorkerLivenessFromRecord` adopter) BEFORE the local
    // timestamp check. A worker the host reports alive is NOT stale even with a
    // stale/hardcoded `.hb` timestamp (the 412-003 wrong-kill). This module holds
    // no out-of-band liveness cache, so docker/tmux report `host-signal-unavailable`
    // and fall back HONESTLY to the sanctioned `isStaleHeartbeat` mtime behavior;
    // subprocess uses the spawn-free pid (`kill(0)`) + host `.log` signal.
    const vote = voteWorkerLivenessFromRecord(
      {
        taskId: worker.taskId,
        workerId: worker.workerId,
        backend: hb.backend,
        pid: (hb as Heartbeat & { pid?: number }).pid,
      },
      { tasksDir: join(projectRoot, TASKS_DIR), now: () => nowMs },
    );
    if ('alive' in vote && vote.alive) {
      continue; // host signal says alive — suppress the wrong-kill.
    }
    if ('unavailable' in vote) {
      debugLog('sprint-checkpoint:detectStaleWorkers', vote.reason); // honest, not silent
    }
    // Host says dead OR host-signal-unavailable → honest fallback to the
    // pre-existing timestamp staleness check (unchanged behavior).
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
  /**
   * v2 (SCHED2 checkpoint-v2 dilim-2): PENDING task IDs cascade-skipped
   * during THIS restore because a (possibly transitive) dependency resolved
   * to NO_GO/MANUAL_REVIEW_REQUIRED — either already terminal at checkpoint
   * time, or a stale-active worker just classified as such above. Written as
   * synthetic `cascadeSkipped:true` NO_GO results (born-610 fix/xfix
   * muafiyeti applies) — zero workers were ever spawned for them, since the
   * resume path skips PLAN/SPAWN/EXECUTE entirely.
   */
  cascadeSkippedTasks: string[];
}

function parseSprintNumber(sprintId: string): number {
  const m = /sprint-(\d+)/.exec(sprintId);
  if (!m) return 0;
  const parsed = parseInt(m[1] ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * DUAL-READER legacy decoder (SCHED2 checkpoint-v2 dilim-2, item 2): a v1
 * checkpoint's three buckets (completedTasks/pendingTasks/activeWorkers)
 * never recorded a task already in a non-bucketed status (e.g. already
 * MANUAL_REVIEW_REQUIRED or PAUSED) at checkpoint-write time — the exact
 * "vanishes on restore" bug v2's `taskStates` closes going forward. For an
 * OLD checkpoint already on disk, the only remaining source of truth is the
 * sprint's own persisted `task-*.json` records — scan them by `sprintId`
 * match and add any id not already present. Mutates `taskIds` in place.
 * Fail-soft: an unreadable `.tasks/` dir or malformed task file is skipped,
 * never thrown — restore must not crash on a legacy checkpoint.
 */
function supplementLegacyCheckpointTaskIds(
  projectRoot: string,
  sprintId: string,
  taskIds: Set<string>,
): void {
  const tasksDir = join(projectRoot, TASKS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(tasksDir);
  } catch (e) {
    debugLog('restoreSprintFromCheckpoint:legacyDecoder:readdir', e);
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith('task-') || !entry.endsWith('.json')) continue;
    const id = entry.slice('task-'.length, entry.length - '.json'.length);
    if (taskIds.has(id)) continue;
    const t = readJsonSafe<Task>(join(tasksDir, entry));
    if (!t || t.sprintId !== sprintId) continue;
    taskIds.add(id);
    debugLog('restoreSprintFromCheckpoint:legacyDecoder',
      `v1 checkpoint for ${sprintId} was missing task ${id} (status=${t.status}) — recovered from its persisted task-*.json record.`);
  }
}

/**
 * Cascade-skip PENDING descendants of any terminal-failure task in the
 * (already fully reconstructed + stale-worker-classified) task list — the
 * restore-side counterpart of `cascadeSkipDeadBlocked`
 * (result-collector.ts), which never runs on the resume path because
 * `sprint-controller.ts` jumps straight past PLAN/SPAWN/EXECUTE to EVALUATE.
 * Reuses `computeEffectiveDependencyState` (scheduler-state.ts, sprint-411)
 * for the fix-aggregation-aware `terminalFailureIds` set — the born-610
 * single-truth vocabulary, not a locally reinvented predicate. Transitive:
 * a freshly-skipped task can itself unblock the next pass, mirroring
 * `cascadeSkipDeadBlocked`'s while-loop shape.
 *
 * Mutates `tasks` in place (status → NO_GO) and writes both the task.json
 * and a synthetic `cascadeSkipped:true` `.result` to disk — the same shape
 * `cascadeSkipDeadBlocked` writes, so the born-610 fix/xfix exemption
 * (debt-manager.ts) applies identically regardless of which path produced
 * the skip. No spawn call exists anywhere in this function or its caller —
 * "spawn sıfır" is structural here, not a flag to check.
 *
 * @returns IDs of tasks cascade-skipped during this call.
 */
function cascadeSkipPendingDescendants(
  projectRoot: string,
  tasks: Task[],
): string[] {
  const skipped: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    const state = computeEffectiveDependencyState(tasks, Date.now());
    for (const t of tasks) {
      if (t.status !== TaskStatus.PENDING) continue;
      const failedDep = (t.dependencies ?? []).find(d => state.terminalFailureIds.has(d));
      if (!failedDep) continue;

      const resultPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
      if (existsSync(resultPath)) continue; // idempotency guard — already collected elsewhere

      t.status = TaskStatus.NO_GO;
      const taskPath = join(projectRoot, TASKS_DIR, `task-${t.id}.json`);
      try {
        writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8');
      } catch (e) {
        debugLog('restoreSprintFromCheckpoint:cascadeSkip:writeTask', e);
      }

      const skip: TaskResult = {
        taskId: t.id,
        workerId: `w-${t.id}`,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: false,
        coverage: 0,
        selfAssessment: 'NO_GO',
        cascadeSkipped: true, // born-610: fix/xfix kapilari bunu MUAF tutar
        notes:
          `Cascade-skipped on checkpoint restore (SCHED2 checkpoint-v2, dilim-2): dependency ` +
          `${failedDep} ended NO_GO/MANUAL_REVIEW_REQUIRED, so this dependent was never ` +
          `(re-)dispatched. Re-run after the dependency is fixed.`,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          provider: t.provider,
          model: t.forceModel ?? t.model,
        },
      };
      try {
        writeFileSync(resultPath, JSON.stringify(skip, null, 2), 'utf-8');
      } catch (e) {
        debugLog('restoreSprintFromCheckpoint:cascadeSkip:writeResult', e);
      }

      skipped.push(t.id);
      changed = true;
      debugLog('restoreSprintFromCheckpoint:cascadeSkip', `task ${t.id} skipped on restore (dep ${failedDep} failed)`);
    }
  }
  return skipped;
}

/**
 * Restore a sprint from its latest checkpoint after a Brain restart.
 *
 * Flow:
 *   1. Read `.deckent/<sprintId>-checkpoint.json`. Missing → action 'fresh'.
 *   2. Rebuild `sprint.tasks`: v2 checkpoints (`schemaVersion===2`) read the
 *      complete `taskStates` snapshot directly; v1 checkpoints fall back to
 *      the legacy completed∪pending∪activeWorkers union, supplemented from
 *      the sprint's own persisted task-*.json records (DUAL-READER —
 *      `supplementLegacyCheckpointTaskIds`) so an already-MRR/PAUSED task
 *      doesn't vanish just because no v1 bucket ever captured its status.
 *   3. Preserve `startedAt` from `cp.sprintStartedAt ?? cp.timestamp` — Sprint
 *      159 forensic showed restart was clobbering this with the new wall clock,
 *      producing negative durations.
 *   4. Classify activeWorkers:
 *        - `.result` exists → push to `staleTasksWithResult` (EVALUATE can consume it)
 *        - `.result` missing → mark task.json status=NO_GO on disk and push to `staleTasksMarkedNoGo`
 *   5. Cascade-skip (`cascadeSkipPendingDescendants`): every PENDING task
 *      transitively depending on a NO_GO/MANUAL_REVIEW_REQUIRED task — old or
 *      freshly classified in step 4 — gets a synthetic `cascadeSkipped:true`
 *      NO_GO `.result` written, since the resume path never runs the live
 *      `cascadeSkipDeadBlocked` closure (it skips PLAN/SPAWN/EXECUTE).
 *   6. Decide action:
 *        - No pending tasks AND no active workers (per the checkpoint's OWN
 *          buckets — deliberately not re-derived from step 5's outcome, see
 *          the inline comment at the call site) → 'complete'
 *        - Otherwise → 'resume-evaluate'
 *   7. Sync `.deckent/sprint-state.json` via writeSprintState so external observers
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
      cascadeSkippedTasks: [],
    };
  }

  // ─── GHOST-FINALIZE guard (Sprint 272 272-001) ──────────────────────
  // A checkpoint left behind by an ALREADY-finalized sprint must NOT drive a
  // phantom "complete" restore (0/0 tasks — the sprint's task.json files were
  // archived by CLEANUP) that exits before the next sprint even starts. When
  // the sprint is finalized, silently purge the stale checkpoint artifacts and
  // report 'fresh' so the caller plans a brand-new sprint. A genuine
  // crash-before-finalize (sprint-state still ACTIVE, no sprint-log) is NOT
  // finalized, so it falls through to the existing recovery logic below.
  if (isSprintFinalized(projectRoot, sprintId)) {
    cleanupCheckpointFiles(projectRoot, sprintId);
    debugLog('restoreSprintFromCheckpoint:ghostFinalize',
      `Stale checkpoint for already-finalized ${sprintId} purged — proceeding fresh`);
    return {
      restored: false,
      action: 'fresh',
      staleTasksWithResult: [],
      staleTasksMarkedNoGo: [],
      cascadeSkippedTasks: [],
    };
  }

  // ─── Rebuild task-id universe (SCHED2 checkpoint-v2 dilim-2, DUAL-READER) ─
  // v2: `taskStates` is already the complete per-task snapshot (superset of
  // the three legacy buckets), in the correct order — use it directly.
  // v1 (legacy, no schemaVersion): keep the original 3-bucket union, then
  // supplement from the sprint's own persisted task-*.json records — this is
  // exactly the "already-MRR task fell out of every bucket" gap the v2
  // schema closes; v1 checkpoints never recorded it at all, so disk is the
  // only remaining source of truth.
  const taskIds = new Set<string>();
  const isV2 = cp.schemaVersion === 2 && !!cp.taskStates;
  if (isV2) {
    for (const state of cp.taskStates!) taskIds.add(state.id);
  } else {
    for (const id of cp.completedTasks ?? []) taskIds.add(id);
    for (const id of cp.pendingTasks ?? []) taskIds.add(id);
    for (const w of cp.activeWorkers ?? []) taskIds.add(w.taskId);
    supplementLegacyCheckpointTaskIds(projectRoot, sprintId, taskIds);
  }

  const tasks: Task[] = [];
  for (const id of taskIds) {
    const taskPath = join(projectRoot, TASKS_DIR, `task-${id}.json`);
    const t = readJsonSafe<Task>(taskPath);
    if (!t) {
      debugLog('restoreSprintFromCheckpoint:unreadableTask',
        `Checkpoint referenced task ${id} but task-${id}.json is missing/unreadable on disk — dropped from restore.`);
      continue;
    }
    // born-562 — un-pause a circuit-breaker-paused task on resume. The cascade
    // circuit-breaker (sprint-controller PAUSE_SPRINT → pauseSprint) sets
    // status=PAUSED + drops a `.paused` marker AFTER the last phase checkpoint
    // already captured the task in `pendingTasks` (by id). restore reads the
    // task.json verbatim, so it would rebuild the task PAUSED — and spawnWorkers
    // only dispatches PENDING → the task is silently STRANDED on `deckent
    // resume`. Flip it back to PENDING (the marker records it was pending work)
    // and clear the marker so it re-dispatches on the same path as any other
    // pending task. Marker-guarded: a no-op for every task that was never
    // paused, so the common resume path stays byte-identical.
    const pausedMarker = join(projectRoot, TASKS_DIR, `task-${id}.paused`);
    if (t.status === TaskStatus.PAUSED && existsSync(pausedMarker)) {
      t.status = TaskStatus.PENDING;
      try { writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8'); }
      catch (e) { debugLog('restoreSprintFromCheckpoint:unpause', e); }
      try { unlinkSync(pausedMarker); }
      catch (e) { debugLog('restoreSprintFromCheckpoint:unlinkPaused', e); }
    }
    tasks.push(t);
  }

  // DUAL-READER honest-warn: only meaningful for the legacy path — a v2
  // checkpoint's taskStates is already the complete superset by construction.
  if (!isV2) {
    for (const t of tasks) {
      for (const dep of t.dependencies ?? []) {
        if (!taskIds.has(dep)) {
          debugLog('restoreSprintFromCheckpoint:legacyDecoder:missingDependency',
            `Legacy v1 checkpoint restore for ${sprintId}: task ${t.id} depends on ${dep}, which ` +
            `has no persisted task-*.json for this sprint — its status is unknown, so cascade-skip ` +
            `cannot evaluate it.`);
        }
      }
    }
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
    const taskPath = join(projectRoot, TASKS_DIR, `task-${worker.taskId}.json`);
    const t = readJsonSafe<Task>(taskPath);
    if (!t) {
      staleTasksMarkedNoGo.push(worker.taskId);
      continue;
    }
    // Sprint 195 195-001 (W-INTEGRITY) — disk-verify gate: if the worker
    // actually produced code on disk before crashing, demote the NO_GO to
    // MANUAL_REVIEW_REQUIRED instead of silently losing the partial work.
    const dv = verifyDiskAgainstClaim(projectRoot, t.scope);
    if (dv.hasDiskEvidence) {
      t.status = TaskStatus.MANUAL_REVIEW_REQUIRED;
      const inMemory = tasks.find(x => x.id === worker.taskId);
      if (inMemory) inMemory.status = TaskStatus.MANUAL_REVIEW_REQUIRED;
      try {
        writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8');
      } catch (e) {
        debugLog('restoreSprintFromCheckpoint:writeTask', e);
      }
      try {
        writeEvent(
          projectRoot,
          sprintId,
          'brain',
          'auditor',
          DISK_VS_CLAIM_MISMATCH_CHANNEL,
          {
            taskId: worker.taskId,
            linesAdded: dv.linesAdded,
            untrackedFiles: dv.untrackedFiles,
            cause: 'checkpoint-recovery-stale-executing',
            emittedAt: new Date().toISOString(),
          },
        );
      } catch (e) {
        debugLog('restoreSprintFromCheckpoint:diskVerifyEmit', e);
      }
      continue;
    }
    staleTasksMarkedNoGo.push(worker.taskId);
    t.status = TaskStatus.NO_GO;
    const inMemory = tasks.find(x => x.id === worker.taskId);
    if (inMemory) inMemory.status = TaskStatus.NO_GO;
    try {
      writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8');
    } catch (e) {
      debugLog('restoreSprintFromCheckpoint:writeTask', e);
    }
  }

  // ─── Cascade-skip PENDING descendants (SCHED2 checkpoint-v2 dilim-2, item 3) ─
  // Binds restore to the born-610 single-truth vocabulary via the sprint-411
  // scheduler-state helper (computeEffectiveDependencyState) — NOT a
  // reinvented local predicate. Runs AFTER the stale-worker classification
  // above so it sees both (a) tasks already NO_GO/MANUAL_REVIEW_REQUIRED at
  // checkpoint-write time (the live cascadeSkipDeadBlocked closure may not
  // have reached their descendants before the crash) and (b) stale-active
  // workers just converted to NO_GO/MRR — whose descendants NEVER get
  // cascade-skipped by any other path, because the resume path jumps
  // straight to EVALUATE (sprint-controller.ts skips PLAN/SPAWN/EXECUTE
  // entirely — zero workers are spawned here, by construction, not by flag).
  const cascadeSkippedTasks = cascadeSkipPendingDescendants(projectRoot, tasks);

  // Action decision stays anchored to the checkpoint's OWN pendingTasks/
  // activeWorkers buckets (unchanged from pre-v2 behavior) — NOT re-derived
  // from the post-cascade-skip `tasks[]` state. This is deliberately
  // conservative: touching the 'complete' vs 'resume-evaluate' decision is
  // out of this slice's scope (dilim-2 is checkpoint schema + restore
  // cascade-skip, not the resume control-flow itself), and 'complete' short-
  // circuits straight past EVALUATE/FIX — the cascade-skip `.result` files
  // just written above still need that pipeline to run.
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
    cascadeSkippedTasks,
  };
}
