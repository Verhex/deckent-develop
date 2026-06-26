import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ResourceCacheAdapter,
  CacheResourceError,
  type CacheResourceClient,
  type CacheStorageLedger,
  type CacheLedgerEntry,
  type CreateCacheRequest,
  type CreateCacheResult,
  type SegmentedPrompt,
  type ProviderCachePayload,
} from '../../src/providers/cache-adapter-resource.js';

// Archetype-C adapter — explicit create→reference→delete lifecycle. Every test
// is hermetic: the network (CacheResourceClient) and audit sink
// (CacheStorageLedger) are in-memory fakes, and the clock is injected, so there
// is no real I/O and storageMillis is deterministic.

const SEGMENTED: SegmentedPrompt = {
  t0: 'GLOBAL-CONTRACT-BYTES;',
  t1: 'TENANT-PREFIX-BYTES;',
  t2: 'VOLATILE-TASK-TAIL;',
};

/** In-memory ledger that records every storage entry for assertions. */
class FakeLedger implements CacheStorageLedger {
  readonly entries: CacheLedgerEntry[] = [];
  record(entry: CacheLedgerEntry): void {
    this.entries.push(entry);
  }
}

/**
 * Recording cache-resource client. `createImpl`/`deleteImpl` can be swapped to
 * simulate provider failures. Defaults: create returns a fixed handle, delete
 * resolves.
 */
class FakeClient implements CacheResourceClient {
  readonly createCalls: CreateCacheRequest[] = [];
  readonly deleteCalls: string[] = [];
  createImpl: (req: CreateCacheRequest) => Promise<CreateCacheResult> = async () => ({
    id: 'cache/handle-1',
    cachedTokenCount: 1234,
  });
  deleteImpl: (id: string) => Promise<void> = async () => {};

  async create(req: CreateCacheRequest): Promise<CreateCacheResult> {
    this.createCalls.push(req);
    return this.createImpl(req);
  }
  async delete(id: string): Promise<void> {
    this.deleteCalls.push(id);
    return this.deleteImpl(id);
  }
}

/** A monotonic clock that advances a fixed step on each read (deterministic storageMillis). */
function steppingClock(start: number, step: number): () => number {
  let t = start;
  return () => {
    const cur = t;
    t += step;
    return cur;
  };
}

