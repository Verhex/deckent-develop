/**
 * GEMINI-PARITY-GATED (Sprint 364 T-364-007 / F11-014).
 *
 * Pins `resolveChatAdapter`'s gemini branch (chat-provider-parity.ts, the
 * project's SSOT chat-adapter resolver, ADR-083) against regression across:
 * arg-table, prompt-feed, subscription-env, error-path, and the gemini
 * `--model` override (which lives locally in entry.ts's
 * `buildReplProvider`/`buildModelOverrideSend` — chat-provider-parity.ts's
 * arg table has no `--model` param by design, mirroring the codex pin in
 * tests/cli/f11-014-codex-parity.test.ts; Sprint 357 T-357-011, ADR-083 /
 * ADR-G-034 #1).
 *
 * Fix applied in this task: `subscriptionEnv()` (chat-provider-parity.ts) now
 * also strips `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `DECKENT_GOOGLE_API_KEY`.
 * Per `src/core/provider-auth-probe.ts`'s `probeGemini()`, the real `gemini`
 * CLI treats any of those three as API-key auth, outranking its own OAuth
 * session file — so leaving them in the child env broke the documented
 * "subscription mode: API keys are stripped from the child env" contract
 * (chat-native.ts header) for the gemini branch specifically, while the
 * claude branch already stripped its own key pair. codex/claude are
 * unaffected (deleting keys they never read is a no-op) — this task's nogo
 * ("claude/codex dallarını değiştirmek") is respected.
 *
 * Hermetic: every fake-spawn test injects a fake `SubscriptionSpawnFn` — no
 * real `gemini` binary is spawned there. Mirrors the fake-spawn pattern
 * already used by tests/cli/repl-provider-parity.test.ts and
 * tests/cli/f11-014-codex-parity.test.ts. The one exception is the final
 * "live gemini CLI" describe block, which is gated honestly behind
 * `describe.skipIf(!process.env['GEMINI_API_KEY'])` and is skipped in CI /
 * this sandbox (no real key present).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

import {
  resolveChatAdapter,
  type ResolveChatAdapterOptions,
} from '../../src/cli/commands/chat-provider-parity.js';
import type { SubscriptionSpawnFn } from '../../src/cli/commands/chat-native.js';

// ─── Hoisted mocks (must precede dynamic import of entry.ts) ────────────
// entry.ts is a CLI entrypoint module; other suites that import it
// (native-repl-wire.test.ts, entry-provider-ssot.test.ts,
// f11-014-codex-parity.test.ts) neutralize its Commander/bootstrap wiring
// via these mocks before import so only `buildReplProvider` is exercised.
// Mirrored here for consistency.

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

// ─── Test helpers ─────────────────────────────────────────────────────

interface Capture {
  binary?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

/** Fake spawn that emits fixed chunks and records what it was invoked with. */
function fakeSpawn(chunks: string[], capture: Capture = {}): SubscriptionSpawnFn {
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

/** Fake spawn whose `wait` promise rejects — simulates a CLI-launch failure. */
function rejectingSpawn(chunks: string[], reason: string): SubscriptionSpawnFn {
  return () => {
    const iterable: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    };
    return { chunks: iterable, wait: Promise.reject(new Error(reason)) };
  };
}

// ─── 1-2. Arg table: binary + "-p" ─────────────────────────────────────

describe('resolveChatAdapter — gemini arg table', () => {
  it('send(): spawns "gemini" with "-p"', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['gemini-out'], cap) });
    const res = await adapter.send([{ role: 'user', content: 'plan the release' }]);

    expect(res).toEqual({ text: 'gemini-out', stopReason: 'end_turn' });
    expect(cap.binary).toBe('gemini');
    expect(cap.args?.[0]).toBe('-p');
  });

  it('stream(): spawns "gemini" with the same "-p" arg table', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['a', 'b'], cap) });
    expect(adapter.stream).toBeDefined();

    const collected: string[] = [];
    let done: { text: string; stopReason: string } | undefined;
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
      if (chunk.text) collected.push(chunk.text);
      if (chunk.done) done = chunk.done;
    }

    expect(cap.binary).toBe('gemini');
    expect(cap.args?.[0]).toBe('-p');
    expect(collected).toEqual(['a', 'b']);
    expect(done).toEqual({ text: 'ab', stopReason: 'end_turn' });
  });
});

// ─── 3. Prompt-feed: multi-message transcript join ───────────────────

