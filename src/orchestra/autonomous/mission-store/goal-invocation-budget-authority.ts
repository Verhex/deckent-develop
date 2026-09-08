import type { ExecutionBudgetPolicyAllowDecision } from '../../../core/execution-budget-policy.js';
import type { ProviderLimitReservationRequest } from '../../../core/provider-limit-truth.js';

export type GoalInvocationEstimateProjection =
  | { state: 'ready'; estimates: ProviderLimitReservationRequest['estimates']; evidenceRefs: readonly string[] }
  | { state: 'hold'; reasonCode: 'goal_invocation_budget_unit_unsupported' | 'goal_invocation_budget_window_mismatch' };

/** Maps canonical role+purpose budget authority onto fresh provider windows. */
export function projectGoalInvocationEstimates(input: {
  decision: ExecutionBudgetPolicyAllowDecision;
  model: string;
  windows: readonly { windowId: string; unit: string; model: string | null }[];
}): GoalInvocationEstimateProjection {
  const budget = input.decision.budget;
  const estimates: ProviderLimitReservationRequest['estimates'][number][] = [];
  for (const window of input.windows) {
    if (window.model !== null && window.model !== input.model) {
      return { state: 'hold', reasonCode: 'goal_invocation_budget_window_mismatch' };
    }
    const amount = window.unit === 'tokens' ? budget?.maxTokens
      : window.unit === 'requests' ? budget?.maxTurns : undefined;
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) {
      return { state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' };
    }
    estimates.push({ windowId: window.windowId, unit: window.unit as 'tokens' | 'requests' | 'usd', amount });
  }
  return {
    state: 'ready', estimates: Object.freeze(estimates),
    evidenceRefs: Object.freeze([`execution-budget-policy:${input.decision.policyDigest}`, input.decision.profileRef]),
  };
}
