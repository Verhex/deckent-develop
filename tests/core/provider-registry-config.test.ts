// ─── Config-Driven Provider Registry Tests (F1-012) ─────────────────────────
// Sprint 292 Task 292-001: verifies that bootstrapProviders registers providers
// declared under `config.providers.registry` (zero-hardcode) — adding a provider
// needs NO source change. Absent/empty registry → built-in claude/codex/gemini/
// ollama behavior is unchanged (backward-safe default). Invalid entries are
// skipped with a friendly reason and never throw.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prevent child_process calls from hitting real CLI tools (claude/codex/gemini)
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Prevent .deck file I/O in tests
vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

import { spawnSync } from 'node:child_process';
import { loadDeckSecrets } from '../../src/core/deck-file.js';
import {
  bootstrapProviders,
  ProviderRegistry,
} from '../../src/core/provider.js';
import type { ResolvedConfig, ProviderDefinition } from '../../src/core/config-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSpawnFail() {
  return { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] };
}

type BootstrapConfig = Pick<
  ResolvedConfig,
  'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot' | 'providers'
> & { auth_mode?: 'subscription' | 'api' | 'hybrid' };

function makeConfig(registry?: ProviderDefinition[]): BootstrapConfig {
  return {
    brain_provider: undefined,
    worker_provider: undefined,
    fallback_provider: undefined,
    projectRoot: '/tmp/test-292-001',
    auth_mode: 'api',
    providers: registry ? { registry } : undefined,
  };
}

function stubFetch(ok = false) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(ok ? '{"models":[]}' : '', { status: ok ? 200 : 500 })
  ) as typeof fetch;
  return original;
}

const ROOT = '/tmp/test-292-001';

// ─── Test Suite ───────────────────────────────────────────────────────────

describe('bootstrapProviders — config-driven provider registry (F1-012)', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof fetch;
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(makeSpawnFail() as ReturnType<typeof spawnSync>);
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    // Strip stray keys so no built-in / openai-compat preset registers.
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['DASHSCOPE_API_KEY'];
    delete process.env['ZHIPU_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OLLAMA_HOST'];
    delete process.env['DECKENT_OLLAMA_HOST'];
    originalFetch = stubFetch(false); // Ollama unreachable → built-ins all skip
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  // ── 1) Registration from config.providers.registry ──────────────────────

  it('registers an openai-compatible provider declared in config.providers.registry', async () => {
    const cfg = makeConfig([
      {
        name: 'groq',
        type: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEnv: 'GROQ_API_KEY',
        models: ['llama-3.1-70b-versatile'],
      },
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);

    expect(result.registered).toContain('groq');
    expect(registry.hasProvider('groq')).toBe(true);
    const adapter = registry.getProvider('groq');
    expect(adapter.name).toBe('groq');
    expect([...adapter.supportedModels]).toContain('llama-3.1-70b-versatile');
  });

  it('accepts the `adapter` key as an alias for `type`', async () => {
    const cfg = makeConfig([
      {
        name: 'groq-alias',
        adapter: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEnv: 'GROQ_API_KEY',
        models: ['llama-3.1-8b-instant'],
      },
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.registered).toContain('groq-alias');
    expect(registry.hasProvider('groq-alias')).toBe(true);
  });

  it('registers a CLI-kind alias under a custom name (zero code change)', async () => {
    const cfg = makeConfig([{ name: 'claude-fast', type: 'claude' }]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.registered).toContain('claude-fast');
    expect(registry.hasProvider('claude-fast')).toBe(true);
    expect(registry.getProvider('claude-fast').name).toBe('claude-fast');
  });

  // ── 2) Absent/empty registry → built-in default preserved ───────────────

  it('preserves built-in default behavior when no registry is configured (backward-compat)', async () => {
    const result = await bootstrapProviders(makeConfig(), ROOT, registry);
    // No custom providers; bootstrap completes without throwing.
    expect(result).toBeTruthy();
    expect(Array.isArray(result.registered)).toBe(true);
    expect(registry.hasProvider('groq')).toBe(false);
  });

  it('treats an empty registry array as a no-op (backward-compat)', async () => {
    const before = registry.size;
    const result = await bootstrapProviders(makeConfig([]), ROOT, registry);
    expect(result).toBeTruthy();
    expect(registry.size).toBe(before); // built-ins all skipped (spawn fail + fetch unreachable)
  });

  // ── 3) Invalid entries → friendly skip (never throw) ────────────────────

  it('skips an entry missing a name without throwing', async () => {
    const cfg = makeConfig([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { type: 'openai-compatible', baseUrl: 'https://x/v1', apiKeyEnv: 'X_KEY', models: ['m'] } as any,
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.skipped.some(s => /missing a non-empty name/i.test(s.reason))).toBe(true);
  });

  it('skips an entry missing type/adapter without throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = makeConfig([{ name: 'no-kind' } as any]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(registry.hasProvider('no-kind')).toBe(false);
    expect(result.skipped.some(s => /missing type\/adapter/i.test(s.reason))).toBe(true);
  });

  it('skips an openai-compatible entry missing baseUrl/apiKeyEnv/models', async () => {
    const cfg = makeConfig([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'bad-oai', type: 'openai-compatible', apiKeyEnv: 'X_KEY', models: ['m'] } as any,
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(registry.hasProvider('bad-oai')).toBe(false);
    expect(result.skipped.some(s => /needs baseUrl, apiKeyEnv and a non-empty models/i.test(s.reason))).toBe(true);
  });

  it('skips an entry with an unknown adapter type without throwing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = makeConfig([{ name: 'mystery', type: 'totally-made-up' } as any]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(registry.hasProvider('mystery')).toBe(false);
    expect(result.skipped.some(s => /unknown adapter type/i.test(s.reason))).toBe(true);
  });

  // ── 4) Mixed valid + invalid → valid registered, invalid skipped ────────

  it('registers valid entries and skips invalid ones in the same registry', async () => {
    const cfg = makeConfig([
      {
        name: 'groq',
        type: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEnv: 'GROQ_API_KEY',
        models: ['llama-3.1-70b-versatile'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'broken' } as any, // missing type → skipped
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(registry.hasProvider('groq')).toBe(true);
    expect(registry.hasProvider('broken')).toBe(false);
    expect(result.registered).toContain('groq');
    expect(result.skipped.some(s => s.reason.includes('broken'))).toBe(true);
  });

  it('is idempotent — a name already registered is not duplicated', async () => {
    const def: ProviderDefinition = {
      name: 'groq',
      type: 'openai-compatible',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
      models: ['llama-3.1-70b-versatile'],
    };
    await bootstrapProviders(makeConfig([def]), ROOT, registry);
    const sizeAfterFirst = registry.size;
    const result = await bootstrapProviders(makeConfig([def]), ROOT, registry);
    expect(registry.size).toBe(sizeAfterFirst); // no duplicate registration
    expect(result.registered).toContain('groq');
  });
});
