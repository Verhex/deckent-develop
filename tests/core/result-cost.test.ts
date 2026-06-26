import { describe, expect, it } from 'vitest';
import {
  calculateActualCost,
  type ActualCostUsage,
  type ResultCost,
} from '../../src/core/cost-calculator.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Hermetic Test Config (inline — no disk, no .deckent state; ADR-087) ─────
// Mirrors the shape validateCostConfig() enforces: per-token costs (e.g. $5/MTok
// = 0.000005), one local provider (ollama, default_billing_mode 'local').

const TEST_CONFIG: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'subscription',
      models: {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000005, // $5/MTok
          output_cost_per_token: 0.000025, // $25/MTok
          cache_creation_input_token_cost: 0.00000625, // $6.25/MTok
          cache_read_input_token_cost: 0.0000005, // $0.50/MTok
          max_input_tokens: 1_000_000,
          supports_prompt_caching: true,
          deckent_tier: 'premium',
          deckent_aliases: ['opus', 'claude-opus-4-8'],
          enabled: true,
        },
        'claude-sonnet-4-6': {
          input_cost_per_token: 0.000003,
          output_cost_per_token: 0.000015,
          cache_creation_input_token_cost: 0.00000375,
          cache_read_input_token_cost: 0.0000003,
          max_input_tokens: 1_000_000,
          supports_prompt_caching: true,
          deckent_tier: 'standard',
          deckent_aliases: ['sonnet'],
          enabled: true,
        },
      },
    },
    openai: {
      enabled: true,
      billing_modes_supported: ['api'],
      default_billing_mode: 'api',
      models: {
        'gpt-5': {
          input_cost_per_token: 0.00000125,
          output_cost_per_token: 0.00001,
          cache_read_input_token_cost: 0.000000125,
          cache_creation_input_token_cost: null, // OpenAI: no cache-creation surcharge
          max_input_tokens: 272_000,
          supports_prompt_caching: true,
          deckent_aliases: ['gpt-5', 'gpt5'],
          enabled: true,
        },
      },
    },
    google: {
      enabled: true,
      billing_modes_supported: ['api', 'free_tier'],
      default_billing_mode: 'api',
      models: {
        'gemini-3-1-pro': {
          input_cost_per_token: 0.000002,
          output_cost_per_token: 0.000012,
          cache_read_input_token_cost: 0.0000002,
          max_input_tokens: 1_000_000,
          supports_prompt_caching: true,
          deckent_aliases: ['gemini-3.1-pro', 'gemini'],
          enabled: true,
        },
      },
    },
    ollama: {
      enabled: true,
      billing_modes_supported: ['local'],
      default_billing_mode: 'local',
      models: {
        'qwen3.6:27b': {
          input_cost_per_token: 0,
          output_cost_per_token: 0,
          cache_read_input_token_cost: 0,
          cache_creation_input_token_cost: 0,
          max_input_tokens: 256_000,
          enabled: true,
        },
      },
    },
  },
  cost_limits: {
    sprint_max_usd: 5.0,
    daily_max_usd: 50.0,
  },
  update_config: {
    sources_priority: ['litellm'],
  },
};

