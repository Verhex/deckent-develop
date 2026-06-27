// ─── Provider Bootstrap-Register Tests (Sprint 215 — 215-005) ───────────────
// Verifies the F1-009 bootstrap path: when DEEPSEEK_API_KEY / DASHSCOPE_API_KEY
// / ZHIPU_API_KEY is present (env or .deck), bootstrapProviders() instantiates
// the matching OpenAICompatibleAdapter and calls registry.registerProvider()
// for it. Missing keys are skipped gracefully (no throw). Tests are hermetic:
// no real CLI spawns, no real .deck reads, no real HTTP, no live state.
//
// Pair-file: provider-bootstrap-openai-compat.test.ts (Sprint 214 — 214-016/
// 214-017-fix) covers the .deck → env mapping. This file focuses on the
// registry-side outcomes called out by the 215-005 goCriteria:
//   1. key present → registered + hasProvider true
//   2. key absent  → graceful skip (no throw, not registered)
//   3. multiple keys → all matching providers registered
//   4. getProvider returns the adapter with correct name + supportedModels

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

import { spawnSync } from 'node:child_process';
import { loadDeckSecrets } from '../../src/core/deck-file.js';
import { bootstrapProviders, ProviderRegistry } from '../../src/core/provider.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

const COMPAT_ENV_KEYS = ['DEEPSEEK_API_KEY', 'DASHSCOPE_API_KEY', 'ZHIPU_API_KEY'] as const;
const STRAY_ENV_KEYS = [
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'OLLAMA_HOST',
  'DECKENT_OLLAMA_HOST',
] as const;

function spawnFail() {
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
    projectRoot: '/tmp/test-215-005',
    auth_mode: 'api',
  };
}

function stubFetch(): typeof fetch {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
  return original;
}

describe('bootstrapProviders — OpenAI-compat register (215-005)', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof fetch;
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(spawnFail() as ReturnType<typeof spawnSync>);
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    for (const k of [...COMPAT_ENV_KEYS, ...STRAY_ENV_KEYS]) delete process.env[k];
    originalFetch = stubFetch();
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('registers deepseek when DEEPSEEK_API_KEY is present', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-deepseek';
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-215-005', registry);
    expect(result.registered).toContain('deepseek');
    expect(registry.hasProvider('deepseek')).toBe(true);
  });

  it('skips OpenAI-compat providers gracefully when no keys are present', async () => {
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-215-005', registry);
    for (const name of ['deepseek', 'qwen', 'zhipu']) {
      expect(result.registered).not.toContain(name);
      expect(registry.hasProvider(name)).toBe(false);
    }
  });

  it('registers deepseek + qwen + zhipu simultaneously when all keys are present', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-deepseek';
    process.env['DASHSCOPE_API_KEY'] = 'sk-test-qwen';
    process.env['ZHIPU_API_KEY'] = 'sk-test-zhipu';
    const result = await bootstrapProviders(makeConfig(), '/tmp/test-215-005', registry);
    expect(result.registered).toContain('deepseek');
    expect(result.registered).toContain('qwen');
    expect(result.registered).toContain('zhipu');
    expect(registry.hasProvider('deepseek')).toBe(true);
    expect(registry.hasProvider('qwen')).toBe(true);
    expect(registry.hasProvider('zhipu')).toBe(true);
  });

  it('exposes a usable adapter via registry.getProvider after registration', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-deepseek';
    await bootstrapProviders(makeConfig(), '/tmp/test-215-005', registry);
    const adapter = registry.getProvider('deepseek');
    expect(adapter.name).toBe('deepseek');
    expect(Array.isArray(adapter.supportedModels)).toBe(true);
    expect(adapter.supportedModels.length).toBeGreaterThan(0);
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });
});
