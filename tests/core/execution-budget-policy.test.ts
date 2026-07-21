import { describe, expect, it } from 'vitest';
import {
  ExecutionBudgetPolicyError,
  assertExecutionBudgetPolicyConfig,
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
    unmetered_backend: {
      action: 'reroute-or-hold',
      ordered_backends: ['docker', 'subprocess'],
    },
  };
}

describe('execution budget policy', () => {
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
      profileRef: 'execution_budget.roles.worker.default',
      requestedNarrowing: false,
    });
    expect(decision.state === 'allow' && decision.budget?.maxOutputTokens).toBeUndefined();
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
