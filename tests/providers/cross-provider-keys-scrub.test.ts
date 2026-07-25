/**
 * tests/providers/cross-provider-keys-scrub.test.ts
 *
 * F1-014 phase-2 — unify + dynamic-ize the cross-provider credential scrub.
 *
 * Two layers of proof:
 *  (A) `resolveCrossProviderCredentialKeys` — the shared single-source-of-truth
 *      resolver returns the static base set, and the base set ∪ a config provider's
 *      `apiKeyEnv` (F1-012 registry), deduped + deterministic.
 *  (B) the SUBPROCESS backend, wired with that registry, scrubs a config provider's
 *      `MY_LLM_KEY` from a FOREIGN worker and re-injects ONLY the owning worker's
 *      key — closing the phase-1 gap where an arbitrary `apiKeyEnv` leaked because
 *      the static set could not know it (the pre-fix RED, demonstrated below by a
 *      backend constructed WITHOUT the registry). Existing invariants hold:
 *      subscription claude → NO `ANTHROPIC_API_KEY` (ADR-076); base PATH/LANG kept.
 *
 * Hermetic: node:fs is mocked (no disk), an injected `spawnImpl` seam means NO real
 * process is spawned, process.env is snapshot+restored around every test, and fake
 * timers swallow the 15s heartbeat interval spawn() schedules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  resolveCrossProviderCredentialKeys,
  BASE_PROVIDER_CREDENTIAL_ENV,
} from '../../src/providers/cross-provider-keys.js';
import { SubprocessSpawnBackend } from '../../src/providers/subprocess.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';
import type { ProviderDefinition } from '../../src/core/config-types.js';

// ─── Mock node:fs (no disk I/O — hermetic) ───────────────────────────
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{"budget":{"maxTokens":1000000}}'),
}));

// ─── Fixtures ────────────────────────────────────────────────────────

/** The current static base scrub set, in canonical order. */
const BASE_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'ZHIPU_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'DECKENT_CLAUDE_API_KEY',
  'DECKENT_OPENAI_API_KEY',
  'DECKENT_GOOGLE_API_KEY',
  'DECKENT_DEEPSEEK_API_KEY',
  'DECKENT_DASHSCOPE_API_KEY',
  'DECKENT_ZHIPU_API_KEY',
  'DECKENT_OPENROUTER_API_KEY',
];

/** A config-driven openai-compatible provider whose credential is NOT a built-in. */
const MY_LLM_REGISTRY: readonly ProviderDefinition[] = [
  { name: 'my-llm', type: 'openai-compatible', baseUrl: 'https://api.my-llm.test/v1', apiKeyEnv: 'MY_LLM_KEY', models: ['my-llm-large'] },
];

// ─── (A) resolver — pure, no env / no I/O ─────────────────────────────

