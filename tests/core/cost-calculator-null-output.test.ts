import { describe, expect, it } from 'vitest';
import {
  calculateRegimeCost,
  type RegimeCostUsage,
} from '../../src/core/cost-calculator.js';
import { ModelRegistry } from '../../src/core/model-registry.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────
// Fresh ModelRegistry (BUILTIN_MODELS copy) → deterministic pricing regardless of
// global-singleton mutation by other suites. Built-in opus = $15/$75 per MTok.
const REGISTRY = new ModelRegistry();
// Opus 4.5+ repricing ($5/$25 — pricing-data-baseline.json SSOT; registry synced,
// these constants follow). Old $15/$75 was pre-4.5 Opus pricing.
const OPUS_IN = 5 / 1_000_000; // $0.000005 / token
const OPUS_OUT = 25 / 1_000_000; // $0.000025 / token

/** opus alias carries REAL per-model cache prices (api regime reads these). */
const CONFIG_WITH_OPUS_CACHE: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'api',
      models: {
        'claude-opus-4-8': {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.000025,
          cache_read_input_token_cost: 0.0000005,
          cache_creation_input_token_cost: 0.00000625,
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

// ─── outputTokens:null → honest under-count signal ──────────────────────────
describe('calculateRegimeCost — unmeasured output honest signal (Task 331-012)', () => {
  it('api: outputTokens:null → cost from input/cache side + outputUnmeasured:true', () => {
    const unmeasured = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: null, cacheReadTokens: 1_000_000 },
      'opus',
      'api',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    // value computed purely from input + cacheRead (output omitted) — constants-based
    expect(unmeasured.value).toBeCloseTo(5 + 0.5, 4);
    // the honest marker fires — a downstream KPI/ledger can see the under-count
    expect(unmeasured.outputUnmeasured).toBe(true);

    // PRE-FIX the null output was indistinguishable from a real 0: same numeric value,
    // but now the marker tells them apart.
    const realZero = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 1_000_000 },
      'opus',
      'api',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    expect(realZero.value).toBeCloseTo(unmeasured.value, 10); // identical $ (output side empty either way)
    expect(realZero.outputUnmeasured).toBe(false); // ...but NOT flagged — it is a genuine zero
  });

  it('api: outputTokens:undefined is also treated as unmeasured (not a real 0)', () => {
    // `outputTokens` omitted → undefined at runtime (defensive: input can arrive untyped).
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: undefined as unknown as number } as RegimeCostUsage,
      'opus',
      'api',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    expect(r.value).toBeCloseTo(5, 4); // input only
    expect(r.outputUnmeasured).toBe(true);
  });

  it('subscription: outputTokens:null → input/cacheWrite burn + outputUnmeasured:true', () => {
    const unmeasured = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: null, cacheCreationTokens: 1_000_000 },
      'opus',
      'subscription',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    // limit-burn = in·$in + cacheWrite·1.25·$in (output omitted): 5 + 6.25 = 11.25
    expect(unmeasured.value).toBeCloseTo(1_000_000 * OPUS_IN + 1_000_000 * 1.25 * OPUS_IN, 6);
    expect(unmeasured.isLimitBurn).toBe(true);
    expect(unmeasured.outputUnmeasured).toBe(true);
  });

  it('real numeric output → NO under-count marker, value byte-identical to pre-fix arithmetic', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'opus',
      'api',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    // in·$in + out·$out (real-numbers path unchanged; constants-based)
    expect(r.value).toBeCloseTo(1_000_000 * OPUS_IN + 1_000_000 * OPUS_OUT, 6);
    expect(r.value).toBeCloseTo(30, 4);
    expect(r.outputUnmeasured).toBe(false);
  });

  it('local regime carries the unmeasured flag too (value stays $0)', () => {
    const r = calculateRegimeCost(
      { inputTokens: 5_000_000, outputTokens: null },
      'opus',
      'local',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    expect(r.value).toBe(0);
    expect(r.outputUnmeasured).toBe(true);
  });

  it('unknown model carries the unmeasured flag too ($0, honest source)', () => {
    const r = calculateRegimeCost(
      { inputTokens: 1_000_000, outputTokens: null },
      'fictional-model-99',
      'api',
      CONFIG_WITH_OPUS_CACHE,
      REGISTRY,
    );
    expect(r.value).toBe(0);
    expect(r.pricingSource).toBe('unknown-model:fictional-model-99');
    expect(r.outputUnmeasured).toBe(true);
  });
});
