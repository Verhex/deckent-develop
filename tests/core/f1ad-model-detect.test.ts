// ─── F1-AD: Model Auto-Detect (first-slice) ──────────────────────────────────
// Hermetic tests — no real CLI calls, no disk I/O in the home dir.
// Covers: probeProviderModels, reconcileModels, detectAndRegisterModels.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRegistry, BUILTIN_MODELS } from '../../src/core/model-registry.js';
import {
  probeProviderModels,
  reconcileModels,
  detectAndRegisterModels,
  parseCliModelOutput,
  supportsModelInventoryProbe,
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
  it('returns model ids from the supported Ollama inventory command', async () => {
    const output = 'NAME ID SIZE\nllama3.2:latest sha256:abc 2GB\n';
    const spawnFn = makeSpawnFn(output);

    const result = await probeProviderModels('ollama', { spawnFn });

    expect(result).toEqual(['llama3.2:latest']);
    expect(spawnFn).toHaveBeenCalledWith('ollama', ['list'], undefined);
  });

  it('returns empty array when CLI exits with non-zero code', async () => {
    const spawnFn = makeFailSpawnFn();
    const result = await probeProviderModels('ollama', { spawnFn });
    expect(result).toEqual([]);
  });

  it('returns empty array when spawn throws', async () => {
    const spawnFn = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await probeProviderModels('ollama', { spawnFn });
    expect(result).toEqual([]);
  });

  it.each(['claude', 'codex', 'gemini'] as const)(
    'does not birth an interactive %s process without inventory capability',
    async provider => {
      const spawnFn = makeSpawnFn(JSON.stringify({ models: [{ id: 'fabricated' }] }));
      expect(supportsModelInventoryProbe(provider)).toBe(false);
      await expect(probeProviderModels(provider, { spawnFn })).resolves.toEqual([]);
      expect(spawnFn).not.toHaveBeenCalled();
    },
  );

  it('declares Ollama inventory capability explicitly', () => {
    expect(supportsModelInventoryProbe('ollama')).toBe(true);
  });

  it('passes timeoutMs to the supported inventory spawn', async () => {
    const spawnFn = makeSpawnFn('[]');
    await probeProviderModels('ollama', { spawnFn, timeoutMs: 3000 });
    expect(vi.mocked(spawnFn)).toHaveBeenCalledWith('ollama', ['list'], 3000);
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
  it('uses catalog authority for cloud providers without birthing a CLI process', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeSpawnFn(JSON.stringify({ models: [{ id: 'claude-mythos-5' }] }));

    const [result] = await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(registry.has('claude-mythos-5')).toBe(false);
    expect(result?.discovered).not.toContain('claude-mythos-5');
    expect(result?.registered).toBe(0);
    expect(result?.source).toBe('catalog');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('keeps existing builtin models when cloud inventory is unsupported', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeFailSpawnFn();

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    // Builtin models are still present
    for (const id of BUILTIN_CLAUDE_IDS) {
      expect(registry.has(id)).toBe(true);
    }
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('ignores stale cloud auto-detect caches', async () => {
    const registry = new ModelRegistry();
    const staleModel = 'claude-stale-cache-model';
    writeFileSync(
      join(workDir, 'model-auto-detect-claude-session.json'),
      JSON.stringify({
        ts: Date.now(),
        provider: 'claude',
        authMode: 'session',
        modelIds: [staleModel],
      }),
    );
    const spawnFn = makeSpawnFn('[]');

    const [result] = await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(result?.discovered).not.toContain(staleModel);
    expect(result?.source).toBe('catalog');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('does not mint a cloud identity from injected fake inventory output', async () => {
    const registry = new ModelRegistry();
    const unknown = 'claude-mythos-9000';
    const output = JSON.stringify({ models: [{ id: unknown }] });
    const spawnFn = makeSpawnFn(output);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(registry.has(unknown)).toBe(false);
    expect(() => registry.resolve(unknown)).toThrow(/pricing evidence is required/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('gracefully handles Ollama inventory failure', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeFailSpawnFn();

    const results = await detectAndRegisterModels(registry, {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.registered).toBe(0);
  });

  it('registers discovered local Ollama tags', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeSpawnFn('NAME ID SIZE\nllama3.2:latest sha256:abc 2GB\n');

    const [result] = await detectAndRegisterModels(registry, {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(result?.source).toBe('cli');
    expect(result?.registered).toBe(1);
    expect(registry.has('llama3.2:latest')).toBe(true);
  });

  it('uses Ollama inventory cache when available and within TTL', async () => {
    const registry = new ModelRegistry();
    const output = 'NAME ID SIZE\nllama3.2:latest sha256:abc 2GB\n';
    const spawnFn = makeSpawnFn(output);

    const fixedNow = 1_700_000_000_000;

    // First call — populates cache
    await detectAndRegisterModels(registry, {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow,
    });

    expect(vi.mocked(spawnFn)).toHaveBeenCalledTimes(1);
    vi.mocked(spawnFn).mockClear();

    // Second call — same ts, cache is warm (within 1h TTL)
    const registry2 = new ModelRegistry();
    const [cachedResult] = await detectAndRegisterModels(registry2, {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow + 60_000, // 1 minute later
    });

    // spawn should NOT be called again (cache hit)
    expect(vi.mocked(spawnFn)).not.toHaveBeenCalled();
    expect(registry2.has('llama3.2:latest')).toBe(true);
    expect(cachedResult?.source).toBe('cache');
    expect(cachedResult?.discovered).toContain('llama3.2:latest');
  });

  it('returns DetectResult with correct shape', async () => {
    const registry = new ModelRegistry();
    const output = 'NAME ID SIZE\nllama3.2:latest sha256:abc 2GB\n';
    const spawnFn = makeSpawnFn(output);

    const results = await detectAndRegisterModels(registry, {
      providers: ['ollama'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.provider).toBe('ollama');
    expect(typeof r.authMode).toBe('string');
    expect(Array.isArray(r.discovered)).toBe(true);
    expect(typeof r.registered).toBe('number');
  });
});
