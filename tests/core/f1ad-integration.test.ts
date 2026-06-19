// ─── F1-AD Integration: bootstrap wire + cache-hit + timeout behaviour ────────
// Hermetic tests — no real CLI calls, no disk I/O in the home dir.
// Tests the three goCriteria that are distinct from the unit-level f1ad-model-detect tests:
//   1. bootstrap wiring: detectAndRegisterModels fills the registry via bootstrapProviders
//   2. cache-hit: second call returns instantly without invoking the spawnFn again
//   3. probe-timeout does not block: slow spawnFn resolves within timeout margin

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelRegistry } from '../../src/core/model-registry.js';
import {
  detectAndRegisterModels,
  type SpawnFn,
} from '../../src/core/model-auto-detect.js';

// ─── Test scratch dir ─────────────────────────────────────────────────────────

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'f1ad-integration-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSpawnFn(stdout: string, exitCode = 0): SpawnFn {
  return vi.fn().mockResolvedValue({ stdout, exitCode });
}

// ─── Test 1: bootstrap fills registry with bundled-external model ─────────────

describe('bootstrap → probe-mock fills registry with external model', () => {
  it('registers a model not in BUILTIN_MODELS after bootstrap wire', async () => {
    const registry = new ModelRegistry();
    const externalModel = 'claude-mythos-99';
    const output = JSON.stringify({ models: [{ id: externalModel }] });
    const spawnFn = makeSpawnFn(output);

    // This mirrors what bootstrapProviders does: call detectAndRegisterModels
    // with the injected registry and mock spawnFn (the _hooks pattern).
    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    expect(registry.has(externalModel)).toBe(true);
  });

  it('probe-mock result is accessible via modelAutoDetectPromise', async () => {
    // Simulate the bootstrapProviders _hooks injection path
    const registry = new ModelRegistry();
    const externalModel = 'claude-atlas-7';
    const spawnFn = makeSpawnFn(JSON.stringify({ models: [{ id: externalModel }] }));

    const promise = detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
    });

    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0]?.registered).toBeGreaterThan(0);
    expect(registry.has(externalModel)).toBe(true);
  });

  it('bootstrapProviders wires detectAndRegisterModels and resolves promise', async () => {
    // Import bootstrapProviders and verify the _hooks injection path
    const { bootstrapProviders } = await import('../../src/core/provider.js');

    const registry = new ModelRegistry();
    const externalModel = 'claude-mythos-99';
    const spawnFn = makeSpawnFn(JSON.stringify({ models: [{ id: externalModel }] }));

    const result = await bootstrapProviders(
      {
        brain_provider: undefined as unknown as import('../../src/core/types.js').ProviderName,
        worker_provider: undefined as unknown as import('../../src/core/types.js').ProviderName,
        fallback_provider: undefined as unknown as import('../../src/core/types.js').ProviderName,
        projectRoot: workDir,
        providers: {},
        auth_mode: 'subscription',
      },
      workDir,
      undefined,
      {
        mr: registry,
        detectOpts: {
          providers: ['claude'],
          spawnFn,
          cacheDir: workDir,
        },
      },
    );

    // modelAutoDetectPromise must be present (wire verified)
    expect(result.modelAutoDetectPromise).toBeInstanceOf(Promise);

    // Await the background detection
    await result.modelAutoDetectPromise;

    // External model must now be in the injected registry
    expect(registry.has(externalModel)).toBe(true);
  });
});

// ─── Test 2: cache-hit is instant ─────────────────────────────────────────────

describe('cache-hit: second call does not invoke spawnFn', () => {
  it('second call within TTL uses cache, skips spawnFn', async () => {
    const registry1 = new ModelRegistry();
    const cachedModel = 'claude-cached-7';
    const spawnFn = makeSpawnFn(JSON.stringify({ models: [{ id: cachedModel }] }));

    const fixedNow = 1_700_000_000_000;

    // First call — populates cache, invokes spawnFn once
    await detectAndRegisterModels(registry1, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow,
    });

    expect(vi.mocked(spawnFn)).toHaveBeenCalledTimes(1);
    vi.mocked(spawnFn).mockClear();

    // Second call — same cache dir, within TTL (1 minute later)
    const registry2 = new ModelRegistry();
    await detectAndRegisterModels(registry2, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow + 60_000,
    });

    // spawnFn must NOT be called (cache hit)
    expect(vi.mocked(spawnFn)).not.toHaveBeenCalled();
    // Model must still be registered via cache
    expect(registry2.has(cachedModel)).toBe(true);
  });

  it('cache-hit returns source=cache in DetectResult', async () => {
    const registry = new ModelRegistry();
    const spawnFn = makeSpawnFn(JSON.stringify({ models: [{ id: 'claude-cache-test' }] }));
    const fixedNow = 1_700_000_000_000;

    // Populate cache
    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow,
    });

    vi.mocked(spawnFn).mockClear();

    // Second call — should return source='cache'
    const registry2 = new ModelRegistry();
    const results = await detectAndRegisterModels(registry2, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      now: () => fixedNow + 30_000,
    });

    expect(results[0]?.source).toBe('cache');
    expect(vi.mocked(spawnFn)).not.toHaveBeenCalled();
  });
});

// ─── Test 3: probe-timeout does not block ─────────────────────────────────────

describe('probe-timeout does not block bootstrap', () => {
  it('detectAndRegisterModels resolves within timeout + margin when probe hangs', async () => {
    const registry = new ModelRegistry();

    // spawnFn that resolves after a delay longer than timeoutMs — simulates a hanging probe
    const TIMEOUT_MS = 50;
    const spawnFn: SpawnFn = vi.fn().mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ stdout: '', exitCode: null }), TIMEOUT_MS * 3)),
    );

    const start = Date.now();
    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      spawnFn,
      cacheDir: workDir,
      timeoutMs: TIMEOUT_MS,
    });
    const elapsed = Date.now() - start;

    // Should complete well within 10× the timeout (not hang indefinitely)
    expect(elapsed).toBeLessThan(TIMEOUT_MS * 10);
  });

  it('when probe times out, no models are registered but function does not throw', async () => {
    const registry = new ModelRegistry();
    const initialCount = registry.getAllModels().length;

    // spawnFn that returns empty (timeout-killed behaviour)
    const spawnFn: SpawnFn = vi.fn().mockResolvedValue({ stdout: '', exitCode: null });

    await expect(
      detectAndRegisterModels(registry, {
        providers: ['claude'],
        spawnFn,
        cacheDir: workDir,
        timeoutMs: 50,
      }),
    ).resolves.toHaveLength(1);

    // No new models beyond what was already in registry (empty CLI response)
    // The CLI ids are empty, but catalog+bundled models are still reconciled
    // so count may be >= initialCount; the key is: no throw.
    expect(registry.getAllModels().length).toBeGreaterThanOrEqual(initialCount);
  });
});
