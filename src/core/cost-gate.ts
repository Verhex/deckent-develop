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
import { readSpendWindow, type CostConfig } from './cost-config-loader.js';
import type { ExecutionBudget } from './work-model.js';

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
  /**
   * Per-request budget from ExecutionRequest.budget (WM-1 contract, ENT-5).
   * When present, `maxUsd` is treated as an additional per-request ceiling —
   * the effective ceiling = min(config sprint_max_usd, budget.maxUsd).
   * Backward-safe: absent → existing behavior using only config sprint budget.
   */
  budget?: ExecutionBudget;
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
  /**
   * Which budget ceiling was tripped.
   * - 'sprint'  — config sprint_max_usd was the binding limit
   * - 'usd'     — per-request budget.maxUsd was the binding limit
   * - 'tokens'  — per-request budget.maxTokens was the binding limit
   */
  ceilingTripped: 'sprint' | 'usd' | 'tokens';
  estimate: SprintCostEstimate;
  /** Convenience: realistic USD cost. */
  estimatedUsd: number;
  /** Convenience: effective USD budget ceiling (sprint or per-request). */
  budgetUsd: number;
  /** Total estimated tokens (present when ceilingTripped === 'tokens'). */
  estimatedTokens?: number;
  /** Per-request token ceiling (present when ceilingTripped === 'tokens'). */
  budgetTokens?: number;
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
  const { tasks, costConfig, acknowledgeCost, estimateOptions, budget } = input;

  const estimate = estimateSprintCost(tasks, costConfig, estimateOptions ?? {});

  const sprintBudgetUsd = estimate.budgetUsd;
  const estimatedUsd = estimate.costRealistic;
  const autoConfirmThresholdUsd =
    costConfig.cost_limits.auto_confirm_below_usd ?? DEFAULT_AUTO_CONFIRM_THRESHOLD_USD;

  // Effective ceiling = min(config sprint budget, per-request budget.maxUsd).
  // When budget is absent, effectiveBudgetUsd === sprintBudgetUsd → backward-safe.
  const requestMaxUsd = budget?.maxUsd;
  const effectiveBudgetUsd =
    requestMaxUsd !== undefined ? Math.min(sprintBudgetUsd, requestMaxUsd) : sprintBudgetUsd;

  const exceedsEffectiveBudget = estimatedUsd > effectiveBudgetUsd;

  // Per-request token ceiling (budget.maxTokens). Mirrors the totalTokens
  // calculation in cost-calculator.ts subscriptionImpact block.
  const requestMaxTokens = budget?.maxTokens;
  const estimatedTotalTokens =
    estimate.totalUncachedInputTokens +
    estimate.totalCacheCreationTokens +
    estimate.totalCacheReadTokens +
    estimate.totalOutputTokens;
  const exceedsTokenBudget =
    requestMaxTokens !== undefined && estimatedTotalTokens > requestMaxTokens;

  // Token ceiling is checked before USD — provides the most specific reason.
  if (exceedsTokenBudget && !acknowledgeCost) {
    return {
      ok: false,
      reason: 'COST_GATE_EXCEEDED',
      ceilingTripped: 'tokens',
      estimate,
      estimatedUsd,
      budgetUsd: effectiveBudgetUsd,
      estimatedTokens: estimatedTotalTokens,
      budgetTokens: requestMaxTokens,
      message:
        `Sprint estimated ${estimatedTotalTokens.toLocaleString()} tokens exceeds per-request token limit ${requestMaxTokens.toLocaleString()}. ` +
        `Raise the request budget.maxTokens or set acknowledgeCost=true (MCP) / --force (CLI).`,
    };
  }

  if (exceedsEffectiveBudget && !acknowledgeCost) {
    const isRequestBudgetBinding =
      requestMaxUsd !== undefined && requestMaxUsd < sprintBudgetUsd;
    const overrideHint = isRequestBudgetBinding
      ? `Raise the request budget.maxUsd or set acknowledgeCost=true (MCP) / --force (CLI).`
      : `Override with acknowledgeCost=true (MCP) / --force (CLI) or raise cost_limits.sprint_max_usd in .deckent/cost-config.json.`;
    const budgetSource = isRequestBudgetBinding ? ` (per-request limit)` : ``;

    return {
      ok: false,
      reason: 'COST_GATE_EXCEEDED',
      ceilingTripped: isRequestBudgetBinding ? 'usd' : 'sprint',
      estimate,
      estimatedUsd,
      budgetUsd: effectiveBudgetUsd,
      message:
        `Sprint cost $${estimatedUsd.toFixed(2)} exceeds budget $${effectiveBudgetUsd.toFixed(2)}${budgetSource}. ` +
        overrideHint,
    };
  }

  const autoConfirm = estimatedUsd <= autoConfirmThresholdUsd;

  return {
    ok: true,
    estimate,
    autoConfirm,
    autoConfirmThresholdUsd,
    overrideApplied: (exceedsEffectiveBudget || exceedsTokenBudget) && acknowledgeCost === true,
  };
}

