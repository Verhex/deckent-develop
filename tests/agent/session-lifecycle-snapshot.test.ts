import { describe, it, expect } from 'vitest';
import { createNativeBudgetState } from '../../src/agent/guards/recursion.js';
import { buildSessionLifecycleSnapshot } from '../../src/agent/session-lifecycle-snapshot.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../../src/core/execution-budget-policy.js';

describe('buildSessionLifecycleSnapshot', () => {
  it('separates user idle from work budget and marks in-flight turn', () => {
    const state = createNativeBudgetState(1_000);
    const snap = buildSessionLifecycleSnapshot({
      closed: false,
      inflightOperation: 'turn',
      turnSequence: 4,
      lastUserActivityAtMs: 31_000,
      permissionPending: false,
      nativeBudget: DEFAULT_NATIVE_AGENT_BUDGET,
      nativeBudgetState: state,
      budgetEpoch: 1,
      nowMs: 61_000,
    });
    expect(snap.operation).toBe('turn');
    expect(snap.userIdleMs).toBe(30_000);
    expect(snap.workBudget?.elapsedWorkMs).toBe(60_000);
  });

  it('reports budget-blocked when exhausted and idle', () => {
    const snap = buildSessionLifecycleSnapshot({
      closed: false,
      inflightOperation: 'none',
      turnSequence: 2,
      lastUserActivityAtMs: 1_000,
      permissionPending: false,
      exhausted: { code: 'native-budget.walltime-exhausted', epoch: 1 },
      nowMs: 5_000,
    });
    expect(snap.operation).toBe('budget-blocked');
    expect(snap.budgetBlocked).toBe(true);
  });
});
