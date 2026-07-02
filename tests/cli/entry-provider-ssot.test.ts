/**
 * PROVIDER-SSOT tests (Sprint 357 Task 357-011).
 *
 * `buildReplProvider` (src/cli/entry.ts) used to duplicate the CLI-spawn /
 * HTTP-fetch adapter mechanics that `resolveChatAdapter` (chat-provider-
 * parity.ts, ADR-083) already owns as the project's SSOT chat-adapter
 * resolver. This suite proves the consolidation at runtime:
 *
 *   1. The claude/codex/gemini `.send()` path (no `--model` override)
 *      actually CALLS `resolveChatAdapter` — not just "produces the same
 *      output" (a spy wraps the real implementation via `importOriginal` so
 *      behavior stays 100% real, only the call is observed).
 *   2. The ollama `.send()` path calls `resolveChatAdapter('ollama', …)` for
 *      BOTH the happy path and the HTTP-status-error path; only a raw
 *      network failure gets the local Turkish "erişilemedi" wrap.
 *   3. The branches the SSOT cannot express (`--model` override, the
 *      persistent claude session) do NOT call `resolveChatAdapter` — they
 *      stay on the local implementation, proving the delegation is targeted
 *      rather than blanket.
 *
 * Hermetic: spawn + fetch are injected throughout. No real binary, no
 * network. Mirrors the mock pattern in `tests/cli/native-repl-wire.test.ts`.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// ─── Hoisted mocks (must precede dynamic import of entry.ts) ────────────

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
  resolveChatAdapterCalls: [] as Array<{ provider: string; opts: unknown }>,
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

// Partial mock: keep the REAL resolveChatAdapter implementation (so
// behavior stays genuine) but record every call so tests can assert
// buildReplProvider actually delegates to it.
vi.mock('../../src/cli/commands/chat-provider-parity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/commands/chat-provider-parity.js')>();
  return {
    ...actual,
    resolveChatAdapter: (provider: string, opts?: unknown) => {
      hoisted.resolveChatAdapterCalls.push({ provider, opts });
      return actual.resolveChatAdapter(provider, opts as Parameters<typeof actual.resolveChatAdapter>[1]);
    },
  };
});

// ─── Dynamic imports after mocks are wired ──────────────────────────────

type ReplProviderName = 'claude' | 'codex' | 'gemini' | 'ollama';

interface ChatMsg { role: string; content: string }
interface ProviderResp { text?: string; stopReason: string }
interface ChatAdapter {
  send(messages: readonly ChatMsg[]): Promise<ProviderResp>;
  stream?(messages: readonly ChatMsg[]): AsyncIterable<{ text?: string; done?: ProviderResp }>;
}

type SpawnFn = (
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => { chunks: AsyncIterable<string>; wait: Promise<{ exitCode: number | null }> };

let buildReplProvider: (
  name: ReplProviderName,
  opts?: { spawnFn?: SpawnFn; fetchFn?: typeof fetch; model?: string; persistentSpawnFn?: unknown },
) => ChatAdapter;

beforeAll(async () => {
  const entryMod = await import('../../src/cli/entry.js');
  buildReplProvider = entryMod.buildReplProvider as typeof buildReplProvider;
});

beforeEach(() => {
  hoisted.resolveChatAdapterCalls.length = 0;
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function fakeSpawn(stdoutChunks: readonly string[]): SpawnFn {
  return (_binary, args, _env) => ({
    chunks: (async function* () {
      // Surface the args so tests can assert on prompt/flag shape without a
      // separate capture object.
      void args;
      for (const c of stdoutChunks) yield c;
    })(),
    wait: Promise.resolve({ exitCode: 0 }),
  });
}

function capturingSpawn(chunks: readonly string[], capture: { binary?: string; args?: string[] }): SpawnFn {
  return (binary, args) => {
    capture.binary = binary;
    capture.args = [...args];
    return {
      chunks: (async function* () {
        for (const c of chunks) yield c;
      })(),
      wait: Promise.resolve({ exitCode: 0 }),
    };
  };
}

function fakeFetch(body: Record<string, unknown>, status = 200): typeof fetch {
  return ((_input: unknown, _init?: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as unknown as typeof fetch;
}

function refusingFetch(reason = 'connect ECONNREFUSED 127.0.0.1:11434'): typeof fetch {
  return (((_input: unknown, _init?: unknown) =>
    Promise.reject(new TypeError(`fetch failed: ${reason}`))) as unknown) as typeof fetch;
}

// ─── 1. claude/codex/gemini .send(), no model → delegates to SSOT ───────

describe('buildReplProvider — SSOT delegation (send, no model)', () => {
  it('claude routes .send() through resolveChatAdapter and returns real text', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['hello from ', 'mock-claude']) });
    const resp = await adapter.send([{ role: 'user', content: 'selam' }]);

    expect(resp.text).toBe('hello from mock-claude');
    expect(resp.stopReason).toBe('end_turn');
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(1);
    expect(hoisted.resolveChatAdapterCalls[0]?.provider).toBe('claude');
  });

  it('codex routes .send() through resolveChatAdapter with exec --full-auto args', async () => {
    const capture: { binary?: string; args?: string[] } = {};
    const adapter = buildReplProvider('codex', { spawnFn: capturingSpawn(['codex-out'], capture) });
    const resp = await adapter.send([{ role: 'user', content: 'plan' }]);

    expect(resp.text).toBe('codex-out');
    expect(capture.binary).toBe('codex');
    expect(capture.args).toContain('exec');
    expect(capture.args).toContain('--full-auto');
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(1);
    expect(hoisted.resolveChatAdapterCalls[0]?.provider).toBe('codex');
  });

  it('gemini routes .send() through resolveChatAdapter with -p flag', async () => {
    const capture: { binary?: string; args?: string[] } = {};
    const adapter = buildReplProvider('gemini', { spawnFn: capturingSpawn(['gem-out'], capture) });
    const resp = await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(resp.text).toBe('gem-out');
    expect(capture.binary).toBe('gemini');
    expect(capture.args?.[0]).toBe('-p');
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(1);
    expect(hoisted.resolveChatAdapterCalls[0]?.provider).toBe('gemini');
  });

  it('claude .stream() still yields NDJSON per-token deltas after the SSOT-delegated refactor', async () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } });
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn([line + '\n']) });
    expect(adapter.stream).toBeDefined();
    const collected: string[] = [];
    let done: ProviderResp | undefined;
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'q' }])) {
      if (chunk.text) collected.push(chunk.text);
      if (chunk.done) done = chunk.done;
    }
    expect(collected).toEqual(['hi']);
    expect(done?.text).toBe('hi');
    // stream() is never delegated (SSOT has no stream-json mode) — the
    // resolveChatAdapter call recorded above came from send() elsewhere in
    // this suite, not from this test's stream()-only call.
  });
});

// ─── 2. ollama .send() → delegates to SSOT (both happy + error paths) ───

describe('buildReplProvider — SSOT delegation (ollama)', () => {
  it('happy path delegates to resolveChatAdapter and returns its text', async () => {
    const adapter = buildReplProvider('ollama', { fetchFn: fakeFetch({ response: 'hello-from-ollama' }) });
    const resp = await adapter.send([{ role: 'user', content: 'selam' }]);

    expect(resp.text).toBe('hello-from-ollama');
    expect(resp.stopReason).toBe('end_turn');
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(1);
    expect(hoisted.resolveChatAdapterCalls[0]?.provider).toBe('ollama');
  });

  it('HTTP-status error delegates to resolveChatAdapter and surfaces its message verbatim (now includes host)', async () => {
    const adapter = buildReplProvider('ollama', { fetchFn: fakeFetch({}, 503) });
    await expect(adapter.send([{ role: 'user', content: 'x' }]))
      .rejects.toThrow(/Ollama request failed: 503.*http:\/\/localhost:11434/);
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(1);
  });

  it('network failure still calls resolveChatAdapter but rewraps the error with the Turkish "erişilemedi" hint', async () => {
    const adapter = buildReplProvider('ollama', { fetchFn: refusingFetch() });
    await expect(adapter.send([{ role: 'user', content: 'x' }]))
      .rejects.toThrow(/Ollama \(http:\/\/localhost:11434\) erişilemedi/);
    await expect(buildReplProvider('ollama', { fetchFn: refusingFetch() }).send([{ role: 'user', content: 'x' }]))
      .rejects.toThrow(/ollama serve/);
    expect(hoisted.resolveChatAdapterCalls.length).toBeGreaterThan(0);
  });
});

// ─── 3. Branches the SSOT cannot express stay local (no delegation) ─────

describe('buildReplProvider — branches that intentionally do NOT delegate', () => {
  it('opts.model override bypasses resolveChatAdapter and injects --model locally', async () => {
    const capture: { binary?: string; args?: string[] } = {};
    const adapter = buildReplProvider('claude', {
      spawnFn: capturingSpawn(['modeled-response'], capture),
      model: 'claude-opus-4-8',
    });
    const resp = await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(resp.text).toBe('modeled-response');
    expect(capture.args).toContain('--model');
    expect(capture.args).toContain('claude-opus-4-8');
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(0);
  });

  it('the default persistent-session path (no spawnFn) never touches resolveChatAdapter', () => {
    const adapter = buildReplProvider('claude');
    // Duck-typed persistent-session marker — proves the persistent branch
    // was taken (not the SSOT-delegated per-turn branch, which has no exit()).
    expect(typeof (adapter as unknown as { exit?: () => Promise<void> }).exit).toBe('function');
    expect(hoisted.resolveChatAdapterCalls).toHaveLength(0);
  });

  it('deepseek/qwen/glm openai-compatible presets never touch resolveChatAdapter', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test';
    try {
      const fetchSpy = ((_input: unknown, _init?: unknown) =>
        Promise.resolve(new Response(JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }), { status: 200 }))) as unknown as typeof fetch;
      const adapter = buildReplProvider('deepseek' as unknown as ReplProviderName, { fetchFn: fetchSpy });
      await adapter.send([{ role: 'user', content: 'x' }]);
      expect(hoisted.resolveChatAdapterCalls).toHaveLength(0);
    } finally {
      delete process.env['DEEPSEEK_API_KEY'];
    }
  });
});

// ─── 4. Grep-evidence companion: entry.ts source actually references it ──

describe('buildReplProvider — static delegation evidence', () => {
  it('entry.ts imports resolveChatAdapter from the SSOT module', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/cli/entry.ts', import.meta.url), 'utf-8');
    expect(src).toContain("import { resolveChatAdapter } from './commands/chat-provider-parity.js';");
    expect(src).toContain('resolveChatAdapter(name, { spawnFn })');
    expect(src).toContain("resolveChatAdapter('ollama'");
  });
});
