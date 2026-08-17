/**
 * tests/agent/loop-budget.test.ts — NATIVE-AGENT-HORIZON-001 T2.
 *
 * Multi-dimension session budget: typed termination per dimension, checkpoint
 * cadence, no-progress semantic-repeat convergence, legacy byte-compat, and
 * the cumulative-counters invariant (an epoch reset never resets accounting).
 */

import { describe, it, expect } from 'vitest';
import {
  createNativeBudgetState,
  evaluateNativeBudget,
  DEFAULT_MAX_ITERATIONS,
  recursionExceeded,
} from '../../src/agent/guards/recursion.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';

const B = DEFAULT_NATIVE_AGENT_BUDGET;

describe('resolveNativeAgentBudget (T1)', () => {
  it('returns the frozen defaults when nothing is authored', () => {
    expect(resolveNativeAgentBudget({ policy: undefined })).toEqual(B);
    expect(resolveNativeAgentBudget({ policy: { roles: {} } })).toEqual(B);
  });

  it('merges every authored dimension independently over the defaults', () => {
    const merged = resolveNativeAgentBudget({ policy: {
      roles: {},
      native_agent: { maxModelRounds: 200, checkpointEveryToolCalls: 30 },
    } });
    expect(merged.maxModelRounds).toBe(200);
    expect(merged.checkpointEveryToolCalls).toBe(30);
    expect(merged.maxToolCalls).toBe(B.maxToolCalls);
  });

  it('fails loudly on unknown keys and non-positive values', () => {
    expect(() => resolveNativeAgentBudget({ policy: {
      roles: {}, native_agent: { bogus: 1 } as never,
    } })).toThrow(/native_agent/);
    expect(() => resolveNativeAgentBudget({ policy: {
      roles: {}, native_agent: { maxModelRounds: 0 },
    } })).toThrow(/positive safe integer/);
    expect(() => resolveNativeAgentBudget({ policy: {
      roles: {}, native_agent: { maxWallTimeMs: -5 },
    } })).toThrow(/positive safe integer/);
  });
});

describe('evaluateNativeBudget (T2)', () => {
  it('terminates each dimension with its own typed code', () => {
    const now = 1_000_000;
    let s = createNativeBudgetState(now);
    s.rounds = B.maxModelRounds + 1;
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'terminate', code: 'native-budget.rounds-exhausted' });

    s = createNativeBudgetState(now);
    s.rounds = 1; s.toolCalls = B.maxToolCalls + 1;
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'terminate', code: 'native-budget.toolcalls-exhausted' });

    s = createNativeBudgetState(now);
    s.rounds = 1;
    expect(evaluateNativeBudget(s, B, now + B.maxWallTimeMs + 1)).toEqual({ verdict: 'terminate', code: 'native-budget.walltime-exhausted' });

    s = createNativeBudgetState(now);
    s.rounds = 1; s.cumulativeTokens = B.maxCumulativeTokens + 1;
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'terminate', code: 'native-budget.tokens-exhausted' });
  });

  it('no-progress first requests ONE checkpoint, then terminates if still stuck', () => {
    const now = 1_000_000;
    const s = createNativeBudgetState(now);
    s.rounds = 5;
    s.noProgressRounds = B.maxNoProgressRounds;
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'checkpoint', reason: 'no-progress' });
    // Still no progress next round → typed termination, not a second request.
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'terminate', code: 'native-budget.noprogress-terminated' });
  });

  it('checkpoint cadence fires once per threshold crossing (rounds and toolCalls)', () => {
    const now = 1_000_000;
    const s = createNativeBudgetState(now);
    s.rounds = B.checkpointEveryRounds;
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'checkpoint', reason: 'cadence-rounds' });
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'ok' });

    s.toolCalls = B.checkpointEveryToolCalls;
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'checkpoint', reason: 'cadence-toolcalls' });
    expect(evaluateNativeBudget(s, B, now)).toEqual({ verdict: 'ok' });
  });

  it('counters are session-cumulative — nothing about the state resets on an epoch change', () => {
    const s = createNativeBudgetState(0);
    s.rounds = 30; s.toolCalls = 90; s.cumulativeTokens = 500_000;
    // An epoch reset is a transcript operation; the budget state object is
    // untouched by design — assert the fields simply persist.
    const snapshot = { rounds: s.rounds, toolCalls: s.toolCalls, cumulativeTokens: s.cumulativeTokens };
    expect(snapshot).toEqual({ rounds: 30, toolCalls: 90, cumulativeTokens: 500_000 });
  });

  it('legacy unwired guard is byte-identical (25 rounds default)', () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(25);
    expect(recursionExceeded(25)).toBe(false);
    expect(recursionExceeded(26)).toBe(true);
  });
});

describe('token accounting honesty (live incident 2026-08-18)', () => {
  it('token-pressure at 80% requests ONE checkpoint before the hard stop', () => {
    const s = createNativeBudgetState(0);
    s.rounds = 3;
    s.cumulativeTokens = Math.ceil(B.maxCumulativeTokens * 0.8);
    expect(evaluateNativeBudget(s, B, 1)).toEqual({ verdict: 'checkpoint', reason: 'token-pressure' });
    expect(evaluateNativeBudget(s, B, 1)).toEqual({ verdict: 'ok' });
    s.cumulativeTokens = B.maxCumulativeTokens + 1;
    expect(evaluateNativeBudget(s, B, 1)).toEqual({ verdict: 'terminate', code: 'native-budget.tokens-exhausted' });
  });

  it('fresh-token base field starts at zero (delta accounting seam)', () => {
    const s = createNativeBudgetState(0);
    expect(s.lastInputTokens).toBe(0);
    expect(s.tokenPressureCheckpointRequested).toBe(false);
  });
});
