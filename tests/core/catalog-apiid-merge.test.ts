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
  it('remote apiId overrides bundled when remote.id matches existing.apiId', () => {
    // Bundled has stale apiId; remote has same api ID as its own id (models.dev pattern)
    const existing = [makeModel('opus', 'claude-opus-4-6')];
    // Remote: id='claude-opus-4-6' means "this is the entry for claude-opus-4-6,
    // and its current apiId is claude-opus-4-8" (renamed/updated upstream)
    const remote = [makeModel('claude-opus-4-6', 'claude-opus-4-8')];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('opus');        // logical id preserved
    expect(result[0]!.apiId).toBe('claude-opus-4-8'); // apiId updated to live value
  });

  it('bundled apiId is preserved when no remote entry matches', () => {
    const existing = [
      makeModel('opus', 'claude-opus-4-8'),
      makeModel('sonnet', 'claude-sonnet-4-6'),
    ];
    const remote: ModelDefinition[] = []; // no remote models at all

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(2);
    expect(result.find(m => m.id === 'opus')?.apiId).toBe('claude-opus-4-8');
    expect(result.find(m => m.id === 'sonnet')?.apiId).toBe('claude-sonnet-4-6');
  });

  it('merge is idempotent — applying twice gives same result', () => {
    const existing = [makeModel('opus', 'claude-opus-4-6')];
    const remote = [makeModel('claude-opus-4-6', 'claude-opus-4-8')];

    const first = mergeApiIdOverrides(existing, remote);
    // Apply again using the already-updated result as "existing"
    const second = mergeApiIdOverrides(first, remote);

    expect(first[0]!.apiId).toBe('claude-opus-4-8');
    // Second pass: remote.id='claude-opus-4-6' but existing.apiId='claude-opus-4-8' now
    // → no match → result unchanged
    expect(second[0]!.apiId).toBe('claude-opus-4-8');
    expect(second).toEqual(first);
  });

  it('unmatched remote models do not affect existing bundled entries', () => {
    const existing = [makeModel('opus', 'claude-opus-4-8')];
    // Remote has a completely different model; no apiId match
    const remote = [makeModel('gpt-5', 'gpt-5', 'codex')];

    const result = mergeApiIdOverrides(existing, remote);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('opus');
    expect(result[0]!.apiId).toBe('claude-opus-4-8'); // unchanged
  });
});

// ─── bootstrapFromCatalog — integration with mock registry ────────────────

describe('bootstrapFromCatalog apiId override integration', () => {
  let mergedWith: ModelDefinition[] = [];
  let existingModels: ModelDefinition[] = [];
  let workDir: string;

  beforeEach(() => {
    mergedWith = [];
    existingModels = [makeModel('opus', 'claude-opus-4-6')];
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

    // Remote returns: id='claude-opus-4-6' (matches existing.apiId), apiId='claude-opus-4-8'
    const mockFetch = async () => ({
      ok: true,
      json: async () => ({
        version: '1.0.0',
        models: [{ id: 'claude-opus-4-6', apiId: 'claude-opus-4-8', provider: 'anthropic', tier: 'premium' }],
      }),
    } as Response);

    await bootstrapFromCatalog({
      force: true,
      _fetchImpl: mockFetch as typeof fetch,
      _registry: mockRegistry,
      _cachePath: join(workDir, 'cache.json'),
    });

    const opusResult = mergedWith.find(m => m.id === 'opus');
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

    const opusResult = mergedWith.find(m => m.id === 'opus');
    expect(opusResult).toBeDefined();
    expect(opusResult!.apiId).toBe('claude-opus-4-6'); // bundled preserved (no remote match on fresh BUILTIN_MODELS)
  });
});
