import { describe, expect, it } from 'vitest';
import {
  BUILTIN_MODELS,
  CANONICAL_MODELS,
  CODEX_PARITY_MODELS,
  LEGACY_MODEL_ALIASES,
  ModelRegistry,
  buildParametricModel,
  getLegacyModelMigration,
  inferProviderFromId,
  modelRegistry,
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

  it('resolves versioned Sol and Fable API IDs directly', () => {
    expect(modelRegistry.resolveApiId('gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(modelRegistry.resolveApiId('claude-fable-5')).toBe('claude-fable-5');
  });

  it('never treats an unowned unknown ID as Claude', () => {
    expect(inferProviderFromId('future-model-v9')).toBeUndefined();
    expect(() => buildParametricModel('future-model-v9')).toThrow(/Provider ownership is required/);
  });

  it('preserves an unambiguous or explicitly owned parametric API ID byte-for-byte', () => {
    const inferred = buildParametricModel('gpt-7.2-reasoning');
    expect(inferred).toMatchObject({ id: 'gpt-7.2-reasoning', apiId: 'gpt-7.2-reasoning', provider: 'codex', status: 'preview' });

    const explicit = buildParametricModel('vendor/model-v3:2026-07-20', { provider: 'gemini' });
    expect(explicit).toMatchObject({ id: 'vendor/model-v3:2026-07-20', apiId: 'vendor/model-v3:2026-07-20', provider: 'gemini' });
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

    const registered = resolveCanonicalModelIdentity('Vendor/Model-V9', {
      provider: 'gemini',
      registerParametric: true,
    });
    expect(registered.id).toBe('Vendor/Model-V9');
    expect(modelRegistry.get('Vendor/Model-V9')?.provider).toBe('gemini');
    modelRegistry.unregister('Vendor/Model-V9');
  });
});
