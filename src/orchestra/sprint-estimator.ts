// ─── Sprint Time Estimator ─────────────────────────────────────────────────
// Heuristic-based sprint duration estimation using task complexity scoring,
// parallelism factors, and historical sprint data.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../core/types.js';
import { BRAIN_DIR, SPRINTS_DIR, DASHBOARD_FILE } from '../core/constants.js';
import { getModelTier, type ModelTier } from '../core/model-equivalence.js';
import { debugLog } from '../core/utils.js';

// ─── Duration Baselines (minutes) ────────────────────────────────────────────

/**
 * Per-task base duration by registry TIER (minutes), not by alias string. Premium
 * work is slower, economy faster. Resolving a task's model to its tier (see
 * {@link baseMinForModel}) means a canonical id, a legacy alias, and a brand-new
 * model all score off the same tier metadata — never off a hardcoded per-alias number.
 */
const TIER_BASE_MIN: Record<ModelTier, number> = {
  economy: 10,
  standard: 20,
  premium: 30,
  premium_plus: 30,
};

/**
 * Resolve a task's model to its base-duration minutes via the canonical
 * model-equivalence authority. Unknown identities fail loudly instead of
 * acquiring an inferred capability tier at this downstream consumer.
 */
function baseMinForModel(model: string): number {
  const tier = getModelTier(model);
  return TIER_BASE_MIN[tier];
}

/** Effort multiplier */
const EFFORT_MULTIPLIER: Record<string, number> = {
  low: 0.6,
  normal: 1.0,
  high: 1.6,
};

/** Additional time per scope item (directory or file) */
const SCOPE_ITEM_MIN = 2;

/** Maximum number of scope items considered for bonus */
const MAX_SCOPE_ITEMS = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskComplexityScore {
  taskId: string;
  baseMin: number;
  effortMin: number;
  scopeMin: number;
  totalMin: number;
}

export interface SprintEstimate {
  /** Estimated duration in minutes */
  estimatedMin: number;
  /** Individual task complexity scores */
  taskScores: TaskComplexityScore[];
  /** Raw serial total (without parallelism) */
  serialTotalMin: number;
  /** Parallelism factor applied */
  parallelismFactor: number;
  /** Historical average in minutes (0 if no history) */
  historicalAvgMin: number;
  /** Number of historical sprints used */
  historicalSprintCount: number;
  /** Number of workers used in estimation */
  workers: number;
}

// ─── Task Complexity Scoring ──────────────────────────────────────────────────

/**
 * Score a single task's expected duration in minutes.
 * Combines model base time, effort multiplier, and scope size.
 */
export function scoreTaskComplexity(task: Task): TaskComplexityScore {
  const baseMin = baseMinForModel(task.model);
  const multiplier = EFFORT_MULTIPLIER[task.effort] ?? 1.0;
  const effortMin = baseMin * multiplier;

  const scopeItems = Math.min(
    (task.scope.directories?.length ?? 0) +
    (task.scope.filesWrite?.length ?? 0),
    MAX_SCOPE_ITEMS,
  );
  const scopeMin: number = scopeItems * SCOPE_ITEM_MIN;

  const totalMin = effortMin + scopeMin;

  return {
    taskId: task.id,
    baseMin,
    effortMin,
    scopeMin,
    totalMin,
  };
}

// ─── Parallelism Factor ───────────────────────────────────────────────────────

/**
 * Calculate the parallelism factor for the given number of workers.
 * With 1 worker: 1.0 (no parallelism).
 * Each additional worker reduces total time, but with diminishing returns.
 * Factor = 1 / sqrt(workers) clamped to [0.2, 1.0].
 */
export function calculateParallelismFactor(workers: number): number {
  if (workers <= 0) return 1.0;
  if (workers === 1) return 1.0;
  const factor = 1 / Math.sqrt(workers);
  return Math.max(0.2, Math.min(1.0, factor));
}

// ─── Historical Data ──────────────────────────────────────────────────────────

/**
 * Parse sprint duration from a sprint log file (Markdown format).
 * Expects a line like `| Duration | 123456ms |`.
 * Returns duration in minutes, or null if not found.
 */
export function parseSprintDurationFromLog(content: string): number | null {
  const match = content.match(/\|\s*Duration\s*\|\s*(\d+)ms\s*\|/);
  if (!match || !match[1]) return null;
  const ms = parseInt(match[1], 10);
  if (!isFinite(ms) || ms <= 0) return null;
  return ms / 60_000;
}

