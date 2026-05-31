/**
 * Tests for catalog-aware model label in cost-calculator
 * Task 207-003: formatEstimate should show live registry apiId, not stale cost-config key
 */

import { describe, expect, it } from 'vitest';
import { estimateSprintCost, formatEstimate, type TaskCostInput } from '../../src/core/cost-calculator.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// Test config mirrors real billing structure.
// Intentionally uses old key 'claude-opus-4-6' in cost-config to verify that
// formatEstimate shows the live registry apiId ('claude-opus-4-8') instead.
const TEST_CONFIG: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'api',
      models: {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000015,
          output_cost_per_token: 0.000075,
          max_input_tokens: 200_000,
          deckent_tier: 'premium',
          deckent_aliases: ['opus'],
          enabled: true,
        },
        'claude-sonnet-4-6': {
          input_cost_per_token: 0.000003,
          output_cost_per_token: 0.000015,
          max_input_tokens: 200_000,
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
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.000015,
          max_input_tokens: 200_000,
          deckent_tier: 'premium',
          deckent_aliases: ['gpt-5'],
          enabled: true,
        },
      },
    },
  },
  cost_limits: { sprint_max_usd: 10.0, daily_max_usd: 100.0 },
  update_config: { sources_priority: ['litellm'] },
};

describe('cost-model-label (207-003)', () => {
  it('label comes from live registry apiId, not stale cost-config key', () => {
    // cost-config has 'claude-opus-4-6' but registry (post 207-001) has opus.apiId='claude-opus-4-8'
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'opus', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    const output = formatEstimate(est);

    // Should show the live registry apiId (claude-opus-4-8), not the stale cost-config key
    expect(output).toContain('claude-opus-4-8');
    // Should NOT show the stale key
    expect(output).not.toContain('claude-opus-4-6');
  });

  it('graceful fallback: unknown model uses cost-config key when not in registry', () => {
    // 'gpt-5' is in cost-config but might not be in the default registry with that exact id
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'gpt-5', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    // Should not throw even if registry doesn't have 'gpt-5'
    expect(() => formatEstimate(est)).not.toThrow();
    const output = formatEstimate(est);
    // Should still show something in model distribution
    expect(output).toContain('Model distribution');
    expect(output).toContain('openai');
  });

  it('tier is correctly mapped from cost-config regardless of display label', () => {
    // Tier assignment should not be affected by the display label change
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'opus', estimatedInputTokens: 1_000_000, estimatedOutputTokens: 0, billingMode: 'api' },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    // Cost should be calculated correctly (1M input * $0.000015 = $15)
    expect(est.totalApiCostUsd).toBeCloseTo(15, 2);
    // perProvider still keyed by cost-config modelId (backward compat)
    expect(est.perProvider.anthropic?.models['claude-opus-4-6']?.taskCount).toBe(1);
  });

  it('provider prefix is correct in model distribution output', () => {
    const tasks: TaskCostInput[] = [
      { id: '001', model: 'opus', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
      { id: '002', model: 'sonnet', estimatedInputTokens: 100, estimatedOutputTokens: 50 },
    ];
    const est = estimateSprintCost(tasks, TEST_CONFIG, { cacheHitRatio: 0, retryMultiplier: 1, cacheableContextTokens: 0 });
    const output = formatEstimate(est);

    // anthropic provider should appear as prefix
    expect(output).toContain('anthropic/');
    // Both claude models should be listed
    expect(output).toContain('claude-opus-4-8');
    // sonnet apiId from registry (claude-sonnet-4-6 — unchanged in 207-001)
    expect(output).toMatch(/anthropic\/claude-sonnet/);
  });
});
