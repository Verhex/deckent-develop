// ─── DECKBROKER-WIRE tests (task 354-006, flag-gated, ADR-G-005/G-017 row 422) ─
//
// Verifies the two halves this task wires together:
//  (A) `bootstrapProviders` (src/core/provider.ts) mints a host-side `DeckBroker`
//      only when `config.deck_broker.enabled` is true — `null` otherwise, and the
//      existing `providerEnvOverrides`/`process.env` path is entirely unaffected
//      either way (flag-off byte-identical).
//  (B) `SubprocessSpawnBackend.spawn()` (src/providers/subprocess.ts) consumes an
//      injected `opts.deckBroker` to resolve THIS task's own credential — task-
//      scoped, audited. The pre-existing `opts.env` reinject path remains only
//      when no broker is injected; a broker denial fail-closes credential
//      reinjection so an unscoped fallback cannot bypass task authority.
//
// Hermetic: node:child_process + deck-file.js are mocked so no real CLI probing
// or disk I/O happens; node:fs is mocked so SubprocessSpawnBackend.spawn() never
// touches disk; fetch is stubbed so the ollama probe never hits the network;
// every touched env var is snapshotted + restored.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { ModelType } from '../../src/core/types.js';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: '', error: null, pid: 0, output: [], signal: null }),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { loadDeckSecrets } from '../../src/core/deck-file.js';
import { bootstrapProviders, ProviderRegistry } from '../../src/core/provider.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { DeckBroker } from '../../src/core/deck-broker.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';

// ─── Shared helpers ─────────────────────────────────────────────────────────

type BootstrapConfig = Pick<
  ResolvedConfig,
  'brain_provider' | 'worker_provider' | 'fallback_provider' | 'projectRoot' | 'providers'
> & {
  auth_mode?: 'subscription' | 'api' | 'hybrid';
  deck_broker?: { enabled?: boolean };
};

function makeBootstrapConfig(overrides: Partial<BootstrapConfig> = {}): BootstrapConfig {
  return {
    brain_provider: undefined,
    worker_provider: undefined,
    fallback_provider: undefined,
    projectRoot: '/tmp/test-354-006',
    auth_mode: 'api',
    ...overrides,
  };
}

const CREDENTIAL_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
] as const;

let savedEnv: Record<string, string | undefined>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', error: null, pid: 0, output: [], signal: null } as any);
  vi.mocked(loadDeckSecrets).mockReturnValue({});

  savedEnv = {};
  for (const k of CREDENTIAL_ENV) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const k of CREDENTIAL_ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// ─── (A) bootstrapProviders — DeckBroker minting ──────────────────────────────

describe('bootstrapProviders — DeckBroker minting (354-006, flag-gated)', () => {
  it('flag omitted → deckBroker is null, providerEnvOverrides unaffected (flag-off byte-identical)', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx' });
    const registry = new ProviderRegistry();
    const config = makeBootstrapConfig();

    const result = await bootstrapProviders(config, config.projectRoot, registry);

    expect(result.deckBroker).toBeNull();
    expect(result.providerEnvOverrides['claude']).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-xxx' });
  });

  it('flag explicitly false → deckBroker is null', async () => {
    const registry = new ProviderRegistry();
    const config = makeBootstrapConfig({ deck_broker: { enabled: false } });

    const result = await bootstrapProviders(config, config.projectRoot, registry);

    expect(result.deckBroker).toBeNull();
  });

  it('flag true + auth_mode "subscription" → deckBroker stays null (no .deck surface at all, mirrors providerEnvOverrides gate)', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx' });
    const registry = new ProviderRegistry();
    const config = makeBootstrapConfig({ auth_mode: 'subscription', deck_broker: { enabled: true } });

    const result = await bootstrapProviders(config, config.projectRoot, registry);

    expect(result.deckBroker).toBeNull();
    expect(result.providerEnvOverrides).toEqual({});
  });

  it('flag true + auth_mode "api" → deckBroker is a live DeckBroker whose resolveForTask matches providerEnvOverrides', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-xxx' });
    const registry = new ProviderRegistry();
    const config = makeBootstrapConfig({ deck_broker: { enabled: true } });

    const result = await bootstrapProviders(config, config.projectRoot, registry);

    expect(result.deckBroker).toBeInstanceOf(DeckBroker);
    expect(result.deckBroker!.resolveForTask('task-A', 'claude')).toEqual(result.providerEnvOverrides['claude']);
  });

  it('flag true → deckBroker resolution is task-scoped: two tasks each get an independent grant, denials are audited', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-shared' });
    const registry = new ProviderRegistry();
    const config = makeBootstrapConfig({ deck_broker: { enabled: true } });

    const result = await bootstrapProviders(config, config.projectRoot, registry);
    const broker = result.deckBroker!;

    expect(broker.resolveForTask('task-A', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-shared' });
    expect(broker.resolveForTask('task-B', 'claude')).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-shared' });
    // Same taskId again → denied (single-use handoff), never another task's leak.
    expect(broker.resolveForTask('task-A', 'claude')).toBeNull();
    // Foreign/unconfigured provider → denied, no secret.
    expect(broker.resolveForTask('task-C', 'codex')).toBeNull();

    const log = broker.getAuditLog();
    expect(log.map((e) => e.outcome)).toEqual(['granted', 'granted', 'denied', 'denied']);
    expect(JSON.stringify(log)).not.toContain('sk-ant-shared');
  });

  it('flag true → deckBroker honors config.providers.registry for a config-driven openai-compatible provider (parity with providerEnvOverrides)', async () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_GROQ_API_KEY: 'gsk-secret-123' });
    const registry = new ProviderRegistry();
    const config = makeBootstrapConfig({
      deck_broker: { enabled: true },
      providers: {
        registry: [
          { name: 'groq', type: 'openai-compatible', apiKeyEnv: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b'] },
        ],
      } as ResolvedConfig['providers'],
    });

    const result = await bootstrapProviders(config, config.projectRoot, registry);

    expect(result.deckBroker!.resolveForTask('task-groq', 'groq')).toEqual({ GROQ_API_KEY: 'gsk-secret-123' });
  });
});

