// ═══ Sprint Checkpoint ════════════════════════════════════════════════
// Sprint state persistence for long-running sprint resume capability.
// Durable checkpoint and recovery support for interrupted sprint lifecycles.
// Sprint 139 Task 030: dep graph embedded in checkpoint for resume restore.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR, TASKS_DIR, BRAIN_DIR, RECENT_WORKS_DIR } from '../core/constants.js';
import { debugLog, readJsonSafe } from '../core/utils.js';
import { checkWorkerLiveness } from './worker-liveness.js';
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
// SCHED6-CKPT (docs/analysis/scheduler-unify-design-2026-07-11.md, "Restore
// trigger.kind='restore' ile aynı reducer'a girer") — cascade-skip on restore
// now DECIDES through the same pure `reduceSchedulerTick` the live scheduler
// uses (scheduler-reducer.ts), instead of a separately hand-rolled predicate.
import { reduceSchedulerTick, toSchedulerTaskSnapshot } from './scheduler-reducer.js';
import type { SchedulerSnapshot } from './scheduler-reducer.js';
import type { SerializedDependencyGraph } from './dependency-scheduler.js';
import {
  persistDependencyGraph,
  loadDependencyGraph,
  deserializeDependencyGraph,
  serializeDependencyGraph,
} from './dependency-scheduler.js';
import type { DependencyGraph } from './dependency-scheduler.js';
// TT553 adoption (task 420-001) — the checkpoint kill-path defers to the canonical
// host-primary liveness decision via its single adopter, instead of judging solely
// from the worker's own `.hb` timestamp (the 412-003 wrong-kill).
import { voteWorkerLivenessFromRecord } from './heartbeat-monitor.js';
import {
  readAuthoritativeTaskResult,
  type TaskResultAuthorityRead,
} from './task-result-authority.js';
import {
  readLatestTaskResultSettlementRef,
  readTaskResultSettlementClosure,
} from '../core/task-result-settlement.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import { applyTerminalTaskOutcome } from '../core/task-terminal-outcome.js';
import { DeckentError } from '../core/errors.js';

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
  /** Persisted so terminalization-only recovery preserves test-vs-standard semantics. */
  executionMode?: 'standard' | 'test';
  /** Persisted cleanup policy; absent legacy checkpoints fail safe to retention. */
  skipCleanup?: boolean;
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

/**
 * Build the complete durable task universe for a checkpoint.
 *
 * PLAN-time tasks live in `sprint.tasks`; FIX/XFIX attempts are created later
 * and persisted as `task-*.json`. In-memory tasks remain authoritative for
 * ids they contain and same-sprint dynamic tasks are appended in lexical order
 * so recovery is deterministic on every filesystem.
 */
