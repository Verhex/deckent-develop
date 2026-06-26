import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalStaticSource, LOCAL_STATIC_SOURCE_ID } from '../../src/core/catalog/local-static-source.js';
import { CatalogRegistry } from '../../src/core/catalog/catalog-registry.js';
import { CACHE_ARCHETYPE, type CatalogEntry } from '../../src/core/catalog/types.js';
import type { ModelCatalogSource } from '../../src/core/catalog/catalog-source.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** In-memory cost-config covering: a marker-cache provider (anthropic), a local-KV
 *  provider with null cache costs (ollama), an alias provider (kimi→moonshotai),
 *  and a disabled provider that must be excluded. */
const FAKE_CONFIG: CostConfig = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      models: {
        'claude-opus-4-6': {
          input_cost_per_token: 5e-6,
          output_cost_per_token: 2.5e-5,
          cache_creation_input_token_cost: 6.25e-6,
          cache_read_input_token_cost: 5e-7,
          max_input_tokens: 1_000_000,
          max_output_tokens: 128_000,
          enabled: true,
        },
      },
    },
    ollama: {
      enabled: true,
      billing_modes_supported: ['local'],
      models: {
        'llama3:8b': {
          input_cost_per_token: 0,
          output_cost_per_token: 0,
          cache_creation_input_token_cost: null,
          cache_read_input_token_cost: null,
          max_input_tokens: 8192,
          // no max_output_tokens → outputLimit normalizes to 0
          enabled: true,
        },
      },
    },
    kimi: {
      enabled: true,
      billing_modes_supported: ['api'],
      models: {
        'kimi-k2': {
          input_cost_per_token: 1e-6,
          output_cost_per_token: 2e-6,
          max_input_tokens: 200_000,
          enabled: true,
        },
      },
    },
    disabledProvider: {
      enabled: false,
      billing_modes_supported: ['api'],
      models: {
        ghost: { input_cost_per_token: 1e-6, output_cost_per_token: 1e-6, max_input_tokens: 1000, enabled: true },
      },
    },
  },
  cost_limits: { sprint_max_usd: 5, daily_max_usd: 50 },
  update_config: { sources_priority: ['bundled'] },
};

/** Build a CatalogEntry with sane defaults for registry-merge tests. */
function fakeEntry(
  over: Partial<CatalogEntry> & Pick<CatalogEntry, 'providerId' | 'modelId'>,
): CatalogEntry {
  return {
    apiStyle: 'test',
    contextLimit: 1000,
    outputLimit: 1000,
    price: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    cacheArchetype: CACHE_ARCHETYPE.IMPLICIT_AUTO,
    cacheVerifyField: '',
    sourceId: 'fake',
    confidence: 'confirmed',
    ...over,
  };
}

/** A source that returns canned entries and counts how often fetch() is called. */
class StubSource implements ModelCatalogSource {
  fetchCount = 0;
  constructor(
    public readonly id: string,
    private readonly entries: CatalogEntry[],
  ) {}
  async fetch(): Promise<CatalogEntry[]> {
    this.fetchCount++;
    return this.entries;
  }
}

/** A source whose fetch() always rejects — exercises graceful degradation. */
class FailingSource implements ModelCatalogSource {
  readonly id = 'failing';
  async fetch(): Promise<CatalogEntry[]> {
    throw new Error('source unreachable');
  }
}

// ─── LocalStaticSource ──────────────────────────────────────────────────────

