import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MODELS,
  CANONICAL_MODELS,
  CODEX_PARITY_MODELS,
  CONFIG_MIGRATION_TIER_OVERRIDES,
  LEGACY_MODEL_ALIASES,
  ModelRegistry,
  buildParametricModel,
  getLegacyModelMigration,
  inferProviderFromId,
  modelRegistry,
  resolveConfigMigrationModelTier,
  resolveCanonicalModelIdentity,
} from '../../src/core/model-registry.js';

describe('canonical provider API model identity', () => {
  it('uses one identity for every bundled, parity, and canonical model', () => {
    for (const model of [...BUILTIN_MODELS, ...CODEX_PARITY_MODELS, ...CANONICAL_MODELS]) {
      expect(model.id).toBe(model.apiId);
    }
  });

  it('removes runtime aliases while retaining explicit migration metadata', () => {
    for (const [legacy, canonical] of Object.entries(LEGACY_MODEL_ALIASES)) {
      expect(modelRegistry.has(legacy), legacy).toBe(false);
      expect(modelRegistry.has(canonical), canonical).toBe(true);
      expect(getLegacyModelMigration(legacy)).toBe(canonical);
    }
  });

  it('owns V1 model-to-tier migration in the registry without a consumer dictionary', () => {
    expect(CONFIG_MIGRATION_TIER_OVERRIDES).toEqual({
      o3: 'standard',
      'o4-mini': 'economy',
    });
    expect(resolveConfigMigrationModelTier('o3')).toBe('standard');
    expect(resolveConfigMigrationModelTier('o4-mini')).toBe('economy');
    expect(resolveConfigMigrationModelTier('gpt-5.6-sol')).toBe('premium_plus');
    expect(resolveConfigMigrationModelTier('fable')).toBe('premium_plus');
    expect(() => resolveConfigMigrationModelTier('unknown-model')).toThrowError(
      expect.objectContaining({ code: 'E_UNKNOWN_MODEL' }),
    );
  });

  it('resolves versioned Sol and Fable API IDs directly', () => {
    expect(modelRegistry.resolveApiId('gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(modelRegistry.resolveApiId('claude-fable-5')).toBe('claude-fable-5');
  });

  it('never treats an unowned unknown ID as Claude', () => {
    expect(inferProviderFromId('future-model-v9')).toBeUndefined();
    expect(() => buildParametricModel('future-model-v9')).toThrow(/Provider ownership is required/);
  });

  it('preserves an unambiguous or explicitly owned parametric API ID byte-for-byte', () => {
    const inferred = buildParametricModel('gpt-7.2-reasoning', {
      costPerMillion: { input: 3, output: 15 },
      pricingEvidenceRef: 'catalog:test:gpt-7.2-reasoning',
    });
    expect(inferred).toMatchObject({ id: 'gpt-7.2-reasoning', apiId: 'gpt-7.2-reasoning', provider: 'codex', status: 'preview' });

    const explicit = buildParametricModel('vendor-model-v3-2026-07-20', {
      provider: 'gemini',
      costPerMillion: { input: 2, output: 10 },
      pricingEvidenceRef: 'catalog:test:vendor-model-v3-2026-07-20',
    });
    expect(explicit).toMatchObject({ id: 'vendor-model-v3-2026-07-20', apiId: 'vendor-model-v3-2026-07-20', provider: 'gemini' });
  });

  it('rejects dual identity at parametric and registry mutation boundaries', () => {
    expect(() => buildParametricModel('gpt-7', { apiId: 'gpt-7-latest' })).toThrow(/cannot remap/);
    const registry = new ModelRegistry([]);
    expect(() => registry.register({
      id: 'display-name',
      apiId: 'provider-name-v1',
      provider: 'claude',
      tier: 'standard',
      contextWindow: 100_000,
      costPerMillion: { input: 1, output: 2 },
      capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
      status: 'preview',
    })).toThrow(/provider API ID unchanged/);
    expect(registry.getAllModelIds()).toEqual([]);
  });

  it('enforces canonical authoring ownership without runtime alias migration', () => {
    expect(() => resolveCanonicalModelIdentity('gpt-5')).toThrowError(expect.objectContaining({ code: 'E_LEGACY_MODEL_ALIAS' }));
    expect(() => resolveCanonicalModelIdentity('Vendor/Model-V9')).toThrowError(expect.objectContaining({ code: 'E_MODEL_PROVIDER_UNVERIFIED' }));
    expect(() => resolveCanonicalModelIdentity('gpt-5.6-sol', { provider: 'claude' })).toThrowError(expect.objectContaining({ code: 'E_MODEL_PROVIDER_MISMATCH' }));

    const registeredId = 'Vendor-Model-V9';
    modelRegistry.register(buildParametricModel(registeredId, {
      provider: 'gemini',
      costPerMillion: { input: 2, output: 10 },
      pricingEvidenceRef: 'catalog:test:Vendor-Model-V9',
    }));
    const registered = resolveCanonicalModelIdentity(registeredId, { provider: 'gemini' });
    expect(registered.id).toBe(registeredId);
    expect(modelRegistry.get(registeredId)?.provider).toBe('gemini');
    modelRegistry.unregister(registeredId);
  });
});
