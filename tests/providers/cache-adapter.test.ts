import { describe, it, expect } from 'vitest';
import {
  ImplicitAutoCacheAdapter,
  ExplicitMarkerCacheAdapter,
  LocalKvCacheAdapter,
  NoneCacheAdapter,
  type SegmentedPrompt,
  type ProviderCacheAdapter,
} from '../../src/providers/cache-adapter.js';

// Spec Pillar 3 — ProviderCacheAdapter archetypes A · B · D · E. All tests are
// pure: emit is a transform, extractCacheUsage parses a string — no I/O, no
// network, no clock.

const SEG: SegmentedPrompt = {
  t0: 'GLOBAL-CONTRACT-BYTES;',
  t1: 'TENANT-PREFIX-BYTES;',
  t2: 'VOLATILE-TASK-TAIL;',
};
const FLAT = SEG.t0 + SEG.t1 + SEG.t2;

describe('ImplicitAutoCacheAdapter (archetype A — IMPLICIT-AUTO)', () => {
  it('archetype is IMPLICIT-AUTO', () => {
    expect(ImplicitAutoCacheAdapter.openAiStyle().archetype).toBe('IMPLICIT-AUTO');
  });

  it('keeps the prefix byte-untouched (prompt === t0+t1+t2) — no marker injected', () => {
    const payload = ImplicitAutoCacheAdapter.openAiStyle().emit(SEG, 'tenant-A');
    expect(payload.prompt).toBe(FLAT);
    // No archetype-B/C/D/E fields leak onto an archetype-A payload.
    expect(payload.cacheControlBlocks).toBeUndefined();
    expect(payload.cachedContentHandle).toBeUndefined();
    expect(payload.cacheSalt).toBeUndefined();
    expect(payload.noCache).toBeUndefined();
  });

  it('OpenAI/DeepSeek dialect: emits the tenant cache-key in `prompt_cache_key` (body)', () => {
    const payload = ImplicitAutoCacheAdapter.openAiStyle().emit(SEG, 'tenant-A');
    expect(payload.tenantKey).toBe('tenant-A');
    expect(payload.cacheKey).toEqual({ name: 'prompt_cache_key', transport: 'body', value: 'tenant-A' });
  });

  it('xAI dialect: emits the tenant cache-key in the `x-grok-conv-id` header', () => {
    const payload = ImplicitAutoCacheAdapter.xaiStyle().emit(SEG, 'tenant-B');
    expect(payload.cacheKey).toEqual({ name: 'x-grok-conv-id', transport: 'header', value: 'tenant-B' });
  });

  it('omits the cache-key entirely when no tenant is supplied (single-tenant auto-detect)', () => {
    const payload = ImplicitAutoCacheAdapter.openAiStyle().emit(SEG);
    expect(payload.prompt).toBe(FLAT);
    expect('cacheKey' in payload).toBe(false);
    expect('tenantKey' in payload).toBe(false);
  });

  describe('extractCacheUsage', () => {
    const a = ImplicitAutoCacheAdapter.openAiStyle();

    it('parses OpenAI usage.prompt_tokens_details.cached_tokens', () => {
      const raw = JSON.stringify({ usage: { prompt_tokens: 5000, prompt_tokens_details: { cached_tokens: 4096 } } });
      expect(a.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 4096,
        cacheCreationTokens: 0,
        source: 'provider-adapter',
      });
    });

    it('parses DeepSeek usage.prompt_cache_hit_tokens', () => {
      const raw = JSON.stringify({ usage: { prompt_cache_hit_tokens: 1280, prompt_cache_miss_tokens: 64 } });
      expect(a.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 1280,
        cacheCreationTokens: 0,
        source: 'provider-adapter',
      });
    });

    it('parses a flat usage.cached_tokens fallback', () => {
      expect(a.extractCacheUsage(JSON.stringify({ usage: { cached_tokens: 777 } })).cacheReadTokens).toBe(777);
    });

    it('returns unmeasured (never fabricates) when no cache field is present', () => {
      const raw = JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 3 } });
      expect(a.extractCacheUsage(raw)).toEqual({ cacheReadTokens: 0, cacheCreationTokens: 0, source: 'unmeasured' });
    });

    it('ignores a negative/garbage cache count as unmeasured', () => {
      expect(a.extractCacheUsage(JSON.stringify({ usage: { cached_tokens: -5 } })).source).toBe('unmeasured');
    });
  });
});

