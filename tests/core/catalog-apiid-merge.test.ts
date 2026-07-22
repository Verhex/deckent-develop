import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeApiIdOverrides, bootstrapFromCatalog } from '../../src/core/model-catalog.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeModel(id: string, apiId: string, provider: 'claude' | 'codex' | 'gemini' = 'claude'): ModelDefinition {
  return {
    id,
    apiId,
    provider,
    tier: 'premium',
    contextWindow: 200_000,
    costPerMillion: { input: 15, output: 75 },
    capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
    status: 'ga',
  };
}

// ─── mergeApiIdOverrides — pure function tests ─────────────────────────────

describe('mergeApiIdOverrides', () => {
  it('remote metadata refreshes a bundled entry with the same canonical API identity', () => {
    const existing = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    const remote = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8'),
    ];
    remote[0]!.contextWindow = 1_000_000;

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('claude-opus-4-8');
    expect(result[0]!.apiId).toBe('claude-opus-4-8');
    expect(result[0]!.contextWindow).toBe(1_000_000);
  });

  it('bundled apiId is preserved when no remote entry matches', () => {
    const existing = [
      makeModel('claude-opus-4-8', 'claude-opus-4-8'),
      makeModel('claude-sonnet-5', 'claude-sonnet-5'),
    ];
    const remote: ModelDefinition[] = []; // no remote models at all

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(2);
    expect(result.find(m => m.id === 'claude-opus-4-8')?.apiId).toBe('claude-opus-4-8');
    expect(result.find(m => m.id === 'claude-sonnet-5')?.apiId).toBe('claude-sonnet-5');
  });

  it('merge is idempotent — applying twice gives same result', () => {
    const existing = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    const remote = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];

    const first = mergeApiIdOverrides(existing, remote);
    const second = mergeApiIdOverrides(first, remote);

    expect(first[0]!.apiId).toBe('claude-opus-4-8');
    expect(second[0]!.apiId).toBe('claude-opus-4-8');
    expect(second).toEqual(first);
  });

  it('unmatched remote models are appended; existing bundled entries stay intact', () => {
    const existing = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    // Remote has a completely different model; no apiId match
    const remote = [makeModel('gpt-5.6-sol', 'gpt-5.6-sol', 'codex')];

    const result = mergeApiIdOverrides(existing, remote);

    // Zero-hardcode: unmatched remote is APPENDED (live catalog surfaces new
    // models); the bundled canonical entry stays byte-identical.
    expect(result).toHaveLength(2);
    const opus = result.find(m => m.id === 'claude-opus-4-8');
    expect(opus?.apiId).toBe('claude-opus-4-8'); // unchanged
    expect(result.some(m => m.id === 'gpt-5.6-sol')).toBe(true); // appended
  });
});

// ─── bootstrapFromCatalog — integration with mock registry ────────────────

describe('bootstrapFromCatalog apiId override integration', () => {
  let mergedWith: ModelDefinition[] = [];
  let existingModels: ModelDefinition[] = [];
  let workDir: string;

  beforeEach(() => {
    mergedWith = [];
    existingModels = [makeModel('claude-opus-4-8', 'claude-opus-4-8')];
    workDir = mkdtempSync(join(tmpdir(), 'catalog-apiid-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('updates bundled entry apiId via remote catalog through bootstrapFromCatalog', async () => {
    const mockRegistry = {
      getAllModels: () => existingModels,
      mergeFromCatalog: (models: ModelDefinition[]) => { mergedWith = models; },
    };

    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        version: '1.0.0',
        models: [{ id: 'claude-opus-4-8', apiId: 'claude-opus-4-8', provider: 'anthropic', tier: 'premium' }],
      }),
    } as Response);

    await bootstrapFromCatalog({
      force: true,
      _fetchImpl: mockFetch as typeof fetch,
      _registry: mockRegistry,
      _cachePath: join(workDir, 'cache.json'),
    });

    const opusResult = mergedWith.find(m => m.id === 'claude-opus-4-8');
    expect(opusResult).toBeDefined();
    expect(opusResult!.apiId).toBe('claude-opus-4-8');
  });

  it('offline mode: bundled apiId preserved when no network', async () => {
    const mockRegistry = {
      getAllModels: () => existingModels,
      mergeFromCatalog: (models: ModelDefinition[]) => { mergedWith = models; },
    };

    // Use isolated cache path with no data — ensures truly offline (no stale cache)
    await bootstrapFromCatalog({
      force: true,
      offline: true,
      _registry: mockRegistry,
      _cachePath: join(workDir, 'empty-cache.json'),
    });

    const opusResult = mergedWith.find(m => m.id === 'claude-opus-4-8');
    expect(opusResult).toBeDefined();
    expect(opusResult!.apiId).toBe('claude-opus-4-8'); // bundled preserved
  });
});