describe('ResourceCacheAdapter (archetype C — EXPLICIT-RESOURCE)', () => {
  let client: FakeClient;
  let ledger: FakeLedger;

  beforeEach(() => {
    client = new FakeClient();
    ledger = new FakeLedger();
  });

  function makeAdapter(extra: { onLeak?: (e: CacheLedgerEntry) => void } = {}) {
    return new ResourceCacheAdapter({
      provider: 'gemini',
      client,
      ledger,
      clock: steppingClock(1_000, 500), // create@1000, delete@1500 → 500ms storage
      onLeak: extra.onLeak,
    });
  }

  it('archetype is EXPLICIT-RESOURCE', () => {
    expect(makeAdapter().archetype).toBe('EXPLICIT-RESOURCE');
  });

  it('runs the full create → use → delete lifecycle and ledgers storage duration', async () => {
    const adapter = makeAdapter();
    const use = vi.fn(async (_payload: ProviderCachePayload) => 'GENERATED');

    const result = await adapter.run(SEGMENTED, { tenantKey: 'tenant-A' }, use);

    expect(result).toBe('GENERATED');
    // create called once, with the stable prefix (t0+t1) only — NOT the tail.
    expect(client.createCalls).toHaveLength(1);
    expect(client.createCalls[0]?.content).toBe(SEGMENTED.t0 + SEGMENTED.t1);
    expect(client.createCalls[0]?.content).not.toContain(SEGMENTED.t2);
    expect(client.createCalls[0]?.tenantKey).toBe('tenant-A');
    // delete called once with the created handle id.
    expect(client.deleteCalls).toEqual(['cache/handle-1']);
    // storage-duration ledgered as a clean teardown.
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      provider: 'gemini',
      handleId: 'cache/handle-1',
      tenantKey: 'tenant-A',
      storageMillis: 500,
      outcome: 'deleted',
    });
  });

  it('passes the handle reference + tail-ONLY payload to use (prefix lives server-side)', async () => {
    const adapter = makeAdapter();
    let seen: ProviderCachePayload | undefined;
    await adapter.run(SEGMENTED, { tenantKey: 'tenant-A' }, async (p) => {
      seen = p;
      return 'ok';
    });
    expect(seen?.cachedContentHandle).toBe('cache/handle-1');
    expect(seen?.tenantKey).toBe('tenant-A');
    // Only the volatile tail is re-sent; the cached t0/t1 prefix is NOT.
    expect(seen?.prompt).toBe(SEGMENTED.t2);
    expect(seen?.prompt).not.toContain(SEGMENTED.t0);
    expect(seen?.prompt).not.toContain(SEGMENTED.t1);
  });

  it('GUARD: an exception in use STILL deletes the cache (no leaked storage) and rethrows', async () => {
    const adapter = makeAdapter();
    const boom = new Error('generate exploded mid-use');

    await expect(
      adapter.run(SEGMENTED, {}, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom); // original error propagates...

    // ...but delete still ran (finally), so storage is not leaked.
    expect(client.deleteCalls).toEqual(['cache/handle-1']);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]?.outcome).toBe('deleted');
  });

  it('does NOT silently swallow a delete failure — records delete-failed + escalates onLeak', async () => {
    const onLeak = vi.fn();
    const adapter = makeAdapter({ onLeak });
    client.deleteImpl = async () => {
      throw new Error('429 from cache delete API');
    };

    // best-effort: a delete failure does NOT crash an otherwise-successful run.
    const result = await adapter.run(SEGMENTED, { tenantKey: 't1' }, async () => 'GEN');
    expect(result).toBe('GEN');

    // the leak is loud: ledger 'delete-failed' + onLeak fired (not swallowed).
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      outcome: 'delete-failed',
      handleId: 'cache/handle-1',
      error: '429 from cache delete API',
    });
    expect(onLeak).toHaveBeenCalledTimes(1);
    expect(onLeak.mock.calls[0]?.[0]).toMatchObject({ outcome: 'delete-failed' });
  });

  it('use-error is NOT masked when delete also fails (use-error wins; leak still recorded)', async () => {
    const onLeak = vi.fn();
    const adapter = makeAdapter({ onLeak });
    const useError = new Error('primary use failure');
    client.deleteImpl = async () => {
      throw new Error('secondary delete failure');
    };

    await expect(
      adapter.run(SEGMENTED, {}, async () => {
        throw useError;
      }),
    ).rejects.toBe(useError); // the USE error propagates, not the delete error.

    // delete was still attempted, and the leak recorded + escalated.
    expect(client.deleteCalls).toEqual(['cache/handle-1']);
    expect(ledger.entries[0]?.outcome).toBe('delete-failed');
    expect(onLeak).toHaveBeenCalledTimes(1);
  });

  it('create failure throws CacheResourceError(phase=create); nothing to delete, no phantom ledger', async () => {
    const adapter = makeAdapter();
    client.createImpl = async () => {
      throw new Error('cache create 500');
    };
    const use = vi.fn();

    await expect(adapter.run(SEGMENTED, {}, use)).rejects.toBeInstanceOf(CacheResourceError);
    try {
      await adapter.run(SEGMENTED, {}, use);
    } catch (err) {
      expect(err).toBeInstanceOf(CacheResourceError);
      expect((err as CacheResourceError).phase).toBe('create');
      expect((err as CacheResourceError).provider).toBe('gemini');
    }
    expect(use).not.toHaveBeenCalled(); // never entered the use step
    expect(client.deleteCalls).toHaveLength(0); // no handle ⇒ no delete
    expect(ledger.entries).toHaveLength(0); // no phantom 'deleted' entry
  });

  it('forwards ttlSeconds + idempotencyKey to the create call (safe retries + TTL safety net)', async () => {
    const adapter = makeAdapter();
    await adapter.run(
      SEGMENTED,
      { tenantKey: 't1', ttlSeconds: 120, idempotencyKey: 'sprint-330-330-018-0' },
      async () => 'ok',
    );
    expect(client.createCalls[0]).toMatchObject({
      ttlSeconds: 120,
      idempotencyKey: 'sprint-330-330-018-0',
      tenantKey: 't1',
    });
  });

  it('defaults TTL to 1h when not specified (belt-and-suspenders against leaks)', async () => {
    const adapter = makeAdapter();
    await adapter.run(SEGMENTED, {}, async () => 'ok');
    expect(client.createCalls[0]?.ttlSeconds).toBe(3600);
  });

  describe('emit (uncached fallback — base ProviderCacheAdapter contract)', () => {
    it('inlines the full prompt with no handle, threading tenantKey', () => {
      const adapter = makeAdapter();
      const payload = adapter.emit(SEGMENTED, 'tenant-X');
      expect(payload.prompt).toBe(SEGMENTED.t0 + SEGMENTED.t1 + SEGMENTED.t2);
      expect(payload.cachedContentHandle).toBeUndefined();
      expect(payload.tenantKey).toBe('tenant-X');
    });

    it('omits tenantKey when not supplied', () => {
      const adapter = makeAdapter();
      const payload = adapter.emit(SEGMENTED);
      expect('tenantKey' in payload).toBe(false);
    });
  });

  describe('extractCacheUsage (provider verify field → measured, else unmeasured)', () => {
    let adapter: ResourceCacheAdapter;
    beforeEach(() => {
      adapter = makeAdapter();
    });

    it('parses Gemini usageMetadata.cachedContentTokenCount', () => {
      const raw = JSON.stringify({
        usageMetadata: { promptTokenCount: 50, cachedContentTokenCount: 2048, totalTokenCount: 60 },
      });
      expect(adapter.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 2048,
        cacheCreationTokens: 0,
        source: 'provider-adapter',
      });
    });

    it('parses Kimi/Moonshot usage.prompt_tokens_details.cached_tokens', () => {
      const raw = JSON.stringify({
        usage: { prompt_tokens: 4096, prompt_tokens_details: { cached_tokens: 3900 } },
      });
      expect(adapter.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 3900,
        cacheCreationTokens: 0,
        source: 'provider-adapter',
      });
    });

    it('parses a flat usage.cached_tokens fallback', () => {
      const raw = JSON.stringify({ usage: { cached_tokens: 777 } });
      expect(adapter.extractCacheUsage(raw).cacheReadTokens).toBe(777);
    });

    it('returns unmeasured (never fabricates) when no cache field is present', () => {
      const raw = JSON.stringify({ usageMetadata: { promptTokenCount: 10 }, usage: { prompt_tokens: 10 } });
      expect(adapter.extractCacheUsage(raw)).toEqual({
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        source: 'unmeasured',
      });
    });

    it('returns unmeasured for malformed / empty input', () => {
      expect(adapter.extractCacheUsage('{not json').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('   ').source).toBe('unmeasured');
      expect(adapter.extractCacheUsage('null').source).toBe('unmeasured');
    });

    it('ignores a negative/garbage cache count as unmeasured (no fabricated number)', () => {
      const raw = JSON.stringify({ usageMetadata: { cachedContentTokenCount: -5 } });
      expect(adapter.extractCacheUsage(raw).source).toBe('unmeasured');
    });
  });
});
