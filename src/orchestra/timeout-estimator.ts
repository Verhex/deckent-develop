// ─── Brain Heuristic Timeout Estimator ──────────────────────────────
// Calculates adaptive per-task timeout based on effort, LoC delta,
// scope complexity, sprint history, and backend type.
// Sprint 145 — Task 145-002

import type { Task } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import type { TimeoutConfig } from '../core/config-types.js';
import { DEFAULT_TIMEOUT_CONFIG } from '../core/config.js';

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
