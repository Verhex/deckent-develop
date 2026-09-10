// ═══ Native work-budget read model (P2) — not user idle / session TTL ═════════

import type { ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';
import type { NativeBudgetState } from './guards/recursion.js';

export interface WorkBudgetSnapshot {
  readonly budgetEpoch: number;
  readonly elapsedWorkMs: number;
  readonly maxWallTimeMs: number;
  readonly rounds: number;
  readonly maxModelRounds: number;
  readonly toolCalls: number;
  readonly maxToolCalls: number;
  readonly cumulativeTokens: number;
  readonly maxCumulativeTokens: number;
}

/** Session-scoped working budget counters (renew resets this, not billing totals). */
export function buildWorkBudgetSnapshot(
  state: NativeBudgetState,
  budget: ResolvedNativeAgentBudget,
  budgetEpoch: number,
  nowMs: number = Date.now(),
): WorkBudgetSnapshot {
  return Object.freeze({
    budgetEpoch,
    elapsedWorkMs: Math.max(0, nowMs - state.startedAtMs),
    maxWallTimeMs: budget.maxWallTimeMs,
    rounds: state.rounds,
    maxModelRounds: budget.maxModelRounds,
    toolCalls: state.toolCalls,
    maxToolCalls: budget.maxToolCalls,
    cumulativeTokens: state.cumulativeTokens,
    maxCumulativeTokens: budget.maxCumulativeTokens,
  });
}
