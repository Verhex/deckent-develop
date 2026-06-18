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

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readSprintState } from './sprint-utils.js';
import { getDebtItems } from '../core/debt-store.js';
import type { SprintStateSnapshot } from '../core/nervous-types.js';

type ActiveWorker = { id: string; taskId: string; lastHeartbeat: string };

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
    if (existsSync(join(tasksDir, file.replace(/\.hb$/, '.result')))) continue;
    try {
      const hbPath = join(tasksDir, file);
      const raw = readFileSync(hbPath, 'utf-8');
      const hb = JSON.parse(raw) as { workerId?: unknown; taskId?: unknown };
      const workerId = typeof hb.workerId === 'string' ? hb.workerId : null;
      const taskId = typeof hb.taskId === 'string' ? hb.taskId : null;
      if (workerId === null || taskId === null) continue;
      out.push({
        id: workerId,
        taskId,
        // Bug-1: freshness from the host filesystem mtime (set on every write
        // through the docker bind-mount) — clock-skew-proof. The worker's
        // self-reported in-file `timestamp` is written on the container clock,
        // which can be hours-skewed (observed: midnight) and falsely reads as
        // stale, spamming StaleWorkerDetector → WORKER_RESPAWN for healthy workers.
        lastHeartbeat: new Date(statSync(hbPath).mtimeMs).toISOString(),
      });
    } catch {
      // malformed .hb / stat error — skip silently
    }
  }
  return out;
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
