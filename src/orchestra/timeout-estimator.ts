// ─── Brain Heuristic Timeout Estimator ──────────────────────────────
// Calculates adaptive per-task timeout based on effort, LoC delta,
// scope complexity, sprint history, and backend type.
// Sprint 145 — Task 145-002

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Task } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import type { TimeoutConfig } from '../core/config-types.js';
import { DEFAULT_TIMEOUT_CONFIG } from '../core/config.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../core/constants.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface TimeoutBreakdown {
  base: number;
  locMultiplier: number;
  scopeMultiplier: number;
  historyFactor: number;
  backendFactor: number;
  estimated: number;
  clampedTo: number;
  clampReason: 'min_floor' | 'max_ceiling' | 'within_bounds';
}

/**
 * Sprint history summary used for timeout estimation.
 * Contains average task duration from past sprints.
 */
export interface SprintHistory {
  /** Average task duration in milliseconds across recent sprints. 0 = no data. */
  avgTaskDurationMs: number;
  /** Number of sprints analyzed */
  sprintCount: number;
}

// ─── Sprint History Aggregation (Sprint 319 B-HISTORYSCALE) ─────────

/** Zero-fill SprintHistory — returned when no usable past-sprint data exists. */
const EMPTY_SPRINT_HISTORY: SprintHistory = { avgTaskDurationMs: 0, sprintCount: 0 };

/**
 * Parse `Total Tasks` and `Duration` from a sprint-log markdown body.
 *
 * The sprint log (`.brain/sprints/sprint-NNN.md`, written by the doc-updater /
 * memory-export pipeline) carries a metrics table with rows like:
 *   `| Total Tasks | 4 |`
 *   `| Duration | 1122442ms |`
 *
 * @returns the parsed pair, or null when either row is missing/unparseable.
 */
function parseSprintDurationAndTasks(content: string): { durationMs: number; totalTasks: number } | null {
  const durationMatch = content.match(/\|\s*Duration\s*\|\s*(\d+)\s*ms\s*\|/i);
  const tasksMatch = content.match(/\|\s*Total Tasks\s*\|\s*(\d+)\s*\|/i);
  if (!durationMatch || !tasksMatch) return null;
  const durationMs = parseInt(durationMatch[1]!, 10);
  const totalTasks = parseInt(tasksMatch[1]!, 10);
  if (Number.isNaN(durationMs) || Number.isNaN(totalTasks)) return null;
  return { durationMs, totalTasks };
}

/**
 * Aggregate the average per-task duration from recent sprint logs — the real
 * data source for the `historyFactor` in {@link brainEstimateTimeout}.
 *
 * Reads the last `recentSprintCount` sprint-log markdown files under
 * `.brain/sprints/` and computes the mean per-task wall-clock duration
 * (`sprintDurationMs / totalTasks`) across the sprints that carry usable
 * metrics (both `durationMs > 0` AND `totalTasks > 0`).
 *
 * Sprint 319 B-HISTORYSCALE: replaces the hardcoded `{ avgTaskDurationMs: 0 }`
 * zero-fill that previously pinned `historyFactor` to 1.0 (no learning from
 * past-sprint durations). When no sprint history exists yet (first sprint) or
 * no log carries usable metrics, the zero-fill fallback is returned unchanged —
 * the `historyFactor=1.0` path is preserved and no scaling is fabricated.
 *
 * @param projectRoot - Project root (contains `.brain/sprints/`)
 * @param recentSprintCount - How many of the most-recent sprint logs to average (default 5)
 * @returns Aggregated {@link SprintHistory}, or the zero-fill fallback when no data exists
 */
