import { describe, expect, it } from 'vitest';
import {
  ExecutionBudgetPolicyError,
  assertExecutionBudgetPolicyConfig,
  deriveExecutionLandingTurnAllocation,
  executionBudgetPolicyDigest,
  resolveExecutionBudgetPolicy,
} from '../../src/core/execution-budget-policy.js';
import type { ExecutionBudgetPolicyConfig } from '../../src/core/config-types.js';

function policy(): ExecutionBudgetPolicyConfig {
  return {
    roles: {
      worker: {
        default: { maxTurns: 40, maxCacheReadTokens: 5_000_000 },
        by_task_kind: {
          documentation: { maxTurns: 12, maxCacheReadTokens: 750_000 },
        },
      },
    },
    landing: {
      reserve_ratio: 0.25,
    },
    unmetered_backend: {
      action: 'reroute-or-hold',
      ordered_backends: ['docker', 'subprocess'],
    },
  };
}

describe('execution budget policy', () => {
  it('rounds discrete turn reserve upward without changing exact allocations', () => {
    expect(deriveExecutionLandingTurnAllocation(5, 0.25)).toEqual({
      workTurns: 3,
      reservedTurns: 2,
    });
    expect(deriveExecutionLandingTurnAllocation(4, 0.25)).toEqual({
      workTurns: 3,
      reservedTurns: 1,
    });
  });

  it('holds remote work when owner policy is absent', () => {
    expect(resolveExecutionBudgetPolicy({ role: 'worker' })).toEqual({
      state: 'hold',
      reasonCode: 'budget-policy-missing',
      profileRef: 'execution_budget.roles.worker',
    });
  });

  it('uses the role default without fabricating missing ceilings', () => {
    const decision = resolveExecutionBudgetPolicy({ policy: policy(), role: 'worker' });
    expect(decision).toMatchObject({
      state: 'allow',
      budget: { maxTurns: 40, maxCacheReadTokens: 5_000_000 },
      landingPolicy: { reserve_ratio: 0.25, attended_unsupported: 'hold' },
      profileRef: 'execution_budget.roles.worker.default',
      requestedNarrowing: false,
    });
    expect(decision.state === 'allow' && decision.budget?.maxOutputTokens).toBeUndefined();
  });

  it('holds remote work when the owner hard budget has no landing authority', () => {
    expect(resolveExecutionBudgetPolicy({
      policy: { roles: { worker: { default: { maxTurns: 4 } } } },
      role: 'worker',
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'landing-policy-missing',
      profileRef: 'execution_budget.landing',
    });
  });

  it('selects a canonical TaskKind profile over the role default', () => {
    const decision = resolveExecutionBudgetPolicy({
      policy: policy(),
      role: 'worker',
      taskKind: 'documentation',
    });
    expect(decision).toMatchObject({
      state: 'allow',
      budget: { maxTurns: 12, maxCacheReadTokens: 750_000 },
      profileRef: 'execution_budget.roles.worker.by_task_kind.documentation',
    });
  });

  it('lets a requested budget narrow or add ceilings but never widen authority', () => {
    const decision = resolveExecutionBudgetPolicy({
      policy: policy(),
      role: 'worker',
      requestedBudget: {
        maxTurns: 200,
        maxCacheReadTokens: 1_000_000,
        maxOutputTokens: 25_000,
      },
    });
    expect(decision).toMatchObject({
      state: 'allow',
      budget: {
        maxTurns: 40,
        maxCacheReadTokens: 1_000_000,
        maxOutputTokens: 25_000,
      },
      requestedNarrowing: true,
    });
  });

  it('holds before remote work when the effective integer turn reserve cannot finish the caller protocol', () => {
    const insufficient = resolveExecutionBudgetPolicy({
      policy: {
        roles: { auditor: { default: { maxTurns: 4, maxCacheReadTokens: 200_000 } } },
        landing: { reserve_ratio: 0.25 },
      },
      role: 'auditor',
      taskKind: 'audit',
      minimumContinuationTurns: 3,
    });
    expect(insufficient).toMatchObject({
      state: 'hold',
      reasonCode: 'landing-turn-reserve-insufficient',
      profileRef: 'execution_budget.roles.auditor.default.maxTurns',
      requiredContinuationTurns: 3,
      guaranteedContinuationTurns: 1,
    });

    const sufficient = resolveExecutionBudgetPolicy({
      policy: {
        roles: { auditor: { default: { maxTurns: 12, maxCacheReadTokens: 200_000 } } },
        landing: { reserve_ratio: 0.25 },
      },
      role: 'auditor',
      taskKind: 'audit',
      minimumContinuationTurns: 3,
    });
    expect(sufficient).toMatchObject({
      state: 'allow',
      budget: { maxTurns: 12, maxCacheReadTokens: 200_000 },
    });

    expect(resolveExecutionBudgetPolicy({
      policy: {
        roles: { worker: { default: { maxTurns: 5 } } },
        landing: { reserve_ratio: 0.25 },
      },
      role: 'worker',
      minimumContinuationTurns: 2,
    })).toMatchObject({
      state: 'allow',
      budget: { maxTurns: 5 },
    });
  });

  it('checks the reserve after requested-budget narrowing and rejects invalid protocol requirements', () => {
    expect(resolveExecutionBudgetPolicy({
      policy: {
        roles: { auditor: { default: { maxTurns: 12 } } },
        landing: { reserve_ratio: 0.25 },
      },
      role: 'auditor',
      requestedBudget: { maxTurns: 4 },
      minimumContinuationTurns: 3,
    })).toMatchObject({
      state: 'hold',
      reasonCode: 'landing-turn-reserve-insufficient',
      guaranteedContinuationTurns: 1,
    });
    expect(() => resolveExecutionBudgetPolicy({
      policy: policy(),
      role: 'worker',
      minimumContinuationTurns: 0,
    })).toThrow('minimumContinuationTurns must be a positive integer');
  });

  it('returns an immutable snapshot and stable digest across key order', () => {
    const raw = policy();
    const decision = resolveExecutionBudgetPolicy({ policy: raw, role: 'worker' });
    expect(decision.state).toBe('allow');
    if (decision.state !== 'allow') return;

    const digest = decision.policyDigest;
    raw.roles.worker!.default!.maxTurns = 999;
    expect(decision.budget?.maxTurns).toBe(40);
    expect(Object.isFrozen(decision.budget)).toBe(true);

    const reordered: ExecutionBudgetPolicyConfig = {
      unmetered_backend: {
        ordered_backends: ['docker', 'subprocess'],
        action: 'reroute-or-hold',
      },
      roles: {
        worker: {
          by_task_kind: {
            documentation: { maxCacheReadTokens: 750_000, maxTurns: 12 },
          },
          default: { maxCacheReadTokens: 5_000_000, maxTurns: 40 },
        },
      },
      landing: {
        reserve_ratio: 0.25,
      },
    };
    expect(executionBudgetPolicyDigest(reordered)).toBe(digest);
  });

  it('allows local execution without inventing a remote policy', () => {
    expect(resolveExecutionBudgetPolicy({
      role: 'worker',
      executionCostClass: 'local',
    })).toMatchObject({ state: 'allow', profileRef: 'local-exempt' });
  });

  it.each([
    [{ roles: {} }, 'must define at least one role'],
    [{ roles: { worker: {} } }, 'must define default or by_task_kind'],
    [{ roles: { worker: { default: {} } } }, 'at least one explicit ceiling'],
    [{ roles: { worker: { default: { maxTurns: -1 } } } }, 'non-negative finite'],
    [{ roles: { worker: { default: { typo: 1 } } } }, "Unknown field 'execution_budget.roles.worker.default.typo'"],
    [{ roles: { worker: { by_task_kind: { made_up: { maxTurns: 1 } } } } }, "Unknown field 'execution_budget.roles.worker.by_task_kind.made_up'"],
    [{ roles: { worker: { default: { maxTurns: 1 } } }, surprise: true }, "Unknown field 'execution_budget.surprise'"],
    [{ roles: { worker: { default: { maxTurns: 1 } } }, landing: { reserve_ratio: 0 } }, 'greater than 0 and less than 1'],
    [{ roles: { worker: { default: { maxTurns: 1 } } }, landing: { reserve_ratio: 1 } }, 'greater than 0 and less than 1'],
    [{ roles: { worker: { default: { maxTurns: 1 } } }, landing: { reserve_ratio: Number.NaN } }, 'greater than 0 and less than 1'],
    [{ roles: { worker: { default: { maxTurns: 1 } } }, landing: { reserve_ratio: 0.25, surprise: true } }, "Unknown field 'execution_budget.landing.surprise'"],
    [{ roles: { worker: { default: { maxTurns: 1 } } }, landing: { reserve_ratio: 0.25, attended_unsupported: 'allow' } }, "must be 'hold' or 'allow-hard-stop'"],
  ])('rejects malformed policy %#', (raw, message) => {
    expect(() => assertExecutionBudgetPolicyConfig(raw)).toThrow(ExecutionBudgetPolicyError);
    expect(() => assertExecutionBudgetPolicyConfig(raw)).toThrow(message);
  });

  it('rejects ambiguous or duplicate backend reroute policy', () => {
    expect(() => assertExecutionBudgetPolicyConfig({
      roles: { worker: { default: { maxTurns: 1 } } },
      unmetered_backend: {
        action: 'reroute-or-hold',
        ordered_backends: ['docker', 'docker'],
      },
    })).toThrow("Duplicate backend 'docker'");
    expect(() => assertExecutionBudgetPolicyConfig({
      roles: { worker: { default: { maxTurns: 1 } } },
      unmetered_backend: { action: 'reroute-or-hold' },
    })).toThrow('ordered_backends is required');
    expect(() => assertExecutionBudgetPolicyConfig({
      roles: { worker: { default: { maxTurns: 1 } } },
      unmetered_backend: { action: 'hold', ordered_backends: ['docker'] },
    })).toThrow('ordered_backends is not allowed');
  });
});