// ─── Cumulative Spend Gate (warn-only) ─────────────────────────────────────

export interface SpendGateCheckInput {
  /** Spend already logged in the current calendar day (from readSpendWindow). */
  spentDayUsd: number;
  /** Spend already logged in the current calendar month (from readSpendWindow). */
  spentMonthUsd: number;
  /** Sprint cost estimate to be added on top of existing spend. */
  sprintEstimateUsd: number;
  /** Loaded cost config (provides daily_max_usd, monthly_max_usd, enforce_spend_gate). */
  costConfig: CostConfig;
}

export interface CostLimitWarnEvent {
  type: 'BRAIN→USER:COST_LIMIT_WARN';
  /** Which window tripped the threshold. */
  window: 'day' | 'month';
  /** Spend already consumed in the window. */
  spentUsd: number;
  /** Estimated sprint cost that was added to spentUsd. */
  sprintEstimateUsd: number;
  /** Projected total: spentUsd + sprintEstimateUsd. */
  projectedUsd: number;
  /** Configured limit that was exceeded. */
  limitUsd: number;
  /** Human-readable warning message for display/logging. */
  message: string;
}

/**
 * Check cumulative spend gate — warn-only, never blocks.
 *
 * Returns a COST_LIMIT_WARN event when:
 * - cost_limits.enforce_spend_gate is true (default-off) AND
 * - projectedSpend (spentThisWindow + sprintEstimateUsd) exceeds daily_max_usd
 *   or monthly_max_usd.
 *
 * Daily window is evaluated before monthly; the first exceeded window is returned.
 * Returns null when flag is off, both windows are within limits, or monthly_max_usd
 * is unset.
 *
 * Pure function — no I/O. Callers supply pre-read spend values from readSpendWindow().
 */
export function checkSpendGate(input: SpendGateCheckInput): CostLimitWarnEvent | null {
  const { spentDayUsd, spentMonthUsd, sprintEstimateUsd, costConfig } = input;
  const limits = costConfig.cost_limits;

  if (!limits.enforce_spend_gate) return null;

  // Daily window
  const projectedDay = spentDayUsd + sprintEstimateUsd;
  if (projectedDay > limits.daily_max_usd) {
    return {
      type: 'BRAIN→USER:COST_LIMIT_WARN',
      window: 'day',
      spentUsd: spentDayUsd,
      sprintEstimateUsd,
      projectedUsd: projectedDay,
      limitUsd: limits.daily_max_usd,
      message:
        `Projected daily spend $${projectedDay.toFixed(2)} exceeds daily limit ` +
        `$${limits.daily_max_usd.toFixed(2)} (spent $${spentDayUsd.toFixed(2)} + ` +
        `sprint estimate $${sprintEstimateUsd.toFixed(2)}).`,
    };
  }

  // Monthly window (only when limit is configured)
  if (limits.monthly_max_usd !== undefined) {
    const projectedMonth = spentMonthUsd + sprintEstimateUsd;
    if (projectedMonth > limits.monthly_max_usd) {
      return {
        type: 'BRAIN→USER:COST_LIMIT_WARN',
        window: 'month',
        spentUsd: spentMonthUsd,
        sprintEstimateUsd,
        projectedUsd: projectedMonth,
        limitUsd: limits.monthly_max_usd,
        message:
          `Projected monthly spend $${projectedMonth.toFixed(2)} exceeds monthly limit ` +
          `$${limits.monthly_max_usd.toFixed(2)} (spent $${spentMonthUsd.toFixed(2)} + ` +
          `sprint estimate $${sprintEstimateUsd.toFixed(2)}).`,
      };
    }
  }

  return null;
}

