import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  calculateRegimeCost,
  billingModeToRegime,
  type RegimeCostUsage,
} from '../../src/core/cost-calculator.js';
import { ModelRegistry } from '../../src/core/model-registry.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────
// A fresh ModelRegistry (BUILTIN_MODELS copy) is injected so pricing is
// deterministic regardless of global-singleton mutation by other suites.
// Built-in opus = $5/$25 per MTok (4.5+ repricing, registry SSOT).
const REGISTRY = new ModelRegistry();
// Opus 4.5+ repricing ($5/$25 — pricing-data-baseline.json SSOT; registry synced,
// these constants follow). Old $15/$75 was pre-4.5 Opus pricing.
const OPUS_IN = 5 / 1_000_000; // $0.000005 / token
const OPUS_OUT = 25 / 1_000_000; // $0.000025 / token

/** Config whose exact Opus API ID carries REAL per-model cache prices. */
const CONFIG_WITH_OPUS_CACHE: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'api',
      models: {
        'claude-opus-4-8': {
          // Deliberately DIFFERENT from the registry ($50 vs $5) to prove the
          // registry — not the cost-config — is the in/out price source.
          input_cost_per_token: 0.00005,
          output_cost_per_token: 0.00025,
          cache_read_input_token_cost: 0.0000005, // $0.50/MTok
          cache_creation_input_token_cost: 0.00000625, // $6.25/MTok
          max_input_tokens: 1_000_000,
          supports_prompt_caching: true,
          deckent_aliases: ['opus'],
          enabled: true,
        },
      },
    },
  },
  cost_limits: { sprint_max_usd: 5, daily_max_usd: 50 },
  update_config: { sources_priority: ['litellm'] },
};

/** Config that does NOT know the exact Opus API ID (so api regime must fall back to archetype-B cache
 *  defaults) but DOES carry a config-only model absent from the registry. */
const CONFIG_NO_OPUS: CostConfig = {
  _version: '1.0',
  providers: {
    legacy: {
      enabled: true,
      billing_modes_supported: ['api'],
      default_billing_mode: 'api',
      models: {
        'legacy-config-model': {
          input_cost_per_token: 0.000002, // $2/MTok
          output_cost_per_token: 0.000008, // $8/MTok
          max_input_tokens: 200_000,
          enabled: true,
        },
      },
    },
  },
  cost_limits: { sprint_max_usd: 5, daily_max_usd: 50 },
  update_config: { sources_priority: ['litellm'] },
};

// ─── billingModeToRegime ──────────────────────────────────────────────────
describe('billingModeToRegime', () => {
  it('maps subscription/api/local directly and free_tier → local', () => {
    expect(billingModeToRegime('subscription')).toBe('subscription');
    expect(billingModeToRegime('api')).toBe('api');
    expect(billingModeToRegime('local')).toBe('local');
    expect(billingModeToRegime('free_tier')).toBe('local');
  });
});

// ─── subscription regime — limit-burn unit ─────────────────────────────────
describe('calculateRegimeCost — subscription (limit-burn)', () => {
  it('counts cacheRead as ZERO weight (cacheRead never affects the burn)', () => {
    const base: RegimeCostUsage = { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0 };
    const noRead = calculateRegimeCost({ ...base, cacheReadTokens: 0 }, 'claude-opus-4-8', 'subscription', CONFIG_WITH_OPUS_CACHE, REGISTRY);
    const hugeRead = calculateRegimeCost({ ...base, cacheReadTokens: 5_000_000 }, 'claude-opus-4-8', 'subscription', CONFIG_WITH_OPUS_CACHE, REGISTRY);

    expect(noRead.value).toBeCloseTo(hugeRead.value, 10); // identical → cacheRead is free
    expect(noRead.value).toBeCloseTo(1_000_000 * OPUS_IN, 6); // input-only burn
    expect(noRead.isLimitBurn).toBe(true);
    expect(noRead.regime).toBe('subscription');
  });

  it('prices cacheWrite at 1.25×input', () => {
    const r = calculateRegimeCost(
      { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 1_000_000 },
      'claude-opus-4-8',
      'subscription',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    // 1M cacheWrite × (1.25 × $0.000005) = $6.25
    expect(r.value).toBeCloseTo(1_000_000 * 1.25 * OPUS_IN, 6);
    expect(r.value).toBeCloseTo(6.25, 4);
  });

  it('full formula = in·$in + out·$out + cacheWrite·1.25·$in', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000 },
      'claude-opus-4-8',
      'subscription',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    const expected = 1_000_000 * OPUS_IN + 1_000_000 * OPUS_OUT + 1_000_000 * 1.25 * OPUS_IN;
    expect(r.value).toBeCloseTo(expected, 6); // 5 + 25 + 6.25 = 36.25 (cacheRead excluded)
    expect(r.value).toBeCloseTo(36.25, 4);
  });
});

