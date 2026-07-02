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

describe('model-registry: CODEX_PARITY_MODELS (gpt-5.5)', () => {
  it('is not part of BUILTIN_MODELS — preserves the hardcoded builtin-count invariant', () => {
    expect(BUILTIN_MODELS.some(m => m.id === 'gpt-5.5')).toBe(false);
  });

  it('declares gpt-5.5 with feed-verified fields', () => {
    const def = CODEX_PARITY_MODELS.find(m => m.id === 'gpt-5.5');
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

  it('registerCodexParityModels() makes gpt-5.5 first-class and resolvable on a fresh registry', () => {
    const registry = new ModelRegistry();
    expect(registry.has('gpt-5.5')).toBe(false);
    registerCodexParityModels(registry);
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

  it('does not disturb the existing gpt-5 apiId shim (Sprint 248)', () => {
    const registry = new ModelRegistry();
    registerCodexParityModels(registry);
    const gpt5 = registry.get('gpt-5');
    expect(gpt5).toBeDefined();
    expect(gpt5!.apiId).toBe('gpt-5.5');
    expect(gpt5!.tier).toBe('premium');
    // Insertion order is preserved: the legacy 'gpt-5' shim still wins the
    // provider+tier lookup after the parity entry is registered.
    expect(registry.getByProviderAndTier('codex', 'premium')!.id).toBe('gpt-5');
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
