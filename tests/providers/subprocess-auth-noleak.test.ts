/**
 * Sprint 333 Task 333-001 — F1-014: per-worker auth NON-LEAK for the SUBPROCESS
 * (local, non-docker) backend.
 *
 * Contract (mirrors the docker backend's runtime per-provider allowlist, but as a
 * SCRUB+inject on the inherited host env): a subprocess worker's child env must
 * carry ONLY its own provider's credential — never a foreign provider's key, and
 * never an `ANTHROPIC_API_KEY` for a subscription claude worker (the ADR-076
 * inverse-failure that demotes subscription→API mode → Tier-1 timeout → the mass
 * synthetic NO_GO that killed Sprint 213).
 *
 * `opts.env` is the single source of truth for credentials — it is exactly the
 * per-provider override map produced by `applyDeckSecretsToEnv` (claude→
 * ANTHROPIC_API_KEY, codex→OPENAI_API_KEY, gemini→GOOGLE_API_KEY), carrying ONLY
 * the worker's own key (subscription mode → empty → no key → CLI session auth).
 *
 * Hermetic: an injected `spawnImpl` seam means NO real process is spawned; node:fs
 * is mocked so spawn() touches no disk; process.env is snapshot+restored around
 * every test so the suite leaves zero global state; fake timers swallow the 15s
 * heartbeat interval spawn() schedules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { SubprocessSpawnBackend } from '../../src/providers/subprocess.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';

// ─── Mock node:fs (no disk I/O — hermetic) ───────────────────────────
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────

/** Minimal provider config — env-building is independent of args/model shape. */
function makeConfig(cliCommand: string, name: string): SubprocessProviderConfig {
  return {
    cliCommand,
    name,
    supportedModels: [],
    buildArgs: () => [],
    buildCommandString: () => '',
  };
}

/** A mock child with the surface spawn() touches (stdin + chainable once). */
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

/** Read the env object passed to the injected spawn seam on its first call. */
function spawnedEnv(spawnImpl: MockInstance): NodeJS.ProcessEnv {
  const call = spawnImpl.mock.calls[0];
  expect(call, 'spawnImpl was not called').toBeDefined();
  const spawnOpts = call[2] as { env?: NodeJS.ProcessEnv };
  expect(spawnOpts?.env, 'spawn opts.env missing').toBeDefined();
  return spawnOpts.env!;
}

// Every env var these tests read or write — snapshot + restore around each test.
const TOUCHED_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
  'LANG',
  'DECKENT_NONSECRET_PROBE',
] as const;

// ─── Tests ───────────────────────────────────────────────────────────