describe('resolveChatAdapter — gemini prompt-feed', () => {
  it('renders a multi-role transcript via buildSubscriptionPrompt and passes it as the last spawn arg', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['ok'], cap) });

    await adapter.send([
      { role: 'user', content: 'run the build' },
      { role: 'assistant', content: 'building…' },
      { role: 'tool', content: 'exit code 0' },
    ]);

    const args = cap.args ?? [];
    const prompt = args[args.length - 1];
    expect(prompt).toBe(
      '<user>run the build</user>\n' +
      '<assistant>building…</assistant>\n' +
      '<tool-result>exit code 0</tool-result>',
    );
    // The prompt is appended after the fixed arg table, never before it.
    expect(args.slice(0, 1)).toEqual(['-p']);
  });
});

// ─── 4-5. Subscription env: API-key stripping ────────────────────────

describe('resolveChatAdapter — gemini subscription env', () => {
  it('strips ANTHROPIC_API_KEY and DECKENT_CLAUDE_API_KEY from the gemini spawn env (parity w/ claude/codex)', async () => {
    const priorAnthropic = process.env['ANTHROPIC_API_KEY'];
    const priorDeckentClaude = process.env['DECKENT_CLAUDE_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-not-reach-gemini';
    process.env['DECKENT_CLAUDE_API_KEY'] = 'dk-should-not-reach-gemini';
    try {
      const cap: Capture = {};
      const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['ok'], cap) });
      await adapter.send([{ role: 'user', content: 'hi' }]);

      expect(cap.env?.['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(cap.env?.['DECKENT_CLAUDE_API_KEY']).toBeUndefined();
    } finally {
      if (priorAnthropic === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = priorAnthropic;
      if (priorDeckentClaude === undefined) delete process.env['DECKENT_CLAUDE_API_KEY'];
      else process.env['DECKENT_CLAUDE_API_KEY'] = priorDeckentClaude;
    }
  });

  it('strips GEMINI_API_KEY, GOOGLE_API_KEY and DECKENT_GOOGLE_API_KEY from the gemini spawn env (regression pin for the fix in this task)', async () => {
    const priorGemini = process.env['GEMINI_API_KEY'];
    const priorGoogle = process.env['GOOGLE_API_KEY'];
    const priorDeckentGoogle = process.env['DECKENT_GOOGLE_API_KEY'];
    process.env['GEMINI_API_KEY'] = 'g-should-not-reach-gemini';
    process.env['GOOGLE_API_KEY'] = 'goog-should-not-reach-gemini';
    process.env['DECKENT_GOOGLE_API_KEY'] = 'dk-goog-should-not-reach-gemini';
    try {
      const cap: Capture = {};
      const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['ok'], cap) });
      await adapter.send([{ role: 'user', content: 'hi' }]);

      // Without the fix, one or more of these would leak through and force
      // the real gemini CLI into API-key auth instead of subscription/OAuth
      // (see probeGemini in provider-auth-probe.ts).
      expect(cap.env?.['GEMINI_API_KEY']).toBeUndefined();
      expect(cap.env?.['GOOGLE_API_KEY']).toBeUndefined();
      expect(cap.env?.['DECKENT_GOOGLE_API_KEY']).toBeUndefined();
    } finally {
      if (priorGemini === undefined) delete process.env['GEMINI_API_KEY'];
      else process.env['GEMINI_API_KEY'] = priorGemini;
      if (priorGoogle === undefined) delete process.env['GOOGLE_API_KEY'];
      else process.env['GOOGLE_API_KEY'] = priorGoogle;
      if (priorDeckentGoogle === undefined) delete process.env['DECKENT_GOOGLE_API_KEY'];
      else process.env['DECKENT_GOOGLE_API_KEY'] = priorDeckentGoogle;
    }
  });
});

// ─── 6-8. Error path ──────────────────────────────────────────────────

describe('resolveChatAdapter — gemini error path', () => {
  it('send() propagates a rejected spawn `wait` instead of silently returning success', async () => {
    const adapter = resolveChatAdapter('gemini', {
      spawnFn: rejectingSpawn(['partial'], 'gemini exited non-zero'),
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('gemini exited non-zero');
  });

  it('stream() propagates a rejected spawn `wait` after yielding prior chunks (never swallowed)', async () => {
    const adapter = resolveChatAdapter('gemini', {
      spawnFn: rejectingSpawn(['chunk-1'], 'gemini crashed mid-stream'),
    });
    const collected: string[] = [];
    await expect((async () => {
      for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
        if (chunk.text) collected.push(chunk.text);
      }
    })()).rejects.toThrow('gemini crashed mid-stream');
    expect(collected).toEqual(['chunk-1']);
  });

  it('stream() never yields empty-string chunks (no fabricated content on empty stdout)', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['', 'real', ''], cap) });
    const collected: string[] = [];
    let done: { text: string; stopReason: string } | undefined;
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
      if (chunk.text !== undefined) collected.push(chunk.text);
      if (chunk.done) done = chunk.done;
    }
    expect(collected).toEqual(['real']);
    expect(done?.text).toBe('real');
  });

  // Documented, out-of-scope observation (NOT fixed here — shared with the
  // codex parity pin, tests/cli/f11-014-codex-parity.test.ts): the CLI-spawn
  // adapter's send()/stream() call `await wait;` but never inspect `wait`'s
  // resolved `{ exitCode }` — a gemini process that exits non-zero but still
  // writes stdout resolves as a normal success. Only a *rejected* `wait`
  // (exercised above) surfaces as an error today. Fixing this touches
  // `buildCliSpawnAdapter`, shared by claude/codex/gemini — out of this
  // task's single-branch scope.
});

