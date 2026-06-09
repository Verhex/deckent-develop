import { describe, it, expect } from 'vitest';
import {
  evaluateCostGate,
  buildCostGateErrorPayload,
  DEFAULT_AUTO_CONFIRM_THRESHOLD_USD,
  type CostGateExceeded,
} from '../../src/core/cost-gate.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';
import type { TaskCostInput } from '../../src/core/cost-calculator.js';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Build a minimal cost-config for testing. The cost-config validator
 * enforces unit safety (per-token costs ≤ 0.01), so all numbers stay
 * realistic (Opus-like).
 */
function makeCostConfig(opts?: {
  sprintMaxUsd?: number;
  autoConfirmBelowUsd?: number;
}): CostConfig {
  return {
    _version: '1.0',
    providers: {
      anthropic: {
        enabled: true,
        billing_modes_supported: ['api'],
        default_billing_mode: 'api',
        models: {
          'claude-opus-4-6': {
            input_cost_per_token: 0.000005,
            output_cost_per_token: 0.000025,
            cache_creation_input_token_cost: 0.00000625,
            cache_read_input_token_cost: 0.0000005,
            max_input_tokens: 1_000_000,
            supports_prompt_caching: true,
            deckent_aliases: ['opus'],
            enabled: true,
          },
          'claude-haiku-4-5': {
            input_cost_per_token: 0.0000008,
            output_cost_per_token: 0.000004,
            max_input_tokens: 200_000,
            supports_prompt_caching: false,
            deckent_aliases: ['haiku'],
            enabled: true,
          },
        },
      },
    },
    cost_limits: {
      sprint_max_usd: opts?.sprintMaxUsd ?? 5,
      daily_max_usd: 50,
      auto_confirm_below_usd: opts?.autoConfirmBelowUsd ?? 2,
    },
    update_config: {
      sources_priority: ['bundled'],
    },
  };
}

function task(id: string, model: string, effort: 'low' | 'normal' | 'high' = 'normal'): TaskCostInput {
  return {
    id,
    model,
    estimatedInputTokens: 2700,
    estimatedOutputTokens: effort === 'high' ? 4000 : effort === 'low' ? 500 : 1500,
    effort,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('evaluateCostGate', () => {
  it('passes (ok=true) when estimate is within budget', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 5 });
    const tasks = [task('t1', 'haiku', 'low')];
    const result = evaluateCostGate({ tasks, costConfig });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate.withinBudget).toBe(true);
      expect(result.overrideApplied).toBe(false);
    }
  });

  it('returns COST_GATE_EXCEEDED when estimate is over budget', () => {
    // Cram many expensive opus tasks against a tiny budget
    const costConfig = makeCostConfig({ sprintMaxUsd: 0.01 });
    const tasks = Array.from({ length: 20 }, (_, i) => task(`t${i}`, 'opus', 'high'));

    const result = evaluateCostGate({ tasks, costConfig });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('COST_GATE_EXCEEDED');
      expect(result.estimatedUsd).toBeGreaterThan(result.budgetUsd);
      expect(result.budgetUsd).toBe(0.01);
      expect(result.message).toMatch(/exceeds budget/i);
    }
  });

  it('bypasses the budget block when acknowledgeCost=true (overrideApplied set)', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 0.01 });
    const tasks = Array.from({ length: 20 }, (_, i) => task(`t${i}`, 'opus', 'high'));

    const result = evaluateCostGate({ tasks, costConfig, acknowledgeCost: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate.withinBudget).toBe(false);
      expect(result.overrideApplied).toBe(true);
    }
  });

  it('sets autoConfirm=true when realistic cost is at or below the auto-confirm threshold', () => {
    const costConfig = makeCostConfig({
      sprintMaxUsd: 100,
      autoConfirmBelowUsd: 50,
    });
    const tasks = [task('t1', 'haiku', 'low')];

    const result = evaluateCostGate({ tasks, costConfig });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoConfirm).toBe(true);
      expect(result.autoConfirmThresholdUsd).toBe(50);
    }
  });

  it('sets autoConfirm=false when realistic cost exceeds the auto-confirm threshold', () => {
    const costConfig = makeCostConfig({
      sprintMaxUsd: 100,
      autoConfirmBelowUsd: 0.000001,
    });
    const tasks = [task('t1', 'opus', 'high')];

    const result = evaluateCostGate({ tasks, costConfig });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoConfirm).toBe(false);
    }
  });

  it('falls back to DEFAULT_AUTO_CONFIRM_THRESHOLD_USD when not set in config', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 100 });
    // Remove auto_confirm_below_usd to test fallback
    delete costConfig.cost_limits.auto_confirm_below_usd;

    const tasks = [task('t1', 'haiku', 'low')];
    const result = evaluateCostGate({ tasks, costConfig });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.autoConfirmThresholdUsd).toBe(DEFAULT_AUTO_CONFIRM_THRESHOLD_USD);
    }
  });

  it('handles an empty task list without crashing (estimate = 0, within budget)', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 5 });
    const result = evaluateCostGate({ tasks: [], costConfig });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.estimate.totalApiCostUsd).toBe(0);
      expect(result.estimate.withinBudget).toBe(true);
    }
  });
});

