import { describe, expect, it } from 'vitest';
import {
  requireFinalOnlyUsageContainment,
  resolveFinalOnlyUsageContainment,
  type ResolveFinalOnlyUsageContainmentInput,
} from '../../src/core/final-only-usage-containment.js';
import { assertLiveUsageBudgetSupport } from '../../src/core/live-execution-budget.js';
import type { TaskExecutionBudgetPolicySnapshot } from '../../src/core/task-types.js';

const authorization = Object.freeze({
  maxWallClockSeconds: 300,
  profileRef: 'execution_budget.final_only_usage',
  policyDigest: 'a'.repeat(64),
});

function policy(
  overrides: Partial<TaskExecutionBudgetPolicySnapshot> = {},
): TaskExecutionBudgetPolicySnapshot {
  return {
    state: 'allow',
    role: 'worker',
    resolvedProvider: 'codex',
    executionCostClass: 'remote',
    profileRef: 'execution_budget.roles.worker.default',
    policyDigest: authorization.policyDigest,
    admissionMode: 'unattended',
    finalOnlyUsage: authorization,
    ...overrides,
  };
}

function input(
  overrides: Partial<ResolveFinalOnlyUsageContainmentInput> = {},
): ResolveFinalOnlyUsageContainmentInput {
  return {
    role: 'worker',
    provider: 'codex',
    providerCommand: { liveUsage: 'final-only' },
    executor: { executor: 'docker', finalOnlyUsageContainment: 'wall-clock' },
    budget: { maxTurns: 12, maxOutputTokens: 500 },
    budgetPolicy: policy(),
    ...overrides,
  };
}

describe('resolveFinalOnlyUsageContainment', () => {
  it('returns the exact canonical task-stamped grant at the complete intersection', () => {
    const request = input();
    const result = resolveFinalOnlyUsageContainment(request);
    expect(result).toEqual({ state: 'grant', grant: authorization });
    expect(result.state === 'grant' && result.grant).toBe(authorization);
  });

  it.each([
    ['incremental provider', input({ providerCommand: { liveUsage: 'incremental' } }), 'provider-live-usage-incremental'],
    ['no live ceiling', input({ budget: {} }), 'live-ceiling-missing'],
    ['USD-only ceiling', input({ budget: { maxUsd: 1 } }), 'live-ceiling-missing'],
  ] as const)('returns not-required for %s', (_case, request, reasonCode) => {
    expect(resolveFinalOnlyUsageContainment(request)).toEqual({ state: 'not-required', reasonCode });
  });

  it.each([
    ['missing provider capability', input({ providerCommand: undefined }), 'provider-live-usage-capability-unavailable'],
    ['no-usage provider', input({ providerCommand: { liveUsage: 'none' } }), 'provider-live-usage-capability-unavailable'],
    ['unresolved executor', input({ executor: undefined }), 'executor-containment-unavailable'],
    ['non-Docker executor', input({ executor: { executor: 'subprocess', finalOnlyUsageContainment: 'wall-clock' } as never }), 'executor-containment-unavailable'],
    ['missing policy snapshot', input({ budgetPolicy: undefined }), 'budget-policy-missing'],
    ['held policy snapshot', input({ budgetPolicy: policy({ state: 'hold' }) }), 'budget-policy-not-allowed'],
    ['role mismatch', input({ budgetPolicy: policy({ role: 'auditor' }) }), 'task-role-mismatch'],
    ['provider mismatch', input({ budgetPolicy: policy({ resolvedProvider: 'gemini' }) }), 'task-provider-mismatch'],
    ['missing authorization', input({ budgetPolicy: policy({ finalOnlyUsage: undefined }) }), 'owner-authorization-missing'],
  ] as const)('fails closed for %s', (_case, request, reasonCode) => {
    expect(resolveFinalOnlyUsageContainment(request)).toEqual({ state: 'hold', reasonCode });
  });

  it.each([
    ['policy digest', { ...authorization, policyDigest: 'b'.repeat(64) }],
    ['profile ref', { ...authorization, profileRef: 'other.profile' }],
    ['wall clock', { ...authorization, maxWallClockSeconds: 0 }],
  ] as const)('refuses an authorization with %s mismatch', (_case, malformed) => {
    expect(resolveFinalOnlyUsageContainment(input({
      budgetPolicy: policy({ finalOnlyUsage: malformed }),
    }))).toEqual({ state: 'hold', reasonCode: 'owner-authorization-mismatch' });
  });

  it('keeps maxUsd on the separate incremental-pricing fail-closed gate', () => {
    const request = input({ budget: { maxUsd: 1 } });
    expect(requireFinalOnlyUsageContainment(request)).toBeUndefined();
    expect(() => assertLiveUsageBudgetSupport(request.budget, undefined, 'docker'))
      .toThrow(/Live USD budget enforcement/);
  });

  it('throws a typed HOLD before dispatch and returns undefined only when containment is unnecessary', () => {
    expect(() => requireFinalOnlyUsageContainment(input({ executor: undefined })))
      .toThrow('FINAL_ONLY_USAGE_CONTAINMENT_HOLD:executor-containment-unavailable');
    expect(requireFinalOnlyUsageContainment(input({ providerCommand: { liveUsage: 'incremental' } })))
      .toBeUndefined();
  });
});
