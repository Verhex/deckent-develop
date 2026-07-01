// ─── F1-AD: Model Auto-Detect (first-slice) ──────────────────────────────────
// Hermetic tests — no real CLI calls, no disk I/O in the home dir.
// Covers: probeProviderModels, reconcileModels, detectAndRegisterModels.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRegistry, BUILTIN_MODELS } from '../../src/core/model-registry.js';
import {
  probeProviderModels,
  reconcileModels,
  detectAndRegisterModels,
  parseCliModelOutput,
  type SpawnFn,
  type AutoDetectProvider,
} from '../../src/core/model-auto-detect.js';

// ─── Test scratch dir ─────────────────────────────────────────────────────────

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'f1ad-test-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mock SpawnFn that returns the given stdout. */
function makeSpawnFn(stdout: string, exitCode = 0): SpawnFn {
  return vi.fn().mockResolvedValue({ stdout, exitCode });
}

/** Create a mock SpawnFn that fails (exit 1 / error). */
function makeFailSpawnFn(): SpawnFn {
  return vi.fn().mockResolvedValue({ stdout: '', exitCode: 1 });
}

const BUILTIN_CLAUDE_IDS = BUILTIN_MODELS
  .filter(m => m.provider === 'claude')
  .map(m => m.id);

// ─── parseCliModelOutput ──────────────────────────────────────────────────────

describe('parseCliModelOutput', () => {
  it('parses JSON array of strings', () => {
    const raw = JSON.stringify(['claude-opus-4-8', 'claude-sonnet-5']);
    expect(parseCliModelOutput(raw, 'claude')).toEqual(['claude-opus-4-8', 'claude-sonnet-5']);
  });

  it('parses JSON { models: [{ id }] }', () => {
    const raw = JSON.stringify({ models: [{ id: 'claude-mythos-5' }, { id: 'claude-opus-4-8' }] });
    const result = parseCliModelOutput(raw, 'claude');
    expect(result).toContain('claude-mythos-5');
    expect(result).toContain('claude-opus-4-8');
  });

  it('parses JSON { data: [{ id }] }', () => {
    const raw = JSON.stringify({ data: [{ id: 'gpt-5.5' }] });
    const result = parseCliModelOutput(raw, 'codex');
    expect(result).toContain('gpt-5.5');
  });

  it('returns empty array for empty input', () => {
    expect(parseCliModelOutput('', 'claude')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseCliModelOutput('{broken', 'claude')).toEqual([]);
  });
});

// ─── probeProviderModels ──────────────────────────────────────────────────────

describe('probeProviderModels', () => {
  it('returns model ids from mock CLI JSON output', async () => {
    const output = JSON.stringify({ models: [{ id: 'claude-opus-4-8' }, { id: 'claude-mythos-5' }] });
    const spawnFn = makeSpawnFn(output);

    const result = await probeProviderModels('claude', { spawnFn });

    expect(result).toContain('claude-opus-4-8');
    expect(result).toContain('claude-mythos-5');
  });

  it('returns empty array when CLI exits with non-zero code', async () => {
    const spawnFn = makeFailSpawnFn();
    const result = await probeProviderModels('codex', { spawnFn });
    expect(result).toEqual([]);
  });

  it('returns empty array when spawn throws', async () => {
    const spawnFn = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await probeProviderModels('gemini', { spawnFn });
    expect(result).toEqual([]);
  });

  it('calls correct command for each provider', async () => {
    const spawnFn = makeSpawnFn('[]');

    await probeProviderModels('claude', { spawnFn });
    expect(vi.mocked(spawnFn)).toHaveBeenCalledWith('claude', ['models', 'list'], undefined);

    vi.mocked(spawnFn).mockClear();
    await probeProviderModels('ollama', { spawnFn });
    expect(vi.mocked(spawnFn)).toHaveBeenCalledWith('ollama', ['list'], undefined);
  });

  it('passes timeoutMs to spawnFn', async () => {
    const spawnFn = makeSpawnFn('[]');
    await probeProviderModels('claude', { spawnFn, timeoutMs: 3000 });
    expect(vi.mocked(spawnFn)).toHaveBeenCalledWith('claude', ['models', 'list'], 3000);
  });
});

// ─── reconcileModels ─────────────────────────────────────────────────────────

