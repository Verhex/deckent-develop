import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  loadCatalog,
  fetchRemoteCatalog,
  mapRemoteEntry,
  normalizeProvider,
  normalizeTier,
  normalizeStatus,
  inferTierFromCost,
  getBundledCatalog,
  CACHE_TTL_MS,
  type RemoteCatalogResponse,
} from '../../src/core/model-catalog.js';
import {
  BUILTIN_MODELS,
  ModelRegistry,
  bootstrapFromCatalog,
  type ModelDefinition,
} from '../../src/core/model-registry.js';

// ─── Test scratch directory ────────────────────────────────────────────────

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'model-catalog-test-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const cachePath = () => join(workDir, 'cache.json');

// ─── Helpers ───────────────────────────────────────────────────────────────

function fakeCatalogResponse(): RemoteCatalogResponse {
  return {
    version: '1.0.0',
    generatedAt: '2026-05-23T00:00:00Z',
    models: [
      {
        id: 'opus-mini-test',
        apiId: 'claude-opus-mini-test',
        provider: 'anthropic',
        tier: 'premium',
        contextWindow: 1_000_000,
        costPerMillion: { input: 15, output: 75 },
        capabilities: {
          streaming: true,
          toolUse: true,
          vision: true,
          codeExecution: true,
          reasoning: false,
        },
        status: 'ga',
      },
      {
        id: 'mock-fast',
        apiId: 'mock-fast-1',
        provider: 'openai',
        contextWindow: 200_000,
        costPerMillion: { input: 0.5, output: 2 },
        capabilities: { streaming: true, toolUse: true },
        status: 'preview',
      },
      {
        id: 'local-llama-test',
        provider: 'ollama',
        contextWindow: 8_192,
        costPerMillion: { input: 0, output: 0 },
        status: 'ga',
      },
    ],
  };
}

