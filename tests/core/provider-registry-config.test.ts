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
  ProviderRegistry,
  applyDeckSecretsToEnv,
  resolveOpenAICompatCandidates,
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
    delete process.env['GROQ_API_KEY'];
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

  // ── 5) All-3-sites end-to-end (F1-012 goCriteria) ───────────────────────

  it('registers an arbitrary openai-compat provider through ALL 3 sites with NO union edit', async () => {
    // .deck carries the config provider's secret under the canonical convention.
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_GROQ_API_KEY: 'gsk-secret-123' });
    const def: ProviderDefinition = {
      name: 'groq', // arbitrary string — NOT in the ProviderName union
      type: 'openai-compatible',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
      models: ['llama-3.1-70b-versatile'],
    };
    const result = await bootstrapProviders(makeConfig([def]), ROOT, registry);

    // Site 1 — adapter resolvable (registered + resolvable from the registry).
    expect(result.registered).toContain('groq');
    expect(registry.hasProvider('groq')).toBe(true);
    expect(registry.getProvider('groq').name).toBe('groq');
    // No duplicate despite registering via both the candidate loop + config block.
    // (String() keeps the comparison type-safe — 'groq' is not in ProviderName.)
    expect(result.registered.filter(n => String(n) === 'groq')).toHaveLength(1);

    // Site 2 — candidate-listed (merged into the openai-compat SSOT).
    const candidates = resolveOpenAICompatCandidates([def]);
    expect(candidates.map(c => c.name)).toContain('groq');

    // Site 3 — secret-env applied via apiKeyEnv (deck secret → process.env),
    // with per-provider isolation in the returned override map.
    expect(process.env['GROQ_API_KEY']).toBe('gsk-secret-123');
    expect(result.providerEnvOverrides['groq']).toEqual({ GROQ_API_KEY: 'gsk-secret-123' });
  });

  it('config-absent path leaves the openai-compat candidate set byte-for-byte (backward-compat)', async () => {
    // No registry → bootstrap must not register groq, and the built-in candidate
    // SSOT is exactly the three built-ins (claude/codex/gemini/ollama unaffected).
    const result = await bootstrapProviders(makeConfig(), ROOT, registry);
    expect(registry.hasProvider('groq')).toBe(false);
    expect(result.registered).not.toContain('groq');
    expect(resolveOpenAICompatCandidates().map(c => c.name)).toEqual(['deepseek', 'qwen', 'zhipu']);
  });
});

// ─── resolveOpenAICompatCandidates — merged SSOT (F1-012 site 2) ─────────────

describe('resolveOpenAICompatCandidates — built-in + config merge (F1-012)', () => {
  it('returns exactly the three built-in presets when no registry is supplied', () => {
    const builtins = resolveOpenAICompatCandidates();
    expect(builtins.map(c => c.name)).toEqual(['deepseek', 'qwen', 'zhipu']);
    // Built-ins are preset-backed (no explicit baseURL/models).
    expect(builtins.every(c => c.preset && !c.baseURL && !c.models)).toBe(true);
  });

  it('merges a config-declared openai-compat provider as a candidate', () => {
    const merged = resolveOpenAICompatCandidates([
      { name: 'groq', type: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', models: ['llama-3.1-70b-versatile'] },
    ]);
    const groq = merged.find(c => c.name === 'groq');
    expect(groq).toBeDefined();
    expect(groq!.apiKeyEnv).toBe('GROQ_API_KEY');
    expect(groq!.baseURL).toBe('https://api.groq.com/openai/v1');
    expect(groq!.models).toEqual(['llama-3.1-70b-versatile']);
    expect(groq!.preset).toBeUndefined(); // config-driven, not a preset
  });

  it('config precedence: a config entry replaces the built-in of the same name', () => {
    const merged = resolveOpenAICompatCandidates([
      { name: 'deepseek', type: 'openai-compatible', baseUrl: 'https://proxy.internal/v1', apiKeyEnv: 'DEEPSEEK_API_KEY', models: ['deepseek-chat'] },
    ]);
    // Still one 'deepseek' entry, now config-backed (explicit baseURL, no preset).
    expect(merged.filter(c => c.name === 'deepseek')).toHaveLength(1);
    const deepseek = merged.find(c => c.name === 'deepseek')!;
    expect(deepseek.baseURL).toBe('https://proxy.internal/v1');
    expect(deepseek.preset).toBeUndefined();
  });

  it('omits incomplete config entries and ignores non-openai-compat kinds', () => {
    const merged = resolveOpenAICompatCandidates([
      // missing baseUrl + models → not candidate-listed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'incomplete', type: 'openai-compatible', apiKeyEnv: 'X_KEY' } as any,
      // CLI-kind alias → not an openai-compat candidate
      { name: 'claude-fast', type: 'claude' },
    ]);
    expect(merged.map(c => c.name)).toEqual(['deepseek', 'qwen', 'zhipu']);
  });
});

// ─── applyDeckSecretsToEnv — config-aware deck secrets (F1-012 site 3) ───────

describe('applyDeckSecretsToEnv — config-driven providers (F1-012)', () => {
  const TOUCHED = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of TOUCHED) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of TOUCHED) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('applies a config openai-compat provider deck secret via DECKENT_<apiKeyEnv>', () => {
    const overrides = applyDeckSecretsToEnv(
      { DECKENT_GROQ_API_KEY: 'gsk-xyz' },
      [{ name: 'groq', type: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', models: ['m'] }],
    );
    expect(process.env['GROQ_API_KEY']).toBe('gsk-xyz');
    // Per-provider isolation: the override map carries ONLY groq's key.
    expect(overrides['groq']).toEqual({ GROQ_API_KEY: 'gsk-xyz' });
    expect(overrides['groq']!['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('config + built-in providers coexist with zero cross-leak', () => {
    const overrides = applyDeckSecretsToEnv(
      { DECKENT_CLAUDE_API_KEY: 'sk-ant', DECKENT_GROQ_API_KEY: 'gsk' },
      [{ name: 'groq', type: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY', models: ['m'] }],
    );
    expect(overrides['claude']).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
    expect(overrides['groq']).toEqual({ GROQ_API_KEY: 'gsk' });
    expect(overrides['claude']!['GROQ_API_KEY']).toBeUndefined();
    expect(overrides['groq']!['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('no-op when the config provider has no matching deck secret', () => {
    const overrides = applyDeckSecretsToEnv(
      {}, // no DECKENT_MISTRAL_API_KEY present
      [{ name: 'mistral', type: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', apiKeyEnv: 'MISTRAL_API_KEY', models: ['mistral-large'] }],
    );
    expect(overrides['mistral']).toBeUndefined();
    expect(process.env['MISTRAL_API_KEY']).toBeUndefined();
  });

  it('CLI-kind config aliases carry no apiKeyEnv → no deck mapping', () => {
    const overrides = applyDeckSecretsToEnv(
      { DECKENT_CLAUDE_API_KEY: 'sk-ant' },
      [{ name: 'claude-fast', type: 'claude' }],
    );
    // Built-in claude mapping still applies; the CLI alias produces no entry.
    expect(overrides['claude']).toEqual({ ANTHROPIC_API_KEY: 'sk-ant' });
    expect(overrides['claude-fast']).toBeUndefined();
  });

  it('omitting providerDefs leaves built-in behavior byte-for-byte', () => {
    const withArg = applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'o' }, []);
    const without = applyDeckSecretsToEnv({ DECKENT_OPENAI_API_KEY: 'o' });
    expect(withArg).toEqual(without);
    expect(without['codex']).toEqual({ OPENAI_API_KEY: 'o' });
  });
});