function collectCheckpointTasks(projectRoot: string, sprint: Sprint): Task[] {
  const tasks = [...sprint.tasks];
  const knownIds = new Set(tasks.map(task => task.id));
  const tasksDir = join(projectRoot, TASKS_DIR);
  let entries: string[];
  try {
    entries = readdirSync(tasksDir).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    debugLog('sprint-checkpoint:collectTasks:readdir', e);
    return tasks;
  }

  for (const entry of entries) {
    if (!entry.startsWith('task-') || !entry.endsWith('.json')) continue;
    const task = readJsonSafe<Task>(join(tasksDir, entry));
    if (!task || task.sprintId !== sprint.id || knownIds.has(task.id)) continue;
    knownIds.add(task.id);
    tasks.push(task);
  }
  return tasks;
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
    const checkpointTasks = collectCheckpointTasks(projectRoot, sprint);

    const completedTasks = checkpointTasks
      .filter(t => isTerminalStatus(t.status))
      .map(t => t.id);

    // Pending: never-started tasks. EXECUTING/CLAIMED tasks are tracked
    // separately in `activeWorkers` so the three sets stay disjoint.
    // Resume logic should union pendingTasks ∪ activeWorkers.taskId to get
    // the full set of non-terminal work.
    const pendingTasks = checkpointTasks
      .filter(t => t.status === TaskStatus.PENDING)
      .map(t => t.id);

    const activeWorkers: WorkerState[] = checkpointTasks
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
      executionMode: sprint.executionMode ?? 'standard',
      skipCleanup: sprint.skipCleanup ?? false,
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
      checkpoint.taskStates = checkpointTasks.map(t => {
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
      // 7094-F1d (2026-08-19): the heartbeat is a SINGLE spawn-time write, so
      // the mtime/timestamp fallback below would brand every healthy docker
      // worker stale after thresholdMs and resume would kill it (the exact
      // 412-003 wrong-kill class this module exists to prevent). When the
      // record-based host signal is unavailable, probe the container itself
      // before trusting a frozen timestamp: a live container is never stale.
      try {
        const probe = checkWorkerLiveness(
          { id: worker.taskId, assignedWorker: worker.workerId } as Task,
          projectRoot,
        );
        if (probe.status === 'alive') continue;
      } catch { /* probe error — fall through to the timestamp fallback */ }
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
): { pendingTasks: Task[]; staleExecutingTasks: Task[]; parkedSettlementTasks: Task[] } {
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

  // Host settlement authority, not raw `.result` existence, decides whether an
  // active worker completed during the crash or must remain parked.
  const resultCompletedIds = new Set<string>();
  const resultParkedIds = new Set<string>();
  for (const worker of checkpoint.activeWorkers) {
    const authority = readResumeTaskResultAuthority(projectRoot, worker.taskId);
    if (authority.state === 'terminal') {
      resultCompletedIds.add(worker.taskId);
    } else if (
      authority.state === 'pending-settlement'
      || authority.state === 'invalid-settlement'
    ) {
      resultParkedIds.add(worker.taskId);
    }
  }

  return {
    pendingTasks: pendingTasks.filter(
      t => !resultCompletedIds.has(t.id) && !resultParkedIds.has(t.id),
    ),
    staleExecutingTasks: staleExecutingTasks.filter(
      t => !resultCompletedIds.has(t.id) && !resultParkedIds.has(t.id),
    ),
    parkedSettlementTasks: allTasks.filter(t => resultParkedIds.has(t.id)),
  };
}

// ─── Durable Interrupted-Worker Reset (455-001, resume CLI surface) ──

export type ResumeTaskResultAuthorityState =
  | 'terminal'
  | 'resumable'
  | 'pending-settlement'
  | 'invalid-settlement';

export interface ResumeTaskResultAuthority {
  state: ResumeTaskResultAuthorityState;
  result: TaskResult | null;
}

const TERMINAL_SELF_ASSESSMENTS = new Set([
  'DONE',
  'GO_WITH_TECH_DEBT',
  'NO_GO',
]);

function isRecoverableNotDispatchedResult(
  projectRoot: string,
  taskId: string,
  result: TaskResult | null,
): boolean {
  if (
    !result
    || result.taskId !== taskId
    || result.workerId !== `docker-recovery-${taskId}`
    || !result.notes.startsWith('DECKENT_E091:coordinator-crashed-before-docker-prepare:')
  ) {
    return false;
  }
  try {
    const ref = readLatestTaskResultSettlementRef(projectRoot, taskId);
    return ref !== null
      && readTaskResultSettlementClosure(ref)?.containerDisposition === 'not-dispatched';
  } catch {
    return false;
  }
}

function archiveNotDispatchedResultProjection(
  projectRoot: string,
  taskId: string,
  result: TaskResult,
): void {
  if (!isRecoverableNotDispatchedResult(projectRoot, taskId, result)) return;
  const source = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  if (!existsSync(source)) return;
  const ref = readLatestTaskResultSettlementRef(projectRoot, taskId);
  if (!ref) {
    throw new DeckentError('E_MISSING_NOT_DISPATCHED_SETTLEMENT_REFERENCE_FOR', `Missing not-dispatched settlement reference for ${taskId}`);
  }
  const archiveDir = join(projectRoot, RECENT_WORKS_DIR, 'recovery-not-dispatched');
  mkdirSync(archiveDir, { recursive: true });
  const safeAttemptId = ref.attemptId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const destination = join(
    archiveDir,
    `${taskId}-${safeAttemptId}.result.json`,
  );
  if (existsSync(destination)) {
    if (readFileSync(destination, 'utf-8') !== readFileSync(source, 'utf-8')) {
      throw new DeckentError('E_CONFLICTING_NOT_DISPATCHED_RECOVERY_ARCHIVE_FOR', `Conflicting not-dispatched recovery archive for ${taskId}`);
    }
    unlinkSync(source);
    return;
  }
  renameSync(source, destination);
}

/**
 * Project one canonical result authority into the resume state machine.
 * A Docker claim makes a closed host receipt mandatory; its absence or invalid
 * terminal payload is parked, never converted into permission to respawn.
 */
export function readResumeTaskResultAuthority(
  projectRoot: string,
  taskId: string,
): ResumeTaskResultAuthority {
  let authority: TaskResultAuthorityRead<TaskResult>;
  try {
    authority = readAuthoritativeTaskResult<TaskResult>(projectRoot, taskId);
  } catch {
    // Corrupt/inconsistent Docker authority is a parked recovery state. It must
    // never degrade to legacy raw-file compatibility or permission to respawn.
    try {
      if (readLatestTaskResultSettlementRef(projectRoot, taskId)) {
        return { state: 'invalid-settlement', result: null };
      }
    } catch {
      return { state: 'invalid-settlement', result: null };
    }
    return { state: 'resumable', result: null };
  }
  if (authority.state === 'pending-settlement') {
    return { state: 'pending-settlement', result: null };
  }
  const result = authority.result;
  const terminal = result?.taskId === taskId
    && TERMINAL_SELF_ASSESSMENTS.has(String(result.selfAssessment));
  if (terminal && isRecoverableNotDispatchedResult(projectRoot, taskId, result)) {
    return { state: 'resumable', result };
  }
  if (terminal) return { state: 'terminal', result };
  if (authority.state === 'settled') {
    return { state: 'invalid-settlement', result: null };
  }
  return { state: 'resumable', result: null };
}

function requireRestorableTaskResultAuthority(
  projectRoot: string,
  taskId: string,
  context: 'active-worker' | 'cascade-skip',
): ResumeTaskResultAuthority {
  const authority = readResumeTaskResultAuthority(projectRoot, taskId);
  if (
    authority.state === 'pending-settlement'
    || authority.state === 'invalid-settlement'
  ) {
    throw createExecutionAuthorityError(
      `Checkpoint restore HOLD for task ${taskId}: ${context} result authority is ${authority.state}`,
    );
  }
  return authority;
}

/**
 * Durable-evidence check: does a task carry a VALID terminal `.result` on disk?
 * A `.result` that exists, parses, and carries one of the canonical terminal
 * self-assessments is treated as a genuine terminal outcome. In particular,
 * timeout/partial-work markers are NOT terminal and remain resumable. Used by
 * the resume CLI to decide
 * which interrupted active workers are truly complete (never respawn) vs. those
 * that crashed mid-flight (reset to PENDING).
 */
export function hasValidResult(projectRoot: string, taskId: string): boolean {
  return readResumeTaskResultAuthority(projectRoot, taskId).state === 'terminal';
}

export interface ResumeDisposition {
  resumableIds: string[];
  parkedSettlements: Array<{
    taskId: string;
    state: 'pending-settlement' | 'invalid-settlement';
  }>;
}

/**
 * Derive the exact set of UNFINISHED task IDs a resume must cover, from durable
 * on-disk evidence alone — the single source of truth shared by `deckent resume
 * --dry-run` (report-only) and the real resume (report + respawn), so the two
 * can never disagree on which tasks are resumable.
 *
 * Resumable = `pendingTasks` (never-started) ∪ activeWorkers WITHOUT a valid
 * terminal `.result` (crashed mid-flight). Active workers that DID write a valid
 * `.result` before the crash are complete and excluded — never respawned, no
 * duplicate execution. Order is deterministic: pending (checkpoint order) first,
 * then interrupted active workers; deduped.
 */
export function deriveResumableTaskIds(
  projectRoot: string,
  checkpoint: Pick<SprintCheckpoint, 'pendingTasks' | 'activeWorkers' | 'taskStates'>
    & Partial<Pick<SprintCheckpoint, 'sprintId'>>,
): string[] {
  return deriveResumeDisposition(projectRoot, checkpoint).resumableIds;
}

export function deriveResumeDisposition(
  projectRoot: string,
  checkpoint: Pick<SprintCheckpoint, 'pendingTasks' | 'activeWorkers' | 'taskStates'>
    & Partial<Pick<SprintCheckpoint, 'sprintId'>>,
): ResumeDisposition {
  const ids: string[] = [];
  const parkedSettlements: ResumeDisposition['parkedSettlements'] = [];
  const seen = new Set<string>();
  const consider = (id: string, checkpointProvesResumable = false): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const authority = readResumeTaskResultAuthority(projectRoot, id);
    if (authority.state === 'terminal') return;
    if (
      authority.state === 'pending-settlement'
      || authority.state === 'invalid-settlement'
    ) {
      parkedSettlements.push({ taskId: id, state: authority.state });
      return;
    }
    const task = readJsonSafe<Task>(join(projectRoot, TASKS_DIR, `task-${id}.json`));
    if (!task) return;
    const resumableStatus = task.status === TaskStatus.DRAFT
      || task.status === TaskStatus.PENDING
      || task.status === TaskStatus.CLAIMED
      || task.status === TaskStatus.EXECUTING
      || (task.status === TaskStatus.PAUSED
        && (checkpointProvesResumable
          || existsSync(join(projectRoot, TASKS_DIR, `task-${id}.paused`))));
    if (resumableStatus) ids.push(id);
  };

  const staleActiveIds = new Set(
    detectStaleWorkers(projectRoot, checkpoint as SprintCheckpoint).map(worker => worker.taskId),
  );
  const pendingIds = new Set(checkpoint.pendingTasks ?? []);
  if (checkpoint.taskStates && checkpoint.taskStates.length > 0) {
    for (const state of checkpoint.taskStates) {
      if (pendingIds.has(state.id) || staleActiveIds.has(state.id)) {
        consider(
          state.id,
          pendingIds.has(state.id)
            || staleActiveIds.has(state.id),
        );
      }
    }
  } else {
    for (const id of checkpoint.pendingTasks ?? []) consider(id, true);
    for (const worker of checkpoint.activeWorkers ?? []) {
      if (staleActiveIds.has(worker.taskId)) consider(worker.taskId, true);
    }
  }

  // Dynamic FIX/XFIX tasks can post-date a checkpoint. Merge only persisted
  // records owned by this sprint before concluding that recovery has no work.
  if (checkpoint.sprintId) {
    const durableTaskIds = new Set<string>();
    supplementLegacyCheckpointTaskIds(projectRoot, checkpoint.sprintId, durableTaskIds);

    // A resume may have just completed the final attempt of a multi-hop FIX
    // lineage while its logical root and downstream tasks still carry the
    // pre-repair NO_GO/PAUSED disk projection. The checkpoint buckets contain
    // no pending work in that state, so a bucket-only resume incorrectly
    // terminalizes instead of continuing the approved DAG. Re-open only
    // markerless PAUSED tasks whose authored dependencies are NOW satisfied by
    // the canonical scheduler lineage projection. Approval/operator pauses
    // (no dependency edge) and still-blocked descendants remain untouched.
    const durableTasks = [...durableTaskIds]
      .map(id => readJsonSafe<Task>(join(projectRoot, TASKS_DIR, `task-${id}.json`)))
      .filter((task): task is Task => task !== null);
    const { satisfyingIds } = computeEffectiveDependencyState(durableTasks, Date.now());
    for (const task of durableTasks) {
      if (
        task.status === TaskStatus.PAUSED
        && (task.dependencies?.length ?? 0) > 0
        && task.dependencies!.every(dependencyId => satisfyingIds.has(dependencyId))
      ) {
        consider(task.id, true);
      }
    }
    for (const id of durableTaskIds) consider(id);
  }
  return { resumableIds: ids, parkedSettlements };
}

/** Outcome of {@link resetInterruptedWorkersToPending}. */
export interface InterruptedResetResult {
  /** Task IDs reset from an interrupted-active state to PENDING. */
  resetIds: string[];
  /** The (possibly-rewritten) checkpoint reflecting the moved buckets. */
  checkpoint: SprintCheckpoint;
  /** True only when every task reset and the checkpoint commit succeeded. */
  committed: boolean;
  /** Durable reset failure. Callers must abort before spawning when present. */
  error?: string;
}

/**
 * Reset interrupted active workers to PENDING as DURABLE recovery evidence —
 * WITHOUT touching {@link restoreSprintFromCheckpoint}'s NO_GO/MRR classification
 * (that path is pinned by out-of-scope recovery tests and stays byte-identical).
 *
 * For each `activeWorker` in the checkpoint that has NO valid terminal `.result`
 * (via {@link hasValidResult}) and whose persisted `task-*.json` is still in an
 * interrupted-active state (EXECUTING|CLAIMED):
 *   1. flip its `task.json` status → PENDING (atomic tmp+rename), and
 *   2. move its id from `activeWorkers` → `pendingTasks` (appended, preserving
 *      the existing pending order) and set its v2 `taskStates` entry → PENDING.
 * The rewritten checkpoint is persisted atomically (tmp → rename) to the same
 * file, reusing writeCheckpoint's crash-safe pattern.
 *
 * Contracts:
 *   - Workers WITH a valid `.result` are left untouched — never respawned, no
 *     duplicate execution.
 *   - PAUSED tasks / `.paused` markers are preserved (skipped); restore's
 *     born-562 unpause owns them.
 *   - `completedTasks` and every unrelated field stay byte-identical.
 *   - Fail-soft: a single task's I/O failure skips only that task.
 *
 * NOTE (455-001): this makes the on-disk recovery evidence honest at the resume
 * CLI surface. Actually re-dispatching a reset PENDING task through SPAWN/EXECUTE
 * additionally requires the sprint-controller resume-evaluate path to reach SPAWN
 * (today it jumps to EVALUATE and marks leftover PENDING tasks DEFERRED) — that
 * wiring lives outside this task's write scope.
 */
export function resetInterruptedWorkersToPending(
  projectRoot: string,
  checkpoint: SprintCheckpoint,
  resumableIds: readonly string[] = deriveResumableTaskIds(projectRoot, checkpoint),
): InterruptedResetResult {
  const resetIds: string[] = [];
  const selected = new Set(resumableIds);

  for (const taskId of resumableIds) {
    const authority = readResumeTaskResultAuthority(projectRoot, taskId);
    if (authority.state !== 'resumable') {
      return {
        resetIds,
        checkpoint,
        committed: false,
        error: `Task ${taskId} resume authority changed to ${authority.state} while preparing`,
      };
    }
    if (authority.result) {
      try {
        archiveNotDispatchedResultProjection(projectRoot, taskId, authority.result);
      } catch (e) {
        return {
          resetIds,
          checkpoint,
          committed: false,
          error: `Failed to archive not-dispatched recovery result for ${taskId}: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
    const t = readJsonSafe<Task>(taskPath);
    if (!t) {
      return {
        resetIds,
        checkpoint,
        committed: false,
        error: `Durable task file is missing or unreadable for ${taskId}`,
      };
    }

    t.status = TaskStatus.PENDING;
    delete t.assignedWorker;
    try {
      const tmp = `${taskPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(t, null, 2), 'utf-8');
      renameSync(tmp, taskPath);
    } catch (e) {
      debugLog('resetInterruptedWorkersToPending:writeTask', e);
      return {
        resetIds,
        checkpoint,
        committed: false,
        error: `Failed to persist PENDING state for ${taskId}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    resetIds.push(taskId);
  }

  if (resetIds.length === 0) return { resetIds, checkpoint, committed: true };

  const existingPending = checkpoint.pendingTasks ?? [];
  const updated: SprintCheckpoint = {
    ...checkpoint,
    pendingTasks: [
      ...existingPending.filter(id => !selected.has(id)),
      ...resetIds.filter(id => !existingPending.includes(id)),
    ],
    activeWorkers: (checkpoint.activeWorkers ?? []).filter(w => !selected.has(w.taskId)),
  };
  if (updated.taskStates) {
    updated.taskStates = updated.taskStates.map(s =>
      selected.has(s.id) ? { ...s, status: TaskStatus.PENDING } : s,
    );
  }
  if (updated.remainingQueue) {
    updated.remainingQueue = [
      ...updated.remainingQueue.filter(id => !selected.has(id)),
      ...resetIds,
    ];
  }

  // Persist the rewritten checkpoint atomically (tmp → rename), same crash-safe
  // pattern as writeCheckpoint. task.json flips above are already durable; if the
  // checkpoint rewrite fails we still return `updated` so the caller's derived
  // state reflects the reset.
  try {
    const filePath = checkpointPath(projectRoot, checkpoint.sprintId);
    const tmpPath = `${filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(updated, null, 2), 'utf-8');
    try {
      renameSync(tmpPath, filePath);
    } catch (renameErr) {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
      throw renameErr;
    }
  } catch (e) {
    debugLog('resetInterruptedWorkersToPending:writeCheckpoint', e);
    return {
      resetIds,
      checkpoint,
      committed: false,
      error: `Failed to commit resume checkpoint: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  for (const taskId of resetIds) {
    const pausedMarker = join(projectRoot, TASKS_DIR, `task-${taskId}.paused`);
    try { if (existsSync(pausedMarker)) unlinkSync(pausedMarker); } catch (e) {
      debugLog('resetInterruptedWorkersToPending:unlinkPaused', e);
    }
  }

  return { resetIds, checkpoint: updated, committed: true };
}

/**
 * Rebuild a preplanned sprint from the checkpoint's durable task universe.
 * Selected resumable tasks enter PENDING; canonical terminal results remain
 * terminal so the normal SPAWN path cannot execute them a second time.
 */
export function buildPreplannedResumeSprint(
  projectRoot: string,
  checkpoint: SprintCheckpoint,
  resumableIds: readonly string[],
): Sprint {
  const orderedIds = checkpoint.taskStates?.map(state => state.id) ?? [
    ...checkpoint.completedTasks,
    ...checkpoint.pendingTasks,
    ...checkpoint.activeWorkers.map(worker => worker.taskId),
  ];
  const uniqueIds = [...new Set(orderedIds)];
  const resumable = new Set(resumableIds);
  const tasks = uniqueIds.map(taskId => {
    const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
    const task = readJsonSafe<Task>(taskPath);
    if (!task) throw new Error(`Durable task file is missing or unreadable for ${taskId}`);

    if (resumable.has(taskId)) {
      task.status = TaskStatus.PENDING;
      delete task.assignedWorker;
      return task;
    }

    const authority = readResumeTaskResultAuthority(projectRoot, taskId);
    if (
      authority.state === 'pending-settlement'
      || authority.state === 'invalid-settlement'
    ) {
      throw createExecutionAuthorityError(`Task ${taskId} resume authority is ${authority.state}`);
    }
    const result = authority.result as
      | (TaskResult & { brainEvaluation?: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' })
      | null;
    const terminalVerdict = result?.brainEvaluation ?? result?.selfAssessment;
    if (terminalVerdict === 'DONE' || terminalVerdict === 'GO_WITH_TECH_DEBT') {
      task.status = TaskStatus.DONE;
    } else if (terminalVerdict === 'NO_GO') {
      task.status = TaskStatus.NO_GO;
    }
    return task;
  });
  const sprintNumber = Number.parseInt(checkpoint.sprintId.replace(/^sprint-/, ''), 10);
  if (!Number.isSafeInteger(sprintNumber)) {
    throw new Error(`Invalid checkpoint sprint id: ${checkpoint.sprintId}`);
  }
  return {
    id: checkpoint.sprintId,
    number: sprintNumber,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks,
    workers: [],
    startedAt: checkpoint.timestamp,
    executionMode: checkpoint.executionMode,
    skipCleanup: checkpoint.skipCleanup,
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
  /** Legacy compatibility field; absent-result workers are now restored as PENDING. */
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
 * restore-side counterpart of `cascadeSkipDeadBlocked` (result-collector.ts),
 * which never runs on the resume path because `sprint-controller.ts` jumps
 * straight past PLAN/SPAWN/EXECUTE to EVALUATE.
 *
 * SCHED6-CKPT (docs/analysis/scheduler-unify-design-2026-07-11.md, "Restore
 * trigger.kind='restore' ile aynı reducer'a girer"): the DECISION of which
 * tasks to cascade-skip is now made by `reduceSchedulerTick` (scheduler-
 * reducer.ts) — the exact same pure reducer the live scheduler uses — instead
 * of a separately hand-rolled predicate, so the born-610 terminal-failure
 * vocabulary and the transitive-closure logic can never drift between the two
 * call sites again. `slotBudget: 0` + `completedTaskIds: []` make "spawn
 * sıfır" a STRUCTURAL property of the resulting decision (the reducer's own
 * spawn-selection code cannot mathematically emit a SpawnTask/KillWorker
 * effect from this snapshot), not merely an omission in this function.
 * `trigger.kind` stays `'watcher'` — `SchedulerTriggerKind` has no `'restore'`
 * literal yet (widening it lives in scheduler-reducer.ts, outside this file's
 * write scope); the reducer's own doc comment confirms its cascade-skip pass
 * is not kind-gated, so this is a documented stand-in, not a semantic gap.
 *
 * `reduceSchedulerTick`'s own internal cascade-skip pass already resolves the
 * FULL transitive closure in one call (a freshly-decided skip is folded into
 * its own `failedIds` set for the next inner pass) — no outer while-loop is
 * needed here anymore.
 *
 * Effect application mirrors `executeSchedulerDecision`'s (scheduler-
 * effects.ts, SCHED6-EFF) CascadeSkip branch inline: atomic tmp-write+rename
 * persist of the synthetic `cascadeSkipped:true` NO_GO `TaskResult` FIRST,
 * then commit (`status → NO_GO` + task.json persist) if-and-only-if the task
 * is still PENDING. That executor is `async`; every caller of
 * `restoreSprintFromCheckpoint` (sprint-controller.ts, resume.ts) invokes it
 * synchronously, so it cannot be called directly here — this replays its
 * persist-before-commit contract instead of duplicating a divergent one. This
 * also fixes a latent gap in the previous restore-local implementation: it
 * unconditionally skipped a PENDING task whose `.result` already existed
 * (crash between a prior persist and its status commit), leaving that task
 * PENDING forever; the commit-if-still-PENDING check below finishes that
 * interrupted commit instead.
 *
 * @returns IDs of tasks cascade-skipped (committed to NO_GO) during this call.
 */
function cascadeSkipPendingDescendants(
  projectRoot: string,
  tasks: Task[],
): string[] {
  const nowMs = Date.now();
  const taskById = new Map(tasks.map(t => [t.id, t]));

  const snapshot: SchedulerSnapshot = {
    trigger: { kind: 'watcher', sequence: 0 },
    strategy: 'continuous',
    nowMs,
    costStop: false,
    // Structural "spawn sıfır": zero slots means reduceSchedulerTick's own
    // spawn-selection loops can never emit a SpawnTask effect from this
    // snapshot, and an empty completedTaskIds means the legacy-fifo
    // completion loop (the only source of KillWorker effects) never runs.
    slotBudget: 0,
    orderedQueue: [],
    tasks: tasks.map(toSchedulerTaskSnapshot),
    assignedTaskIds: new Set(),
    // Restore has no live in-tick "already decided this tick" bookkeeping to
    // protect against (that in-memory state is exactly what a crash lost) —
    // the disk-existence check in the persist step below is the idempotency
    // guard instead, and it correctly finishes an interrupted commit rather
    // than excluding the task from being re-decided.
    collectedIds: new Set(),
    completedTaskIds: [],
    dependencyPipelineEnabled: true,
    effectiveDependencyState: computeEffectiveDependencyState(tasks, nowMs),
    collisionBlockedIds: new Set(),
  };

  const decision = reduceSchedulerTick(snapshot);
  const skipped: string[] = [];

  for (const effect of decision.orderedEffects) {
    if (effect.kind === 'SpawnTask' || effect.kind === 'KillWorker') {
      // Structurally unreachable given slotBudget=0 / completedTaskIds=[]
      // above — logged (never executed) so a future reducer change that
      // breaks this invariant is visible instead of silently spawning.
      debugLog(
        'restoreSprintFromCheckpoint:cascadeSkip:unexpectedSpawnEffect',
        `reducer emitted ${effect.kind} for ${effect.taskId} during restore — skipped, never executed`,
      );
      continue;
    }
    if (effect.kind !== 'CascadeSkip') continue; // Blocked/ClearBlocked/EmitMetric/WriteCheckpoint — no-ops on restore

    const t = taskById.get(effect.taskId);
    if (!t) continue; // defensive — every effect taskId originates from `tasks` itself

    const resultPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
    const resultAuthority = requireRestorableTaskResultAuthority(
      projectRoot,
      t.id,
      'cascade-skip',
    );
    if (resultAuthority.state === 'resumable') {
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
          `Cascade-skipped on checkpoint restore (SCHED6-CKPT reducer-parity — decided by the ` +
          `same reduceSchedulerTick pass the live scheduler uses): dependency ` +
          `${effect.failedDependencyId} ended NO_GO/MANUAL_REVIEW_REQUIRED, so this dependent was ` +
          `never (re-)dispatched. Re-run after the dependency is fixed.`,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          provider: t.provider,
          model: t.forceModel ?? t.model,
        },
      };
      try {
        const tmpPath = `${resultPath}.tmp`;
        writeFileSync(tmpPath, JSON.stringify(skip, null, 2), 'utf-8');
        renameSync(tmpPath, resultPath);
      } catch (e) {
        debugLog('restoreSprintFromCheckpoint:cascadeSkip:persist', `${effect.idempotencyKey}: ${String(e)}`);
        continue; // persist failed — task stays PENDING, retried next restore with the same idempotencyKey
      }
    }

    if (t.status === TaskStatus.PENDING) {
      t.status = TaskStatus.NO_GO;
      const taskPath = join(projectRoot, TASKS_DIR, `task-${t.id}.json`);
      try {
        writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8');
      } catch (e) {
        debugLog('restoreSprintFromCheckpoint:cascadeSkip:writeTask', e);
      }
      skipped.push(t.id);
      debugLog(
        'restoreSprintFromCheckpoint:cascadeSkip',
        `task ${t.id} skipped on restore (dep ${effect.failedDependencyId} failed, idempotencyKey=${effect.idempotencyKey})`,
      );
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
 *        - terminal result authority → push to `staleTasksWithResult`
 *        - terminal result absent → persist task.json status=PENDING; never synthesize a verdict
 *   5. Cascade-skip (`cascadeSkipPendingDescendants`): every PENDING task
 *      transitively depending on a NO_GO/MANUAL_REVIEW_REQUIRED task — old or
 *      freshly classified in step 4 — gets a synthetic `cascadeSkipped:true`
 *      NO_GO `.result` written, since the resume path never runs the live
 *      `cascadeSkipDeadBlocked` closure (it skips PLAN/SPAWN/EXECUTE).
 *   6. Decide action:
 *        - every durable task has terminal status AND terminal result authority → 'complete'
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
  }
  // Dynamic FIX/XFIX attempts may be newer than either checkpoint schema.
  supplementLegacyCheckpointTaskIds(projectRoot, sprintId, taskIds);

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
    const checkpointProvesUnfinished = (cp.pendingTasks ?? []).includes(id)
      || (cp.activeWorkers ?? []).some(worker => worker.taskId === id);
    if (
      t.status === TaskStatus.PAUSED
      && (checkpointProvesUnfinished || existsSync(pausedMarker))
    ) {
      t.status = TaskStatus.PENDING;
      try { writeFileSync(taskPath, JSON.stringify(t, null, 2), 'utf-8'); }
      catch (e) { debugLog('restoreSprintFromCheckpoint:unpause', e); }
      try { unlinkSync(pausedMarker); }
      catch (e) { debugLog('restoreSprintFromCheckpoint:unlinkPaused', e); }
    }
    tasks.push(t);
  }

  // Reconcile every task — not only checkpoint.activeWorkers — against the
  // authoritative terminal result after backend settlement recovery. A crash
  // can leave checkpoint buckets stale while a host-owned settlement is already
  // closed; syncing before cascade prevents both duplicate spawn and stranded
  // descendants. Pending/corrupt settlement remains a typed HOLD.
  for (const task of tasks) {
    const authority = requireRestorableTaskResultAuthority(
      projectRoot,
      task.id,
      'active-worker',
    );
    if (authority.state !== 'terminal' || !authority.result) continue;
    // Legacy raw results retain their existing restore/cascade semantics. This
    // eager projection is specifically for a host-owned settlement that closed
    // after the checkpoint snapshot became stale.
    if (!readLatestTaskResultSettlementRef(projectRoot, task.id)) continue;
    if (!applyTerminalTaskOutcome(task, authority.result)) continue;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) {
      debugLog('restoreSprintFromCheckpoint:terminalOutcomePersist', e);
      throw createExecutionAuthorityError(
        `Checkpoint restore HOLD for task ${task.id}: terminal outcome could not be persisted`,
      );
    }
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

  // Classify active workers against the host settlement authority. A raw
  // worker-writable `.result` is terminal only on the legacy non-Docker path;
  // pending/corrupt Docker authority must HOLD recovery. Missing terminal
  // evidence is unfinished work: durably project it back to PENDING rather
  // than manufacturing a terminal result that could enter terminalization.
  const staleTasksWithResult: string[] = [];
  const staleTasksMarkedNoGo: string[] = [];

  for (const worker of cp.activeWorkers ?? []) {
    const resultAuthority = requireRestorableTaskResultAuthority(
      projectRoot,
      worker.taskId,
      'active-worker',
    );
    if (resultAuthority.state === 'terminal') {
      staleTasksWithResult.push(worker.taskId);
      continue;
    }
    // No terminal result — preserve this task as resumable work. Checkpoint
    // activeWorkers is durable interrupted-work authority even when a failed
    // run left a PAUSED/EXECUTING projection in task.json.
    const taskPath = join(projectRoot, TASKS_DIR, `task-${worker.taskId}.json`);
    const t = readJsonSafe<Task>(taskPath);
    if (!t) {
      continue;
    }
    t.status = TaskStatus.PENDING;
    delete t.assignedWorker;
    const inMemory = tasks.find(x => x.id === worker.taskId);
    if (inMemory) {
      inMemory.status = TaskStatus.PENDING;
      delete inMemory.assignedWorker;
    }
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

  // Terminalization is allowed only when the complete durable task universe
  // has genuine terminal result authority. Empty legacy buckets, a PAUSED disk
  // projection, or a missing task/result must never masquerade as completion.
  // This preserves the existing terminalization-only path for an actually
  // closed checkpoint while keeping unfinished work on the resume path.
  const fullyTerminal = taskIds.size > 0
    && tasks.length === taskIds.size
    && tasks.every(task => {
    if (!isTerminalStatus(task.status)) return false;
    return readResumeTaskResultAuthority(projectRoot, task.id).state === 'terminal';
  });
  const action: RestoreAction = fullyTerminal ? 'complete' : 'resume-evaluate';

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
