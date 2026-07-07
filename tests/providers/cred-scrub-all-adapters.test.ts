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
 * §B — SubprocessSpawnBackend integration matrix: ALL SIX built-in provider
 *      credentials + one config-driven custom credential present in the host
 *      env at once (the worst-case mixed fleet); every provider identity's
 *      spawn must see ONLY its own key.
 * §C — KNOWN GAP, out of this task's write scope. `providers/codex.ts`
 *      (`CodexAdapter.spawn()`), `providers/gemini.ts`
 *      (`buildGeminiSpawnEnv()`), `providers/ollama.ts`
 *      (`OllamaAdapter.spawn()`), `providers/openai-compatible.ts`
 *      (`OpenAICompatibleAdapter.spawn()`), and `providers/openrouter.ts`
 *      (`OpenRouterProvider.spawn()`) each independently build their child env
 *      from `{...process.env}` with NO cross-provider scrub — confirmed by
 *      direct read, NOT fixed by this task (none of those 5 files are in this
 *      task's write scope), and NOT wired through `SubprocessSpawnBackend`
 *      (each implements `ProviderAdapter.spawn()` directly). §C proves this
 *      TODAY for the three adapters with an injectable `spawnImpl` seam
 *      (Ollama/OpenAICompatible/OpenRouter) — hermetic, no real process spawned.
 *      `CodexAdapter`/`GeminiAdapter` have no injectable seam (raw `spawn` from
 *      `node:child_process`); their leak is documented by exact file:line
 *      citation in this header instead of an executable test, to avoid a
 *      brittle full-module mock for marginal proof beyond what's already been
 *      read and confirmed. `orchestra/spawn-backend.ts`'s `TmuxBackend` (the
 *      "tmux-Claude default" the audit names) is outside this task's read AND
 *      write scope entirely — not covered here at all.
 *
 * §C tests intentionally assert the CURRENT (vulnerable) behavior. They are a
 * tracked regression marker for a follow-up task (expanded write scope:
 * providers/codex.ts, providers/gemini.ts, providers/ollama.ts,
 * providers/openai-compatible.ts, providers/openrouter.ts,
 * orchestra/spawn-backend.ts) — NOT a security guarantee. When those adapters
 * adopt `scrubCrossProviderEnv`/`buildProviderChildEnv`, §C must be inverted to
 * assert zero-leak, matching §B's shape.
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
import { OllamaAdapter } from '../../src/providers/ollama.js';
import { OpenAICompatibleAdapter } from '../../src/providers/openai-compatible.js';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';
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
// §B — SubprocessSpawnBackend: full 6-provider + custom-key mixed fleet
// ═══════════════════════════════════════════════════════════════════════

