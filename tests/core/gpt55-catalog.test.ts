// Sprint 360 task 360-004 — GPT55-CATALOG: gpt-5.5 model-kaydı (feed-fiyatlı,
// zero-hardcode). Verifies the opt-in CODEX_PARITY_MODELS catalog entry in
// model-registry.ts and the matching feed-verified baseline pricing entry.
//
// CODEX_PARITY_MODELS is kept OUT of BUILTIN_MODELS on purpose (mirrors
// OLLAMA_BUILTIN_MODELS): tests/core/model-registry-apiid.test.ts,
// tests/core/model-registry-ollama.test.ts and tests/core/model-registry.test.ts
// all hardcode the BUILTIN_MODELS / modelRegistry builtin count to 14 and are
// outside this task's write scope, so growing BUILTIN_MODELS directly would
// regress them. registerCodexParityModels() is the opt-in activation path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ModelRegistry,
  BUILTIN_MODELS,
  CODEX_PARITY_MODELS,
  registerCodexParityModels,
} from '../../src/core/model-registry.js';
import { loadCostConfig, findModel } from '../../src/core/cost-config-loader.js';

describe('model-registry: canonical gpt-5.5', () => {
  it('is a canonical core model, not an alias shim', () => {
    expect(BUILTIN_MODELS.some(m => m.id === 'gpt-5.5' && m.apiId === m.id)).toBe(true);
  });

  it('declares gpt-5.5 with feed-verified fields', () => {
    const def = BUILTIN_MODELS.find(m => m.id === 'gpt-5.5');
    expect(def).toBeDefined();
    expect(def!.apiId).toBe('gpt-5.5');
    expect(def!.provider).toBe('codex');
    expect(def!.tier).toBe('premium');
    expect(def!.contextWindow).toBe(1_050_000);
    expect(def!.maxOutputTokens).toBe(128_000);
    expect(def!.costPerMillion).toEqual({ input: 5, output: 30 });
    expect(def!.status).toBe('ga');
    expect(def!.capabilities.streaming).toBe(true);
    expect(def!.capabilities.toolUse).toBe(true);
    expect(def!.capabilities.vision).toBe(true);
    expect(def!.capabilities.reasoning).toBe(true);
  });

  it('is first-class and resolvable on a fresh registry', () => {
    const registry = new ModelRegistry();
    expect(registry.has('gpt-5.5')).toBe(true);
    expect(registry.resolveApiId('gpt-5.5')).toBe('gpt-5.5');
    expect(registry.getTier('gpt-5.5')).toBe('premium');
    expect(registry.getByProvider('codex').some(m => m.id === 'gpt-5.5')).toBe(true);
    expect(registry.estimateCost('gpt-5.5', 1_000_000, 1_000_000)).toBe(35);
  });

  it('is idempotent — calling twice does not duplicate the codex catalog', () => {
    const registry = new ModelRegistry();
    registerCodexParityModels(registry);
    const firstCount = registry.getByProvider('codex').length;
    registerCodexParityModels(registry);
    expect(registry.getByProvider('codex').length).toBe(firstCount);
  });

  it('does not register the removed gpt-5 alias', () => {
    const registry = new ModelRegistry();
    registerCodexParityModels(registry);
    expect(registry.get('gpt-5')).toBeUndefined();
    expect(registry.getByProviderAndTier('codex', 'premium')!.id).toBe('gpt-5.5');
  });
});