/**
 * Read the last N sprint durations from .brain/sprints/ directory.
 * Returns an array of durations in minutes (most recent first).
 */
export function readHistoricalDurations(projectRoot: string, limit = 3): number[] {
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return [];

  let files: string[];
  try {
    files = readdirSync(sprintsDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse();
  } catch {
    return [];
  }

  const durations: number[] = [];
  for (const file of files) {
    if (durations.length >= limit) break;
    try {
      const content = readFileSync(join(sprintsDir, file), 'utf-8');
      const min = parseSprintDurationFromLog(content);
      if (min !== null) durations.push(min);
    } catch (e) {
      debugLog('getHistoricalDurations:readFile', e);
    }
  }
  return durations;
}

/**
 * Calculate the average of an array of numbers.
 * Returns 0 for empty arrays.
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ─── Main Estimation Function ─────────────────────────────────────────────────

/**
 * Estimate the sprint duration in minutes.
 *
 * Algorithm:
 * 1. Score each task's complexity → serial total
 * 2. Apply parallelism factor based on worker count
 * 3. Read historical sprint data (last 3 sprints)
 * 4. Blend heuristic estimate with historical average (70/30 split when history available)
 *
 * @param tasks - Array of planned tasks
 * @param workers - Number of parallel workers
 * @param projectRoot - Project root for reading historical data (default: process.cwd())
 * @returns Estimated sprint duration in minutes
 */
export function estimateSprintDuration(
  tasks: Task[],
  workers: number,
  projectRoot = process.cwd(),
): number {
  return estimateSprintFull(tasks, workers, projectRoot).estimatedMin;
}

/**
 * Full estimation with detailed breakdown.
 */
export function estimateSprintFull(
  tasks: Task[],
  workers: number,
  projectRoot = process.cwd(),
): SprintEstimate {
  if (tasks.length === 0) {
    return {
      estimatedMin: 0,
      taskScores: [],
      serialTotalMin: 0,
      parallelismFactor: 1.0,
      historicalAvgMin: 0,
      historicalSprintCount: 0,
      workers,
    };
  }

  // 1. Score each task
  const taskScores = tasks.map((t) => scoreTaskComplexity(t));
  const serialTotalMin = taskScores.reduce((sum, s) => sum + s.totalMin, 0);

  // 2. Apply parallelism factor
  const effectiveWorkers = Math.max(1, workers);
  const parallelismFactor = calculateParallelismFactor(effectiveWorkers);
  const heuristicMin = serialTotalMin * parallelismFactor;

  // 3. Historical data
  const historicalDurations = readHistoricalDurations(projectRoot, 3);
  const historicalAvgMin = average(historicalDurations);
  const historicalSprintCount = historicalDurations.length;

  // 4. Blend: 70% heuristic, 30% historical (only when history available)
  let estimatedMin: number;
  if (historicalSprintCount > 0) {
    estimatedMin = heuristicMin * 0.7 + historicalAvgMin * 0.3;
  } else {
    estimatedMin = heuristicMin;
  }

  // Round to nearest minute, minimum 1
  estimatedMin = Math.max(1, Math.round(estimatedMin));

  return {
    estimatedMin,
    taskScores,
    serialTotalMin,
    parallelismFactor,
    historicalAvgMin,
    historicalSprintCount,
    workers,
  };
}

// ─── Dashboard Integration ────────────────────────────────────────────────────

/**
 * Write the estimated sprint duration to the dashboard JSON file.
 * The estimate is stored as an additional field on the dashboard state.
 * Safe: reads existing dashboard, merges estimate, writes back.
 */
export function writeEstimateToDashboard(
  projectRoot: string,
  estimate: SprintEstimate,
): void {
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  if (!existsSync(dashPath)) return;

  let dashState: Record<string, unknown>;
  try {
    const raw = readFileSync(dashPath, 'utf-8');
    dashState = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  dashState.estimatedDurationMin = estimate.estimatedMin;
  dashState.estimationDetails = {
    serialTotalMin: estimate.serialTotalMin,
    parallelismFactor: estimate.parallelismFactor,
    historicalAvgMin: estimate.historicalAvgMin,
    historicalSprintCount: estimate.historicalSprintCount,
    workers: estimate.workers,
    taskCount: estimate.taskScores.length,
  };

  try {
    writeFileSync(dashPath, JSON.stringify(dashState, null, 2), 'utf-8');
  } catch (e) {
    debugLog('writeDashboardEstimate:writeFile', e);
  }
}
