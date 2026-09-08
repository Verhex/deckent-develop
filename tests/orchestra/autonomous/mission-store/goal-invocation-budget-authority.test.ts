import { describe, expect, it } from 'vitest';
import { projectGoalInvocationEstimates } from '../../../../src/orchestra/autonomous/mission-store/goal-invocation-budget-authority.js';

const decision = {
  state: 'allow' as const,
  budget: { maxTokens: 100, maxTurns: 3 },
  profileRef: 'execution_budget.roles.brain.default', policyDigest: 'a'.repeat(64),
  requestedNarrowing: true,
};

describe('projectGoalInvocationEstimates', () => {
  it('maps canonical token and request ceilings without inventing provider truth', () => {
    expect(projectGoalInvocationEstimates({ decision, model: 'claude-fable-5', windows: [
      { windowId: 'tokens-all', unit: 'tokens', model: null },
      { windowId: 'requests-all', unit: 'requests', model: 'claude-fable-5' },
    ] })).toMatchObject({ state: 'ready', estimates: [
      { windowId: 'tokens-all', unit: 'tokens', amount: 100 },
      { windowId: 'requests-all', unit: 'requests', amount: 3 },
    ] });
  });

  it.each(['percent', 'usd', 'credits'])('holds an unsupported %s window', unit => {
    expect(projectGoalInvocationEstimates({ decision, model: 'claude-fable-5', windows: [
      { windowId: `${unit}-all`, unit, model: null },
    ] })).toEqual({ state: 'hold', reasonCode: 'goal_invocation_budget_unit_unsupported' });
  });
});
