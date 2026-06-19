// ─── F1-012: Config-Driven Provider Registry Type-Safety ─────────────────────
// Sprint 301 Task 301-010: validates validateProviderName runtime check +
// config.providers.registry openai-compatible registration + backward-compat.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

import { spawnSync } from 'node:child_process';
import { loadDeckSecrets } from '../../src/core/deck-file.js';
import {
  bootstrapProviders,
  validateProviderName,
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
    projectRoot: '/tmp/test-f1012',
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

const ROOT = '/tmp/test-f1012';

// ─── validateProviderName ──────────────────────────────────────────────────

describe('validateProviderName', () => {
  it('accepts known built-in names', () => {
    expect(validateProviderName('claude')).toBe(true);
    expect(validateProviderName('codex')).toBe(true);
    expect(validateProviderName('gemini')).toBe(true);
    expect(validateProviderName('ollama')).toBe(true);
  });

  it('accepts arbitrary custom names (not in ProviderName union)', () => {
    expect(validateProviderName('test-ai')).toBe(true);
    expect(validateProviderName('groq')).toBe(true);
    expect(validateProviderName('my_provider')).toBe(true);
    expect(validateProviderName('provider-v2')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateProviderName('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(validateProviderName('   ')).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(validateProviderName('provider name')).toBe(false);
    expect(validateProviderName('provider/name')).toBe(false);
    expect(validateProviderName('provider@name')).toBe(false);
    expect(validateProviderName('provider.name')).toBe(false);
  });
});

// ─── bootstrapProviders — registry integration ────────────────────────────

describe('bootstrapProviders — F1-012 config-driven registry', () => {
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
    originalFetch = stubFetch(false);
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  // ── 1) Custom openai-compatible provider registration ─────────────────

  it('registers test-ai from config.providers.registry and makes it selectable', async () => {
    const cfg = makeConfig([
      {
        name: 'test-ai',
        type: 'openai-compatible',
        baseUrl: 'https://api.test-ai.example.com/v1',
        apiKeyEnv: 'TEST_AI_API_KEY',
        models: ['test-model-7b'],
      },
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);

    expect(result.registered).toContain('test-ai');
    expect(registry.hasProvider('test-ai')).toBe(true);
    const adapter = registry.getProvider('test-ai');
    expect(adapter.name).toBe('test-ai');
    expect([...adapter.supportedModels]).toContain('test-model-7b');
  });

  it('registered config-driven provider is selectable via registry.getProvider', async () => {
    const cfg = makeConfig([
      {
        name: 'test-ai',
        type: 'openai-compatible',
        baseUrl: 'https://api.test-ai.example.com/v1',
        apiKeyEnv: 'TEST_AI_API_KEY',
        models: ['test-model-7b'],
      },
    ]);
    await bootstrapProviders(cfg, ROOT, registry);

    expect(() => registry.getProvider('test-ai')).not.toThrow();
    const adapter = registry.getProvider('test-ai');
    expect(typeof adapter.spawn).toBe('function');
    expect(typeof adapter.kill).toBe('function');
    expect(typeof adapter.listWorkers).toBe('function');
  });

  it('accepts adapter key as alias for type', async () => {
    const cfg = makeConfig([
      {
        name: 'test-ai-alias',
        adapter: 'openai-compatible',
        baseUrl: 'https://api.example.com/v1',
        apiKeyEnv: 'EXAMPLE_API_KEY',
        models: ['example-model'],
      },
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.registered).toContain('test-ai-alias');
    expect(registry.hasProvider('test-ai-alias')).toBe(true);
  });

  // ── 2) Backward-compat: no registry → built-in detection still runs ────

  it('completes without error when no registry configured (backward-compat)', async () => {
    const result = await bootstrapProviders(makeConfig(), ROOT, registry);
    expect(result).toBeTruthy();
    expect(Array.isArray(result.registered)).toBe(true);
    expect(registry.hasProvider('test-ai')).toBe(false);
  });

  it('treats empty registry array as no-op (backward-compat)', async () => {
    const result = await bootstrapProviders(makeConfig([]), ROOT, registry);
    expect(result).toBeTruthy();
    expect(registry.hasProvider('test-ai')).toBe(false);
  });

  // ── 3) Invalid entries → validateProviderName rejects, no throw ────────

  it('skips registry entry with empty name via validateProviderName', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = makeConfig([{ name: '', type: 'openai-compatible', baseUrl: 'x', apiKeyEnv: 'Y', models: ['m'] } as any]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.skipped.some(s => /missing a non-empty name/i.test(s.reason))).toBe(true);
  });

  it('skips registry entry with special-char name via validateProviderName', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg = makeConfig([{ name: 'bad name!', type: 'openai-compatible', baseUrl: 'x', apiKeyEnv: 'Y', models: ['m'] } as any]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.skipped.some(s => /missing a non-empty name/i.test(s.reason))).toBe(true);
  });

  // ── 4) Multiple providers in registry ─────────────────────────────────

  it('registers multiple config-driven providers in one pass', async () => {
    const cfg = makeConfig([
      {
        name: 'test-ai',
        type: 'openai-compatible',
        baseUrl: 'https://api.test-ai.example.com/v1',
        apiKeyEnv: 'TEST_AI_API_KEY',
        models: ['test-model-7b'],
      },
      {
        name: 'another-ai',
        type: 'openai-compatible',
        baseUrl: 'https://api.another-ai.example.com/v1',
        apiKeyEnv: 'ANOTHER_AI_API_KEY',
        models: ['another-model-13b'],
      },
    ]);
    const result = await bootstrapProviders(cfg, ROOT, registry);
    expect(result.registered).toContain('test-ai');
    expect(result.registered).toContain('another-ai');
    expect(registry.hasProvider('test-ai')).toBe(true);
    expect(registry.hasProvider('another-ai')).toBe(true);
  });

  it('is idempotent — re-registering same name does not duplicate', async () => {
    const def: ProviderDefinition = {
      name: 'test-ai',
      type: 'openai-compatible',
      baseUrl: 'https://api.test-ai.example.com/v1',
      apiKeyEnv: 'TEST_AI_API_KEY',
      models: ['test-model-7b'],
    };
    await bootstrapProviders(makeConfig([def]), ROOT, registry);
    const sizeAfterFirst = registry.size;
    const result = await bootstrapProviders(makeConfig([def]), ROOT, registry);
    expect(registry.size).toBe(sizeAfterFirst);
    expect(result.registered).toContain('test-ai');
  });
});
