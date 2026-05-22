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
import { getDebtItems } from './debt-manager.js';
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
    try {
      const raw = readFileSync(join(tasksDir, file), 'utf-8');
      const hb = JSON.parse(raw) as { workerId?: unknown; taskId?: unknown; timestamp?: unknown };
      const workerId = typeof hb.workerId === 'string' ? hb.workerId : null;
      const taskId = typeof hb.taskId === 'string' ? hb.taskId : null;
      if (workerId === null || taskId === null) continue;
      out.push({
        id: workerId,
        taskId,
        lastHeartbeat: typeof hb.timestamp === 'string' ? hb.timestamp : new Date(0).toISOString(),
      });
    } catch {
      // malformed .hb — skip silently
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
