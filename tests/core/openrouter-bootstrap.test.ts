// ─── OpenRouter Provider Bootstrap Tests ────────────────────────────────────
// Sprint 361 Task 361-007: verifies that bootstrapProviders registers the
// `OpenRouterProvider` (providers/openrouter.ts, 360-006) ONLY when
// `config.openrouter.enabled` is true AND `$DECK:OPENROUTER_API_KEY` resolves
// (bare or `DECKENT_`-prefixed) — and that flag-off leaves bootstrap
// byte-for-byte identical to pre-361-007 behavior, regardless of key presence.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prevent child_process calls from hitting real CLI tools
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

// Prevent .deck file I/O in tests — this intercepts BOTH provider.ts's own
// `loadDeckSecrets` import AND openrouter.ts's (same resolved module file).
vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

import { spawnSync } from 'node:child_process';
import { loadDeckSecrets } from '../../src/core/deck-file.js';
import { bootstrapProviders, ProviderRegistry } from '../../src/core/provider.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

type BootstrapConfig = Pick<
  ResolvedConfig,
  'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot'
> & {
  auth_mode?: 'subscription' | 'api' | 'hybrid';
  openrouter?: { enabled?: boolean };
};

function makeSpawnFail() {
  return { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] };
}

function makeConfig(openrouter?: { enabled?: boolean }): BootstrapConfig {
  return {
    brain_provider: 'claude',
    worker_provider: 'claude',
    fallback_provider: undefined,
    projectRoot: '/tmp/test-361-007',
    auth_mode: 'api',
    openrouter,
  };
}

function stubFetch(ok = true) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(ok ? '{"models":[]}' : '', { status: ok ? 200 : 500 })
  ) as typeof fetch;
  return original;
}

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('bootstrapProviders — OpenRouter flag-gated auto-register (361-007)', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof fetch;
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(makeSpawnFail() as ReturnType<typeof spawnSync>);
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['DASHSCOPE_API_KEY'];
    delete process.env['ZHIPU_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OLLAMA_HOST'];
    delete process.env['DECKENT_OLLAMA_HOST'];
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_REGION'];
    delete process.env['AWS_DEFAULT_REGION'];
    originalFetch = stubFetch(false); // Ollama unreachable by default
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('flag-off + key present: does NOT register openrouter', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ OPENROUTER_API_KEY: 'sk-fake-openrouter' });
    const result = await bootstrapProviders(makeConfig(undefined), '/tmp/test-361-007', registry);
    expect(result.registered).not.toContain('openrouter');
    expect(registry.hasProvider('openrouter')).toBe(false);
  });

  it('flag-off is byte-identical to flag-absent, key present either way', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ OPENROUTER_API_KEY: 'sk-fake-openrouter' });
    const registryA = new ProviderRegistry();
    const resultA = await bootstrapProviders(makeConfig(undefined), '/tmp/test-361-007', registryA);
    const registryB = new ProviderRegistry();
    const resultB = await bootstrapProviders(makeConfig({ enabled: false }), '/tmp/test-361-007', registryB);
    expect(resultB.registered).toEqual(resultA.registered);
    expect(resultB.skipped).toEqual(resultA.skipped);
    expect(registryB.hasProvider('openrouter')).toBe(false);
  });

  it('flag-on + $DECK:OPENROUTER_API_KEY (bare) present: registers openrouter', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ OPENROUTER_API_KEY: 'sk-fake-openrouter' });
    const result = await bootstrapProviders(makeConfig({ enabled: true }), '/tmp/test-361-007', registry);
    expect(result.registered).toContain('openrouter');
    expect(registry.hasProvider('openrouter')).toBe(true);
    expect(registry.getProvider('openrouter').name).toBe('openrouter');
  });

  it('flag-on + DECKENT_OPENROUTER_API_KEY (prefixed) present: registers openrouter', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_OPENROUTER_API_KEY: 'sk-fake-openrouter' });
    const result = await bootstrapProviders(makeConfig({ enabled: true }), '/tmp/test-361-007', registry);
    expect(result.registered).toContain('openrouter');
    expect(registry.hasProvider('openrouter')).toBe(true);
  });

  it('flag-on + no key: does NOT register, records an honest skip reason', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    const result = await bootstrapProviders(makeConfig({ enabled: true }), '/tmp/test-361-007', registry);
    expect(result.registered).not.toContain('openrouter');
    expect(registry.hasProvider('openrouter')).toBe(false);
    const skip = result.skipped.find(s => s.name === 'openrouter');
    expect(skip).toBeDefined();
    expect(skip?.reason).toMatch(/OPENROUTER_API_KEY/);
  });

  it('is idempotent — already-registered openrouter is left untouched', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ OPENROUTER_API_KEY: 'sk-fake-openrouter' });
    const first = await bootstrapProviders(makeConfig({ enabled: true }), '/tmp/test-361-007', registry);
    expect(first.registered).toContain('openrouter');
    const sentinel = registry.getProvider('openrouter');
    await bootstrapProviders(makeConfig({ enabled: true }), '/tmp/test-361-007', registry);
    expect(registry.getProvider('openrouter')).toBe(sentinel);
  });
});
