import { describe, expect, it } from 'vitest';

import { evaluateExecutionBudget, evaluateRunCostBudget } from '../../src/core/execution-budget.js';

describe('evaluateExecutionBudget', () => {
  it('counts cache read and creation toward the token ceiling', () => {
    const verdict = evaluateExecutionBudget(
      { budget: { maxTokens: 1_000_000 } },
      {
        tokenUsage: {
          inputTokens: 9853,
          outputTokens: 100804,
          cacheReadTokens: 29598013,
          cacheCreationTokens: 352211,
          source: 'cli-log',
        },
      },
    );
    expect(verdict.state).toBe('exceeded');
    expect(verdict.consumedTokens).toBe(30_060_881);
  });

  it('uses provider-authoritative result.cost for the USD ceiling', () => {
    const verdict = evaluateExecutionBudget(
      { budget: { maxUsd: 15 } },
      { cost: { usd: 19.57630525, currency: 'USD', pricingSource: 'provider-envelope', isLocal: false } },
      undefined,
      'api',
    );
    expect(verdict.state).toBe('exceeded');
    expect(verdict.consumedUsd).toBe(19.57630525);
  });

  it('returns unknown when a configured ceiling has no durable usage evidence', () => {
    expect(evaluateExecutionBudget({ budget: { maxTokens: 100 } }, {}).state).toBe('unknown');
    expect(evaluateExecutionBudget({ budget: { maxUsd: 1 } }, {}, undefined, 'api').state).toBe('unknown');
  });

  it('does not enforce a ceiling from heuristic or worker-claimed token counts', () => {
    const estimated = evaluateExecutionBudget(
      { budget: { maxTokens: 1_000_000, maxUsd: 10 } },
      {
        tokenUsage: {
          inputTokens: 5_684,
          outputTokens: 500,
          cacheReadTokens: 22_736,
          source: 'estimate',
        },
        cost: { usd: 0.02, currency: 'USD', pricingSource: 'cost-config:claude', isLocal: false },
      },
      undefined,
      'api',
    );
    expect(estimated.state).toBe('unknown');
    expect(estimated.consumedTokens).toBeNull();
    expect(estimated.consumedUsd).toBeNull();

    const unprovenWorkerClaim = evaluateExecutionBudget(
      { budget: { maxTokens: 1_000_000 } },
      { tokenUsage: { inputTokens: 10, outputTokens: 10 } },
    );
    expect(unprovenWorkerClaim.state).toBe('unknown');
  });

  it('accepts host/provider measured usage for a within-budget decision', () => {
    const verdict = evaluateExecutionBudget(
      { budget: { maxTokens: 1_000 } },
      { tokenUsage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200, source: 'provider-adapter' } },
    );
    expect(verdict.state).toBe('within-budget');
    expect(verdict.consumedTokens).toBe(350);
  });

  it('treats unknown-model pricing as unknown even when the numeric placeholder is zero', () => {
    const verdict = evaluateExecutionBudget(
      { budget: { maxUsd: 1 } },
      { cost: { usd: 0, currency: 'USD', pricingSource: 'unknown-model:x', isLocal: false } },
      undefined,
      'api',
    );
    expect(verdict.state).toBe('unknown');
    expect(verdict.consumedUsd).toBeNull();
  });

  it('is inert when the owner supplied no ceiling', () => {
    expect(evaluateExecutionBudget({}, {}).state).toBe('within-budget');
  });

  it('excludes subscription/free-tier/local work from per-task USD ceilings while preserving token ceilings', () => {
    for (const billingMode of ['subscription', 'free_tier', 'local'] as const) {
      const verdict = evaluateExecutionBudget(
        { budget: { maxUsd: 0.0001, maxTokens: 1_000 } },
        {
          tokenUsage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 200,
            source: 'host-runtime-budget',
          },
          cost: {
            usd: 99,
            currency: 'USD',
            pricingSource: 'unknown-model:plan-model',
            isLocal: billingMode === 'local',
          },
        },
        undefined,
        billingMode,
      );
      expect(verdict.state).toBe('within-budget');
      expect(verdict.consumedTokens).toBe(350);
      expect(verdict.consumedUsd).toBe(billingMode === 'local' ? 0 : null);
    }
  });

  it('accepts the host runtime ledger and its lineage projection as measured usage', () => {
    for (const source of ['host-runtime-budget', 'host-runtime-budget-lineage'] as const) {
      const verdict = evaluateExecutionBudget(
        { budget: { maxTokens: 100 } },
        { tokenUsage: { inputTokens: 40, outputTokens: 20, source } },
      );
      expect(verdict.state).toBe('within-budget');
      expect(verdict.consumedTokens).toBe(60);
    }
  });

  it('uses the terminal live summary for turn and peak-context ceilings', () => {
    const measured = {
      state: 'within-budget' as const,
      reasons: [],
      counters: {
        turns: 4,
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 20,
        cacheCreationTokens: 0,
        totalTokens: 35,
        maxContextTokens: 30,
      },
    };
    expect(evaluateExecutionBudget(
      { budget: { maxTurns: 5, maxContextTokens: 100 } },
      {},
      measured,
    ).state).toBe('within-budget');
    expect(evaluateExecutionBudget(
      { budget: { maxTurns: 3 } },
      {},
      measured,
    ).state).toBe('exceeded');
  });
});