// ─── api regime — registry-fed price + measured ratio ──────────────────────
describe('calculateRegimeCost — api ($-per-token)', () => {
  it('pulls per-model in/out price from the REGISTRY, not the cost-config', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 0 },
      'claude-opus-4-8',
      'api',
      CONFIG_WITH_OPUS_CACHE, // config says $50/MTok; registry says $5/MTok
      REGISTRY,
    );
    expect(r.value).toBeCloseTo(5, 4); // registry $5, NOT config $50
    expect(r.pricingSource).toBe('registry:claude-opus-4-8');
  });

  it('charges cacheRead (discounted) — unlike subscription, it is NOT free', () => {
    const usage: RegimeCostUsage = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 };
    const api = calculateRegimeCost(usage, 'claude-opus-4-8', 'api', CONFIG_WITH_OPUS_CACHE, REGISTRY);
    const sub = calculateRegimeCost(usage, 'claude-opus-4-8', 'subscription', CONFIG_WITH_OPUS_CACHE, REGISTRY);

    // api uses config cacheRead price $0.50/MTok → 5 + 0.5 = 5.5
    expect(api.value).toBeCloseTo(5 + 0.5, 4);
    // subscription ignores cacheRead → 5 only
    expect(sub.value).toBeCloseTo(5, 4);
    expect(api.value).toBeGreaterThan(sub.value);
  });

  it('measures the cache-hit ratio from real token counts (never assumed)', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 0 },
      'claude-opus-4-8',
      'api',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    // cacheRead / (input + cacheRead + cacheWrite) = 1M / 2M = 0.5
    expect(r.measuredHitRatio).toBeCloseTo(0.5, 6);
    expect(r.isLimitBurn).toBe(false);
  });

  it('falls back to archetype-B cache weights when the config has no per-model cache price', () => {
    const r = calculateRegimeCost(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheCreationTokens: 1_000_000 },
      'claude-opus-4-8',
      'api',
      CONFIG_NO_OPUS, // opus absent from config → derive cache prices from input
      REGISTRY,
    );
    // cacheRead = 1M × (0.10 × $0.000005) = 0.5 ; cacheWrite = 1M × (1.25 × $0.000005) = 6.25
    const expected = 1_000_000 * 0.1 * OPUS_IN + 1_000_000 * 1.25 * OPUS_IN;
    expect(r.value).toBeCloseTo(expected, 6); // 0.5 + 6.25 = 6.75
    expect(r.value).toBeCloseTo(6.75, 4);
    expect(r.pricingSource).toBe('registry:claude-opus-4-8');
  });
});

// ─── local regime + unknown model + config fallback ────────────────────────
describe('calculateRegimeCost — local / unknown / config-fallback', () => {
  it('local regime is always $0 regardless of tokens', () => {
    const r = calculateRegimeCost(
      { inputTokens: 5_000_000, outputTokens: 500_000, cacheCreationTokens: 1_000_000 },
      'claude-opus-4-8',
      'local',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    expect(r.value).toBe(0);
    expect(r.pricingSource).toBe('local');
    expect(r.isLimitBurn).toBe(false);
  });

  it('unknown model → $0 with an honest unknown-model pricing source (never silently priced)', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'fictional-model-99',
      'api',
      CONFIG_NO_OPUS,
      REGISTRY,
    );
    expect(r.value).toBe(0);
    expect(r.pricingSource).toBe('unknown-model:fictional-model-99');
  });

  it('falls back to cost-config price for a model absent from the registry', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 0 },
      'legacy-config-model',
      'api',
      CONFIG_NO_OPUS,
      REGISTRY,
    );
    // config in price $2/MTok → $2
    expect(r.value).toBeCloseTo(2, 4);
    expect(r.pricingSource).toBe('cost-config:legacy/legacy-config-model');
  });
});

// ─── Regression guard: the 0.70 / 8000 hardcodes are gone ──────────────────
describe('Spec Pillar 5 — no fabricated cache hardcodes', () => {
  it('cost-calculator.ts contains neither DEFAULT_CACHE_HIT_RATIO=0.70 nor DEFAULT_CACHEABLE_CONTEXT=8000', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../../src/core/cost-calculator.ts', import.meta.url)),
      'utf-8',
    );
    expect(src).not.toContain('DEFAULT_CACHE_HIT_RATIO');
    expect(src).not.toContain('DEFAULT_CACHEABLE_CONTEXT');
    expect(src).not.toContain('0.70');
    expect(src).not.toMatch(/=\s*8000\b/);
  });
});
