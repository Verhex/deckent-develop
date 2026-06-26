import { describe, expect, it, vi } from 'vitest';

import { ModelsDevSource, MODELS_DEV_SOURCE_ID } from '../../src/core/catalog/models-dev-source.js';
import { OpenRouterSource, OPENROUTER_SOURCE_ID } from '../../src/core/catalog/openrouter-source.js';
import { CatalogRegistry } from '../../src/core/catalog/catalog-registry.js';
import { CACHE_ARCHETYPE } from '../../src/core/catalog/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal models.dev API response covering: anthropic (with cache costs), openai, alias (kimi). */
const MODELS_DEV_RESPONSE = {
  anthropic: {
    'claude-3-5-sonnet': {
      name: 'Claude 3.5 Sonnet',
      cost: {
        input: 3e-6,
        output: 1.5e-5,
        cache_read: 3e-7,
        cache_write: 3.75e-6,
      },
      context: 200_000,
      output: 8_192,
    },
    'claude-3-opus': {
      name: 'Claude 3 Opus',
      cost: {
        input: 1.5e-5,
        output: 7.5e-5,
        // no cache fields → should normalize to 0
      },
      context: 200_000,
      output: 4_096,
    },
  },
  kimi: {
    'kimi-k2': {
      name: 'Kimi K2',
      cost: {
        input: 1e-6,
        output: 2e-6,
        cache_read: 5e-8,
        cache_write: 1e-7,
      },
      context: 128_000,
      output: 8_192,
    },
  },
};

/** Minimal OpenRouter /v1/models response covering: anthropic, openai (with cache costs), alias. */
const OPENROUTER_RESPONSE = {
  data: [
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Claude 3.5 Sonnet',
      pricing: {
        prompt: '0.000003',
        completion: '0.000015',
        cache_read: '0.0000003',
        cache_write: '0.00000375',
      },
      context_length: 200_000,
      top_provider: { max_completion_tokens: 8_192 },
    },
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      pricing: {
        prompt: '0.0000025',
        completion: '0.00001',
        // no cache fields
      },
      context_length: 128_000,
      top_provider: { max_completion_tokens: 16_384 },
    },
    {
      id: 'kimi/kimi-k2',
      name: 'Kimi K2',
      pricing: {
        prompt: '0.000001',
        completion: '0.000002',
      },
      context_length: 128_000,
    },
    {
      // Missing slash → should be skipped
      id: 'invalid-no-slash',
      name: 'Invalid',
      pricing: { prompt: '0.001', completion: '0.002' },
    },
    {
      // Slash at end → should be skipped
      id: 'provider/',
      name: 'Slash at end',
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mock fetchFn that resolves with the given JSON payload and status 200. */
function mockFetch(payload: unknown, status = 200): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => payload,
  }) as unknown as typeof globalThis.fetch;
}

/** Create a mock fetchFn that rejects with a network error. */
function failingFetch(message = 'network error'): typeof globalThis.fetch {
  return vi.fn().mockRejectedValue(new Error(message)) as unknown as typeof globalThis.fetch;
}

// ─── ModelsDevSource ──────────────────────────────────────────────────────────