describe('F1-014 phase-2 (A): resolveCrossProviderCredentialKeys', () => {
  it('returns the static base set (no registry), including non-ambient OpenRouter auth', () => {
    expect(resolveCrossProviderCredentialKeys()).toEqual(BASE_KEYS);
    expect(resolveCrossProviderCredentialKeys({})).toEqual(BASE_KEYS);
    expect(resolveCrossProviderCredentialKeys({ registry: [] })).toEqual(BASE_KEYS);
  });

  it('unions a config provider runtime key and raw deck alias onto the base set', () => {
    const keys = resolveCrossProviderCredentialKeys({ registry: MY_LLM_REGISTRY });
    expect(keys).toEqual([...BASE_KEYS, 'MY_LLM_KEY', 'DECKENT_MY_LLM_KEY']);
    // contains base + the config key
    for (const k of BASE_KEYS) expect(keys).toContain(k);
    expect(keys).toContain('MY_LLM_KEY');
    expect(keys).toContain('DECKENT_MY_LLM_KEY');
  });

  it('dedupes a config apiKeyEnv that collides with a base key, and is deterministic', () => {
    const registry: ProviderDefinition[] = [
      { name: 'shadow-openai', type: 'openai-compatible', baseUrl: 'x', apiKeyEnv: 'OPENAI_API_KEY', models: ['m'] },
      { name: 'my-llm', type: 'openai-compatible', baseUrl: 'x', apiKeyEnv: 'MY_LLM_KEY', models: ['m'] },
    ];
    const keys = resolveCrossProviderCredentialKeys({ registry });
    // OPENAI_API_KEY appears exactly once; MY_LLM_KEY appended once.
    expect(keys.filter((k) => k === 'OPENAI_API_KEY')).toHaveLength(1);
    expect(keys).toEqual([...BASE_KEYS, 'MY_LLM_KEY', 'DECKENT_MY_LLM_KEY']);
    // Determinism: same input → same output.
    expect(resolveCrossProviderCredentialKeys({ registry })).toEqual(keys);
  });

  it('ignores entries with missing / blank apiKeyEnv (CLI-kind aliases carry none)', () => {
    const registry: ProviderDefinition[] = [
      { name: 'claude-fast', type: 'claude' },            // CLI alias, no apiKeyEnv
      { name: 'blank', type: 'openai-compatible', apiKeyEnv: '   ' },
      { name: 'my-llm', type: 'openai-compatible', apiKeyEnv: 'MY_LLM_KEY' },
    ];
    expect(resolveCrossProviderCredentialKeys({ registry })).toEqual([
      ...BASE_KEYS,
      'MY_LLM_KEY',
      'DECKENT_MY_LLM_KEY',
    ]);
  });

  it('BASE_PROVIDER_CREDENTIAL_ENV mirrors core/provider.ts applyDeckSecretsToEnv', () => {
    expect(BASE_PROVIDER_CREDENTIAL_ENV).toEqual({
      claude: 'ANTHROPIC_API_KEY',
      codex: 'OPENAI_API_KEY',
      gemini: 'GOOGLE_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      qwen: 'DASHSCOPE_API_KEY',
      zhipu: 'ZHIPU_API_KEY',
    });
  });
});

// ─── (B) subprocess backend — config-provider scrub (hermetic spawn) ──