// ─── Pre-Spawn Cumulative-Spend Warn-Gate (B6 — warn-only) ─────────────────

export interface SpendWarnAtSpawnInput {
  /** Project root — the resource ledger (spend log) lives under it. */
  root: string;
  /** Loaded cost config (provides daily_max_usd / monthly_max_usd / enforce_spend_gate). */
  costConfig: CostConfig;
  /** This sprint's cost estimate, projected on top of the already-logged spend. */
  sprintEstimateUsd: number;
  /**
   * Spend-window reader override. Defaults to the real `readSpendWindow` over the
   * resource ledger; tests inject a stub so no real resource-log is read. Invoked
   * ONLY when `enforce_spend_gate` is on — the flag-off path does zero I/O.
   * (Mirrors the injectable seam of `emitFinalizeSpendAdvisory`.)
   */
  readSpendWindow?: (root: string, window: 'day' | 'month') => number;
}

/**
 * B6 (DECKENT-TRIAGE-PLAN) — PRE-SPAWN cumulative-spend warn-gate.
 *
 * The pre-spawn cost gate (`evaluateCostGate`) enforces only the per-sprint
 * ESTIMATE against `auto_confirm_below_usd` / `sprint_max_usd`; it never looks
 * at rolling daily/monthly spend (that was only gated at FINALIZE via
 * `emitFinalizeSpendAdvisory`). This helper closes that gap on the spawn path
 * WITHOUT touching the estimate gate: when `enforce_spend_gate` is on
 * (default-off) it projects this sprint's estimate on top of the already-logged
 * day/month spend (read through `readSpendWindow`) and returns a
 * `COST_LIMIT_WARN` when a window limit is breached.
 *
 * WARN-ONLY — never blocks. The HARD pre-spawn block (refuse-unless-acknowledged)
 * is a deliberate post-beta follow-up — see TODO(phase2) at the two call sites.
 *
 * Flag-off short-circuit: when `enforce_spend_gate` is falsy the helper returns
 * null BEFORE the reader is resolved or the ledger is touched — zero I/O, zero
 * side effects, byte-for-byte unchanged spawn behavior. The projection +
 * threshold math is delegated entirely to {@link checkSpendGate} (no re-impl).
 */
export function evaluateSpendWarnAtSpawn(
  input: SpendWarnAtSpawnInput,
): CostLimitWarnEvent | null {
  const { root, costConfig, sprintEstimateUsd } = input;

  // Flag-off (the default) → no ledger read, no event. Short-circuits BEFORE the
  // reader is resolved/called, so the common spawn path is a true no-op.
  if (!costConfig.cost_limits.enforce_spend_gate) return null;

  const readSpend =
    input.readSpendWindow ??
    ((r: string, window: 'day' | 'month'): number => readSpendWindow(r, window));

  return checkSpendGate({
    spentDayUsd: readSpend(root, 'day'),
    spentMonthUsd: readSpend(root, 'month'),
    sprintEstimateUsd,
    costConfig,
  });
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