describe('§B SubprocessSpawnBackend — full mixed-provider fleet, zero cross-leak', () => {
  const projectDir = '/tmp/test-cred-scrub-all-adapters';
  let saved: Record<string, string | undefined>;
  let spawnImpl: MockInstance;

  const ALL_KEYS = [...BASE_KEYS, 'MY_LLM_KEY'] as const;

  const HOST_VALUES: Record<string, string> = {
    ANTHROPIC_API_KEY: 'sk-ant-HOST',
    OPENAI_API_KEY: 'sk-oai-HOST',
    GOOGLE_API_KEY: 'goog-HOST',
    DEEPSEEK_API_KEY: 'ds-HOST',
    DASHSCOPE_API_KEY: 'qw-HOST',
    ZHIPU_API_KEY: 'zp-HOST',
    MY_LLM_KEY: 'my-llm-HOST',
  };

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
    for (const k of ALL_KEYS) process.env[k] = HOST_VALUES[k];
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
    return { cliCommand, name, supportedModels: [], buildArgs: () => [], buildCommandString: () => '' };
  }

  function makeBackend(cliCommand: string, name: string): SubprocessSpawnBackend {
    return new SubprocessSpawnBackend(projectDir, {
      providerConfig: makeConfig(cliCommand, name),
      platform: 'linux',
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      providerRegistry: [
        { name: 'my-llm', type: 'openai-compatible', baseUrl: 'https://api.my-llm.test/v1', apiKeyEnv: 'MY_LLM_KEY', models: ['my-llm-large'] },
      ],
    });
  }

  it.each(IDENTITIES)(
    '$cli worker sees ONLY its own credential ($ownKey) — every other of the 7 present host keys is scrubbed',
    ({ cli, ownKey, ownValue }) => {
      const backend = makeBackend(cli, `${cli}-subprocess`);
      const opts: ProviderSpawnOptions = { env: { [ownKey]: ownValue } };
      backend.spawn(`t-${cli}`, 'model-x' as ModelType, 'prompt', opts);

      const env = spawnedEnv(spawnImpl);
      expect(env[ownKey]).toBe(ownValue);
      for (const { ownKey: foreignKey } of IDENTITIES) {
        if (foreignKey === ownKey) continue;
        expect(env[foreignKey], `${cli} worker must not see foreign key ${foreignKey}`).toBeUndefined();
      }
    },
  );

  it('subscription-mode worker (no opts.env) gets NO credential key for any provider', () => {
    const backend = makeBackend('claude', 'claude-subprocess');
    backend.spawn('t-claude-sub', 'model-x' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl);
    for (const { ownKey } of IDENTITIES) {
      expect(env[ownKey]).toBeUndefined();
    }
  });

  it('preserves non-credential host vars (PATH) byte-for-byte across the whole matrix', () => {
    const backend = makeBackend('codex', 'codex-subprocess');
    backend.spawn('t-base', 'model-x' as ModelType, 'prompt', { env: { OPENAI_API_KEY: 'k' } });

    const env = spawnedEnv(spawnImpl);
    expect(env['PATH']).toBe(process.env['PATH']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// §C — KNOWN GAP: standalone adapters not yet migrated (out of write scope)
// ═══════════════════════════════════════════════════════════════════════

describe('§C KNOWN GAP — standalone adapters still leak (born-518 follow-up required)', () => {
  const projectDir = '/tmp/test-cred-scrub-gap';
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    saved = {};
    for (const k of BASE_KEYS) saved[k] = process.env[k];
    for (const k of BASE_KEYS) process.env[k] = `${k}-HOST`;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    for (const k of BASE_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('KNOWN GAP: OllamaAdapter.spawn() child env still inherits every foreign provider secret', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new OllamaAdapter(projectDir, {
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });
    const model = adapter.supportedModels[0];
    expect(model, 'OllamaAdapter has no registered model to spawn with').toBeDefined();

    adapter.spawn('t-ollama-gap', model, 'prompt');

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    // TODO(born-518-followup, out of this task's write scope): ollama.ts:282
    // must adopt providers/provider.ts's scrubCrossProviderEnv. Today it still
    // leaks every foreign provider credential — asserted here as evidence.
    for (const k of BASE_KEYS) {
      expect(env[k], `expected ${k} to still leak today (pre-fix) — flip this to toBeUndefined() once ollama.ts is migrated`).toBe(`${k}-HOST`);
    }
  });

  it('KNOWN GAP: OpenAICompatibleAdapter.spawn() child env still inherits every foreign provider secret', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new OpenAICompatibleAdapter({
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: ['deepseek-chat'],
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
    });

    adapter.spawn('t-oaicompat-gap', 'deepseek-chat' as ModelType, 'prompt', { env: { DEEPSEEK_API_KEY: 'ds-OWN' } });

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    // TODO(born-518-followup, out of this task's write scope):
    // openai-compatible.ts:300 must adopt scrubCrossProviderEnv.
    expect(env['DEEPSEEK_API_KEY']).toBe('ds-OWN'); // own key present, as expected
    for (const k of BASE_KEYS.filter((k) => k !== 'DEEPSEEK_API_KEY')) {
      expect(env[k], `expected ${k} to still leak today (pre-fix)`).toBe(`${k}-HOST`);
    }
  });

  it('KNOWN GAP: OpenRouterProvider.spawn() child env still inherits every foreign provider secret', () => {
    const spawnImpl = vi.fn().mockReturnValue(makeMockChild());
    const adapter = new OpenRouterProvider(projectDir, {
      spawnImpl: spawnImpl as unknown as typeof import('node:child_process').spawn,
      loadSecretsImpl: () => ({ OPENROUTER_API_KEY: 'or-OWN' }),
      models: ['test-model'],
    });

    adapter.spawn('t-openrouter-gap', 'test-model' as ModelType, 'prompt');

    const env = spawnedEnv(spawnImpl as unknown as MockInstance);
    // TODO(born-518-followup, out of this task's write scope):
    // openrouter.ts:395-399 must adopt scrubCrossProviderEnv.
    for (const k of BASE_KEYS) {
      expect(env[k], `expected ${k} to still leak today (pre-fix)`).toBe(`${k}-HOST`);
    }
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
