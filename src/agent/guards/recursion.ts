// src/agent/guards/recursion.ts
// ═══ Recursion guard (SP-1 §8) ══════════════════════════════════════════════
// Caps the model→tool→model loop so a runaway tool cycle cannot spin forever.
// (The cross-process terminal→sprint→worker depth is a future extension via an
// env-propagated counter; this cut bounds the in-loop iteration count.)

export const DEFAULT_MAX_ITERATIONS = 25;

/** True once the loop has run more than `max` model round-trips this turn. */
export function recursionExceeded(iterations: number, max: number = DEFAULT_MAX_ITERATIONS): boolean {
  return iterations > max;
}

// ─── NATIVE-AGENT-HORIZON-001: multi-dimension session budget ───────────────
// The legacy single-round guard above stays byte-identical for unwired callers.
// Counters are SESSION-cumulative: a context-epoch reset never resets them —
// billing/usage/wall/audit accounting is a hard invariant.

import type { ResolvedNativeAgentBudget } from '../../core/execution-budget-policy.js';

export interface NativeBudgetState {
  rounds: number;
  toolCalls: number;
  cumulativeTokens: number;
  /** Last round's provider-reported input size — fresh-token delta base. */
  lastInputTokens: number;
  noProgressRounds: number;
  startedAtMs: number;
  /** name+canonicalized-args digests seen this session (semantic-repeat detection). */
  seenCallDigests: Set<string>;
  /** cadence markers so each threshold crossing requests exactly one checkpoint. */
  lastCheckpointRound: number;
  lastCheckpointToolCalls: number;
  /** a no-progress checkpoint was already requested; next no-progress round terminates. */
  noProgressCheckpointRequested: boolean;
  /** the 80%-of-token-cap checkpoint was already requested once. */
  tokenPressureCheckpointRequested: boolean;
}

export function createNativeBudgetState(nowMs: number = Date.now()): NativeBudgetState {
  return {
    rounds: 0,
    toolCalls: 0,
    cumulativeTokens: 0,
    lastInputTokens: 0,
    noProgressRounds: 0,
    startedAtMs: nowMs,
    seenCallDigests: new Set(),
    lastCheckpointRound: 0,
    lastCheckpointToolCalls: 0,
    noProgressCheckpointRequested: false,
    tokenPressureCheckpointRequested: false,
  };
}

export type NativeBudgetVerdict =
  | { verdict: 'ok' }
  | { verdict: 'checkpoint'; reason: 'cadence-rounds' | 'cadence-toolcalls' | 'no-progress' | 'token-pressure' }
  | { verdict: 'terminate'; code:
      | 'native-budget.rounds-exhausted'
      | 'native-budget.toolcalls-exhausted'
      | 'native-budget.walltime-exhausted'
      | 'native-budget.tokens-exhausted'
      | 'native-budget.noprogress-terminated' };

/** Hard caps first (typed termination), then checkpoint cadence. Called at the
 *  START of each round after the counters were advanced for the previous one. */
export function evaluateNativeBudget(
  state: NativeBudgetState,
  budget: ResolvedNativeAgentBudget,
  nowMs: number = Date.now(),
): NativeBudgetVerdict {
  if (state.rounds > budget.maxModelRounds) {
    return { verdict: 'terminate', code: 'native-budget.rounds-exhausted' };
  }
  if (state.toolCalls > budget.maxToolCalls) {
    return { verdict: 'terminate', code: 'native-budget.toolcalls-exhausted' };
  }
  if (nowMs - state.startedAtMs > budget.maxWallTimeMs) {
    return { verdict: 'terminate', code: 'native-budget.walltime-exhausted' };
  }
  if (state.cumulativeTokens > budget.maxCumulativeTokens) {
    return { verdict: 'terminate', code: 'native-budget.tokens-exhausted' };
  }
  if (!state.tokenPressureCheckpointRequested
    && state.cumulativeTokens >= budget.maxCumulativeTokens * 0.8) {
    // 80% pressure: one checkpoint request so the epoch compaction shrinks the
    // resent context long before the hard stop — the session lands its answer
    // instead of dying mid-analysis (live incident 2026-08-18).
    state.tokenPressureCheckpointRequested = true;
    return { verdict: 'checkpoint', reason: 'token-pressure' };
  }
  if (state.noProgressRounds >= budget.maxNoProgressRounds) {
    if (!state.noProgressCheckpointRequested) {
      state.noProgressCheckpointRequested = true;
      return { verdict: 'checkpoint', reason: 'no-progress' };
    }
    return { verdict: 'terminate', code: 'native-budget.noprogress-terminated' };
  }
  if (state.rounds - state.lastCheckpointRound >= budget.checkpointEveryRounds) {
    state.lastCheckpointRound = state.rounds;
    return { verdict: 'checkpoint', reason: 'cadence-rounds' };
  }
  if (state.toolCalls - state.lastCheckpointToolCalls >= budget.checkpointEveryToolCalls) {
    state.lastCheckpointToolCalls = state.toolCalls;
    return { verdict: 'checkpoint', reason: 'cadence-toolcalls' };
  }
  return { verdict: 'ok' };
}