/** Minimal provider config — env-building is independent of args/model shape. */
function makeConfig(cliCommand: string, name: string): SubprocessProviderConfig {
  return {
    cliCommand,
    name,
    supportedModels: [],
    buildArgs: () => [],
    buildCommandString: () => '',
    liveStreamArgs: [],
    liveBudgetEvidenceTrust: 'host-isolated',
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

const TOUCHED_ENV = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'MY_LLM_KEY',
  'DECKENT_MY_LLM_KEY',
  'LANG',
  'DECKENT_NONSECRET_PROBE',
] as const;

describe('F1-014 phase-2 (B): subprocess backend scrubs config-provider apiKeyEnv', () => {
  const projectDir = '/tmp/test-f1014-phase2';
  let saved: Record<string, string | undefined>;
  let spawnImpl: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Worst-case mixed host: built-in keys AND a config provider's key all present.
    saved = {};
    for (const k of TOUCHED_ENV) saved[k] = process.env[k];
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-HOST';
    process.env['OPENAI_API_KEY'] = 'sk-oai-HOST';
    process.env['GOOGLE_API_KEY'] = 'goog-HOST';
    process.env['MY_LLM_KEY'] = 'my-llm-HOST';
    process.env['DECKENT_MY_LLM_KEY'] = 'my-llm-RAW-HOST';
    process.env['LANG'] = 'en_US.UTF-8';
    process.env['DECKENT_NONSECRET_PROBE'] = 'keep-me';

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

  function makeBackend(
    cliCommand: string,
    name: string,
    providerRegistry?: readonly ProviderDefinition[],
  ): SubprocessSpawnBackend {
    return new LocalSubprocessTestBackend(projectDir, {
      providerConfig: makeConfig(cliCommand, name),
      platform: 'linux',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      providerRegistry,
    });
  }

  it('FOREIGN worker (codex) — config provider MY_LLM_KEY is scrubbed when registry is wired', () => {
    const backend = makeBackend('codex', 'codex-subprocess', MY_LLM_REGISTRY);
    const opts: ProviderSpawnOptions = { env: { OPENAI_API_KEY: 'sk-oai-OWN' } };
    backend.spawn('t-codex-vs-myllm', 'gpt-5-codex' as ModelType, 'prompt', opts);

    const env = spawnedEnv(spawnImpl);
    // Own credential re-injected; foreign built-in AND config keys scrubbed.
    expect(env['OPENAI_API_KEY']).toBe('sk-oai-OWN');
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
    expect(env['MY_LLM_KEY']).toBeUndefined();
    expect(env['DECKENT_MY_LLM_KEY']).toBeUndefined();
  });

  it('OWNING worker (my-llm) — MY_LLM_KEY re-injected from opts.env only, host value scrubbed', () => {
    const backend = makeBackend('my-llm', 'my-llm-subprocess', MY_LLM_REGISTRY);
    // applyDeckSecretsToEnv would hand the my-llm worker ONLY its own key.
    backend.spawn('t-myllm-own', 'my-llm-large' as ModelType, 'prompt', { env: { MY_LLM_KEY: 'my-llm-OWN' } });

    const env = spawnedEnv(spawnImpl);
    // The re-injected own value, never the host value.
    expect(env['MY_LLM_KEY']).toBe('my-llm-OWN');
    // No foreign built-in keys leak in.
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['OPENAI_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
    expect(env['DECKENT_MY_LLM_KEY']).toBeUndefined();
  });

  it('PRE-FIX RED: WITHOUT the registry, the static base set misses MY_LLM_KEY → it leaks', () => {
    // A backend built with no registry reproduces the phase-1 behaviour: the config
    // provider's key is unknown to the scrub set and survives into a foreign worker.
    const backend = makeBackend('codex', 'codex-subprocess' /* no registry */);
    backend.spawn('t-codex-leak', 'gpt-5-codex' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'sk-oai-OWN' } });

    const env = spawnedEnv(spawnImpl);
    // Built-ins still scrubbed (phase-1 worked for those)...
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
    // ...but the config provider's key LEAKS — exactly the gap phase-2 closes.
    expect(env['MY_LLM_KEY']).toBe('my-llm-HOST');
    expect(env['DECKENT_MY_LLM_KEY']).toBe('my-llm-RAW-HOST');
  });

  it('subscription claude (no opts.env) gets NO ANTHROPIC_API_KEY even with a registry (ADR-076)', () => {
    const backend = makeBackend('claude', 'claude-subprocess', MY_LLM_REGISTRY);
    backend.spawn('t-claude-sub', 'opus' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl);
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['OPENAI_API_KEY']).toBeUndefined();
    expect(env['GOOGLE_API_KEY']).toBeUndefined();
    expect(env['MY_LLM_KEY']).toBeUndefined();
    expect(env['DECKENT_MY_LLM_KEY']).toBeUndefined();
  });

  it('preserves base non-secret host vars (PATH/LANG/probe) byte-for-byte', () => {
    const backend = makeBackend('codex', 'codex-subprocess', MY_LLM_REGISTRY);
    backend.spawn('t-base', 'gpt-5-codex' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'k' } });

    const env = spawnedEnv(spawnImpl);
    // WORKER-GIT-GUARD (born-499): the subprocess backend prepends a per-task
    // git-shim dir (buildGitGuardDir → <tmpdir>/deckent-git-guard/<taskId>-<hex>)
    // to PATH on POSIX so a worker `git` resolves to the stash/reset-blocking
    // wrapper; win32 skips it (POSIX-only shim). Either way the host PATH is
    // preserved verbatim — as the suffix when the guard prepends, or unchanged
    // on win32. The guard only prepends one entry; it never rewrites PATH.
    const hostPath = process.env['PATH'] ?? '';
    const childPath = env['PATH'] ?? '';
    expect(childPath.endsWith(hostPath)).toBe(true);
    if (childPath !== hostPath) {
      expect(childPath.slice(0, childPath.length - hostPath.length)).toMatch(
        /deckent-git-guard[/\\][^/\\:;]+[:;]$/,
      );
    }
    expect(env['LANG']).toBe('en_US.UTF-8');
    expect(env['PYTHONIOENCODING']).toBe('utf-8');
    expect(env['DECKENT_NONSECRET_PROBE']).toBe('keep-me');
  });

  it('does not mutate the host process.env while building the child env', () => {
    const backend = makeBackend('codex', 'codex-subprocess', MY_LLM_REGISTRY);
    backend.spawn('t-nomutate', 'gpt-5-codex' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'sk-oai-OWN' } });

    expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-HOST');
    expect(process.env['OPENAI_API_KEY']).toBe('sk-oai-HOST');
    expect(process.env['GOOGLE_API_KEY']).toBe('goog-HOST');
    expect(process.env['MY_LLM_KEY']).toBe('my-llm-HOST');
  });
});