function makeMockFetch(payload: RemoteCatalogResponse, opts: { fail?: boolean; status?: number } = {}) {
  let calls = 0;
  const impl: typeof fetch = async () => {
    calls += 1;
    if (opts.fail) {
      throw new Error('network unreachable');
    }
    return new Response(JSON.stringify(payload), {
      status: opts.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    impl,
    get calls() {
      return calls;
    },
  };
}

// ─── Pure mapping helpers ──────────────────────────────────────────────────

describe('model-catalog: provider/tier/status normalization', () => {
  it('maps anthropic/openai/google aliases to canonical providers', () => {
    expect(normalizeProvider('Anthropic')).toBe('claude');
    expect(normalizeProvider('openai')).toBe('codex');
    expect(normalizeProvider('google')).toBe('gemini');
    expect(normalizeProvider('ollama')).toBe('ollama');
    expect(normalizeProvider('unknown-vendor')).toBeNull();
  });

  it('maps tier synonyms (max, flagship, pro, mini) to canonical tiers', () => {
    expect(normalizeTier('premium_plus')).toBe('premium_plus');
    expect(normalizeTier('flagship')).toBe('premium');
    expect(normalizeTier('balanced')).toBe('standard');
    expect(normalizeTier('mini')).toBe('economy');
    expect(normalizeTier(undefined)).toBeNull();
    expect(normalizeTier('garbage')).toBeNull();
  });

  it('infers tier from average cost', () => {
    expect(inferTierFromCost(30, 60)).toBe('premium_plus');
    expect(inferTierFromCost(5, 15)).toBe('premium');
    expect(inferTierFromCost(1, 5)).toBe('standard');
    expect(inferTierFromCost(0, 0)).toBe('economy');
  });

  it('falls back to ga when status is missing or unknown', () => {
    expect(normalizeStatus(undefined)).toBe('ga');
    expect(normalizeStatus('beta')).toBe('preview');
    expect(normalizeStatus('retired')).toBe('deprecated');
    expect(normalizeStatus('mystery')).toBe('ga');
  });
});

describe('model-catalog: mapRemoteEntry', () => {
  it('produces a complete ModelDefinition from a well-formed remote entry', () => {
    const def = mapRemoteEntry({
      id: 'sonnet-x',
      apiId: 'claude-sonnet-x',
      provider: 'anthropic',
      tier: 'standard',
      contextWindow: 200_000,
      costPerMillion: { input: 3, output: 15 },
      capabilities: {
        streaming: true,
        toolUse: true,
        vision: true,
        codeExecution: true,
        reasoning: false,
      },
      status: 'ga',
    });
    expect(def).not.toBeNull();
    expect(def?.id).toBe('claude-sonnet-x');
    expect(def?.apiId).toBe('claude-sonnet-x');
    expect(def?.provider).toBe('claude');
    expect(def?.tier).toBe('standard');
    expect(def?.capabilities.toolUse).toBe(true);
    expect(def?.status).toBe('ga');
  });

  it('returns null for unknown providers', () => {
    const def = mapRemoteEntry({
      id: 'mystery',
      provider: 'mystery-vendor',
    });
    expect(def).toBeNull();
  });

  it('infers tier from cost when tier metadata is absent', () => {
    const def = mapRemoteEntry({
      id: 'budget-bot',
      provider: 'openai',
      costPerMillion: { input: 0.1, output: 0.3 },
    });
    expect(def?.tier).toBe('economy');
  });

  it('defaults sensible flags when capabilities are missing', () => {
    const def = mapRemoteEntry({
      id: 'plain',
      provider: 'google',
      costPerMillion: { input: 1, output: 4 },
    });
    expect(def?.capabilities.streaming).toBe(true);
    expect(def?.capabilities.toolUse).toBe(false);
  });
});

// ─── Bundled fallback ──────────────────────────────────────────────────────

describe('model-catalog: bundled fallback', () => {
  it('returns the BUILTIN_MODELS snapshot as a defensive copy', () => {
    const bundled = getBundledCatalog();
    expect(bundled.length).toBe(BUILTIN_MODELS.length);
    expect(bundled[0]?.id).toBe(BUILTIN_MODELS[0]?.id);
    // Defensive copy — mutations do not bleed back into source array.
    bundled.length = 0;
    expect(getBundledCatalog().length).toBe(BUILTIN_MODELS.length);
  });
});

// ─── Fetch ─────────────────────────────────────────────────────────────────

describe('fetchRemoteCatalog', () => {
  it('returns parsed catalog on 2xx with valid shape', async () => {
    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await fetchRemoteCatalog('https://example.test/api', {
      fetchImpl: mock.impl,
    });
    expect(result.models.length).toBe(3);
    expect(result.version).toBe('1.0.0');
    expect(mock.calls).toBe(1);
  });

  it('throws DeckentError on non-2xx', async () => {
    const impl: typeof fetch = async () =>
      new Response('boom', { status: 503 });
    await expect(
      fetchRemoteCatalog('https://example.test/api', { fetchImpl: impl }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it('throws when payload shape is invalid', async () => {
    const impl: typeof fetch = async () =>
      new Response(JSON.stringify({ not: 'a catalog' }), { status: 200 });
    await expect(
      fetchRemoteCatalog('https://example.test/api', { fetchImpl: impl }),
    ).rejects.toThrow(/missing models/);
  });
});

// ─── End-to-end load flow ──────────────────────────────────────────────────

describe('loadCatalog: fresh fetch → cache write', () => {
  it('fetches, writes cache, returns source=remote', async () => {
    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
    });
    expect(result.source).toBe('remote');
    expect(result.models.length).toBe(3);
    expect(mock.calls).toBe(1);

    const cached = JSON.parse(await fs.readFile(cachePath(), 'utf-8'));
    expect(cached.payload.models.length).toBe(3);
    expect(typeof cached.fetchedAt).toBe('number');
  });
});

describe('loadCatalog: warm cache hit', () => {
  it('serves cache without network when fetchedAt < TTL', async () => {
    const cached = {
      fetchedAt: Date.now() - 1_000,
      url: 'https://example.test/api',
      payload: fakeCatalogResponse(),
    };
    await fs.mkdir(workDir, { recursive: true });
    await fs.writeFile(cachePath(), JSON.stringify(cached));

    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
    });

    expect(result.source).toBe('cache');
    expect(mock.calls).toBe(0);
    expect(result.models.length).toBe(3);
  });
});

describe('loadCatalog: stale cache triggers re-fetch', () => {
  it('re-fetches when cache older than TTL', async () => {
    const cached = {
      fetchedAt: Date.now() - (CACHE_TTL_MS + 60_000),
      url: 'https://example.test/api',
      payload: { version: 'old', models: [] },
    };
    await fs.writeFile(cachePath(), JSON.stringify(cached));

    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
    });

    expect(result.source).toBe('remote');
    expect(mock.calls).toBe(1);
  });
});

