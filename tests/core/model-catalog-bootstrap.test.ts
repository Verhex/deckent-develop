import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { RemoteCatalogResponse } from '../../src/core/model-catalog.js';
import { CURSOR_MODELS } from '../../src/core/model-registry.js';

// ─── Test helpers ──────────────────────────────────────────────────────────

function fakeRegistry(): { mergeFromCatalog: ReturnType<typeof vi.fn>; merged: unknown[] } {
  const merged: unknown[] = [];
  return {
    mergeFromCatalog: vi.fn((models: unknown[]) => { merged.push(...models); }),
    merged,
  };
}

function fakeCatalogResponse(id = 'test-model-01'): RemoteCatalogResponse {
  return {
    version: '1.0.0',
    models: [
      {
        id,
        provider: 'anthropic',
        tier: 'standard',
        status: 'ga',
        contextWindow: 200_000,
        costPerMillion: { input: 1, output: 2 },
        capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
      },
    ],
  };
}

function mockFetch(response: RemoteCatalogResponse): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  }) as unknown as typeof fetch;
}

function failingFetch(): typeof fetch {
  return vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;
}

// Each test should pass force:true so the module-level idempotency flag is reset.
// We also use temp cache dirs so tests don't interfere with real cache.

let workDir: string;

afterEach(() => {
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('bootstrapFromCatalog', () => {
  it('(a) fetch success → mergeFromCatalog called with remote models', async () => {
    const { bootstrapFromCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
    const registry = fakeRegistry();
    const response = fakeCatalogResponse('remote-model-01');

    await bootstrapFromCatalog({
      force: true,
      _fetchImpl: mockFetch(response),
      _cachePath: join(workDir, 'cache.json'),
      _registry: registry,
    });

    expect(registry.mergeFromCatalog).toHaveBeenCalledOnce();
    const calledWith = (registry.mergeFromCatalog as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    expect(calledWith.length).toBeGreaterThan(0);
    expect(calledWith.filter((model: { provider?: string }) => model.provider === 'cursor'))
      .toHaveLength(CURSOR_MODELS.length);
  });

  it('(b) fetch fail + warm cache → mergeFromCatalog called with cached models', async () => {
    const { bootstrapFromCatalog, loadCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
    const cachePath = join(workDir, 'cache.json');
    const registry = fakeRegistry();

    // Prime the cache with a successful fetch
    await loadCatalog({
      _fetchImpl: mockFetch(fakeCatalogResponse('cached-model-01')),
      cachePath,
    } as Parameters<typeof loadCatalog>[0]);

    // Now fetch fails, but cache is warm
    await bootstrapFromCatalog({
      force: true,
      _fetchImpl: failingFetch(),
      _cachePath: cachePath,
      _registry: registry,
    });

    expect(registry.mergeFromCatalog).toHaveBeenCalledOnce();
    const calledWith = (registry.mergeFromCatalog as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    expect(calledWith.length).toBeGreaterThan(0);
  });

  it('(c) fetch fail + no cache → mergeFromCatalog called with bundled BUILTIN_MODELS', async () => {
    const { bootstrapFromCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
    const registry = fakeRegistry();

    // No cache exists, fetch fails → bundled fallback
    await bootstrapFromCatalog({
      force: true,
      _fetchImpl: failingFetch(),
      _cachePath: join(workDir, 'nonexistent-cache.json'),
      _registry: registry,
    });

    expect(registry.mergeFromCatalog).toHaveBeenCalledOnce();
    const calledWith = (registry.mergeFromCatalog as ReturnType<typeof vi.fn>).mock.calls[0][0] as unknown[];
    // Bundled BUILTIN_MODELS has entries
    expect(calledWith.length).toBeGreaterThan(0);
  });

  it('(d) offline:true → network skipped, cache or bundled used', async () => {
    const { bootstrapFromCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'bootstrap-test-'));
    const registry = fakeRegistry();
    const spyFetch = failingFetch();

    await bootstrapFromCatalog({
      force: true,
      offline: true,
      _fetchImpl: spyFetch,
      _cachePath: join(workDir, 'no-cache.json'),
      _registry: registry,
    });

    // Fetch should NOT have been called in offline mode
    expect(spyFetch).not.toHaveBeenCalled();
    // mergeFromCatalog should still be called (bundled fallback)
    expect(registry.mergeFromCatalog).toHaveBeenCalledOnce();
  });
});