export function aggregateSprintHistory(
  projectRoot: string,
  recentSprintCount = 5,
): SprintHistory {
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsDir)) return EMPTY_SPRINT_HISTORY;

  let files: string[];
  try {
    files = readdirSync(sprintsDir).filter(f => f.endsWith('.md')).sort();
  } catch {
    return EMPTY_SPRINT_HISTORY;
  }

  // Zero-padded `sprint-NNN.md` sorts lexically into chronological order;
  // take the most-recent N (mirrors readPreviousSprintMetrics' .sort().at(-1)).
  const recent = files.slice(-recentSprintCount);

  let totalAvg = 0;
  let usableSprints = 0;
  for (const file of recent) {
    let content: string;
    try {
      content = readFileSync(join(sprintsDir, file), 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseSprintDurationAndTasks(content);
    if (parsed && parsed.durationMs > 0 && parsed.totalTasks > 0) {
      totalAvg += parsed.durationMs / parsed.totalTasks;
      usableSprints += 1;
    }
  }

  if (usableSprints === 0) return EMPTY_SPRINT_HISTORY;
  return {
    avgTaskDurationMs: Math.round(totalAvg / usableSprints),
    sprintCount: usableSprints,
  };
}

// ─── Backend Factors ────────────────────────────────────────────────

const BACKEND_FACTORS: Record<string, number> = {
  docker: 1.0,
  tmux: 0.9,
  subprocess: 0.8,
};

// ─── LoC Estimation ─────────────────────────────────────────────────

/**
 * Estimate the LoC delta for a task.
 *
 * Heuristic order:
 * 1. Parse description for LoC patterns like "1566 → <400" or "~250 LoC"
 * 2. Fallback: filesWrite count × 200
 */
export function estimateTaskLoC(task: Task): number {
  const desc = task.description ?? '';

  // Pattern 1: "1566 → <400" or "1566 → 400" — interpret as delta
  const arrowMatch = desc.match(/(\d{2,5})\s*→\s*<?(\d{2,5})/);
  if (arrowMatch) {
    const from = parseInt(arrowMatch[1]!, 10);
    const to = parseInt(arrowMatch[2]!, 10);
    return Math.abs(from - to);
  }

  // Pattern 2: "~250 LoC" or "(~250 LoC)" or "+620 LoC"
  const locMatch = desc.match(/[~+]?\s*(\d{2,5})\s*LoC/i);
  if (locMatch) {
    return parseInt(locMatch[1]!, 10);
  }

  // Pattern 3: "+382 LoC" standalone
  const plusMatch = desc.match(/\+(\d{2,5})\s*LoC/i);
  if (plusMatch) {
    return parseInt(plusMatch[1]!, 10);
  }

  // Fallback: filesWrite count × 200
  const filesWriteCount = task.scope?.filesWrite?.length ?? 0;
  return filesWriteCount * 200;
}

// ─── Main Estimator ─────────────────────────────────────────────────

/**
 * Estimate timeout in seconds for a task using heuristic factors.
 *
 * Algorithm:
 * 1. base = effort_base[task.effort]
 * 2. locMultiplier = max(1.0, log10(locDelta/500 + 1) * 0.6)  [if enabled]
 * 3. scopeMultiplier = 1 + (filesWrite > 5 ? (filesWrite - 5) * 0.05 : 0)
 * 4. historyFactor = max(1.0, (histAvg/1000) / base * 1.2)     [if enabled]
 * 5. backendFactor = {docker: 1.0, tmux: 0.9, subprocess: 0.8}
 * 6. estimated = round(base * loc * scope * history * backend)
 * 7. clamp to [min_timeout, max_timeout] per backend
 */
export function brainEstimateTimeout(
  task: Task,
  config: ResolvedConfig,
  history: SprintHistory,
): { timeoutSeconds: number; breakdown: TimeoutBreakdown } {
  const timeoutConfig = config.timeout ?? DEFAULT_TIMEOUT_CONFIG;
  const backend = resolveBackend(config);

  // Step 1: Base by effort
  const effort = task.effort ?? 'normal';
  const base = timeoutConfig.effort_base[effort] ?? timeoutConfig.effort_base.normal;

  // Step 2: LoC multiplier
  let locMultiplier = 1.0;
  if (timeoutConfig.loc_scaling_enabled) {
    const locDelta = estimateTaskLoC(task);
    locMultiplier = Math.max(1.0, Math.log10(locDelta / 500 + 1) * 0.6);
  }

  // Step 3: Scope multiplier
  const filesWriteCount = task.scope?.filesWrite?.length ?? 0;
  const scopeMultiplier = 1 + (filesWriteCount > 5 ? (filesWriteCount - 5) * 0.05 : 0);

  // Step 4: History factor
  let historyFactor = 1.0;
  if (timeoutConfig.history_scaling_enabled && history.avgTaskDurationMs > 0) {
    historyFactor = Math.max(1.0, (history.avgTaskDurationMs / 1000) / base * 1.2);
  }

  // Step 5: Backend factor
  const backendFactor = BACKEND_FACTORS[backend] ?? 1.0;

  // Step 6: Estimate
  const estimated = Math.round(base * locMultiplier * scopeMultiplier * historyFactor * backendFactor);

  // Step 7: Clamp
  const { min, max } = getBackendBounds(backend, timeoutConfig);
  let clampedTo: number;
  let clampReason: TimeoutBreakdown['clampReason'];

  if (estimated < min) {
    clampedTo = min;
    clampReason = 'min_floor';
  } else if (estimated > max) {
    clampedTo = max;
    clampReason = 'max_ceiling';
  } else {
    clampedTo = estimated;
    clampReason = 'within_bounds';
  }

  const breakdown: TimeoutBreakdown = {
    base,
    locMultiplier,
    scopeMultiplier,
    historyFactor,
    backendFactor,
    estimated,
    clampedTo,
    clampReason,
  };

  return { timeoutSeconds: clampedTo, breakdown };
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Resolve the effective spawn backend from config.
 * 'auto' resolves to 'tmux' (default backend).
 */
function resolveBackend(config: ResolvedConfig): string {
  const backend = config.spawn_backend ?? 'auto';
  if (backend === 'auto') return 'tmux';
  return backend;
}

/**
 * Get min/max timeout bounds for a given backend.
 */
function getBackendBounds(backend: string, tc: TimeoutConfig): { min: number; max: number } {
  switch (backend) {
    case 'docker':
      return { min: tc.docker_min_timeout, max: tc.docker_max_timeout };
    case 'tmux':
      return { min: tc.tmux_min_timeout, max: tc.tmux_max_timeout };
    case 'subprocess':
      return { min: tc.subprocess_min_timeout, max: tc.subprocess_max_timeout };
    default:
      return { min: tc.tmux_min_timeout, max: tc.tmux_max_timeout };
  }
}