describe('loadCatalog: offline mode skips network', () => {
  it('falls back to bundled when offline and no cache', async () => {
    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
      offline: true,
    });
    expect(result.source).toBe('bundled');
    expect(mock.calls).toBe(0);
    expect(result.models.length).toBe(BUILTIN_MODELS.length);
  });

  it('uses cache (not bundled) when offline and cache exists', async () => {
    const cached = {
      fetchedAt: Date.now() - 1_000,
      url: 'https://example.test/api',
      payload: fakeCatalogResponse(),
    };
    await fs.writeFile(cachePath(), JSON.stringify(cached));
    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
      offline: true,
    });
    expect(result.source).toBe('cache');
    expect(mock.calls).toBe(0);
  });
});

describe('loadCatalog: remote failure falls back to cache then bundled', () => {
  it('returns cache when remote fails but cache exists', async () => {
    const cached = {
      fetchedAt: Date.now() - (CACHE_TTL_MS + 60_000), // stale → forces fetch attempt
      url: 'https://example.test/api',
      payload: fakeCatalogResponse(),
    };
    await fs.writeFile(cachePath(), JSON.stringify(cached));

    const mock = makeMockFetch(fakeCatalogResponse(), { fail: true });
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
    });
    expect(result.source).toBe('cache');
    expect(result.warnings.some(w => w.includes('remote-fetch-failed'))).toBe(true);
  });

  it('returns bundled when remote fails and cache absent', async () => {
    const mock = makeMockFetch(fakeCatalogResponse(), { fail: true });
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
    });
    expect(result.source).toBe('bundled');
    expect(result.models.length).toBe(BUILTIN_MODELS.length);
  });

  it('treats malformed cache as missing and falls back', async () => {
    await fs.writeFile(cachePath(), '{not valid json');
    const mock = makeMockFetch(fakeCatalogResponse(), { fail: true });
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
    });
    expect(result.source).toBe('bundled');
  });
});

describe('loadCatalog: forceRefresh bypasses cache', () => {
  it('fetches fresh even when cache is warm', async () => {
    const cached = {
      fetchedAt: Date.now() - 1_000,
      url: 'https://example.test/api',
      payload: fakeCatalogResponse(),
    };
    await fs.writeFile(cachePath(), JSON.stringify(cached));
    const mock = makeMockFetch(fakeCatalogResponse());
    const result = await loadCatalog({
      url: 'https://example.test/api',
      cachePath: cachePath(),
      fetchImpl: mock.impl,
      forceRefresh: true,
    });
    expect(result.source).toBe('remote');
    expect(mock.calls).toBe(1);
  });
});

// ─── Registry integration ─────────────────────────────────────────────────

describe('ModelRegistry.loadFromCatalog / mergeFromCatalog', () => {
  it('replace mode swaps the entire catalog', () => {
    const reg = new ModelRegistry(BUILTIN_MODELS);
    expect(reg.getAllModelIds().length).toBeGreaterThan(0);
    const fresh: ModelDefinition[] = [
      {
        id: 'only-one',
        apiId: 'only-one',
        provider: 'claude',
        tier: 'standard',
        contextWindow: 100_000,
        costPerMillion: { input: 1, output: 1 },
        capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
        status: 'ga',
      },
    ];
    reg.loadFromCatalog(fresh);
    expect(reg.getAllModelIds()).toEqual(['only-one']);
  });

  it('merge mode overrides matching ids, preserves the rest', () => {
    const reg = new ModelRegistry(BUILTIN_MODELS);
    const baseline = reg.getAllModelIds().length;
    const override: ModelDefinition = {
      id: 'claude-opus-4-8',
      apiId: 'claude-opus-4-8',
      provider: 'claude',
      tier: 'premium_plus',
      contextWindow: 2_000_000,
      costPerMillion: { input: 99, output: 99 },
      capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
      status: 'ga',
    };
    reg.mergeFromCatalog([override]);
    expect(reg.getAllModelIds().length).toBe(baseline);
    expect(reg.getOrThrow('claude-opus-4-8').apiId).toBe('claude-opus-4-8');
    expect(reg.getOrThrow('claude-opus-4-8').tier).toBe('premium_plus');
  });
});

describe('bootstrapFromCatalog (singleton glue)', () => {
  it('does not throw even in offline / no-network scenarios', async () => {
    // We can't easily inject opts into the singleton bootstrap; just verify it
    // completes and returns a sensible payload. Network may or may not be live
    // in CI — bundled fallback guarantees success.
    const result = await bootstrapFromCatalog({ mode: 'merge' });
    expect(['remote', 'cache', 'bundled']).toContain(result.source);
    expect(result.count).toBeGreaterThan(0);
  });
});