// ─── 9-11. Model-param evidence (buildReplProvider, entry.ts) ─────────
//
// chat-provider-parity.ts's SSOT arg table has no `--model` parameter by
// design (see tests/cli/f11-014-codex-parity.test.ts's equivalent pin); the
// REPL's model-switcher path is implemented locally in entry.ts and is the
// correct place to evidence gemini model-param passthrough.

describe('buildReplProvider — gemini --model override (entry.ts)', () => {
  it('passes model "gemini-2.5-pro" through as "--model gemini-2.5-pro" on the gemini spawn args', async () => {
    const cap: Capture = {};
    const adapter = buildReplProvider('gemini', { spawnFn: fakeSpawn(['g25-out'], cap), model: 'gemini-2.5-pro' });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(res.text).toBe('g25-out');
    expect(cap.binary).toBe('gemini');
    expect(cap.args).toContain('--model');
    expect(cap.args).toContain('gemini-2.5-pro');
  });

  it('passes model "gemini-2.5-flash" through as "--model gemini-2.5-flash" on the gemini spawn args', async () => {
    const cap: Capture = {};
    const adapter = buildReplProvider('gemini', { spawnFn: fakeSpawn(['flash-out'], cap), model: 'gemini-2.5-flash' });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(res.text).toBe('flash-out');
    expect(cap.args).toContain('--model');
    expect(cap.args).toContain('gemini-2.5-flash');
  });

  it('composes the full gemini arg table when a model override is set: -p --model <id> <prompt>', async () => {
    const cap: Capture = {};
    const adapter = buildReplProvider('gemini', { spawnFn: fakeSpawn(['ok'], cap), model: 'gemini-2.5-flash' });
    await adapter.send([{ role: 'user', content: 'ship it' }]);

    expect(cap.args).toEqual([
      '-p', '--model', 'gemini-2.5-flash',
      '<user>ship it</user>',
    ]);
  });

  // Out-of-scope observation (entry.ts, not in this task's write scope): the
  // real `gemini` CLI's short model flag is documented as `-m` elsewhere in
  // this repo (src/providers/gemini.ts's buildArgs — a separate, non-REPL
  // adapter), not `--model`. This pin proves the REPL's CURRENT behavior; it
  // does not assert the flag is correct against the real binary. See
  // docImpact note in this task's .result.
});

// ─── 12. SSOT-gap pin ──────────────────────────────────────────────────

describe('resolveChatAdapter — gemini SSOT has no --model hook (intentional gap pin)', () => {
  it('ignores an out-of-contract "model" field — the SSOT arg table never emits --model', async () => {
    const cap: Capture = {};
    // ResolveChatAdapterOptions has no `model` field; force one through via
    // an `unknown` cast (not an object literal, so no excess-property check
    // fires) to prove the gemini branch structurally cannot forward it even
    // if a future caller mistakenly supplies one.
    const smuggled: unknown = { spawnFn: fakeSpawn(['ok'], cap), model: 'gemini-2.5-pro' };
    const adapter = resolveChatAdapter('gemini', smuggled as ResolveChatAdapterOptions);
    await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(cap.args).not.toContain('--model');
    expect(cap.args).not.toContain('gemini-2.5-pro');
  });
});

// ─── 13. Live gemini CLI — honest key-gate ────────────────────────────
//
// Requires a real GEMINI_API_KEY in the environment AND the `gemini` CLI
// installed on the host. Skipped everywhere else (CI, this sandbox) — never
// silently "passes" with a fake credential. Uses the default (real) spawn,
// i.e. no `spawnFn` injected, so this is a genuine end-to-end call.

describe.skipIf(!process.env['GEMINI_API_KEY'])('resolveChatAdapter — gemini live CLI (GEMINI_API_KEY gated)', () => {
  it('send() returns real, non-empty text from the live gemini CLI', async () => {
    const adapter = resolveChatAdapter('gemini');
    const res = await adapter.send([
      { role: 'user', content: 'Reply with exactly one word: pong' },
    ]);
    expect(res.stopReason).toBe('end_turn');
    expect(typeof res.text).toBe('string');
    expect((res.text ?? '').length).toBeGreaterThan(0);
  }, 30_000);
});