describe('buildCostGateErrorPayload', () => {
  it('emits a structured COST_GATE_EXCEEDED payload from an exceeded result', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 0.001 });
    const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, 'opus', 'high'));
    const result = evaluateCostGate({ tasks, costConfig });

    expect(result.ok).toBe(false);
    const exceeded = result as CostGateExceeded;
    const payload = buildCostGateErrorPayload(exceeded, 'acknowledgeCost');

    expect(payload.error).toBe('COST_GATE_EXCEEDED');
    expect(payload.estimated).toBeGreaterThan(payload.budget);
    expect(payload.override).toBe('acknowledgeCost');
    expect(payload.message).toMatch(/exceeds budget/i);
  });

  it('defaults the override hint to "acknowledgeCost" when not specified', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 0.001 });
    const tasks = [task('t1', 'opus', 'high')];
    const result = evaluateCostGate({ tasks, costConfig });

    const exceeded = result as CostGateExceeded;
    const payload = buildCostGateErrorPayload(exceeded);
    expect(payload.override).toBe('acknowledgeCost');
  });

  it('supports an explicit "force" override hint for CLI parity', () => {
    const costConfig = makeCostConfig({ sprintMaxUsd: 0.001 });
    const tasks = [task('t1', 'opus', 'high')];
    const result = evaluateCostGate({ tasks, costConfig });

    const exceeded = result as CostGateExceeded;
    const payload = buildCostGateErrorPayload(exceeded, 'force');
    expect(payload.override).toBe('force');
  });

  // ─── ENT-5 — per-request budget ceiling (budget.maxUsd) ─────────────────────
  describe('per-request budget ceiling (budget.maxUsd)', () => {
    it('blocks when estimate exceeds per-request budget even if within sprint budget', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 10 });
      // Use a cheap task that costs >0 but stay well under sprint budget
      const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, 'haiku', 'normal'));

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxUsd: 0.000001 } });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('COST_GATE_EXCEEDED');
        // effectiveBudgetUsd should be the per-request budget (the binding one)
        expect(result.budgetUsd).toBe(0.000001);
        expect(result.message).toMatch(/per-request limit/i);
      }
    });

    it('uses sprint budget when it is smaller than per-request budget', () => {
      // sprint budget $0.01, request budget $100 → sprint wins
      const costConfig = makeCostConfig({ sprintMaxUsd: 0.01 });
      const tasks = Array.from({ length: 20 }, (_, i) => task(`t${i}`, 'opus', 'high'));

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxUsd: 100 } });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('COST_GATE_EXCEEDED');
        expect(result.budgetUsd).toBe(0.01);
        expect(result.message).toMatch(/exceeds budget/i);
        expect(result.message).not.toMatch(/per-request limit/i);
      }
    });

    it('passes when estimate is within both sprint and per-request budgets', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 10 });
      const tasks = [task('t1', 'haiku', 'low')];

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxUsd: 5 } });

      expect(result.ok).toBe(true);
    });

    it('acknowledgeCost=true bypasses per-request budget too (overrideApplied)', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 10 });
      const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, 'haiku', 'normal'));

      const result = evaluateCostGate({
        tasks,
        costConfig,
        budget: { maxUsd: 0.000001 },
        acknowledgeCost: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.overrideApplied).toBe(true);
      }
    });

    it('no budget field → existing sprint-budget behavior unchanged', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 0.01 });
      const tasks = Array.from({ length: 20 }, (_, i) => task(`t${i}`, 'opus', 'high'));

      const resultNoBudget = evaluateCostGate({ tasks, costConfig });
      const resultWithBudgetUndefined = evaluateCostGate({ tasks, costConfig, budget: undefined });

      expect(resultNoBudget.ok).toBe(false);
      expect(resultWithBudgetUndefined.ok).toBe(false);
      if (!resultNoBudget.ok && !resultWithBudgetUndefined.ok) {
        expect(resultNoBudget.budgetUsd).toBe(resultWithBudgetUndefined.budgetUsd);
      }
    });

    it('ceilingTripped=sprint for pure sprint-budget block', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 0.01 });
      const tasks = Array.from({ length: 20 }, (_, i) => task(`t${i}`, 'opus', 'high'));

      const result = evaluateCostGate({ tasks, costConfig });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.ceilingTripped).toBe('sprint');
      }
    });

    it('ceilingTripped=usd for per-request maxUsd block', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 10 });
      const tasks = Array.from({ length: 5 }, (_, i) => task(`t${i}`, 'haiku', 'normal'));

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxUsd: 0.000001 } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.ceilingTripped).toBe('usd');
      }
    });
  });

  // ─── Sprint 261 — per-request token ceiling (budget.maxTokens) ──────────────
  describe('per-request token ceiling (budget.maxTokens)', () => {
    it('blocks when estimated tokens exceed per-request maxTokens', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 100 });
      // Each task has 2700 input + 1500 output = 4200 tokens. 3 tasks = 12600 tokens min.
      // Set maxTokens to 1 to force a block.
      const tasks = [task('t1', 'haiku', 'normal')];

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxTokens: 1 } });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('COST_GATE_EXCEEDED');
        expect(result.ceilingTripped).toBe('tokens');
        expect(result.estimatedTokens).toBeGreaterThan(0);
        expect(result.budgetTokens).toBe(1);
        expect(result.message).toMatch(/tokens/i);
        expect(result.message).toMatch(/per-request token limit/i);
      }
    });

    it('passes when estimated tokens are within per-request maxTokens', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 100 });
      const tasks = [task('t1', 'haiku', 'low')];
      // Very large maxTokens → should pass
      const result = evaluateCostGate({ tasks, costConfig, budget: { maxTokens: 1_000_000_000 } });

      expect(result.ok).toBe(true);
    });

    it('ceilingTripped=tokens even when USD is also over (tokens checked first)', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 0.000001 });
      const tasks = [task('t1', 'haiku', 'normal')];

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxTokens: 1 } });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Tokens was checked first — should win
        expect(result.ceilingTripped).toBe('tokens');
      }
    });

    it('acknowledgeCost=true bypasses token ceiling (overrideApplied)', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 100 });
      const tasks = [task('t1', 'haiku', 'normal')];

      const result = evaluateCostGate({
        tasks,
        costConfig,
        budget: { maxTokens: 1 },
        acknowledgeCost: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.overrideApplied).toBe(true);
      }
    });

    it('no maxTokens field → existing behavior unchanged (backward-safe)', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 100 });
      const tasks = [task('t1', 'haiku', 'low')];

      const resultNoBudget = evaluateCostGate({ tasks, costConfig });
      const resultWithMaxUsdOnly = evaluateCostGate({ tasks, costConfig, budget: { maxUsd: 50 } });

      expect(resultNoBudget.ok).toBe(true);
      expect(resultWithMaxUsdOnly.ok).toBe(true);
    });

    it('estimatedTokens and budgetTokens are populated on token block', () => {
      const costConfig = makeCostConfig({ sprintMaxUsd: 100 });
      const tasks = [task('t1', 'haiku', 'normal')];

      const result = evaluateCostGate({ tasks, costConfig, budget: { maxTokens: 100 } });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.estimatedTokens).toBeDefined();
        expect(result.budgetTokens).toBe(100);
        expect(result.estimatedTokens).toBeGreaterThan(100);
      }
    });
  });

  // ─── Sprint 238 İŞ10 — estimate↔gate bridge for 'local' (ollama) ──────────
  // The cost gate keys on estimate.costRealistic / withinBudget. A local
  // on-device task must contribute $0, so an all-ollama sprint passes the gate
  // with auto-confirm and never trips the budget — even when the budget is tiny.
  describe('local billing bridge (ollama on-device)', () => {
    function makeLocalConfig(sprintMaxUsd = 0.01): CostConfig {
      return {
        _version: '1.0',
        providers: {
          ollama: {
            enabled: true,
            billing_modes_supported: ['local'],
            default_billing_mode: 'local',
            models: {
              'qwen3.6:27b': {
                input_cost_per_token: 0,
                output_cost_per_token: 0,
                max_input_tokens: 262144,
                max_output_tokens: 16384,
                supports_prompt_caching: false,
                enabled: true,
              },
            },
          },
        },
        cost_limits: { sprint_max_usd: sprintMaxUsd, daily_max_usd: 50, auto_confirm_below_usd: 2 },
        update_config: { sources_priority: ['bundled'] },
      } as unknown as CostConfig;
    }

    it('all-ollama sprint passes the gate at $0 with auto-confirm, even on a $0.01 budget', () => {
      const tasks: TaskCostInput[] = [
        { id: 'OLL-1', model: 'qwen3.6:27b', estimatedInputTokens: 500_000, estimatedOutputTokens: 50_000 },
        { id: 'OLL-2', model: 'qwen3.6:27b', estimatedInputTokens: 800_000, estimatedOutputTokens: 80_000 },
      ];
      const result = evaluateCostGate({ tasks, costConfig: makeLocalConfig(0.01) });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.estimate.costRealistic).toBe(0);
        expect(result.estimate.withinBudget).toBe(true);
        expect(result.autoConfirm).toBe(true);
        // No subscription quota draw for a local task.
        expect(result.estimate.subscriptionImpact?.['ollama']).toBeUndefined();
      }
    });
  });
});