describe('model-registry: gpt-5.6 family (Alperen 2026-07-11, feed-verified)', () => {
  const FAMILY = [
    { id: 'gpt-5.6-sol', tier: 'premium', cost: { input: 5, output: 30 } },
    { id: 'gpt-5.6-terra', tier: 'standard', cost: { input: 2.5, output: 15 } },
    { id: 'gpt-5.6-luna', tier: 'economy', cost: { input: 1, output: 6 } },
  ] as const;

  it('declares all three pinned API IDs outside the 14 core entries', () => {
    for (const { id, tier, cost } of FAMILY) {
      expect(BUILTIN_MODELS.some(m => m.id === id)).toBe(false);
      const def = CODEX_PARITY_MODELS.find(m => m.id === id);
      expect(def, id).toBeDefined();
      expect(def!.apiId).toBe(id);
      expect(def!.provider).toBe('codex');
      expect(def!.tier).toBe(tier);
      expect(def!.contextWindow).toBe(1_050_000);
      expect(def!.maxOutputTokens).toBe(128_000);
      expect(def!.costPerMillion).toEqual(cost);
      expect(def!.capabilities.reasoning).toBe(true);
    }
  });

  it('registerCodexParityModels() makes the family first-class on a fresh registry', () => {
    const registry = new ModelRegistry();
    registerCodexParityModels(registry);
    for (const { id, tier } of FAMILY) {
      expect(registry.has(id), id).toBe(true);
      expect(registry.resolveApiId(id)).toBe(id);
      expect(registry.getTier(id)).toBe(tier);
    }
  });

  it('providers/codex.ts module-load registers the parity catalog on the GLOBAL registry (half-wire closed 2026-07-11)', async () => {
    // Before 2026-07-11 registerCodexParityModels had ZERO callers in src/ —
    // gpt-5.5 was reachable only via the legacy gpt-5 apiId shim. The codex
    // provider module now registers the family at import time (mirrors
    // providers/ollama.ts). Importing the module must be sufficient.
    await import('../../src/providers/codex.js');
    const { modelRegistry } = await import('../../src/core/model-registry.js');
    for (const id of ['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
      expect(modelRegistry.has(id), id).toBe(true);
    }
    expect(modelRegistry.has('gpt-5.6')).toBe(false);
  });
});

describe('pricing-data-baseline.json: providers.openai.models gpt-5.6 family', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-gpt56-catalog-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ships feed-verified entries with per-model aliases', () => {
    const config = loadCostConfig(tmpDir, { forceReload: true });
    const cases: Array<[string, number, number, string, string[]]> = [
      ['gpt-5.6', 0.000005, 0.00003, 'premium', ['gpt-5.6', 'gpt56']],
      ['gpt-5.6-sol', 0.000005, 0.00003, 'premium', ['gpt-5.6-sol', 'gpt56-sol', 'sol']],
      ['gpt-5.6-terra', 0.0000025, 0.000015, 'standard', ['gpt-5.6-terra', 'gpt56-terra', 'terra']],
      ['gpt-5.6-luna', 0.000001, 0.000006, 'economy', ['gpt-5.6-luna', 'gpt56-luna', 'luna']],
    ];
    for (const [id, inCost, outCost, tier, aliases] of cases) {
      const pricing = config.providers.openai?.models[id];
      expect(pricing, id).toBeDefined();
      expect(pricing!.input_cost_per_token).toBe(inCost);
      expect(pricing!.output_cost_per_token).toBe(outCost);
      expect(pricing!.deckent_tier).toBe(tier);
      expect(pricing!.deckent_aliases).toEqual(aliases);
      // unit-safety pin (per-token, not per-MTok)
      expect(pricing!.input_cost_per_token).toBeLessThan(0.01);
    }
  });

  it('is resolvable via findModel() by short alias (sol/terra/luna)', () => {
    const config = loadCostConfig(tmpDir, { forceReload: true });
    expect(findModel(config, 'sol')?.modelId).toBe('gpt-5.6-sol');
    expect(findModel(config, 'terra')?.modelId).toBe('gpt-5.6-terra');
    expect(findModel(config, 'luna')?.modelId).toBe('gpt-5.6-luna');
  });
});

describe('pricing-data-baseline.json: providers.openai.models["gpt-5.5"]', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-gpt55-catalog-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ships a feed-verified gpt-5.5 entry (no user cost-config.json present)', () => {
    const config = loadCostConfig(tmpDir, { forceReload: true });
    const pricing = config.providers.openai?.models['gpt-5.5'];
    expect(pricing).toBeDefined();
    expect(pricing!.input_cost_per_token).toBe(0.000005);
    expect(pricing!.output_cost_per_token).toBe(0.00003);
    expect(pricing!.cache_read_input_token_cost).toBe(0.0000005);
    expect(pricing!.max_input_tokens).toBe(1_050_000);
    expect(pricing!.max_output_tokens).toBe(128_000);
    expect(pricing!.deckent_tier).toBe('premium');
    expect(pricing!.deckent_aliases).toEqual(['gpt-5.5', 'gpt55']);
    expect(pricing!.enabled).toBe(true);
    expect(pricing!._source).toBe('litellm');
  });

  it('is resolvable via findModel() by canonical id and by the gpt55 alias', () => {
    const config = loadCostConfig(tmpDir, { forceReload: true });
    expect(findModel(config, 'gpt-5.5')?.modelId).toBe('gpt-5.5');
    expect(findModel(config, 'gpt-5.5')?.provider).toBe('openai');
    expect(findModel(config, 'gpt55')?.modelId).toBe('gpt-5.5');
  });

  it('passes the unit-safety pin (per-token, not accidentally per-MTok)', () => {
    const config = loadCostConfig(tmpDir, { forceReload: true });
    const pricing = config.providers.openai!.models['gpt-5.5']!;
    expect(pricing.input_cost_per_token).toBeLessThan(0.01);
    expect(pricing.output_cost_per_token).toBeLessThan(0.01);
  });

  it('leaves the existing gpt-5 baseline entry unchanged', () => {
    const config = loadCostConfig(tmpDir, { forceReload: true });
    const gpt5 = config.providers.openai?.models['gpt-5'];
    expect(gpt5).toBeDefined();
    expect(gpt5!.input_cost_per_token).toBe(0.00000125);
    expect(gpt5!.output_cost_per_token).toBe(0.00001);
    expect(gpt5!.deckent_aliases).toEqual(['gpt-5', 'gpt5']);
  });
});