describe('evaluateRunCostBudget', () => {
  it('uses provider-final task cost against the configured sprint cap', () => {
    const verdict = evaluateRunCostBudget({
      cumulativeUsd: 0,
      nextCost: { usd: 19.57630525, currency: 'USD', pricingSource: 'provider-envelope', isLocal: false },
      sprintBudgetUsd: 3.5,
      billingMode: 'api',
    });
    expect(verdict).toEqual({ state: 'exceeded', cumulativeUsd: 19.57630525 });
  });

  it('HOLDs unknown pricing evidence instead of treating it as zero', () => {
    expect(evaluateRunCostBudget({
      cumulativeUsd: 1,
      sprintBudgetUsd: 3.5,
      billingMode: 'api',
    }).state).toBe('unknown');
    expect(evaluateRunCostBudget({
      cumulativeUsd: 1,
      nextCost: { usd: 0, currency: 'USD', pricingSource: 'unknown-model:x', isLocal: false },
      sprintBudgetUsd: 3.5,
      billingMode: 'api',
    }).state).toBe('unknown');
  });

  it('HOLDs a locally-priced heuristic estimate instead of spending it as measured cost', () => {
    const verdict = evaluateRunCostBudget({
      cumulativeUsd: 1,
      nextCost: { usd: 0.02, currency: 'USD', pricingSource: 'cost-config:claude', isLocal: false },
      nextUsage: { inputTokens: 5_684, outputTokens: 500, cacheReadTokens: 22_736, source: 'estimate' },
      sprintBudgetUsd: 3.5,
      billingMode: 'api',
    });
    expect(verdict).toEqual({ state: 'unknown', cumulativeUsd: 1 });
  });

  it('accepts locally-priced cost only when its token usage was measured', () => {
    const verdict = evaluateRunCostBudget({
      cumulativeUsd: 1,
      nextCost: { usd: 0.5, currency: 'USD', pricingSource: 'cost-config:claude', isLocal: false },
      nextUsage: { inputTokens: 100, outputTokens: 50, source: 'cli-log' },
      sprintBudgetUsd: 3.5,
      billingMode: 'api',
    });
    expect(verdict).toEqual({ state: 'within-budget', cumulativeUsd: 1.5 });
  });

  it('excludes subscription, free-tier and local tasks from the sprint USD ledger', () => {
    for (const billingMode of ['subscription', 'free_tier', 'local'] as const) {
      const verdict = evaluateRunCostBudget({
        cumulativeUsd: 1.25,
        nextCost: {
          usd: 999,
          currency: 'USD',
          pricingSource: 'unknown-model:quota-or-local-model',
          isLocal: billingMode === 'local',
        },
        sprintBudgetUsd: 3.5,
        billingMode,
      });
      expect(verdict).toEqual({ state: 'within-budget', cumulativeUsd: 1.25 });
    }
  });

  it('fails closed when effective billing mode is unresolved', () => {
    expect(evaluateRunCostBudget({
      cumulativeUsd: 1,
      nextCost: { usd: 0, currency: 'USD', pricingSource: 'local', isLocal: true },
      sprintBudgetUsd: 3.5,
      billingMode: undefined,
    })).toEqual({ state: 'unknown', cumulativeUsd: 1 });
  });
});
