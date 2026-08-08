// ═══ Execution-budget derivation (KN2, GR-2026-08-08-DOGFOOD-KN2-01) ════════
// The owner-approved rule (karar-turu 2026-08-08): a task's REQUESTED execution
// budget anchors on the cost estimator's own per-task numbers × a safety
// headroom, hard-capped by the sprint USD budget. This module is deliberately
// only the REQUEST side of the ledger: authority stays with the owner-authored
// `execution_budget` policy, and `narrowBudget(authority, requested)` inside
// resolveExecutionBudgetPolicy takes the field-wise minimum — a request can
// only ever TIGHTEN what the policy allows, never widen it.
//
// ADR-G-036 (zero-hardcode, parametric-only): this module carries NO numeric
// flow values. Every number — the estimator token defaults, the effort map and
// the headroom factor — is resolved from the cost config, whose single DATA
// source is `pricing-data-baseline.json` (project cost-config overrides it).
// Callers pass `CostConfig.estimator` through; there is no literal fallback.

import type { ExecutionBudget } from './work-model.js';
import type { Task } from './task-types.js';
import type { TaskCostInput } from './cost-calculator.js';
import type { EstimatorDefaults } from './cost-config-loader.js';

/** Build the estimator input for one task from config-resolved defaults —
 *  the CLI cost tables and the planner's budget stamping share this, so the
 *  two can never drift. `billingMode` is layered on by callers that know auth. */
export function buildTaskCostInput(
  task: Pick<Task, 'id' | 'model'> & Partial<Pick<Task, 'effort' | 'estimatedTokens'>>,
  estimator: EstimatorDefaults,
): TaskCostInput {
  const effort = (task.effort ?? 'normal') as keyof EstimatorDefaults['output_tokens_by_effort'];
  return {
    id: task.id,
    model: task.model,
    estimatedInputTokens: task.estimatedTokens ?? estimator.default_input_tokens,
    estimatedOutputTokens:
      estimator.output_tokens_by_effort[effort] ?? estimator.output_tokens_by_effort.normal,
    effort: task.effort as TaskCostInput['effort'],
  };
}

export interface DeriveExecutionBudgetInput {
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  /** Per-task USD estimate; 0 / absent (subscription-billed) derives no maxUsd. */
  readonly estimatedCostUsd?: number;
  /** Sprint-level retry multiplier from the cost estimator (≥1). */
  readonly retryMultiplier?: number;
  /** Absolute USD cap — the sprint budget (cost_limits.sprint_max_usd). */
  readonly sprintMaxUsd?: number;
  /** Config-resolved safety factor (estimator.budget_headroom_factor). */
  readonly headroomFactor: number;
}

/**
 * Derive a task's REQUESTED execution budget from its own estimate.
 *
 * - Token ceilings always derive (subscription-billed work still needs
 *   containment — USD 0 is a billing fact, not a quota verdict).
 * - `maxUsd` derives only from a positive USD estimate, capped by the sprint
 *   budget; a 0-estimate must never manufacture a 0-USD ceiling that would
 *   block the task it is meant to contain.
 */
export function deriveRequestedExecutionBudget(input: DeriveExecutionBudgetInput): ExecutionBudget {
  const retry = input.retryMultiplier !== undefined && input.retryMultiplier >= 1
    ? input.retryMultiplier
    : 1;
  const scale = (n: number): number => Math.ceil(n * retry * input.headroomFactor);

  const maxInputTokens = scale(Math.max(input.estimatedInputTokens, 1));
  const maxOutputTokens = scale(Math.max(input.estimatedOutputTokens, 1));
  // KN5 (measured in the 2026-08-08 re-smoke): NO aggregate `maxTokens` leg in
  // the request. `maxTokens` counts AGGREGATE usage — prompt-cache reads and
  // writes included — while the estimator's numbers model billable input/output
  // only. Deriving the aggregate ceiling from cache-blind estimates killed an
  // honest worker at 15,120 while it legitimately consumed 42,126 aggregate
  // tokens (mostly cache reads). Input/output ceilings are unit-correct
  // (usage.input_tokens excludes cache reads); the aggregate ceiling stays the
  // policy AUTHORITY's call, which narrowBudget already applies field-wise.
  const budget: ExecutionBudget = {
    maxInputTokens,
    maxOutputTokens,
  };

  if (typeof input.estimatedCostUsd === 'number' && input.estimatedCostUsd > 0) {
    const scaledUsd = input.estimatedCostUsd * retry * input.headroomFactor;
    budget.maxUsd = typeof input.sprintMaxUsd === 'number' && input.sprintMaxUsd >= 0
      ? Math.min(scaledUsd, input.sprintMaxUsd)
      : scaledUsd;
  }

  return budget;
}
