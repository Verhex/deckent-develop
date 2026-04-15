import { describe, expect, it } from 'vitest';
import {
  estimateSprintCost,
  formatEstimate,
  type TaskCostInput,
  type SprintCostEstimate,
} from '../../src/core/cost-calculator.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Test Config ────────────────────────────────────────────────────────────

const TEST_CONFIG: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'api',
      models: {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000005, // $5/MTok
          output_cost_per_token: 0.000025, // $25/MTok
          cache_creation_input_token_cost: 0.00000625,
          cache_read_input_token_cost: 0.0000005,
          max_input_tokens: 1000000,
          max_output_tokens: 128000,
          supports_prompt_caching: true,
          deckent_tier: 'premium',
          deckent_aliases: ['opus'],
          enabled: true,
        },
        'claude-sonnet-4-6': {
          input_cost_per_token: 0.000003,
          output_cost_per_token: 0.000015,
          cache_creation_input_token_cost: 0.00000375,
          cache_read_input_token_cost: 0.0000003,
          max_input_tokens: 1000000,
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
          max_input_tokens: 272000,
          supports_prompt_caching: true,
          deckent_tier: 'premium',
          deckent_aliases: ['gpt-5', 'gpt5'],
          enabled: true,
        },
      },
    },
    google: {
      enabled: true,
      billing_modes_supported: ['api', 'free_tier'],
      default_billing_mode: 'free_tier',
      models: {
        'gemini-2-5-flash': {
          input_cost_per_token: 0.0000003,
          output_cost_per_token: 0.0000025,
          max_input_tokens: 1000000,
          supports_prompt_caching: true,
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('cost-calculator', () => {
  describe('single task basic math', () => {
    it('calculates Opus API cost with correct units', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 1_000_000,
          estimatedOutputTokens: 0,
          billingMode: 'api',
        },
      ];
      // No cache (multiplier 1.0, cache ratio 0), no retry → pure input math
      const est = estimateSprintCost(tasks, TEST_CONFIG, {
        cacheHitRatio: 0,
        retryMultiplier: 1.0,
        cacheableContextTokens: 0, // Disable cache overhead
      });
      // 1M tokens * $0.000005 = $5
      expect(est.totalApiCostUsd).toBeCloseTo(5, 2);
      expect(est.costRealistic).toBeCloseTo(5, 2);
    });

    it('calculates output cost', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 0,
          estimatedOutputTokens: 1_000_000,
          billingMode: 'api',
        },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG, {
        cacheHitRatio: 0,
        retryMultiplier: 1.0,
        cacheableContextTokens: 0,
      });
      // 1M tokens * $0.000025 = $25
      expect(est.totalApiCostUsd).toBeCloseTo(25, 2);
    });
  });

  describe('cache math', () => {
    it('applies cache read discount (90% savings)', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 0, // no incremental
          estimatedOutputTokens: 0,
        },
      ];
      // 1M cacheable context, 100% cache hit → all cache read
      const est = estimateSprintCost(tasks, TEST_CONFIG, {
        cacheHitRatio: 1.0,
        retryMultiplier: 1.0,
        cacheableContextTokens: 1_000_000,
      });
      // 1M cache read tokens * $0.0000005 = $0.50
      expect(est.totalApiCostUsd).toBeCloseTo(0.5, 2);
    });

    it('applies cache creation when cache miss', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 0,
          estimatedOutputTokens: 0,
        },
      ];
      // 1M cacheable context, 0% cache hit → all cache creation
      const est = estimateSprintCost(tasks, TEST_CONFIG, {
        cacheHitRatio: 0,
        retryMultiplier: 1.0,
        cacheableContextTokens: 1_000_000,
      });
      // 1M tokens * $0.00000625 = $6.25
      expect(est.totalApiCostUsd).toBeCloseTo(6.25, 2);
    });
  });

  describe('retry multiplier', () => {
    it('applies retry multiplier to all token counts', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 1_000_000,
          estimatedOutputTokens: 0,
          billingMode: 'api',
        },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG, {
        cacheHitRatio: 0,
        retryMultiplier: 2.0, // 2x retry
        cacheableContextTokens: 0,
      });
      // 2x * 1M * $0.000005 = $10
      expect(est.totalApiCostUsd).toBeCloseTo(10, 2);
    });
  });

  describe('confidence intervals', () => {
    it('naive is 70% of realistic', () => {
      const tasks: TaskCostInput[] = [{ id: '001', model: 'opus', estimatedInputTokens: 1000, estimatedOutputTokens: 500 }];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      expect(est.costNaive).toBeCloseTo(est.costRealistic * 0.7, 4);
    });

    it('worst case is 160% of realistic', () => {
      const tasks: TaskCostInput[] = [{ id: '001', model: 'opus', estimatedInputTokens: 1000, estimatedOutputTokens: 500 }];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      expect(est.costWorstCase).toBeCloseTo(est.costRealistic * 1.6, 4);
    });
  });

  describe('multi-provider mixed billing', () => {
    it('handles Opus subs + GPT-5 API + Gemini free', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 2000,
          estimatedOutputTokens: 1000,
          billingMode: 'subscription', // Opus via subscription
        },
        {
          id: '002',
          model: 'gpt-5',
          estimatedInputTokens: 2000,
          estimatedOutputTokens: 1000,
          billingMode: 'api', // GPT-5 via API
        },
        {
          id: '003',
          model: 'gemini-2-5-flash',
          estimatedInputTokens: 2000,
          estimatedOutputTokens: 1000,
          billingMode: 'free_tier', // Gemini free
        },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1 });

      // Only GPT-5 contributes USD cost (the others are subscription/free)
      expect(est.perProvider.openai?.totalApiCostUsd).toBeGreaterThan(0);
      expect(est.perProvider.anthropic?.totalApiCostUsd).toBe(0);
      expect(est.perProvider.google?.totalApiCostUsd).toBe(0);

      // But subscription impact should be calculated for anthropic
      expect(est.subscriptionImpact.anthropic?.dailyPercent).toBeGreaterThan(0);
      expect(est.perProvider.anthropic?.billingMode).toBe('subscription');
      expect(est.perProvider.openai?.billingMode).toBe('api');
      expect(est.perProvider.google?.billingMode).toBe('free_tier');
    });

    it('aggregates task counts per provider', () => {
      const tasks: TaskCostInput[] = [
        { id: '001', model: 'opus', estimatedInputTokens: 100, estimatedOutputTokens: 100 },
        { id: '002', model: 'sonnet', estimatedInputTokens: 100, estimatedOutputTokens: 100 },
        { id: '003', model: 'sonnet', estimatedInputTokens: 100, estimatedOutputTokens: 100 },
        { id: '004', model: 'gpt-5', estimatedInputTokens: 100, estimatedOutputTokens: 100 },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      expect(est.perProvider.anthropic?.taskCount).toBe(3);
      expect(est.perProvider.openai?.taskCount).toBe(1);
      expect(est.perProvider.anthropic?.models['claude-opus-4-6']?.taskCount).toBe(1);
      expect(est.perProvider.anthropic?.models['claude-sonnet-4-6']?.taskCount).toBe(2);
    });
  });

  describe('context fit check', () => {
    it('warns when task exceeds context window', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'gpt-5', // 272K context
          estimatedInputTokens: 500_000,
          estimatedOutputTokens: 1000,
        },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheableContextTokens: 0 });
      expect(est.warnings.some((w) => /context window/.test(w))).toBe(true);
    });

    it('passes when task fits in 1M Opus context', () => {
      const tasks: TaskCostInput[] = [
        {
          id: '001',
          model: 'opus',
          estimatedInputTokens: 500_000,
          estimatedOutputTokens: 1000,
        },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheableContextTokens: 0 });
      expect(est.warnings.filter((w) => /context window/.test(w))).toHaveLength(0);
    });
  });

  describe('budget check', () => {
    it('marks withinBudget false when exceeds', () => {
      const tasks: TaskCostInput[] = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        model: 'opus',
        estimatedInputTokens: 100_000,
        estimatedOutputTokens: 10_000,
        billingMode: 'api' as const,
      }));
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      // 100 * 100K opus input + 100 * 10K opus output = ~$55 → exceeds $5 budget
      expect(est.withinBudget).toBe(false);
      expect(est.warnings.some((w) => /EXCEEDS|exceeds sprint budget/i.test(w))).toBe(true);
    });

    it('marks withinBudget true when under', () => {
      const tasks: TaskCostInput[] = [
        { id: '001', model: 'opus', estimatedInputTokens: 1000, estimatedOutputTokens: 500 },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      expect(est.withinBudget).toBe(true);
    });
  });

  describe('unknown model handling', () => {
    it('warns on unknown model', () => {
      const tasks: TaskCostInput[] = [
        { id: '001', model: 'fictional-gpt-99', estimatedInputTokens: 100, estimatedOutputTokens: 100 },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      expect(est.warnings.some((w) => /Unknown model/.test(w))).toBe(true);
      expect(est.totalApiCostUsd).toBe(0);
    });

    it('still counts known models when some are unknown', () => {
      const tasks: TaskCostInput[] = [
        { id: '001', model: 'opus', estimatedInputTokens: 1000, estimatedOutputTokens: 500 },
        { id: '002', model: 'mystery-model', estimatedInputTokens: 1000, estimatedOutputTokens: 500 },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      expect(est.totalApiCostUsd).toBeGreaterThan(0); // opus counted
      expect(est.warnings.some((w) => /mystery-model/.test(w))).toBe(true);
    });
  });

  describe('formatEstimate', () => {
    it('produces human-readable output with all sections', () => {
      const tasks: TaskCostInput[] = [
        { id: '001', model: 'opus', estimatedInputTokens: 1000, estimatedOutputTokens: 500 },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      const output = formatEstimate(est);

      expect(output).toContain('Sprint Cost Estimate');
      expect(output).toContain('Task count:');
      expect(output).toContain('Model distribution:');
      expect(output).toContain('Token Estimate:');
      expect(output).toContain('Cost Breakdown (USD):');
      expect(output).toContain('Realistic:');
      expect(output).toContain('Optimistic');
      expect(output).toContain('Worst case');
      expect(output).toContain('Budget check:');
    });

    it('shows subscription impact for subs billing', () => {
      const tasks: TaskCostInput[] = [
        { id: '001', model: 'opus', estimatedInputTokens: 50000, estimatedOutputTokens: 10000, billingMode: 'subscription' },
      ];
      const est = estimateSprintCost(tasks, TEST_CONFIG);
      const output = formatEstimate(est);
      expect(output).toContain('Subscription impact');
      expect(output).toContain('daily');
    });
  });

  describe('Sprint 140 disaster reproduction (regression test)', () => {
    it('estimates 409 task analysis sprint realistically', () => {
      // Reproduction of Sprint 140's planned workload
      const tasks: TaskCostInput[] = Array.from({ length: 409 }, (_, i) => ({
        id: `${i}`,
        model: 'sonnet',
        estimatedInputTokens: 2700, // Sprint 140 measured
        estimatedOutputTokens: 1500,
        billingMode: 'api' as const,
      }));
      const est = estimateSprintCost(tasks, TEST_CONFIG, {
        cacheHitRatio: 0.7,
        retryMultiplier: 1.2,
        cacheableContextTokens: 8000,
      });

      // Should be realistic — $15-30 range, not $42 (Sprint 140 was cascade retry disaster)
      expect(est.costRealistic).toBeGreaterThan(10);
      expect(est.costRealistic).toBeLessThan(60);
      // Budget check should catch this
      expect(est.withinBudget).toBe(false); // $5 sprint budget in TEST_CONFIG
    });
  });
});
