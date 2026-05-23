/**
 * Cost Gate — Pre-spawn budget enforcement helper.
 *
 * Shared by CLI (`deckent start`) and MCP (`deckent_start`) to evaluate
 * whether a planned sprint exceeds the configured budget BEFORE workers
 * are spawned. Prevents the Sprint 140 $42 overrun pattern from recurring
 * via the MCP code path (which previously had no cost gate).
 *
 * The helper only evaluates and reports — it never prompts. Interactive
 * confirmation (CLI) and structured errors (MCP) are handled by callers.
 *
 * Sprint 189 Task 189-008 — ADR-022-V2 (CLI/MCP Feature Parity)
 */

import {
  estimateSprintCost,
  type TaskCostInput,
  type SprintCostEstimate,
  type EstimateOptions,
} from './cost-calculator.js';
import type { CostConfig } from './cost-config-loader.js';

// ─── Input / Output Types ───────────────────────────────────────────────────

export interface CostGateInput {
  /** Planned tasks (model, token estimates, effort). */
  tasks: TaskCostInput[];
  /** Loaded cost config (provides pricing + budget + auto_confirm threshold). */
  costConfig: CostConfig;
  /**
   * If true, an over-budget estimate does NOT block — caller has explicitly
   * acknowledged the cost (CLI `--force`, MCP `acknowledgeCost: true`).
   */
  acknowledgeCost?: boolean;
  /** Optional estimate tuning (cache hit ratio, retry multiplier, …). */
  estimateOptions?: EstimateOptions;
}

export interface CostGatePass {
  ok: true;
  /** Full sprint cost estimate (caller may render with formatEstimate). */
  estimate: SprintCostEstimate;
  /** True when realistic cost ≤ auto_confirm_below_usd (no prompt needed). */
  autoConfirm: boolean;
  /** The auto-confirm threshold in USD (resolved from config). */
  autoConfirmThresholdUsd: number;
  /**
   * Set when the gate would have blocked but `acknowledgeCost: true` bypassed
   * the budget check. CLI surfaces this as a warning; MCP includes it in the
   * response so the caller knows the override was applied.
   */
  overrideApplied?: boolean;
}

export interface CostGateExceeded {
  ok: false;
  reason: 'COST_GATE_EXCEEDED';
  estimate: SprintCostEstimate;
  /** Convenience: realistic USD cost. */
  estimatedUsd: number;
  /** Convenience: sprint_max_usd from cost-config. */
  budgetUsd: number;
  /** Human-readable explanation suitable for error messages. */
  message: string;
}

export type CostGateResult = CostGatePass | CostGateExceeded;

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Default auto-confirm threshold when `cost_limits.auto_confirm_below_usd` is
 * not set in the cost config. CLI historically used $2 as the threshold below
 * which a sprint runs without prompting.
 */
export const DEFAULT_AUTO_CONFIRM_THRESHOLD_USD = 2;

// ─── Core Evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate the cost gate for a planned sprint.
 *
 * Behaviour:
 * 1. Compute the sprint cost estimate.
 * 2. If estimate.withinBudget is false AND acknowledgeCost is not set →
 *    return COST_GATE_EXCEEDED.
 * 3. Otherwise return ok=true with autoConfirm flag set when the realistic
 *    cost is ≤ the auto_confirm_below_usd threshold.
 *
 * Pure function — performs no I/O, no prompting, no side effects.
 */
export function evaluateCostGate(input: CostGateInput): CostGateResult {
  const { tasks, costConfig, acknowledgeCost, estimateOptions } = input;

  const estimate = estimateSprintCost(tasks, costConfig, estimateOptions ?? {});

  const budgetUsd = estimate.budgetUsd;
  const estimatedUsd = estimate.costRealistic;
  const autoConfirmThresholdUsd =
    costConfig.cost_limits.auto_confirm_below_usd ?? DEFAULT_AUTO_CONFIRM_THRESHOLD_USD;

  if (!estimate.withinBudget && !acknowledgeCost) {
    return {
      ok: false,
      reason: 'COST_GATE_EXCEEDED',
      estimate,
      estimatedUsd,
      budgetUsd,
      message:
        `Sprint cost $${estimatedUsd.toFixed(2)} exceeds budget $${budgetUsd.toFixed(2)}. ` +
        `Override with acknowledgeCost=true (MCP) / --force (CLI) or raise ` +
        `cost_limits.sprint_max_usd in .deckent/cost-config.json.`,
    };
  }

  const autoConfirm = estimatedUsd <= autoConfirmThresholdUsd;

  return {
    ok: true,
    estimate,
    autoConfirm,
    autoConfirmThresholdUsd,
    overrideApplied: !estimate.withinBudget && acknowledgeCost === true,
  };
}

// ─── Convenience: structured error payload for MCP ──────────────────────────

export interface CostGateErrorPayload {
  error: 'COST_GATE_EXCEEDED';
  estimated: number;
  budget: number;
  override: 'acknowledgeCost' | 'force';
  message: string;
}

/**
 * Convert a `COST_GATE_EXCEEDED` result into a structured payload suitable for
 * an MCP tool response. CLI surfaces the same data via printError + exitCode.
 */
export function buildCostGateErrorPayload(
  result: CostGateExceeded,
  override: 'acknowledgeCost' | 'force' = 'acknowledgeCost',
): CostGateErrorPayload {
  return {
    error: 'COST_GATE_EXCEEDED',
    estimated: result.estimatedUsd,
    budget: result.budgetUsd,
    override,
    message: result.message,
  };
}