describe('Sprint 333 333-001 — subprocess backend per-worker auth NON-LEAK (F1-014)', () => {
  const projectDir = '/tmp/test-noleak-project';
  let saved: Record<string, string | undefined>;
  let spawnImpl: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Snapshot then seed a worst-case mixed-provider HOST env: all three CLI
    // provider credentials present at once (the exact leak surface), plus a
    // non-secret probe var that MUST survive into the child.
    saved = {};
    for (const k of TOUCHED_ENV) saved[k] = process.env[k];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-HOST';
    process.env['OPENAI_API_KEY'] = 'sk-oai-HOST';
    process.env['GOOGLE_API_KEY'] = 'goog-HOST';
    process.env['LANG'] = 'en_US.UTF-8';
    process.env['DECKENT_NONSECRET_PROBE'] = 'keep-me';
    delete process.env['DEEPSEEK_API_KEY'];
    delete process.env['DASHSCOPE_API_KEY'];
    delete process.env['ZHIPU_API_KEY'];

    spawnImpl = vi.fn().mockReturnValue(makeMockChild()) as unknown as MockInstance;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const k of TOUCHED_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function makeBackend(cliCommand: string, name: string): SubprocessSpawnBackend {
    return new SubprocessSpawnBackend(projectDir, {
      providerConfig: makeConfig(cliCommand, name),
      platform: 'linux',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
  }

  it('codex worker child env carries ONLY OPENAI_API_KEY — no ANTHROPIC/GOOGLE leak', () => {
    const backend = makeBackend('codex', 'codex-subprocess');
    // opts.env = the codex override map applyDeckSecretsToEnv would hand the spawn.
    const opts: ProviderSpawnOptions = { env: { OPENAI_API_KEY: 'sk-oai-OWN' } };
    backend.spawn('t-codex', 'gpt-5-codex' as ModelType, 'prompt', opts);

    const env = spawnedEnv(spawnImpl);
    // Own credential present (re-injected via opts.env).
    expect(env['OPENAI_API_KEY']).toBe('sk-oai-OWN');
    // Foreign credentials scrubbed — zero cross-leak.
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
  });

  it('claude SUBSCRIPTION worker (no opts.env) gets NO ANTHROPIC_API_KEY (ADR-076)', () => {
    const backend = makeBackend('claude', 'claude-subprocess');
    // Subscription mode → applyDeckSecretsToEnv returns {} → no override passed.
    backend.spawn('t-claude-sub', 'opus' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['OPENAI_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
  });

  it('preserves base non-secret host vars (PATH/LANG/probe) byte-for-byte', () => {
    const backend = makeBackend('codex', 'codex-subprocess');
    backend.spawn('t-base', 'gpt-5-codex' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'k' } });

    const env = spawnedEnv(spawnImpl);
    expect(env['PATH']).toBe(process.env['PATH']);
    expect(env['LANG']).toBe('en_US.UTF-8');
    expect(env['PYTHONIOENCODING']).toBe('utf-8');
    expect(env['DECKENT_NONSECRET_PROBE']).toBe('keep-me');
  });

  it('api claude worker (opts.env carries its own key) gets ANTHROPIC_API_KEY, no foreign keys', () => {
    const backend = makeBackend('claude', 'claude-subprocess');
    // api mode → override map carries ONLY the claude credential.
    backend.spawn('t-claude-api', 'opus' as ModelType, 'prompt', { env: { ANTHROPIC_API_KEY: 'sk-ant-OWN' } });

    const env = spawnedEnv(spawnImpl);
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-ant-OWN');
    expect(env['OPENAI_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
  });

  it('gemini worker gets ONLY GOOGLE_API_KEY even when host carries all three', () => {
    const backend = makeBackend('gemini', 'gemini-subprocess');
    backend.spawn('t-gemini', 'gemini-2.5-pro' as ModelType, 'prompt', { env: { GOOGLE_API_KEY: 'goog-OWN' } });

    const env = spawnedEnv(spawnImpl);
    expect(env['GOOGLE_API_KEY']).toBe('goog-OWN');
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['OPENAI_API_KEY']).toBeUndefined();
  });

  it('scrubs openai-compatible provider keys (deepseek/qwen/zhipu) from the host env too', () => {
    // A host that ALSO carries openai-compat keys must not leak them into a codex worker.
    process.env['DEEPSEEK_API_KEY'] = 'ds-HOST';
    process.env['DASHSCOPE_API_KEY'] = 'qw-HOST';
    process.env['ZHIPU_API_KEY'] = 'zp-HOST';

    const backend = makeBackend('codex', 'codex-subprocess');
    backend.spawn('t-compat', 'gpt-5-codex' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'sk-oai-OWN' } });

    const env = spawnedEnv(spawnImpl);
    expect(env['OPENAI_API_KEY']).toBe('sk-oai-OWN');
    expect(env['DEEPSEEK_API_KEY']).toBeUndefined();
    expect(env['DASHSCOPE_API_KEY']).toBeUndefined();
    expect(env['ZHIPU_API_KEY']).toBeUndefined();
  });

  it('does not mutate the host process.env while building the child env', () => {
    const backend = makeBackend('codex', 'codex-subprocess');
    backend.spawn('t-nomutate', 'gpt-5-codex' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'sk-oai-OWN' } });

    // Host env is untouched — scrub happens on a child copy only.
    expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-HOST');
    expect(process.env['GOOGLE_API_KEY']).toBe('goog-HOST');
    expect(process.env['OPENAI_API_KEY']).toBe('sk-oai-HOST');
  });
});