describe('LocalStaticSource', () => {
  it('exposes the canonical source id', () => {
    const src = new LocalStaticSource('/unused', () => FAKE_CONFIG);
    expect(src.id).toBe(LOCAL_STATIC_SOURCE_ID);
    expect(src.id).toBe('local-static');
  });

  it('normalizes cost-config into CatalogEntry[] (price, limits, archetype)', async () => {
    const src = new LocalStaticSource('/unused', () => FAKE_CONFIG);
    const entries = await src.fetch();

    // anthropic + ollama + kimi enabled; disabledProvider excluded.
    expect(entries).toHaveLength(3);

    const opus = entries.find((e) => e.modelId === 'claude-opus-4-6');
    expect(opus).toBeDefined();
    expect(opus).toMatchObject({
      providerId: 'anthropic',
      apiStyle: 'anthropic',
      contextLimit: 1_000_000,
      outputLimit: 128_000,
      price: { input: 5e-6, output: 2.5e-5, cacheRead: 5e-7, cacheWrite: 6.25e-6 },
      cacheArchetype: CACHE_ARCHETYPE.EXPLICIT_MARKER,
      cacheVerifyField: 'cache_read_input_tokens',
      sourceId: 'local-static',
      confidence: 'confirmed',
    });
    // anthropic profile defines no minimum cacheable prefix.
    expect(opus?.minCacheablePrefix).toBeUndefined();
  });

  it('maps null cache costs to 0 and missing output limit to 0 (ollama / LOCAL_KV)', async () => {
    const src = new LocalStaticSource('/unused', () => FAKE_CONFIG);
    const entries = await src.fetch();

    const llama = entries.find((e) => e.modelId === 'llama3:8b');
    expect(llama).toMatchObject({
      providerId: 'ollama',
      apiStyle: 'ollama',
      outputLimit: 0,
      price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      cacheArchetype: CACHE_ARCHETYPE.LOCAL_KV,
      cacheVerifyField: '',
    });
  });

  it('canonicalizes provider aliases (kimi → moonshotai) with the default cache profile', async () => {
    const src = new LocalStaticSource('/unused', () => FAKE_CONFIG);
    const entries = await src.fetch();

    const k2 = entries.find((e) => e.modelId === 'kimi-k2');
    expect(k2?.providerId).toBe('moonshotai');
    // Not in the provider table → default IMPLICIT_AUTO profile, apiStyle mirrors id.
    expect(k2?.cacheArchetype).toBe(CACHE_ARCHETYPE.IMPLICIT_AUTO);
    expect(k2?.apiStyle).toBe('moonshotai');
    expect(k2?.cacheVerifyField).toBe('cached_tokens');
  });

  it('returns [] (never throws) when the config reader fails — graceful offline', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const src = new LocalStaticSource('/unused', () => {
      throw new Error('cost-config missing');
    });

    await expect(src.fetch()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  describe('real cost-config.json (no network)', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'deckent-catalog-test-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads .deckent/cost-config.json from disk and normalizes it', async () => {
      mkdirSync(join(tmpDir, '.deckent'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.deckent', 'cost-config.json'),
        JSON.stringify({
          _version: '1.0',
          providers: {
            anthropic: {
              enabled: true,
              billing_modes_supported: ['api'],
              models: {
                'claude-sonnet-4-6': {
                  input_cost_per_token: 3e-6,
                  output_cost_per_token: 1.5e-5,
                  cache_read_input_token_cost: 3e-7,
                  max_input_tokens: 1_000_000,
                  max_output_tokens: 64_000,
                  enabled: true,
                },
              },
            },
          },
          cost_limits: { sprint_max_usd: 5, daily_max_usd: 50 },
          update_config: { sources_priority: ['bundled'] },
        }),
        'utf-8',
      );

      // No injected loader → exercises the real loadCostConfig file path.
      const src = new LocalStaticSource(tmpDir);
      const entries = await src.fetch();

      const sonnet = entries.find((e) => e.modelId === 'claude-sonnet-4-6');
      expect(sonnet?.providerId).toBe('anthropic');
      expect(sonnet?.price.input).toBe(3e-6);
      expect(sonnet?.cacheArchetype).toBe(CACHE_ARCHETYPE.EXPLICIT_MARKER);
    });

    it('does not crash when cost-config.json is absent (baseline fallback)', async () => {
      // Empty project dir → loadCostConfig falls back to the bundled baseline.
      const src = new LocalStaticSource(tmpDir);
      const entries = await src.fetch();
      expect(Array.isArray(entries)).toBe(true);
    });
  });
});

// ─── CatalogRegistry ────────────────────────────────────────────────────────

describe('CatalogRegistry', () => {
  it('merges sources with custom overwriting builtin-default for the same model', async () => {
    const base = new StubSource('base', [
      fakeEntry({ providerId: 'anthropic', modelId: 'm', price: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, sourceId: 'base' }),
    ]);
    const custom = new StubSource('custom', [
      fakeEntry({ providerId: 'anthropic', modelId: 'm', price: { input: 999, output: 1, cacheRead: 0, cacheWrite: 0 }, sourceId: 'custom' }),
    ]);

    const reg = new CatalogRegistry();
    reg.register(base, 'builtin-default');
    reg.register(custom, 'custom');
    await reg.sync();

    expect(reg.get('anthropic', 'm')?.price.input).toBe(999);
    expect(reg.get('anthropic', 'm')?.sourceId).toBe('custom');
  });

  it('applies precedence by tier rank, independent of registration order', async () => {
    const base = new StubSource('base', [fakeEntry({ providerId: 'anthropic', modelId: 'm', sourceId: 'base' })]);
    const custom = new StubSource('custom', [fakeEntry({ providerId: 'anthropic', modelId: 'm', sourceId: 'custom' })]);

    // Register custom FIRST, builtin-default second — custom must still win.
    const reg = new CatalogRegistry();
    reg.register(custom, 'custom');
    reg.register(base, 'builtin-default');
    await reg.sync();

    expect(reg.get('anthropic', 'm')?.sourceId).toBe('custom');
  });

  it('layers the full precedence stack (builtin < enrichment < local-override < custom)', async () => {
    const builtin = new StubSource('b', [fakeEntry({ providerId: 'p', modelId: 'm', sourceId: 'builtin' })]);
    const enrichment = new StubSource('e', [fakeEntry({ providerId: 'p', modelId: 'm', sourceId: 'enrichment' })]);
    const localOverride = new StubSource('l', [fakeEntry({ providerId: 'p', modelId: 'm', sourceId: 'local-override' })]);
    const custom = new StubSource('c', [fakeEntry({ providerId: 'p', modelId: 'm', sourceId: 'custom' })]);

    const reg = new CatalogRegistry();
    reg.register(enrichment, 'enrichment');
    reg.register(custom, 'custom');
    reg.register(builtin, 'builtin-default');
    reg.register(localOverride, 'local-override');
    await reg.sync();

    expect(reg.get('p', 'm')?.sourceId).toBe('custom');
  });

  it('returns undefined for an unknown provider/model (no crash)', async () => {
    const reg = new CatalogRegistry();
    reg.register(new StubSource('base', [fakeEntry({ providerId: 'anthropic', modelId: 'm' })]));
    await reg.sync();

    expect(reg.get('nope', 'nope')).toBeUndefined();
    expect(reg.get('anthropic', 'unknown-model')).toBeUndefined();
  });

  it('get() performs no network — fetch only happens at sync-time', async () => {
    const base = new StubSource('base', [fakeEntry({ providerId: 'anthropic', modelId: 'm' })]);
    const reg = new CatalogRegistry();
    reg.register(base);

    await reg.sync();
    expect(base.fetchCount).toBe(1); // exactly one fetch during sync

    reg.get('anthropic', 'm');
    reg.get('x', 'y');
    reg.getAll();
    expect(base.fetchCount).toBe(1); // get()/getAll() never re-fetch
  });

  it('skips a failing source without aborting the merge (graceful)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const good = new StubSource('good', [fakeEntry({ providerId: 'anthropic', modelId: 'm', sourceId: 'good' })]);

    const reg = new CatalogRegistry();
    reg.register(new FailingSource(), 'enrichment');
    reg.register(good, 'builtin-default');

    await expect(reg.sync()).resolves.toBeUndefined(); // does not throw
    expect(reg.get('anthropic', 'm')?.sourceId).toBe('good'); // good source merged
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('exposes getAll() and size over the merged set; sync is idempotent', async () => {
    const src = new StubSource('s', [
      fakeEntry({ providerId: 'anthropic', modelId: 'a' }),
      fakeEntry({ providerId: 'openai', modelId: 'b' }),
    ]);
    const reg = new CatalogRegistry();
    reg.register(src);

    await reg.sync();
    expect(reg.size).toBe(2);
    expect(reg.getAll()).toHaveLength(2);

    // Re-sync rebuilds to the same set (no duplication).
    await reg.sync();
    expect(reg.size).toBe(2);
  });

  it('works end-to-end with LocalStaticSource alone, offline (registry.get)', async () => {
    const reg = new CatalogRegistry();
    reg.register(new LocalStaticSource('/unused', () => FAKE_CONFIG)); // default builtin-default
    await reg.sync();

    expect(reg.get('anthropic', 'claude-opus-4-6')).toBeDefined();
    expect(reg.get('moonshotai', 'kimi-k2')).toBeDefined(); // alias normalized
    expect(reg.get('kimi', 'kimi-k2')).toBeUndefined(); // raw alias is not a key
    expect(reg.size).toBe(3);
  });
});
