/**
 * tests/providers/cred-scrub-all-adapters.test.ts
 *
 * born-518 (audit §4.4 P0-SEC) — CROSS-PROVIDER-CRED-SCRUB.
 *
 * `applyDeckSecretsToEnv` (core/provider.ts) writes every provider's secret
 * into the shared `process.env` by design. The bug is that only
 * `providers/subprocess.ts` scrubbed every OTHER provider's credential back
 * out before handing the env to a spawned child — every other adapter's
 * `spawn()` inherited `{...process.env}` (or equivalent) unscrubbed, so a
 * mixed-provider fleet could leak one provider's secret into a worker that
 * never asked for it.
 *
 * FIX (this task, write-scope-limited — see notes below): extracted the scrub
 * into a central helper, `providers/provider.ts`
 * (`scrubCrossProviderEnv`/`buildProviderChildEnv`), and wired it into
 * `providers/subprocess.ts` — the ONLY two non-test files this task's scope
 * grants write access to. `providers/subprocess.ts` backs BOTH the claude and
 * codex spawn routes used by `orchestra/spawn-backend.ts`'s `SubprocessBackend`
 * (`resolveSubprocessProviderConfig`), so this closes the real production
 * mixed-provider-fleet gap for those two routes.
 *
 * §A — unit tests for the new central helper (pure, hermetic).
 * §B — SubprocessSpawnBackend integration matrix: every canonical provider
 *      credentials + one config-driven custom credential present in the host
 *      env at once (the worst-case mixed fleet); every provider identity's
 *      spawn must see ONLY its own key.
 * §C — Ollama/OpenAICompatible/OpenRouter injectable spawn seams now enforce
 *      the same zero-cross-provider-leak contract as §B. Gemini is included
 *      through its injectable spawn seam and normalized GEMINI_API_KEY.
 *
 * Hermetic: node:fs is mocked (no disk I/O), every adapter is constructed with
 * an injected `spawnImpl` (no real process spawned), process.env is
 * snapshot+restored around every test, fake timers swallow heartbeat/timeout
 * intervals.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  scrubCrossProviderEnv,
  buildProviderChildEnv,
} from '../../src/providers/provider.js';
import { resolveCrossProviderCredentialKeys } from '../../src/providers/cross-provider-keys.js';
import { SubprocessSpawnBackend } from '../../src/providers/subprocess.js';
import type { SubprocessProviderConfig } from '../../src/providers/subprocess.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';
import { OllamaAdapter } from '../../src/providers/ollama.js';
import { OpenAICompatibleAdapter } from '../../src/providers/openai-compatible.js';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';
import { GeminiAdapter } from '../../src/providers/gemini.js';
import { CursorAdapter } from '../../src/providers/cursor.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';

// ─── Mock node:fs (no disk I/O — hermetic) ───────────────────────────
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{"budget":{"maxTokens":1000000}}'),
}));

// ─── Shared fixtures ───────────────────────────────────────────────────

/** Every built-in provider credential env var, in canonical map order. */
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
] as const;

/** A mock child with the surface every adapter's spawn() touches. */
function makeMockChild() {
  const child = {
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    once: vi.fn(),
    kill: vi.fn(),
    pid: 4242,
  };
  child.once.mockReturnValue(child);
  return child;
}

/** Read the env object passed to a mocked spawn seam's Nth call (default: first). */
function spawnedEnv(spawnImpl: MockInstance, callIndex = 0): NodeJS.ProcessEnv {
  const call = spawnImpl.mock.calls[callIndex];
  expect(call, `spawnImpl call #${callIndex} not found`).toBeDefined();
  const spawnOpts = call[2] as { env?: NodeJS.ProcessEnv };
  expect(spawnOpts?.env, 'spawn opts.env missing').toBeDefined();
  return spawnOpts.env!;
}

// ═══════════════════════════════════════════════════════════════════════
// §A — scrubCrossProviderEnv / buildProviderChildEnv (pure unit tests)
// ═══════════════════════════════════════════════════════════════════════