function usage(partial: Partial<ActualCostUsage>): ActualCostUsage {
  return {
    inputTokens: partial.inputTokens ?? 0,
    outputTokens: partial.outputTokens ?? 0,
    cacheReadTokens: partial.cacheReadTokens,
    cacheCreationTokens: partial.cacheCreationTokens,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('calculateActualCost', () => {
  describe('metered arithmetic (per-token)', () => {
    it('prices Opus input tokens with correct units (1M in → $5)', () => {
      const cost = calculateActualCost(
        usage({ inputTokens: 1_000_000 }),
        'claude-opus-4-6',
        'claude',
        TEST_CONFIG,
      );
      expect(cost.usd).toBeCloseTo(5, 6);
      expect(cost.isLocal).toBe(false);
      expect(cost.currency).toBe('USD');
      expect(cost.pricingSource).toBe('cost-config:anthropic/claude-opus-4-6');
    });

    it('prices Opus output tokens (1M out → $25)', () => {
      const cost = calculateActualCost(usage({ outputTokens: 1_000_000 }), 'opus', 'claude', TEST_CONFIG);
      expect(cost.usd).toBeCloseTo(25, 6);
    });

    it('sums input + output + cache_read + cache_creation precisely', () => {
      const cost = calculateActualCost(
        usage({
          inputTokens: 200_000, // 0.2M * 5  = $1.00
          outputTokens: 40_000, // 0.04M * 25 = $1.00
          cacheReadTokens: 1_000_000, // 1M  * 0.5 = $0.50
          cacheCreationTokens: 80_000, // 0.08M * 6.25 = $0.50
        }),
        'claude-opus-4-6',
        'claude',
        TEST_CONFIG,
      );
      // 1.00 + 1.00 + 0.50 + 0.50 = $3.00
      expect(cost.usd).toBeCloseTo(3.0, 6);
    });

    it('treats a null cache-creation cost as $0 (no throw — gpt-5)', () => {
      const cost = calculateActualCost(
        usage({ inputTokens: 1_000_000, cacheCreationTokens: 500_000 }),
        'gpt-5',
        'codex',
        TEST_CONFIG,
      );
      // input 1M * 1.25e-6 = $1.25; cache_creation null → $0
      expect(cost.usd).toBeCloseTo(1.25, 6);
      expect(cost.pricingSource).toBe('cost-config:openai/gpt-5');
    });

    it('omitted cache fields contribute $0', () => {
      const cost = calculateActualCost(
        { inputTokens: 100_000, outputTokens: 100_000 } as ActualCostUsage,
        'claude-sonnet-4-6',
        'claude',
        TEST_CONFIG,
      );
      // 0.1M * 3 + 0.1M * 15 = 0.30 + 1.50 = $1.80
      expect(cost.usd).toBeCloseTo(1.8, 6);
    });
  });

  describe('cross-provider resolution', () => {
    it('prices an OpenAI model regardless of the deckent provider arg', () => {
      const cost = calculateActualCost(usage({ outputTokens: 1_000_000 }), 'gpt5', 'codex', TEST_CONFIG);
      expect(cost.usd).toBeCloseTo(10, 6); // 1M * $10/MTok
      expect(cost.pricingSource).toBe('cost-config:openai/gpt-5');
    });

    it('prices a Gemini model via alias', () => {
      const cost = calculateActualCost(usage({ inputTokens: 1_000_000 }), 'gemini-3.1-pro', 'gemini', TEST_CONFIG);
      expect(cost.usd).toBeCloseTo(2, 6); // 1M * $2/MTok
      expect(cost.pricingSource).toBe('cost-config:google/gemini-3-1-pro');
    });

    it('resolves pricing by alias even when provider name differs from config key', () => {
      // provider 'claude' (deckent name) ≠ cost-config key 'anthropic'; alias 'opus' still prices.
      const cost = calculateActualCost(usage({ inputTokens: 1_000_000 }), 'opus', 'claude', TEST_CONFIG);
      expect(cost.usd).toBeCloseTo(5, 6);
      expect(cost.isLocal).toBe(false);
    });
  });

  describe('local / self-hosted → $0', () => {
    it('returns $0 + isLocal for an ollama-provider run, even with non-zero tokens', () => {
      const cost = calculateActualCost(
        usage({ inputTokens: 5_000_000, outputTokens: 5_000_000 }),
        'qwen3.6:27b',
        'ollama',
        TEST_CONFIG,
      );
      expect(cost.usd).toBe(0);
      expect(cost.isLocal).toBe(true);
      expect(cost.pricingSource).toBe('local');
    });

    it('detects local via config default_billing_mode even for an unlisted provider arg', () => {
      // provider 'on-prem' is not in the name set, but the model resolves to ollama (local config).
      const cost = calculateActualCost(usage({ inputTokens: 1_000_000 }), 'qwen3.6:27b', 'on-prem', TEST_CONFIG);
      expect(cost.usd).toBe(0);
      expect(cost.isLocal).toBe(true);
    });

    it('detects local via the provider-name fallback when the model is not catalogued', () => {
      // A brand-new local model deckent has not catalogued, served by a self-hosted backend.
      const cost = calculateActualCost(usage({ inputTokens: 1_000_000 }), 'mystery-local-7b', 'self-hosted', TEST_CONFIG);
      expect(cost.usd).toBe(0);
      expect(cost.isLocal).toBe(true);
      expect(cost.pricingSource).toBe('local');
    });
  });

  describe('honesty & robustness', () => {
    it('reports an unknown model honestly (never silently priced)', () => {
      const cost = calculateActualCost(usage({ inputTokens: 1_000_000 }), 'no-such-model', 'claude', TEST_CONFIG);
      expect(cost.usd).toBe(0);
      expect(cost.isLocal).toBe(false);
      expect(cost.pricingSource).toBe('unknown-model:no-such-model');
    });

    it('clamps negative / NaN token counts to $0 (no negative cost)', () => {
      const cost = calculateActualCost(
        usage({ inputTokens: -100_000, outputTokens: Number.NaN }),
        'claude-opus-4-6',
        'claude',
        TEST_CONFIG,
      );
      expect(cost.usd).toBe(0);
    });

    it('emits a contract-shaped ResultCost (usd / currency / pricingSource / isLocal)', () => {
      const cost: ResultCost = calculateActualCost(usage({ inputTokens: 1000 }), 'opus', 'claude', TEST_CONFIG);
      expect(Object.keys(cost).sort()).toEqual(['currency', 'isLocal', 'pricingSource', 'usd']);
      expect(cost.currency).toBe('USD');
      expect(typeof cost.usd).toBe('number');
      expect(cost.usd).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reconciler-style summation (the 326-013 consumer)', () => {
    it('sums per-task actual cost to a sprint total (Σ matches manual)', () => {
      const perTask = [
        calculateActualCost(usage({ inputTokens: 1_000_000 }), 'opus', 'claude', TEST_CONFIG), // $5
        calculateActualCost(usage({ outputTokens: 1_000_000 }), 'gpt-5', 'codex', TEST_CONFIG), // $10
        calculateActualCost(usage({ inputTokens: 1_000_000 }), 'qwen3.6:27b', 'ollama', TEST_CONFIG), // $0 local
      ];
      const total = perTask.reduce((sum, c) => sum + c.usd, 0);
      expect(total).toBeCloseTo(15, 6);
      // the local task does not inflate the metered total
      expect(perTask[2]!.isLocal).toBe(true);
    });
  });
});
