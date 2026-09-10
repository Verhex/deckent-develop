import { describe, it, expect } from 'vitest';
import { createNativeBudgetState } from '../../src/agent/guards/recursion.js';
import { buildWorkBudgetSnapshot } from '../../src/agent/work-budget-snapshot.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../../src/core/execution-budget-policy.js';

describe('buildWorkBudgetSnapshot', () => {
  it('projects elapsed work time from startedAtMs', () => {
    const state = createNativeBudgetState(1_000);
    state.rounds = 3;
    state.toolCalls = 7;
    state.cumulativeTokens = 42_000;
    const snap = buildWorkBudgetSnapshot(state, DEFAULT_NATIVE_AGENT_BUDGET, 2, 61_000);
    expect(snap.budgetEpoch).toBe(2);
    expect(snap.elapsedWorkMs).toBe(60_000);
    expect(snap.rounds).toBe(3);
    expect(snap.maxWallTimeMs).toBe(DEFAULT_NATIVE_AGENT_BUDGET.maxWallTimeMs);
  });
});
