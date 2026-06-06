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
