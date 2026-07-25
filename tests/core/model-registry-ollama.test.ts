// Sprint 202 F1 P0 — Ollama model registry tier→local model resolution.
// Verifies that `getByProviderAndTier('ollama', tier)` works after the
// opt-in `registerOllamaModels()` is called, that all Ollama entries have
// cost=0, and that the canonical BUILTIN invariant is preserved.

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry, BUILTIN_MODELS, registerOllamaModels } from '../../src/core/model-registry.js';
import { OLLAMA_BUILTIN_MODELS } from '../../src/core/ollama-models.js';

const OLLAMA = 'ollama' as const;

describe('OLLAMA_BUILTIN_MODELS catalog (src/core/ollama-models.ts)', () => {
  it('contains at least 3 Ollama entries (premium/standard/economy coverage)', () => {
    expect(OLLAMA_BUILTIN_MODELS.length).toBeGreaterThanOrEqual(3);
  });

  it('every entry declares provider="ollama"', () => {
    for (const m of OLLAMA_BUILTIN_MODELS) {
      expect(m.provider).toBe('ollama');
    }
  });

  it('preserves the provider wire tag byte-for-byte as the canonical identity', () => {
    for (const m of OLLAMA_BUILTIN_MODELS) {
      expect(m.id).toBe(m.apiId);
    }
  });

  it('every entry has zero cost (local inference)', () => {
    for (const m of OLLAMA_BUILTIN_MODELS) {
      expect(m.costPerMillion.input).toBe(0);
      expect(m.costPerMillion.output).toBe(0);
    }
  });

  it('covers all three resolvable tiers (premium, standard, economy)', () => {
    const tiers = new Set(OLLAMA_BUILTIN_MODELS.map(m => m.tier));
    expect(tiers.has('premium')).toBe(true);
    expect(tiers.has('standard')).toBe(true);
    expect(tiers.has('economy')).toBe(true);
  });
});

describe('ModelRegistry — Ollama tier resolution (opt-in)', () => {
  let registry: ModelRegistry;

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  it('returns undefined for ollama tier BEFORE registerOllamaModels is called', () => {
    expect(registry.getByProviderAndTier(OLLAMA, 'premium')).toBeUndefined();
    expect(registry.getByProviderAndTier(OLLAMA, 'standard')).toBeUndefined();
    expect(registry.getByProviderAndTier(OLLAMA, 'economy')).toBeUndefined();
  });

  it('resolves premium tier to a qwen-coder-32b-class model after registration', () => {
    registerOllamaModels(registry);
    const model = registry.getByProviderAndTier(OLLAMA, 'premium');
    expect(model).toBeDefined();
    expect(model!.provider).toBe('ollama');
    expect(model!.tier).toBe('premium');
    expect(model!.apiId).toContain('qwen2.5-coder:32b');
  });

  it('resolves standard tier to a coding-tuned Ollama model after registration', () => {
    registerOllamaModels(registry);
    const model = registry.getByProviderAndTier(OLLAMA, 'standard');
    expect(model).toBeDefined();
    expect(model!.provider).toBe('ollama');
    expect(model!.tier).toBe('standard');
  });

  it('resolves economy tier to a llama3.2-class model after registration', () => {
    registerOllamaModels(registry);
    const model = registry.getByProviderAndTier(OLLAMA, 'economy');
    expect(model).toBeDefined();
    expect(model!.provider).toBe('ollama');
    expect(model!.tier).toBe('economy');
    expect(model!.apiId).toContain('llama3.2');
  });

  it('returns undefined for premium_plus (unmapped tier) even after registration', () => {
    registerOllamaModels(registry);
    expect(registry.getByProviderAndTier(OLLAMA, 'premium_plus')).toBeUndefined();
  });

  it('is idempotent — calling registerOllamaModels twice does not duplicate entries', () => {
    registerOllamaModels(registry);
    const firstCount = registry.getByProvider(OLLAMA).length;
    registerOllamaModels(registry);
    const secondCount = registry.getByProvider(OLLAMA).length;
    expect(secondCount).toBe(firstCount);
  });

  it('preserves the 15-model BUILTIN invariant — Ollama models are NOT in BUILTIN_MODELS', () => {
    expect(BUILTIN_MODELS).toHaveLength(15);
    const builtinProviders = new Set(BUILTIN_MODELS.map(m => m.provider));
    expect(builtinProviders.has('ollama')).toBe(false);
  });

  it('grows the registry by exactly OLLAMA_BUILTIN_MODELS.length after registration', () => {
    const before = registry.getAllModelIds().length;
    expect(before).toBeGreaterThan(BUILTIN_MODELS.length);
    registerOllamaModels(registry);
    const after = registry.getAllModelIds().length;
    expect(after - before).toBe(OLLAMA_BUILTIN_MODELS.length);
  });
});