describe('ModelsDevSource', () => {
  it('exposes the canonical source id', () => {
    const src = new ModelsDevSource(mockFetch({}));
    expect(src.id).toBe(MODELS_DEV_SOURCE_ID);
    expect(src.id).toBe('models-dev');
  });

  it('normalizes models.dev JSON to CatalogEntry[] with correct price mapping', async () => {
    const src = new ModelsDevSource(mockFetch(MODELS_DEV_RESPONSE));
    const entries = await src.fetch();

    // 3 enabled models across 3 providers (kimi counts once, alias is applied)
    expect(entries).toHaveLength(3);

    const sonnet = entries.find((e) => e.modelId === 'claude-3-5-sonnet');
    expect(sonnet).toBeDefined();
    expect(sonnet).toMatchObject({
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet',
      apiStyle: 'anthropic',
      contextLimit: 200_000,
      outputLimit: 8_192,
      price: {
        input: 3e-6,
        output: 1.5e-5,
        cacheRead: 3e-7,
        cacheWrite: 3.75e-6,
      },
      cacheArchetype: CACHE_ARCHETYPE.EXPLICIT_MARKER,
      cacheVerifyField: 'cache_read_input_tokens',
      sourceId: 'models-dev',
      confidence: 'unconfirmed',
    });
    expect(sonnet?.minCacheablePrefix).toBeUndefined();
  });

  it('maps cost.cache_read → price.cacheRead and cost.cache_write → price.cacheWrite', async () => {
    const src = new ModelsDevSource(mockFetch(MODELS_DEV_RESPONSE));
    const entries = await src.fetch();

    const sonnet = entries.find((e) => e.modelId === 'claude-3-5-sonnet')!;
    expect(sonnet.price.cacheRead).toBe(3e-7);
    expect(sonnet.price.cacheWrite).toBe(3.75e-6);
  });

  it('defaults missing cache cost fields to 0 (no cache_read/cache_write in response)', async () => {
    const src = new ModelsDevSource(mockFetch(MODELS_DEV_RESPONSE));
    const entries = await src.fetch();

    const opus = entries.find((e) => e.modelId === 'claude-3-opus')!;
    expect(opus.price.cacheRead).toBe(0);
    expect(opus.price.cacheWrite).toBe(0);
  });

  it('canonicalizes provider aliases (kimi → moonshotai)', async () => {
    const src = new ModelsDevSource(mockFetch(MODELS_DEV_RESPONSE));
    const entries = await src.fetch();

    const k2 = entries.find((e) => e.modelId === 'kimi-k2')!;
    expect(k2.providerId).toBe('moonshotai');
    expect(k2.cacheArchetype).toBe(CACHE_ARCHETYPE.IMPLICIT_AUTO);
    expect(k2.sourceId).toBe('models-dev');
    expect(k2.confidence).toBe('unconfirmed');
  });

  it('returns [] (never throws) on network failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new ModelsDevSource(failingFetch('ECONNREFUSED'));

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/ModelsDevSource.*fetch failed/);
    warn.mockRestore();
  });

  it('returns [] (never throws) on HTTP error status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new ModelsDevSource(mockFetch(null, 503));

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('returns [] (never throws) on unexpected response shape (not an object)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new ModelsDevSource(mockFetch([1, 2, 3]));

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('skips provider entries with non-object values without crashing', async () => {
    const partial = {
      anthropic: {
        'claude-3-5-sonnet': {
          cost: { input: 3e-6, output: 1.5e-5 },
          context: 200_000,
          output: 8_192,
        },
      },
      // malformed provider entry
      badprovider: 'not-an-object',
    };
    const src = new ModelsDevSource(mockFetch(partial));
    const entries = await src.fetch();
    expect(entries).toHaveLength(1);
    expect(entries[0].providerId).toBe('anthropic');
  });

  it('fetch is only called during the fetch() call (no eager network)', () => {
    const fetchFn = mockFetch(MODELS_DEV_RESPONSE);
    const _src = new ModelsDevSource(fetchFn);
    // Constructor must not trigger a network call.
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ─── OpenRouterSource ─────────────────────────────────────────────────────────

describe('OpenRouterSource', () => {
  it('exposes the canonical source id', () => {
    const src = new OpenRouterSource(mockFetch({}));
    expect(src.id).toBe(OPENROUTER_SOURCE_ID);
    expect(src.id).toBe('openrouter');
  });

  it('normalizes OpenRouter JSON to CatalogEntry[] with correct price mapping', async () => {
    const src = new OpenRouterSource(mockFetch(OPENROUTER_RESPONSE));
    const entries = await src.fetch();

    // 3 valid entries (2 invalid skipped: no-slash, slash-at-end)
    expect(entries).toHaveLength(3);

    const sonnet = entries.find((e) => e.modelId === 'claude-3.5-sonnet');
    expect(sonnet).toBeDefined();
    expect(sonnet).toMatchObject({
      providerId: 'anthropic',
      modelId: 'claude-3.5-sonnet',
      apiStyle: 'openai-chat',
      contextLimit: 200_000,
      outputLimit: 8_192,
      price: {
        input: 0.000003,
        output: 0.000015,
        cacheRead: 0.0000003,
        cacheWrite: 0.00000375,
      },
      cacheArchetype: CACHE_ARCHETYPE.EXPLICIT_MARKER,
      sourceId: 'openrouter',
      confidence: 'unconfirmed',
    });
  });

  it('maps pricing.cache_read → price.cacheRead and pricing.cache_write → price.cacheWrite', async () => {
    const src = new OpenRouterSource(mockFetch(OPENROUTER_RESPONSE));
    const entries = await src.fetch();

    const sonnet = entries.find((e) => e.modelId === 'claude-3.5-sonnet')!;
    expect(sonnet.price.cacheRead).toBeCloseTo(0.0000003);
    expect(sonnet.price.cacheWrite).toBeCloseTo(0.00000375);
  });

  it('defaults missing cache pricing to 0', async () => {
    const src = new OpenRouterSource(mockFetch(OPENROUTER_RESPONSE));
    const entries = await src.fetch();

    const gpt4o = entries.find((e) => e.modelId === 'gpt-4o')!;
    expect(gpt4o.price.cacheRead).toBe(0);
    expect(gpt4o.price.cacheWrite).toBe(0);
  });

  it('parses price strings and number values correctly', async () => {
    const response = {
      data: [
        {
          id: 'openai/gpt-4o-mini',
          pricing: { prompt: 0.00000015, completion: '0.0000006' },
          context_length: 128_000,
          top_provider: { max_completion_tokens: 16_384 },
        },
      ],
    };
    const src = new OpenRouterSource(mockFetch(response));
    const entries = await src.fetch();

    expect(entries[0].price.input).toBeCloseTo(0.00000015);
    expect(entries[0].price.output).toBeCloseTo(0.0000006);
  });

  it('canonicalizes provider aliases (kimi → moonshotai)', async () => {
    const src = new OpenRouterSource(mockFetch(OPENROUTER_RESPONSE));
    const entries = await src.fetch();

    const k2 = entries.find((e) => e.modelId === 'kimi-k2')!;
    expect(k2.providerId).toBe('moonshotai');
    expect(k2.sourceId).toBe('openrouter');
    expect(k2.confidence).toBe('unconfirmed');
  });

  it('skips model entries with invalid id format (no slash or slash at end)', async () => {
    const src = new OpenRouterSource(mockFetch(OPENROUTER_RESPONSE));
    const entries = await src.fetch();

    // "invalid-no-slash" and "provider/" must not appear
    expect(entries.find((e) => e.modelId === 'invalid-no-slash')).toBeUndefined();
    expect(entries.find((e) => e.modelId === '')).toBeUndefined();
    expect(entries).toHaveLength(3);
  });

  it('returns [] (never throws) on network failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new OpenRouterSource(failingFetch('ECONNREFUSED'));

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/OpenRouterSource.*fetch failed/);
    warn.mockRestore();
  });

  it('returns [] (never throws) on HTTP error status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new OpenRouterSource(mockFetch(null, 429));

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('returns [] (never throws) on unexpected response shape (no data array)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new OpenRouterSource(mockFetch({ models: [] }));

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('applies minCacheablePrefix for openai provider', async () => {
    const response = {
      data: [
        {
          id: 'openai/gpt-4o',
          pricing: { prompt: '0.0000025', completion: '0.00001' },
          context_length: 128_000,
          top_provider: { max_completion_tokens: 16_384 },
        },
      ],
    };
    const src = new OpenRouterSource(mockFetch(response));
    const entries = await src.fetch();

    expect(entries[0].minCacheablePrefix).toBe(1024);
  });

  it('fetch is only called during the fetch() call (no eager network)', () => {
    const fetchFn = mockFetch(OPENROUTER_RESPONSE);
    const _src = new OpenRouterSource(fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ─── Enrichment precedence in CatalogRegistry ─────────────────────────────────

describe('enrichment sources in CatalogRegistry', () => {
  it('enrichment-tier source overwrites builtin-default for the same model', async () => {
    const { CatalogEntry: _unused, ..._ } = {} as { CatalogEntry: never };
    void _unused;
    void _;

    // Stub the enrichment source with a known entry
    const enrichmentFetch = mockFetch({
      anthropic: {
        'claude-3-5-sonnet': {
          cost: { input: 9e-6, output: 9e-5 },
          context: 200_000,
          output: 8_192,
        },
      },
    });

    const enrichmentSrc = new ModelsDevSource(enrichmentFetch);

    // Stub the builtin-default with a lower-precedence entry for the same model
    const { LocalStaticSource } = await import('../../src/core/catalog/local-static-source.js');
    const builtinSrc = new LocalStaticSource('/unused', () => ({
      _version: '1.0',
      providers: {
        anthropic: {
          enabled: true,
          billing_modes_supported: ['api'],
          models: {
            'claude-3-5-sonnet': {
              input_cost_per_token: 1e-9,
              output_cost_per_token: 2e-9,
              max_input_tokens: 1_000,
              enabled: true,
            },
          },
        },
      },
      cost_limits: { sprint_max_usd: 5, daily_max_usd: 50 },
      update_config: { sources_priority: ['bundled'] },
    }));

    const registry = new CatalogRegistry();
    registry.register(builtinSrc, 'builtin-default');
    registry.register(enrichmentSrc, 'enrichment');
    await registry.sync();

    const entry = registry.get('anthropic', 'claude-3-5-sonnet');
    expect(entry).toBeDefined();
    // enrichment (9e-6) overwrites builtin (1e-9)
    expect(entry?.price.input).toBe(9e-6);
    expect(entry?.sourceId).toBe('models-dev');
  });

  it('local-override overwrites enrichment for the same model', async () => {
    const enrichmentFetch = mockFetch({
      openai: {
        'gpt-4o': {
          cost: { input: 2.5e-6, output: 1e-5 },
          context: 128_000,
          output: 16_384,
        },
      },
    });
    const enrichmentSrc = new ModelsDevSource(enrichmentFetch);

    // Minimal stub acting as local-override
    class LocalOverrideStub {
      id = 'local-override-stub';
      async fetch() {
        return [
          {
            providerId: 'openai',
            modelId: 'gpt-4o',
            apiStyle: 'openai-chat',
            contextLimit: 128_000,
            outputLimit: 16_384,
            price: { input: 9.99e-6, output: 9.99e-5, cacheRead: 0, cacheWrite: 0 },
            cacheArchetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
            cacheVerifyField: '',
            sourceId: 'local-override-stub',
            confidence: 'confirmed' as const,
          },
        ];
      }
    }

    const registry = new CatalogRegistry();
    registry.register(enrichmentSrc, 'enrichment');
    registry.register(new LocalOverrideStub(), 'local-override');
    await registry.sync();

    const entry = registry.get('openai', 'gpt-4o');
    // local-override (9.99e-6) wins over enrichment (2.5e-6)
    expect(entry?.price.input).toBe(9.99e-6);
    expect(entry?.sourceId).toBe('local-override-stub');
  });

  it('OpenRouterSource at enrichment tier: registry.get() performs no network', async () => {
    const fetchFn = mockFetch(OPENROUTER_RESPONSE);
    const src = new OpenRouterSource(fetchFn);

    const registry = new CatalogRegistry();
    registry.register(src, 'enrichment');
    await registry.sync();

    const callsAfterSync = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.length;

    // These get() calls must not trigger additional fetch
    registry.get('anthropic', 'claude-3.5-sonnet');
    registry.get('openai', 'gpt-4o');
    registry.getAll();

    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterSync);
  });
});
