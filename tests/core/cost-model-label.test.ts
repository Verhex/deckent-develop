/**
 * Tests for catalog-aware model label in cost-calculator
 * Task 207-003: formatEstimate should show live registry apiId, not stale cost-config key
 */

import { describe, expect, it } from 'vitest';
import { estimateSprintCost, formatEstimate, type TaskCostInput } from '../../src/core/cost-calculator.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// Test config mirrors the canonical billing structure: cost keys and task model
// identities are exact provider API IDs, never legacy aliases.
const TEST_CONFIG: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'api',
      models: {
        'claude-opus-4-8': {
          input_cost_per_token: 0.000015,
          output_cost_per_token: 0.000075,
          max_input_tokens: 200_000,
          deckent_tier: 'premium',
          deckent_aliases: [],
          enabled: true,
        },
        'claude-sonnet-5': {
          input_cost_per_token: 0.000003,
          output_cost_per_token: 0.000015,
          max_input_tokens: 200_000,
          deckent_tier: 'standard',
          deckent_aliases: [],
          enabled: true,
        },
      },
    },
    openai: {
      enabled: true,
      billing_modes_supported: ['api'],
      default_billing_mode: 'api',
      models: {
        'gpt-5.6-sol': {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.000015,
          max_input_tokens: 200_000,
          deckent_tier: 'premium',
          deckent_aliases: [],
          enabled: true,
        },
      },
    },
  },
  cost_limits: { sprint_max_usd: 10.0, daily_max_usd: 100.0 },
  update_config: { sources_priority: ['litellm'] },
};

describe('cost-model-label (207-003)', () => {
  it('label preserves the exact canonical registry API ID', () => {
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'claude-opus-4-8', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    const output = formatEstimate(est);

    expect(output).toContain('claude-opus-4-8');
  });

  it('uses an exact canonical cost-config key without alias normalization', () => {
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'gpt-5.6-sol', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    expect(() => formatEstimate(est)).not.toThrow();
    const output = formatEstimate(est);
    expect(output).toContain('Model distribution');
    expect(output).toContain('openai');
    expect(output).toContain('gpt-5.6-sol');
  });

  it('tier is correctly mapped from cost-config regardless of display label', () => {
    // Tier assignment should not be affected by the display label change
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'claude-opus-4-8', estimatedInputTokens: 1_000_000, estimatedOutputTokens: 0, billingMode: 'api' },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    // Cost should be calculated correctly (1M input * $0.000015 = $15)
    expect(est.totalApiCostUsd).toBeCloseTo(15, 2);
    expect(est.perProvider.anthropic?.models['claude-opus-4-8']?.taskCount).toBe(1);
  });

  it('provider prefix is correct in model distribution output', () => {
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'claude-opus-4-8', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
      { id: '002', model: 'claude-sonnet-5', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    const output = formatEstimate(est);

    // anthropic provider should appear as prefix
    expect(output).toContain('anthropic/');
    // Both claude models should be listed
    expect(output).toContain('claude-opus-4-8');
    // sonnet apiId comes from the live registry (currently claude-sonnet-5) — loose
    // prefix match so this stays valid across future sonnet apiId bumps.
    expect(output).toMatch(/anthropic\/claude-sonnet/);
  });
});
