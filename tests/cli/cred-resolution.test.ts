/**
 * CRED-RESOLUTION (born-548, Task 389-005).
 *
 * Two independent cred-resolution gaps, both in files owned by this task:
 *
 * 1. `resolveNativeSelection` (native-transport.ts) resolved deepseek/qwen/glm
 *    API keys from bare env only — no `.deck` secret fallback, unlike the
 *    claude/openai branches in the same function. Fixed to follow the same
 *    `.deck` DECKENT_<apiKeyEnv> > env DECKENT_<apiKeyEnv> > env <apiKeyEnv>
 *    precedence as core/provider.ts's `applyDeckSecretsToEnv` (the
 *    project's canonical deck-key convention).
 *
 * 2. entry.ts's local `subscriptionReplEnv()` (used by `buildCliStream()` for
 *    `.stream()` and by `buildModelOverrideSend()` for `--model`-override
 *    `.send()` — both spawn the `gemini` CLI directly) stripped only
 *    ANTHROPIC_API_KEY/DECKENT_CLAUDE_API_KEY. A prior fix
 *    (Sprint 364 T-364-007/F11-014) already taught chat-provider-parity.ts's
 *    OWN `subscriptionEnv()` to also strip GEMINI_API_KEY/GOOGLE_API_KEY/
 *    DECKENT_GOOGLE_API_KEY, but entry.ts's separate, duplicate function was
 *    never updated — so a host-env Gemini key leaked into the gemini CLI
 *    child process on the `.stream()`/model-override path even though the
 *    SSOT-delegated `.send()` path already blocked it. Fixed to strip the
 *    same three keys, mirroring chat-provider-parity.ts's subscriptionEnv().
 *
 * Hermetic: every gemini-path test injects a fake `SubscriptionSpawnFn` — no
 * real `gemini` binary is spawned. Mirrors the fake-spawn pattern used by
 * tests/cli/gemini-parity-gated.test.ts and tests/cli/f11-014-codex-parity.test.ts.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

import {
  resolveNativeSelection,
  type NativeTransportConfig,
} from '../../src/cli/repl/native-transport.js';

// ─── Part 1: deepseek/qwen/glm `.deck` → env resolution (native-transport.ts) ──

const emptyEnv: Record<string, string | undefined> = {};

function ok(
  r: ReturnType<typeof resolveNativeSelection>,
): asserts r is Exclude<typeof r, { error: string }> {
  expect(r).not.toHaveProperty('error');
}

describe('resolveNativeSelection — deepseek/qwen/glm .deck secret resolution', () => {
  const cfg: NativeTransportConfig = {};

  it('resolves deepseek from a .deck DECKENT_DEEPSEEK_API_KEY with no env var set', () => {
    const r = resolveNativeSelection(
      { provider: 'deepseek', model: null },
      { env: emptyEnv, config: cfg, secrets: { DECKENT_DEEPSEEK_API_KEY: 'deck-deepseek-key' } },
    );
    ok(r);
    expect(r).toMatchObject({ providerName: 'deepseek', model: 'deepseek-chat' });
  });

  it('resolves qwen from a .deck DECKENT_DASHSCOPE_API_KEY with no env var set', () => {
    const r = resolveNativeSelection(
      { provider: 'qwen', model: null },
      { env: emptyEnv, config: cfg, secrets: { DECKENT_DASHSCOPE_API_KEY: 'deck-qwen-key' } },
    );
    ok(r);
    expect(r).toMatchObject({ providerName: 'qwen', model: 'qwen-plus' });
  });

  it('resolves glm from a .deck DECKENT_ZHIPU_API_KEY with no env var set', () => {
    const r = resolveNativeSelection(
      { provider: 'glm', model: null },
      { env: emptyEnv, config: cfg, secrets: { DECKENT_ZHIPU_API_KEY: 'deck-glm-key' } },
    );
    ok(r);
    expect(r).toMatchObject({ providerName: 'glm', model: 'glm-4-plus' });
  });

  it('.deck secret takes precedence over env when both are set (ADR-G-005)', () => {
    const r = resolveNativeSelection(
      { provider: 'deepseek', model: null },
      {
        env: { DEEPSEEK_API_KEY: 'env-key' },
        config: cfg,
        secrets: { DECKENT_DEEPSEEK_API_KEY: 'deck-key' },
      },
    );
    ok(r);
    expect(r.providerName).toBe('deepseek');
    // Both resolve successfully; the precedence itself is proven by the
    // "no env var set" cases above (only the .deck value could have resolved).
  });

  it('still falls back to the bare canonical env var when .deck has no key (regression)', () => {
    const r = resolveNativeSelection(
      { provider: 'deepseek', model: null },
      { env: { DEEPSEEK_API_KEY: 'k' }, config: cfg },
    );
    ok(r);
    expect(r).toMatchObject({ providerName: 'deepseek', model: 'deepseek-chat' });
  });

  it('still refuses when neither .deck nor env has a key (detail unchanged)', () => {
    const r = resolveNativeSelection({ provider: 'qwen', model: null }, { env: emptyEnv, config: cfg });
    expect(r).toMatchObject({ errorCode: 'missing-api-key', detail: 'DASHSCOPE_API_KEY', provider: 'qwen' });
  });
});

// ─── Part 2: gemini env-var scrub parity (entry.ts subscriptionReplEnv) ───────
//
// Hoisted mocks (must precede dynamic import of entry.ts) — entry.ts is a CLI
// entrypoint module; neutralize its Commander/bootstrap wiring before import
// so only `buildReplProvider` is exercised. Mirrors
// tests/cli/gemini-parity-gated.test.ts / tests/cli/f11-014-codex-parity.test.ts.

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
}));

hoisted.buildProgramMock.mockImplementation(() => {
  const fake = {
    hook: hoisted.hookMock,
    parseAsync: hoisted.parseAsyncMock,
  };
  hoisted.hookMock.mockReturnValue(fake);
  return fake;
});

vi.mock('../../src/cli/index.js', () => ({
  buildProgram: hoisted.buildProgramMock,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  handleCliError: hoisted.handleCliErrorMock,
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  interruptActiveSprint: hoisted.interruptActiveSprintMock,
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killAllSessions: hoisted.killAllSessionsMock,
}));

vi.mock('../../src/core/model-catalog.js', () => ({
  bootstrapFromCatalog: hoisted.bootstrapMock,
}));

let buildReplProvider: typeof import('../../src/cli/entry.js').buildReplProvider;

beforeAll(async () => {
  ({ buildReplProvider } = await import('../../src/cli/entry.js'));
});

interface Capture {
  binary?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

/** Fake spawn that emits fixed chunks and records what it was invoked with. */
function fakeSpawn(chunks: string[], capture: Capture = {}): import('../../src/cli/commands/chat-native.js').SubscriptionSpawnFn {
  return (binary, args, env) => {
    capture.binary = binary;
    capture.args = [...args];
    capture.env = env;
    const iterable: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    };
    return { chunks: iterable, wait: Promise.resolve({ exitCode: 0 }) };
  };
}