describe('ExplicitMarkerCacheAdapter (archetype B — EXPLICIT-MARKER)', () => {
  const b = new ExplicitMarkerCacheAdapter();

  it('archetype is EXPLICIT-MARKER', () => {
    expect(b.archetype).toBe('EXPLICIT-MARKER');
  });

  it('places a cache_control breakpoint at each stable-tier boundary (T0 + T1), tail uncached', () => {
    const payload = b.emit(SEG);
    expect(payload.cacheControlBlocks).toEqual([
      { text: SEG.t0, cacheControl: true },
      { text: SEG.t1, cacheControl: true },
      { text: SEG.t2, cacheControl: false },
    ]);
    // The flat fallback prompt still preserves the prefix bytes.
    expect(payload.prompt).toBe(FLAT);
  });

  it('emits ≤4 breakpoints (Anthropic limit) — exactly 2 for the two stable tiers', () => {
    const breakpoints = (b.emit(SEG).cacheControlBlocks ?? []).filter((blk) => blk.cacheControl);
    expect(breakpoints).toHaveLength(2);
    expect(breakpoints.length).toBeLessThanOrEqual(4);
  });

  it('does not waste a breakpoint on an empty stable tier', () => {
    const payload = b.emit({ t0: 'ONLY-GLOBAL;', t1: '', t2: 'TAIL;' });
    expect(payload.cacheControlBlocks).toEqual([
      { text: 'ONLY-GLOBAL;', cacheControl: true },
      { text: 'TAIL;', cacheControl: false },
    ]);
  });

  it('never caches the volatile T2 tail', () => {
    const tailBlock = (b.emit(SEG).cacheControlBlocks ?? []).find((blk) => blk.text === SEG.t2);
    expect(tailBlock?.cacheControl).toBe(false);
  });

  describe('extractCacheUsage', () => {
    it('parses Anthropic usage.cache_read_input_tokens + cache_creation_input_tokens', () => {
      const raw = JSON.stringify({
        usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 8000, cache_creation_input_tokens: 1500 },
      });
      expect(b.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 8000,
        cacheCreationTokens: 1500,
        source: 'provider-adapter',
      });
    });

    it('captures creation-only (cache-write) usage — the archetype with a real write cost', () => {
      const raw = JSON.stringify({ usage: { cache_creation_input_tokens: 2048 } });
      expect(b.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 0,
        cacheCreationTokens: 2048,
        source: 'provider-adapter',
      });
    });

    it('returns unmeasured when no anthropic cache field is present', () => {
      const raw = JSON.stringify({ usage: { input_tokens: 100, output_tokens: 20 } });
      expect(b.extractCacheUsage(raw).source).toBe('unmeasured');
    });
  });
});

describe('LocalKvCacheAdapter (archetype D — LOCAL-KV)', () => {
  const d = new LocalKvCacheAdapter();

  it('archetype is LOCAL-KV', () => {
    expect(d.archetype).toBe('LOCAL-KV');
  });

  it('keeps the prefix byte-exact and emits cache_salt = tenant key (per-tenant isolation)', () => {
    const payload = d.emit(SEG, 'tenant-A');
    expect(payload.prompt).toBe(FLAT);
    expect(payload.cacheSalt).toBe('tenant-A');
    expect(payload.tenantKey).toBe('tenant-A');
  });

  it('isolates tenants: distinct tenant keys produce distinct salts', () => {
    expect(d.emit(SEG, 'tenant-A').cacheSalt).not.toBe(d.emit(SEG, 'tenant-B').cacheSalt);
  });

  it('omits the salt when no tenant is supplied (single-tenant shared local cache)', () => {
    const payload = d.emit(SEG);
    expect(payload.prompt).toBe(FLAT);
    expect('cacheSalt' in payload).toBe(false);
  });

  it('extractCacheUsage is always unmeasured ($0 latency-only — never fabricates a number)', () => {
    expect(d.extractCacheUsage(JSON.stringify({ usage: { cached_tokens: 999 } }))).toEqual({
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      source: 'unmeasured',
    });
  });
});

describe('NoneCacheAdapter (archetype E — NONE)', () => {
  const e = new NoneCacheAdapter();

  it('archetype is NONE', () => {
    expect(e.archetype).toBe('NONE');
  });

  it('is an explicit no-op: full prompt + honest noCache marker, no cache fields', () => {
    const payload = e.emit(SEG, 'tenant-A');
    expect(payload.prompt).toBe(FLAT);
    expect(payload.noCache).toEqual({ reason: 'PROVIDER_HAS_NO_PROMPT_CACHE' });
    // E must never look like a silent cache — no cache-key/blocks/salt/handle.
    expect(payload.cacheKey).toBeUndefined();
    expect(payload.cacheControlBlocks).toBeUndefined();
    expect(payload.cacheSalt).toBeUndefined();
    expect(payload.cachedContentHandle).toBeUndefined();
  });

  it('does not thread a tenant cache-key (no tenant-scoped cache exists to isolate)', () => {
    expect('tenantKey' in e.emit(SEG, 'tenant-A')).toBe(false);
  });

  it('extractCacheUsage is always unmeasured (no cache exists)', () => {
    expect(e.extractCacheUsage(JSON.stringify({ usage: { cached_tokens: 100 } })).source).toBe('unmeasured');
  });
});

describe('cross-archetype contract', () => {
  const adapters: ReadonlyArray<readonly [string, ProviderCacheAdapter]> = [
    ['A', ImplicitAutoCacheAdapter.openAiStyle()],
    ['B', new ExplicitMarkerCacheAdapter()],
    ['D', new LocalKvCacheAdapter()],
    ['E', new NoneCacheAdapter()],
  ];

  it('every adapter preserves the stable prefix bytes in `prompt`', () => {
    for (const [, adapter] of adapters) {
      expect(adapter.emit(SEG, 'tenant-A').prompt).toBe(FLAT);
    }
  });

  it('every adapter returns unmeasured (never fabricates) on malformed / empty input', () => {
    for (const [, adapter] of adapters) {
      expect(adapter.extractCacheUsage('{not json').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('   ').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('null').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('[1,2,3]').source).toBe('unmeasured');
    }
  });
});
