// ─── Ollama Provider Bootstrap Tests ───────────────────────────────────────
// Sprint 202 Task 202-001 (F1 Provider Independence): verifies the Ollama
// adapter is registered as a 1st-class spawn target by detection + bootstrap,
// so `worker_provider=ollama` resolves to a real adapter instead of silently
// falling back to Claude (the pre-202 behavior — provider.ts:detectAvailable-
// Providers did not include Ollama and adapterFactories had no factory entry).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before importing — keeps the CLI detectors deterministic
// regardless of whether claude/codex/gemini binaries exist in the test env.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

import { spawnSync } from 'node:child_process';
import {
  detectAvailableProviders,
  bootstrapProviders,
  ProviderRegistry,
} from '../../src/core/provider.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeSpawnFail() {
  return { status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] };
}

function makeBootstrapConfig(): Pick<
  ResolvedConfig,
  'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot'
> & { auth_mode?: 'subscription' | 'api' | 'hybrid' } {
  return {
    brain_provider: 'ollama',
    worker_provider: 'ollama',
    fallback_provider: undefined,
    projectRoot: '/tmp/test-202-001',
    auth_mode: 'subscription',
  };
}

/**
 * Stub global.fetch with a controllable handler. Returns the original fetch
 * so the test can restore it in afterEach. The handler is called with the
 * full URL; tests inspect URL + return a Response-like object.
 */
function stubFetch(handler: (url: string) => Response | Promise<Response>): typeof fetch {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    return handler(url);
  }) as typeof fetch;
  return original;
}

// ─── detectOllama via detectAvailableProviders ─────────────────────────────

describe('detectAvailableProviders — Ollama detection', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(makeSpawnFail() as ReturnType<typeof spawnSync>);
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OLLAMA_HOST'];
    delete process.env['DECKENT_OLLAMA_HOST'];
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('returns ollama as available when /api/tags responds 200', async () => {
    stubFetch(() => new Response('{"models":[]}', { status: 200 }));
    const providers = await detectAvailableProviders();
    const ollama = providers.find(p => p.name === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(true);
    expect(ollama!.authMethod).toBe('none');
  });

  it('returns ollama as unavailable when fetch throws (server unreachable)', async () => {
    stubFetch(() => { throw new Error('ECONNREFUSED'); });
    const providers = await detectAvailableProviders();
    const ollama = providers.find(p => p.name === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(false);
    expect(ollama!.authMethod).toBe('none');
  });

  it('returns ollama as unavailable when /api/tags responds non-2xx', async () => {
    stubFetch(() => new Response('', { status: 500 }));
    const providers = await detectAvailableProviders();
    const ollama = providers.find(p => p.name === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama!.available).toBe(false);
  });

  it('lists ollama alongside claude/codex/cursor/gemini (5 providers total)', async () => {
    stubFetch(() => new Response('{"models":[]}', { status: 200 }));
    const providers = await detectAvailableProviders();
    const names = providers.map(p => p.name).sort();
    // ddc523bf0 cursor adapter: detectCursor joined detectAvailableProviders
    // (7091 FAZ-1) — 4 providers became 5. The spawnSync mock above keeps the
    // cursor CLI detector deterministic (reported absent) like the others.
    expect(names).toEqual(['claude', 'codex', 'cursor', 'gemini', 'ollama']);
  });

  it('respects DECKENT_OLLAMA_HOST env override', async () => {
    process.env['DECKENT_OLLAMA_HOST'] = 'http://custom-host:9999';
    const seenUrls: string[] = [];
    stubFetch((url) => {
      seenUrls.push(url);
      return new Response('{"models":[]}', { status: 200 });
    });
    const providers = await detectAvailableProviders();
    const ollama = providers.find(p => p.name === 'ollama')!;
    expect(ollama.available).toBe(true);
    expect(seenUrls.some(u => u.startsWith('http://custom-host:9999/'))).toBe(true);
  });
});

// ─── bootstrapProviders — Ollama registration ──────────────────────────────

describe('bootstrapProviders — Ollama factory wiring', () => {
  const originalEnv = { ...process.env };
  let originalFetch: typeof fetch;
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(spawnSync).mockReturnValue(makeSpawnFail() as ReturnType<typeof spawnSync>);
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OLLAMA_HOST'];
    delete process.env['DECKENT_OLLAMA_HOST'];
    originalFetch = globalThis.fetch;
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('registers ollama adapter when local server is reachable', async () => {
    stubFetch(() => new Response('{"models":[]}', { status: 200 }));
    const result = await bootstrapProviders(
      makeBootstrapConfig(),
      '/tmp/test-202-001',
      registry,
    );
    expect(result.registered).toContain('ollama');
    expect(registry.hasProvider('ollama')).toBe(true);
    const adapter = registry.getProvider('ollama');
    expect(adapter.name).toBe('ollama');
  });

  it('skips ollama gracefully when local server is unreachable', async () => {
    stubFetch(() => { throw new Error('ECONNREFUSED'); });
    const result = await bootstrapProviders(
      makeBootstrapConfig(),
      '/tmp/test-202-001',
      registry,
    );
    expect(result.registered).not.toContain('ollama');
    expect(registry.hasProvider('ollama')).toBe(false);
    expect(result.skipped.some(s => s.name === 'ollama')).toBe(true);
  });

  it('ollama adapter exposes ProviderAdapter surface (isAvailable + buildCommand)', async () => {
    stubFetch(() => new Response('{"models":[]}', { status: 200 }));
    const result = await bootstrapProviders(
      makeBootstrapConfig(),
      '/tmp/test-202-001',
      registry,
    );
    expect(result.registered).toContain('ollama');
    const adapter = registry.getProvider('ollama');
    expect(typeof adapter.isAvailable).toBe('function');
    expect(typeof adapter.buildCommand).toBe('function');
    expect(Array.isArray(adapter.supportedModels)).toBe(true);
  });
});
