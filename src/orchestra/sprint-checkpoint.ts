// ═══ Sprint Checkpoint ════════════════════════════════════════════════
// Sprint state persistence for long-running sprint resume capability.
// MVP: write/read checkpoint — resume from middle of sprint.
// Sprint 139 Task 030: dep graph embedded in checkpoint for resume restore.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.
// Sprint 145+ will add external state store.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import type { Sprint, SprintPhase } from '../core/types.js';
import type { Task } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
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

// ─── Core API ────────────────────────────────────────────────────────

/**
 * Write a checkpoint for the given sprint state.
 * Fail-safe: write errors are logged but do not crash the sprint.
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

    const filePath = checkpointPath(projectRoot, sprint.id);
    writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
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

// ─── Helpers ─────────────────────────────────────────────────────────

function isTerminalStatus(status: TaskStatus): boolean {
  return (
    status === TaskStatus.DONE ||
    status === TaskStatus.NO_GO
  );
}