// ─── (B) SubprocessSpawnBackend.spawn() — broker consumption ─────────────────

function makeProviderConfig(cliCommand: string, name: string): SubprocessProviderConfig {
  return {
    cliCommand,
    name,
    supportedModels: [],
    buildArgs: () => [],
    buildCommandString: () => '',
  };
}

function makeMockChild() {
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    once: vi.fn(),
    kill: vi.fn(),
    pid: 4242,
  };
  child.once.mockReturnValue(child);
  return child;
}

function spawnedEnv(spawnImpl: MockInstance): NodeJS.ProcessEnv {
  const call = spawnImpl.mock.calls[0];
  expect(call, 'spawnImpl was not called').toBeDefined();
  const spawnOpts = call[2] as { env?: NodeJS.ProcessEnv };
  expect(spawnOpts?.env, 'spawn opts.env missing').toBeDefined();
  return spawnOpts.env!;
}

describe('SubprocessSpawnBackend.spawn() — DeckBroker consumption (354-006, flag-gated)', () => {
  const projectDir = '/tmp/test-354-006-subprocess';
  let spawnImpl: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    spawnImpl = vi.fn().mockReturnValue(makeMockChild()) as unknown as MockInstance;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function makeBackend(cliCommand: string, name: string): LocalSubprocessTestBackend {
    return new LocalSubprocessTestBackend(projectDir, {
      providerConfig: makeProviderConfig(cliCommand, name),
      platform: 'linux',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
  }

  it('opts.deckBroker absent → env built exactly as before (flag-off byte-identical regression pin)', () => {
    const backend = makeBackend('codex', 'codex-subprocess');
    const opts: ProviderSpawnOptions = { env: { OPENAI_API_KEY: 'sk-oai-OWN' } };
    backend.spawn('t-flagoff', 'gpt-5-codex' as ModelType, 'prompt', opts);

    const env = spawnedEnv(spawnImpl);
    expect(env['OPENAI_API_KEY']).toBe('sk-oai-OWN');
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('opts.deckBroker granted → child env carries ONLY the broker-resolved credential for THIS task', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-broker' });
    const broker = new DeckBroker(projectDir);
    const backend = makeBackend('claude', 'claude-subprocess');

    backend.spawn('t-brokered', 'opus' as ModelType, 'prompt', { deckBroker: broker });

    const env = spawnedEnv(spawnImpl);
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-broker');
    expect(env['OPENAI_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
  });

  it('two different taskIds spawned off the SAME broker each get their own independent grant — no leak between tasks', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-shared' });
    const broker = new DeckBroker(projectDir);
    const backend = makeBackend('claude', 'claude-subprocess');

    backend.spawn('t-A', 'opus' as ModelType, 'prompt', { deckBroker: broker });
    expect(spawnedEnv(spawnImpl)['ANTHROPIC_API_KEY']).toBe('sk-ant-shared');

    spawnImpl.mockClear();
    backend.spawn('t-B', 'opus' as ModelType, 'prompt', { deckBroker: broker });
    expect(spawnedEnv(spawnImpl)['ANTHROPIC_API_KEY']).toBe('sk-ant-shared');

    const log = broker.getAuditLog();
    expect(log.map((e) => e.taskId)).toEqual(['t-A', 't-B']);
    expect(log.every((e) => e.outcome === 'granted')).toBe(true);
  });

  it('opts.deckBroker denial fail-closes credential reinjection from opts.env', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-broker' });
    const broker = new DeckBroker(projectDir);
    // Pre-consume the taskId's grant before spawn() ever runs.
    broker.resolveForTask('t-dup', 'claude');
    const backend = makeBackend('claude', 'claude-subprocess');

    expect(() =>
      backend.spawn('t-dup', 'opus' as ModelType, 'prompt', {
        deckBroker: broker,
        env: { ANTHROPIC_API_KEY: 'sk-ant-fallback' },
      }),
    ).not.toThrow();

    const env = spawnedEnv(spawnImpl);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(broker.getAuditLog().at(-1)).toMatchObject({
      taskId: 't-dup',
      outcome: 'denied',
    });
  });

  it('opts.deckBroker denies (no secret configured) with no opts.env fallback → worker gets no credential, still spawns', () => {
    // Empty .deck — broker denies every resolve; no opts.env fallback supplied.
    const broker = new DeckBroker(projectDir);
    const backend = makeBackend('claude', 'claude-subprocess');

    expect(() =>
      backend.spawn('t-nokey', 'opus' as ModelType, 'prompt', { deckBroker: broker }),
    ).not.toThrow();

    const env = spawnedEnv(spawnImpl);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
  });

  it('the .deck project path never appears in the spawned child env when a broker is used', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-ant-broker' });
    const broker = new DeckBroker(projectDir);
    const backend = makeBackend('claude', 'claude-subprocess');

    backend.spawn('t-nopathleak', 'opus' as ModelType, 'prompt', { deckBroker: broker });

    const env = spawnedEnv(spawnImpl);
    expect(JSON.stringify(env)).not.toContain(projectDir);
    expect(JSON.stringify(env)).not.toContain('.deck');
  });
});