describe('reconcileModels', () => {
  it('CLI ids come first', () => {
    const cli = ['claude-mythos-5', 'claude-opus-4-8'];
    const catalog = ['claude-sonnet-5'];
    const builtin = ['haiku'];
    const result = reconcileModels(cli, catalog, builtin);
    expect(result[0]).toBe('claude-mythos-5');
    expect(result[1]).toBe('claude-opus-4-8');
  });

  it('deduplicates across sources', () => {
    const cli = ['model-a', 'model-b'];
    const catalog = ['model-b', 'model-c'];
    const builtin = ['model-a', 'model-d'];
    const result = reconcileModels(cli, catalog, builtin);
    expect(result).toEqual(['model-a', 'model-b', 'model-c', 'model-d']);
  });

  it('returns catalog-only when CLI is empty', () => {
    const result = reconcileModels([], ['catalog-model'], ['builtin-model']);
    expect(result).toContain('catalog-model');
    expect(result).toContain('builtin-model');
  });

  it('returns builtin-only when CLI and catalog are both empty', () => {
    const result = reconcileModels([], [], ['builtin-model']);
    expect(result).toEqual(['builtin-model']);
  });

  it('returns empty array when all sources are empty', () => {
    expect(reconcileModels([], [], [])).toEqual([]);
  });
});

// ─── detectAndRegisterModels ──────────────────────────────────────────────────

describe('detectAndRegisterModels', () => {
  it('registers bundled-external models after CLI probe', async () => {
    const registry = new ModelRegistry();
    // CLI returns a model NOT in BUILTIN_MODELS
    const output = JSON.stringify({ models: [{ id: 'claude-mythos-5' }] });
    const spawnFn = makeSpawnFn(output);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(registry.has('claude-mythos-5')).toBe(true);
  });

  it('discovered models do not break existing builtin models', async () => {
    const registry = new ModelRegistry();
    const output = JSON.stringify({ models: [{ id: 'claude-mythos-5' }, { id: 'claude-opus-4-8' }] });
    const spawnFn = makeSpawnFn(output);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    // Builtin models are still present
    for (const id of BUILTIN_CLAUDE_IDS) {
      expect(registry.has(id)).toBe(true);
    }
  });

  it('unknown new model is selectable via registry.resolve (no throw)', async () => {
    const registry = new ModelRegistry();
    const newModel = 'claude-future-unknown-xyz';
    const output = JSON.stringify({ models: [{ id: newModel }] });
    const spawnFn = makeSpawnFn(output);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    // resolve must not throw for the newly registered model
    const def = registry.resolve(newModel);
    expect(def).toBeDefined();
    expect(def.id).toBe(newModel);
  });

  it('unknown new model resolve returns correct provider inference', async () => {
    const registry = new ModelRegistry();
    const output = JSON.stringify({ models: [{ id: 'claude-mythos-9000' }] });
    const spawnFn = makeSpawnFn(output);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    const def = registry.resolve('claude-mythos-9000');
    expect(def.provider).toBe('claude');
  });

  it('gracefully handles provider CLI failure', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeFailSpawnFn();

    const results = await detectAndRegisterModels(registry, {
      providers: ['codex'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(results).toHaveLength(1);
    // No discovered models from failed CLI; registry unchanged (only builtins)
    expect(results[0]?.registered).toBe(0);
  });

  it('probes multiple providers and registers all discovered models', async () => {
    const registry = new ModelRegistry();
    const spawnFn: SpawnFn = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'claude') {
        return Promise.resolve({ stdout: JSON.stringify({ models: [{ id: 'claude-mythos-5' }] }), exitCode: 0 });
      }
      if (cmd === 'codex') {
        return Promise.resolve({ stdout: JSON.stringify({ models: [{ id: 'gpt-6-turbo' }] }), exitCode: 0 });
      }
      return Promise.resolve({ stdout: '', exitCode: 1 });
    });

    await detectAndRegisterModels(registry, {
      providers: ['claude', 'codex'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(registry.has('claude-mythos-5')).toBe(true);
    expect(registry.has('gpt-6-turbo')).toBe(true);
  });

  it('uses cache when available and within TTL', async () => {
    const registry = new ModelRegistry();
    const output = JSON.stringify({ models: [{ id: 'claude-cached-model' }] });
    const spawnFn = makeSpawnFn(output);

    const fixedNow = 1_700_000_000_000;

    // First call — populates cache
    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow,
    });

    expect(vi.mocked(spawnFn)).toHaveBeenCalledTimes(1);
    vi.mocked(spawnFn).mockClear();

    // Second call — same ts, cache is warm (within 1h TTL)
    const registry2 = new ModelRegistry();
    await detectAndRegisterModels(registry2, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow + 60_000, // 1 minute later
    });

    // spawn should NOT be called again (cache hit)
    expect(vi.mocked(spawnFn)).not.toHaveBeenCalled();
    expect(registry2.has('claude-cached-model')).toBe(true);
  });

  it('returns DetectResult with correct shape', async () => {
    const registry = new ModelRegistry();
    const output = JSON.stringify({ models: [{ id: 'claude-new-model' }] });
    const spawnFn = makeSpawnFn(output);

    const results = await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.provider).toBe('claude');
    expect(typeof r.authMode).toBe('string');
    expect(Array.isArray(r.discovered)).toBe(true);
    expect(typeof r.registered).toBe('number');
  });
});
