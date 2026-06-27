// ─── OpenAI-Compatible Provider Bootstrap Tests ─────────────────────────────
// Sprint 214 Task 214-016/214-017-fix: verifies that bootstrapProviders
// auto-registers OpenAICompatibleAdapter instances for DeepSeek, Qwen, and
// Zhipu/GLM when their API keys are present (from env or .deck file), and
// skips gracefully when they are absent.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Prevent child_process calls from hitting real CLI tools
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

// Prevent .deck file I/O in tests
vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

import { spawnSync } from 'node:child_process';
import { loadDeckSecrets } from '../../src/core/deck-file.js';
import {
  bootstrapProviders,
  applyDeckSecretsToEnv,
  ProviderRegistry,
} from '../../src/core/provider.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeSpawnFail() {
  return { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] };
}

function makeConfig(): Pick<
  ResolvedConfig,
  'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot'
> & { auth_mode?: 'subscription' | 'api' | 'hybrid' } {
  return {
    brain_provider: 'claude',
    worker_provider: 'claude',
    fallback_provider: undefined,
    projectRoot: '/tmp/test-214-017',
    auth_mode: 'api',
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

describe('bootstrapProviders — OpenAI-compatible provider auto-register', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof fetch;
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(makeSpawnFail() as ReturnType<typeof spawnSync>);
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    // Strip any stray OpenAI-compat keys
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['DASHSCOPE_API_KEY'];
    delete process.env['ZHIPU_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OLLAMA_HOST'];
    delete process.env['DECKENT_OLLAMA_HOST'];
    originalFetch = stubFetch(false); // Ollama unreachable by default
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('registers deepseek adapter when DEEPSEEK_API_KEY is set', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-deepseek';
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-214-017', registry);
    expect(result.registered).toContain('deepseek');
    expect(registry.hasProvider('deepseek')).toBe(true);
    const adapter = registry.getProvider('deepseek');
    expect(adapter.name).toBe('deepseek');
    expect(Array.isArray(adapter.supportedModels)).toBe(true);
    expect(adapter.supportedModels.length).toBeGreaterThan(0);
  });

  it('skips deepseek gracefully when DEEPSEEK_API_KEY is absent', async () => {
    // DEEPSEEK_API_KEY is not set
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-214-017', registry);
    expect(result.registered).not.toContain('deepseek');
    expect(registry.hasProvider('deepseek')).toBe(false);
  });

  it('registers multiple OpenAI-compat providers when multiple keys are set', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-deepseek';
    process.env['DASHSCOPE_API_KEY'] = 'sk-test-qwen';
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-214-017', registry);
    expect(result.registered).toContain('deepseek');
    expect(result.registered).toContain('qwen');
    expect(registry.hasProvider('deepseek')).toBe(true);
    expect(registry.hasProvider('qwen')).toBe(true);
  });

  it('applies .deck DECKENT_DEEPSEEK_API_KEY to env and triggers registration', async () => {
    // Simulate .deck file containing DECKENT_DEEPSEEK_API_KEY
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_DEEPSEEK_API_KEY: 'sk-deck-deepseek' });
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-214-017', registry);
    // applyDeckSecretsToEnv should have set DEEPSEEK_API_KEY in process.env
    expect(process.env['DEEPSEEK_API_KEY']).toBe('sk-deck-deepseek');
    expect(result.registered).toContain('deepseek');
    expect(registry.hasProvider('deepseek')).toBe(true);
  });

  it('registers zhipu adapter when ZHIPU_API_KEY is set', async () => {
    process.env['ZHIPU_API_KEY'] = 'sk-test-zhipu';
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-214-017', registry);
    expect(result.registered).toContain('zhipu');
    expect(registry.hasProvider('zhipu')).toBe(true);
  });

  it('skips OpenAI-compat providers when no keys are set', async () => {
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-214-017', registry);
    for (const name of ['deepseek', 'qwen', 'zhipu']) {
      expect(result.registered).not.toContain(name);
      expect(registry.hasProvider(name)).toBe(false);
    }
  });
});

describe('applyDeckSecretsToEnv — OpenAI-compat key mapping', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('maps DECKENT_DEEPSEEK_API_KEY to DEEPSEEK_API_KEY in process.env', () => {
    delete process.env['DEEPSEEK_API_KEY'];
    const overrides = applyDeckSecretsToEnv({ DECKENT_DEEPSEEK_API_KEY: 'sk-deep' });
    expect(process.env['DEEPSEEK_API_KEY']).toBe('sk-deep');
    expect(overrides['deepseek']).toEqual({ DEEPSEEK_API_KEY: 'sk-deep' });
  });

  it('maps DECKENT_DASHSCOPE_API_KEY to DASHSCOPE_API_KEY in process.env', () => {
    delete process.env['DASHSCOPE_API_KEY'];
    const overrides = applyDeckSecretsToEnv({ DECKENT_DASHSCOPE_API_KEY: 'sk-qwen' });
    expect(process.env['DASHSCOPE_API_KEY']).toBe('sk-qwen');
    expect(overrides['qwen']).toEqual({ DASHSCOPE_API_KEY: 'sk-qwen' });
  });

  it('maps DECKENT_ZHIPU_API_KEY to ZHIPU_API_KEY in process.env', () => {
    delete process.env['ZHIPU_API_KEY'];
    const overrides = applyDeckSecretsToEnv({ DECKENT_ZHIPU_API_KEY: 'sk-zhipu' });
    expect(process.env['ZHIPU_API_KEY']).toBe('sk-zhipu');
    expect(overrides['zhipu']).toEqual({ ZHIPU_API_KEY: 'sk-zhipu' });
  });

  it('does not set env vars for absent deck keys', () => {
    delete process.env['DEEPSEEK_API_KEY'];
    const overrides = applyDeckSecretsToEnv({});
    expect(process.env['DEEPSEEK_API_KEY']).toBeUndefined();
    expect(overrides['deepseek']).toBeUndefined();
  });
});
