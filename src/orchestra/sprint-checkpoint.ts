// ═══ Sprint Checkpoint ════════════════════════════════════════════════
// Sprint state persistence for long-running sprint resume capability.
// MVP: write/read checkpoint — resume from middle of sprint.
// Sprint 140+ will add mid-worker resume and heartbeat daemon integration.
// Sprint 145+ will add external state store.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { DECKENT_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import type { Sprint, SprintPhase } from '../core/types.js';
import type { Task } from '../core/types.js';
import { TaskStatus } from '../core/types.js';

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
 */
export function writeCheckpoint(
  projectRoot: string,
  sprint: Sprint,
  eventStreamOffset: number,
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

// ─── Helpers ─────────────────────────────────────────────────────────

function isTerminalStatus(status: TaskStatus): boolean {
  return (
    status === TaskStatus.DONE ||
    status === TaskStatus.NO_GO
  );
}