describe('§A providers/provider.ts — scrubCrossProviderEnv', () => {
  it('removes every key in scrubKeys, keeps everything else', () => {
    const host: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-oai',
      PATH: '/usr/bin',
      LANG: 'en_US.UTF-8',
    };
    const result = scrubCrossProviderEnv(host, ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['OPENAI_API_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
    expect(result['LANG']).toBe('en_US.UTF-8');
  });

  it('is a no-op copy when scrubKeys is empty', () => {
    const host: NodeJS.ProcessEnv = { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant' };
    const result = scrubCrossProviderEnv(host, []);
    expect(result).toEqual(host);
    expect(result).not.toBe(host); // copy, not the same reference
  });

  it('never mutates the input hostEnv', () => {
    const host: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant', PATH: '/usr/bin' };
    scrubCrossProviderEnv(host, ['ANTHROPIC_API_KEY']);
    expect(host['ANTHROPIC_API_KEY']).toBe('sk-ant');
  });

  it('tolerates scrubKeys not present in hostEnv (missing key is a no-op delete)', () => {
    const host: NodeJS.ProcessEnv = { PATH: '/usr/bin' };
    const result = scrubCrossProviderEnv(host, ['ANTHROPIC_API_KEY', 'MY_LLM_KEY']);
    expect(result).toEqual({ PATH: '/usr/bin' });
  });

  it('scrubs a config-driven custom provider key exactly like a built-in one', () => {
    const host: NodeJS.ProcessEnv = { MY_LLM_KEY: 'custom-secret', PATH: '/usr/bin' };
    const result = scrubCrossProviderEnv(host, [...BASE_KEYS, 'MY_LLM_KEY']);
    expect(result['MY_LLM_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
  });
});

describe('§A providers/provider.ts — buildProviderChildEnv', () => {
  it('scrubs foreign keys then re-injects ownEnv on top', () => {
    const host: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant-HOST',
      OPENAI_API_KEY: 'sk-oai-HOST',
      PATH: '/usr/bin',
    };
    const result = buildProviderChildEnv(host, [...BASE_KEYS], { OPENAI_API_KEY: 'sk-oai-OWN' });
    expect(result['OPENAI_API_KEY']).toBe('sk-oai-OWN');
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
  });

  it('with no ownEnv, the child gets NO credential key at all (subscription/session auth fallback)', () => {
    const host: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant-HOST', PATH: '/usr/bin' };
    const result = buildProviderChildEnv(host, [...BASE_KEYS]);
    expect(result['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(result['PATH']).toBe('/usr/bin');
  });

  it('never mutates the input hostEnv', () => {
    const host: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant-HOST' };
    buildProviderChildEnv(host, [...BASE_KEYS], { ANTHROPIC_API_KEY: 'sk-ant-OWN' });
    expect(host['ANTHROPIC_API_KEY']).toBe('sk-ant-HOST');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §B — SubprocessSpawnBackend: full canonical + custom-key mixed fleet
// ═══════════════════════════════════════════════════════════════════════

describe('§B SubprocessSpawnBackend — full mixed-provider fleet, zero cross-leak', () => {
  const projectDir = '/tmp/test-cred-scrub-all-adapters';
  let saved: Record<string, string | undefined>;
  let spawnImpl: MockInstance;

  const ALL_KEYS = [...BASE_KEYS, 'MY_LLM_KEY', 'DECKENT_MY_LLM_KEY'] as const;

  /** Every (cliCommand, own credential env var, own credential value) triple. */
  const IDENTITIES = [
    { cli: 'claude', ownKey: 'ANTHROPIC_API_KEY', ownValue: 'sk-ant-OWN' },
    { cli: 'codex', ownKey: 'OPENAI_API_KEY', ownValue: 'sk-oai-OWN' },
    { cli: 'gemini', ownKey: 'GOOGLE_API_KEY', ownValue: 'goog-OWN' },
    { cli: 'deepseek', ownKey: 'DEEPSEEK_API_KEY', ownValue: 'ds-OWN' },
    { cli: 'qwen', ownKey: 'DASHSCOPE_API_KEY', ownValue: 'qw-OWN' },
    { cli: 'zhipu', ownKey: 'ZHIPU_API_KEY', ownValue: 'zp-OWN' },
    { cli: 'my-llm', ownKey: 'MY_LLM_KEY', ownValue: 'my-llm-OWN' },
  ] as const;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    saved = {};
    for (const k of ALL_KEYS) saved[k] = process.env[k];
    for (const k of ALL_KEYS) process.env[k] = `${k}-HOST`;
    spawnImpl = vi.fn().mockReturnValue(makeMockChild()) as unknown as MockInstance;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const k of ALL_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

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

  function makeBackend(cliCommand: string, name: string): SubprocessSpawnBackend {
    return new LocalSubprocessTestBackend(projectDir, {
      providerConfig: makeConfig(cliCommand, name),
      platform: 'linux',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      providerRegistry: [
        { name: 'my-llm', type: 'openai-compatible', baseUrl: 'https://api.my-llm.test/v1', apiKeyEnv: 'MY_LLM_KEY', models: ['my-llm-large'] },
      ],
    });
  }

  it.each(IDENTITIES)(
    '$cli worker sees ONLY its own credential ($ownKey) — every other present host key is scrubbed',
    ({ cli, ownKey, ownValue }) => {
      const backend = makeBackend(cli, `${cli}-subprocess`);
      const opts: ProviderSpawnOptions = { env: { [ownKey]: ownValue } };
      backend.spawn(`t-${cli}`, 'model-x' as ModelType, 'prompt', opts);

      const env = spawnedEnv(spawnImpl);
      expect(env[ownKey]).toBe(ownValue);
      for (const foreignKey of ALL_KEYS) {
        if (foreignKey === ownKey) continue;
        expect(env[foreignKey], `${cli} worker must not see foreign key ${foreignKey}`).toBeUndefined();
      }
    },
  );

  it('subscription-mode worker (no opts.env) gets NO credential key for any provider', () => {
    const backend = makeBackend('claude', 'claude-subprocess');
    backend.spawn('t-claude-sub', 'model-x' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl);
    for (const key of ALL_KEYS) {
      expect(env[key]).toBeUndefined();
    }
  });

  it('preserves non-credential host vars (PATH) byte-for-byte across the whole matrix', () => {
    const backend = makeBackend('codex', 'codex-subprocess');
    backend.spawn('t-base', 'model-x' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'k' } });

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
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §C — Injectable standalone adapters: zero cross-provider credential leak
// ═══════════════════════════════════════════════════════════════════════

describe('§C standalone injectable adapters — zero cross-provider leak', () => {
  const projectDir = '/tmp/test-cred-scrub-gap';
  const ALL_KEYS = [...BASE_KEYS, 'MY_LLM_KEY', 'DECKENT_MY_LLM_KEY'] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    saved = {};
    for (const k of ALL_KEYS) saved[k] = process.env[k];
    for (const k of ALL_KEYS) process.env[k] = `${k}-HOST`;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const k of ALL_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('OllamaAdapter.spawn() removes every canonical and config-driven provider secret', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new OllamaAdapter(projectDir, {
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      credentialEnvKeys: ALL_KEYS,
    });
    const model = adapter.supportedModels[0];
    expect(model, 'OllamaAdapter has no registered model to spawn with').toBeDefined();

    adapter.spawn('t-ollama-gap', model, 'prompt');

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    for (const k of ALL_KEYS) {
      expect(env[k], `Ollama worker must not see provider credential ${k}`).toBeUndefined();
    }
    expect(env['PATH']).toBe(process.env['PATH']);
  });

  it('OpenAICompatibleAdapter.spawn() retains only its own explicitly supplied credential', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new OpenAICompatibleAdapter({
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: ['deepseek-chat'],
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      credentialEnvKeys: ALL_KEYS,
    });

    adapter.spawn('t-oaicompat-gap', 'deepseek-chat' as ModelType, 'prompt', { env: { DEEPSEEK_API_KEY: 'ds-OWN' } });

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    expect(env['DEEPSEEK_API_KEY']).toBe('ds-OWN');
    for (const k of ALL_KEYS.filter((k) => k !== 'DEEPSEEK_API_KEY')) {
      expect(env[k], `OpenAI-compatible worker must not see foreign key ${k}`).toBeUndefined();
    }
    expect(env['PATH']).toBe(process.env['PATH']);
  });

  it('OpenRouterProvider.spawn() retains only its host-resolved credential', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new OpenRouterProvider(projectDir, {
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      loadSecretsImpl: () => ({ OPENROUTER_API_KEY: 'or-OWN' }),
      models: ['test-model'],
      credentialEnvKeys: ALL_KEYS,
      reasoning: { effort: 'high' },
    });

    adapter.spawn('t-openrouter-gap', 'test-model' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    expect(env['OPENROUTER_API_KEY']).toBe('or-OWN');
    for (const k of ALL_KEYS.filter((k) => k !== 'OPENROUTER_API_KEY')) {
      expect(env[k], `OpenRouter worker must not see foreign key ${k}`).toBeUndefined();
    }
    expect(env['DECKENT_HTTP_EXTRA_BODY']).toBe(JSON.stringify({ reasoning: { effort: 'high' } }));
    expect(env['PATH']).toBe(process.env['PATH']);
  });

  it('GeminiAdapter.spawn() retains only its normalized Gemini credential', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new GeminiAdapter(projectDir, {
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      credentialEnvKeys: ALL_KEYS,
    });

    adapter.spawn('t-gemini-gap', 'gemini-2.5-pro', 'prompt');

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    expect(env['GEMINI_API_KEY']).toBe('DECKENT_GOOGLE_API_KEY-HOST');
    for (const key of ALL_KEYS.filter((key) => key !== 'GEMINI_API_KEY')) {
      expect(env[key], `Gemini worker must not see provider credential ${key}`).toBeUndefined();
    }
    expect(env['PATH']).toBe(process.env['PATH']);
  });

  it('CursorAdapter.spawn() scrubs every provider credential for session auth', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    vi.spyOn(modelRegistry, 'getByProvider').mockReturnValue([{ id: 'cursor-test' }] as never);
    const adapter = new CursorAdapter(projectDir, {
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      credentialEnvKeys: ALL_KEYS,
    });

    adapter.spawn('t-cursor-gap', 'cursor-test' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    for (const key of ALL_KEYS) {
      expect(env[key], `Cursor worker must not see provider credential ${key}`).toBeUndefined();
    }
    expect(env['PATH']).toBe(process.env['PATH']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §D — resolveCrossProviderCredentialKeys sanity (already covered by
// cross-provider-keys-scrub.test.ts; single smoke check that §B's key set
// matches the real resolver so the matrix above never silently drifts).
// ═══════════════════════════════════════════════════════════════════════

describe('§D key-set sanity', () => {
  it('the static base scrub set matches BASE_KEYS used throughout this file', () => {
    expect(resolveCrossProviderCredentialKeys()).toEqual([...BASE_KEYS]);
  });
});
