import { describe, it, expect } from 'vitest';
import {
  CACHE_ARCHETYPE,
  type CacheArchetype,
  type CatalogEntry,
  type Regime,
} from '../../src/core/catalog/types.js';
import {
  PROVIDER_ID_ALIASES,
  normalizeProviderId,
  type ModelCatalogSource,
} from '../../src/core/catalog/catalog-source.js';

// ─── CacheArchetype ───────────────────────────────────────────────────────────

describe('CACHE_ARCHETYPE', () => {
  it('exports exactly 5 values', () => {
    expect(Object.keys(CACHE_ARCHETYPE)).toHaveLength(5);
  });

  it('contains all required archetype keys', () => {
    expect(CACHE_ARCHETYPE.IMPLICIT_AUTO).toBe('IMPLICIT_AUTO');
    expect(CACHE_ARCHETYPE.EXPLICIT_MARKER).toBe('EXPLICIT_MARKER');
    expect(CACHE_ARCHETYPE.EXPLICIT_RESOURCE).toBe('EXPLICIT_RESOURCE');
    expect(CACHE_ARCHETYPE.LOCAL_KV).toBe('LOCAL_KV');
    expect(CACHE_ARCHETYPE.NONE).toBe('NONE');
  });

  it('key and value are identical strings (constant semantics)', () => {
    for (const [k, v] of Object.entries(CACHE_ARCHETYPE)) {
      expect(v).toBe(k);
    }
  });

  it('CacheArchetype type assignment compiles for all members', () => {
    const archetypes: CacheArchetype[] = [
      CACHE_ARCHETYPE.IMPLICIT_AUTO,
      CACHE_ARCHETYPE.EXPLICIT_MARKER,
      CACHE_ARCHETYPE.EXPLICIT_RESOURCE,
      CACHE_ARCHETYPE.LOCAL_KV,
      CACHE_ARCHETYPE.NONE,
    ];
    expect(archetypes).toHaveLength(5);
  });
});

// ─── Regime ───────────────────────────────────────────────────────────────────

describe('Regime', () => {
  it('accepts all three valid regime values', () => {
    const regimes: Regime[] = ['subscription', 'api', 'local'];
    expect(regimes).toHaveLength(3);
  });
});

// ─── CatalogEntry shape ───────────────────────────────────────────────────────

describe('CatalogEntry', () => {
  it('accepts a fully populated confirmed entry', () => {
    const entry: CatalogEntry = {
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
      apiStyle: 'anthropic',
      contextLimit: 200_000,
      outputLimit: 8_192,
      price: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
      cacheArchetype: CACHE_ARCHETYPE.EXPLICIT_MARKER,
      cacheVerifyField: 'cache_creation_input_tokens',
      minCacheablePrefix: 1024,
      sourceId: 'anthropic-static',
      confidence: 'confirmed',
    };
    expect(entry.providerId).toBe('anthropic');
    expect(entry.confidence).toBe('confirmed');
    expect(entry.price.cacheRead).toBe(0.3);
  });

  it('accepts an unconfirmed entry without minCacheablePrefix', () => {
    const entry: CatalogEntry = {
      providerId: 'xai',
      modelId: 'grok-3',
      apiStyle: 'openai-chat',
      contextLimit: 131_072,
      outputLimit: 8_192,
      price: { input: 5.0, output: 25.0, cacheRead: 0, cacheWrite: 0 },
      cacheArchetype: CACHE_ARCHETYPE.NONE,
      cacheVerifyField: '',
      sourceId: 'xai-static',
      confidence: 'unconfirmed',
    };
    expect(entry.minCacheablePrefix).toBeUndefined();
    expect(entry.confidence).toBe('unconfirmed');
  });
});

// ─── PROVIDER_ID_ALIASES ──────────────────────────────────────────────────────

describe('PROVIDER_ID_ALIASES', () => {
  it('contains exactly 5 entries', () => {
    expect(Object.keys(PROVIDER_ID_ALIASES)).toHaveLength(5);
  });

  it('kimi → moonshotai', () => {
    expect(PROVIDER_ID_ALIASES['kimi']).toBe('moonshotai');
  });

  it('qwen → alibaba', () => {
    expect(PROVIDER_ID_ALIASES['qwen']).toBe('alibaba');
  });

  it('grok → xai', () => {
    expect(PROVIDER_ID_ALIASES['grok']).toBe('xai');
  });

  it('together → togetherai', () => {
    expect(PROVIDER_ID_ALIASES['together']).toBe('togetherai');
  });

  it('fireworks → fireworks-ai', () => {
    expect(PROVIDER_ID_ALIASES['fireworks']).toBe('fireworks-ai');
  });
});

// ─── normalizeProviderId ──────────────────────────────────────────────────────

describe('normalizeProviderId', () => {
  it('resolves known aliases', () => {
    expect(normalizeProviderId('kimi')).toBe('moonshotai');
    expect(normalizeProviderId('qwen')).toBe('alibaba');
    expect(normalizeProviderId('grok')).toBe('xai');
    expect(normalizeProviderId('together')).toBe('togetherai');
    expect(normalizeProviderId('fireworks')).toBe('fireworks-ai');
  });

  it('returns the raw value unchanged for unknown providers', () => {
    expect(normalizeProviderId('anthropic')).toBe('anthropic');
    expect(normalizeProviderId('openai')).toBe('openai');
    expect(normalizeProviderId('custom-provider')).toBe('custom-provider');
    expect(normalizeProviderId('')).toBe('');
  });
});

// ─── ModelCatalogSource port shape ───────────────────────────────────────────

describe('ModelCatalogSource', () => {
  it('can be implemented with the required interface shape', async () => {
    const source: ModelCatalogSource = {
      id: 'test-source',
      fetch: async (): Promise<CatalogEntry[]> => [],
    };
    expect(source.id).toBe('test-source');
    const result = await source.fetch();
    expect(result).toEqual([]);
  });
});
