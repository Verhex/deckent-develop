/**
 * F11-014-CODEX-PARITY (Sprint 360 T-360-011 / fix pass).
 *
 * Pins `resolveChatAdapter`'s codex branch (chat-provider-parity.ts, the
 * project's SSOT chat-adapter resolver, ADR-083) against regression across:
 * arg-table, prompt-feed, subscription-env, error-path, and the codex
 * `--model` override (which lives locally in entry.ts's
 * `buildReplProvider`/`buildModelOverrideSend` — chat-provider-parity.ts's
 * arg table has no `--model` param by design, see the behavior-diff matrix
 * on `buildReplProvider` in src/cli/entry.ts; Sprint 357 T-357-011,
 * ADR-083 / ADR-G-034 #1).
 *
 * Investigation for this fix pass found no codex-specific defect in the SSOT
 * arg table / prompt-feed / error path, so `chat-provider-parity.ts` is left
 * unmodified — this is a test-only pin. One real but out-of-scope
 * observation (the CLI-spawn adapter never inspects the spawn `wait`
 * exit-code) lives in code shared with the claude/gemini branches, which
 * this task's nogo forbids touching; it is documented in the "error path"
 * describe block below rather than fixed inline.
 *
 * Hermetic: every test injects a fake `SubscriptionSpawnFn` — no real
 * `codex` binary is ever spawned. Mirrors the fake-spawn pattern already
 * used by tests/cli/repl-provider-parity.test.ts and
 * tests/cli/entry-provider-ssot.test.ts.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

import {
  resolveChatAdapter,
  type ResolveChatAdapterOptions,
} from '../../src/cli/commands/chat-provider-parity.js';
import type { SubscriptionSpawnFn } from '../../src/cli/commands/chat-native.js';

// ─── Hoisted mocks (must precede dynamic import of entry.ts) ────────────
// entry.ts is a CLI entrypoint module; other suites that import it
// (native-repl-wire.test.ts, entry-provider-ssot.test.ts) neutralize its
// Commander/bootstrap wiring via these mocks before import so only
// `buildReplProvider` is exercised. Mirrored here for consistency.

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

// ─── 1-2. Arg table: binary + `exec --full-auto` ─────────────────────

describe('resolveChatAdapter — codex arg table', () => {
  it('send(): spawns "codex" with "exec" and "--full-auto"', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawn(['codex-out'], cap) });
    const res = await adapter.send([{ role: 'user', content: 'plan the release' }]);

    expect(res).toEqual({ text: 'codex-out', stopReason: 'end_turn' });
    expect(cap.binary).toBe('codex');
    expect(cap.args?.[0]).toBe('exec');
    expect(cap.args?.[1]).toBe('--full-auto');
  });

  it('stream(): spawns "codex" with the same "exec --full-auto" arg table', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawn(['a', 'b'], cap) });
    expect(adapter.stream).toBeDefined();

    const collected: string[] = [];
    let done: { text: string; stopReason: string } | undefined;
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
      if (chunk.text) collected.push(chunk.text);
      if (chunk.done) done = chunk.done;
    }

    expect(cap.binary).toBe('codex');
    expect(cap.args?.[0]).toBe('exec');
    expect(cap.args?.[1]).toBe('--full-auto');
    expect(collected).toEqual(['a', 'b']);
    expect(done).toEqual({ text: 'ab', stopReason: 'end_turn' });
  });
});

// ─── 3. Prompt-feed: multi-message transcript join ───────────────────

describe('resolveChatAdapter — codex prompt-feed', () => {
  it('renders a multi-role transcript via buildSubscriptionPrompt and passes it as the last spawn arg', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawn(['ok'], cap) });

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
    expect(args.slice(0, 2)).toEqual(['exec', '--full-auto']);
  });
});

// ─── 4. Subscription env: API-key stripping ──────────────────────────

describe('resolveChatAdapter — codex subscription env', () => {
  it('strips ANTHROPIC_API_KEY and DECKENT_CLAUDE_API_KEY from the codex spawn env', async () => {
    const priorAnthropic = process.env['ANTHROPIC_API_KEY'];
    const priorDeckent = process.env['DECKENT_CLAUDE_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'sk-should-not-reach-codex';
    process.env['DECKENT_CLAUDE_API_KEY'] = 'dk-should-not-reach-codex';
    try {
      const cap: Capture = {};
      const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawn(['ok'], cap) });
      await adapter.send([{ role: 'user', content: 'hi' }]);

      expect(cap.env?.['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(cap.env?.['DECKENT_CLAUDE_API_KEY']).toBeUndefined();
    } finally {
      if (priorAnthropic === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = priorAnthropic;
      if (priorDeckent === undefined) delete process.env['DECKENT_CLAUDE_API_KEY'];
      else process.env['DECKENT_CLAUDE_API_KEY'] = priorDeckent;
    }
  });
});

// ─── 5-7. Error path ──────────────────────────────────────────────────

describe('resolveChatAdapter — codex error path', () => {
  it('send() propagates a rejected spawn `wait` instead of silently returning success', async () => {
    const adapter = resolveChatAdapter('codex', {
      spawnFn: rejectingSpawn(['partial'], 'codex exited non-zero'),
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }]))
      .rejects.toThrow('codex exited non-zero');
  });

  it('stream() propagates a rejected spawn `wait` after yielding prior chunks (never swallowed)', async () => {
    const adapter = resolveChatAdapter('codex', {
      spawnFn: rejectingSpawn(['chunk-1'], 'codex crashed mid-stream'),
    });
    const collected: string[] = [];
    await expect((async () => {
      for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
        if (chunk.text) collected.push(chunk.text);
      }
    })()).rejects.toThrow('codex crashed mid-stream');
    expect(collected).toEqual(['chunk-1']);
  });

  it('stream() never yields empty-string chunks (no fabricated content on empty stdout)', async () => {
    const cap: Capture = {};
    const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawn(['', 'real', ''], cap) });
    const collected: string[] = [];
    let done: { text: string; stopReason: string } | undefined;
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
      if (chunk.text !== undefined) collected.push(chunk.text);
      if (chunk.done) done = chunk.done;
    }
    expect(collected).toEqual(['real']);
    expect(done?.text).toBe('real');
  });

  // Documented, out-of-scope observation (NOT fixed here — see task nogo:
  // "claude/gemini dallarını değiştirmek" forbids touching the shared
  // buildCliSpawnAdapter that also implements those branches):
  // buildCliSpawnAdapter's send()/stream() call `await wait;` but never
  // inspect `wait`'s resolved `{ exitCode }` — a codex process that exits
  // non-zero but still writes stdout resolves as a normal success. Only a
  // *rejected* `wait` (exercised above) surfaces as an error today.
});

// ─── 8-10. Model-param evidence (buildReplProvider, entry.ts) ────────
//
// chat-provider-parity.ts's SSOT arg table has no `--model` parameter by
// design (see assumptions in .tasks/task-360-011-fix.plan); the REPL's
// model-switcher path is implemented locally in entry.ts and is the
// correct place to evidence gpt-5 / gpt-5.5 model-param passthrough.

describe('buildReplProvider — codex --model override (entry.ts)', () => {
  it('passes model "gpt-5" through as "--model gpt-5" on the codex spawn args', async () => {
    const cap: Capture = {};
    const adapter = buildReplProvider('codex', { spawnFn: fakeSpawn(['gpt5-out'], cap), model: 'gpt-5' });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(res.text).toBe('gpt5-out');
    expect(cap.binary).toBe('codex');
    expect(cap.args).toContain('--model');
    expect(cap.args).toContain('gpt-5');
  });

  it('passes model "gpt-5.5" through as "--model gpt-5.5" on the codex spawn args', async () => {
    const cap: Capture = {};
    const adapter = buildReplProvider('codex', { spawnFn: fakeSpawn(['gpt55-out'], cap), model: 'gpt-5.5' });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(res.text).toBe('gpt55-out');
    expect(cap.args).toContain('--model');
    expect(cap.args).toContain('gpt-5.5');
  });

  it('composes the full codex arg table when a model override is set: exec --full-auto --model <id> <prompt>', async () => {
    const cap: Capture = {};
    const adapter = buildReplProvider('codex', { spawnFn: fakeSpawn(['ok'], cap), model: 'gpt-5.5' });
    await adapter.send([{ role: 'user', content: 'ship it' }]);

    expect(cap.args).toEqual([
      'exec', '--full-auto', '--model', 'gpt-5.5',
      '<user>ship it</user>',
    ]);
  });
});

// ─── 11. SSOT-gap pin ─────────────────────────────────────────────────

describe('resolveChatAdapter — codex SSOT has no --model hook (intentional gap pin)', () => {
  it('ignores an out-of-contract "model" field — the SSOT arg table never emits --model', async () => {
    const cap: Capture = {};
    // ResolveChatAdapterOptions has no `model` field; force one through via
    // an `unknown` cast (not an object literal, so no excess-property check
    // fires) to prove the codex branch structurally cannot forward it even
    // if a future caller mistakenly supplies one.
    const smuggled: unknown = { spawnFn: fakeSpawn(['ok'], cap), model: 'gpt-5' };
    const adapter = resolveChatAdapter('codex', smuggled as ResolveChatAdapterOptions);
    await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(cap.args).not.toContain('--model');
    expect(cap.args).not.toContain('gpt-5');
  });
});