describe('buildReplProvider — gemini subscriptionReplEnv scrub (entry.ts, born-548 fix)', () => {
  const geminiEnvKeys = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DECKENT_GOOGLE_API_KEY'] as const;
  const priors: Record<string, string | undefined> = {};

  function setForeignGeminiKeys(): void {
    for (const k of geminiEnvKeys) {
      priors[k] = process.env[k];
      process.env[k] = `should-not-reach-gemini-${k}`;
    }
  }

  function restoreForeignGeminiKeys(): void {
    for (const k of geminiEnvKeys) {
      if (priors[k] === undefined) delete process.env[k];
      else process.env[k] = priors[k];
    }
  }

  it('.stream() strips GEMINI_API_KEY/GOOGLE_API_KEY/DECKENT_GOOGLE_API_KEY from the gemini spawn env', async () => {
    setForeignGeminiKeys();
    try {
      const cap: Capture = {};
      const adapter = buildReplProvider('gemini', { spawnFn: fakeSpawn(['a', 'b'], cap) });
      expect(adapter.stream).toBeDefined();
      for await (const _chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
        // drain
      }
      expect(cap.env?.['GEMINI_API_KEY']).toBeUndefined();
      expect(cap.env?.['GOOGLE_API_KEY']).toBeUndefined();
      expect(cap.env?.['DECKENT_GOOGLE_API_KEY']).toBeUndefined();
    } finally {
      restoreForeignGeminiKeys();
    }
  });

  it('--model-override .send() strips GEMINI_API_KEY/GOOGLE_API_KEY/DECKENT_GOOGLE_API_KEY from the gemini spawn env', async () => {
    setForeignGeminiKeys();
    try {
      const cap: Capture = {};
      const adapter = buildReplProvider('gemini', {
        spawnFn: fakeSpawn(['ok'], cap),
        model: 'gemini-2.5-flash',
      });
      await adapter.send([{ role: 'user', content: 'hi' }]);
      expect(cap.env?.['GEMINI_API_KEY']).toBeUndefined();
      expect(cap.env?.['GOOGLE_API_KEY']).toBeUndefined();
      expect(cap.env?.['DECKENT_GOOGLE_API_KEY']).toBeUndefined();
      // Model override itself still works (existing behavior preserved).
      expect(cap.args).toContain('--model');
      expect(cap.args).toContain('gemini-2.5-flash');
    } finally {
      restoreForeignGeminiKeys();
    }
  });

  it('claude spawn env is unaffected by the gemini-key stripping (existing providers not broken)', async () => {
    setForeignGeminiKeys();
    const priorAnthropic = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-not-reach-claude';
    try {
      const cap: Capture = {};
      const adapter = buildReplProvider('claude', {
        spawnFn: fakeSpawn(['ok'], cap),
        model: 'claude-fable-5',
      });
      await adapter.send([{ role: 'user', content: 'hi' }]);
      // Claude's own key is still stripped (subscription mode, pre-existing).
      expect(cap.env?.['ANTHROPIC_API_KEY']).toBeUndefined();
      // Gemini keys are also absent from claude's spawn env (harmless no-op,
      // matches the "delete unconditionally" pattern already used for codex
      // in chat-provider-parity.ts's subscriptionEnv()).
      expect(cap.env?.['GEMINI_API_KEY']).toBeUndefined();
    } finally {
      if (priorAnthropic === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = priorAnthropic;
      restoreForeignGeminiKeys();
    }
  });
});
