/**
 * Native REPL provider-wire tests (Sprint 220 Task 220-001).
 *
 * Verifies that:
 *   1. `resolveChatProvider` walks the chat_provider → brain_provider → claude
 *      fallback chain correctly and never returns an out-of-set value.
 *   2. `buildReplProvider` builds a real ChatProviderAdapter that produces
 *      actual assistant text (no "provider not yet wired" skeleton).
 *   3. Unknown providers fail with a clear error instead of falling back
 *      silently to the legacy stub.
 *   4. The Ollama branch uses the injected fetch (hermetic — no network).
 *
 * All tests are hermetic: the host-CLI spawn function and the fetch
 * implementation are injected, so the suite never touches a real binary
 * or the network. Mirrors the `tests/cli/default-repl.test.ts` mock pattern.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Hoisted Spies (must precede dynamic import of entry.ts) ───────────

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

// ─── Dynamic imports after mocks are wired ─────────────────────────────

type ChatProviderName = 'claude' | 'codex' | 'gemini' | 'ollama';
let resolveChatProvider: (config: unknown) => ChatProviderName;
let buildReplProvider: (
  name: ChatProviderName,
  opts?: { spawnFn?: SpawnFn; fetchFn?: typeof fetch },
) => ChatAdapter;

interface ChatAdapter {
  send(messages: readonly { role: string; content: string }[]): Promise<{ text?: string; stopReason: string }>;
  stream?(messages: readonly { role: string; content: string }[]): AsyncIterable<{ text?: string; done?: { text?: string; stopReason: string } }>;
}

type SpawnFn = (
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => { chunks: AsyncIterable<string>; wait: Promise<{ exitCode: number | null }> };

beforeAll(async () => {
  const configMod = await import('../../src/core/config.js');
  resolveChatProvider = configMod.resolveChatProvider as typeof resolveChatProvider;
  const entryMod = await import('../../src/cli/entry.js');
  buildReplProvider = entryMod.buildReplProvider as typeof buildReplProvider;
});

// ─── Helpers ───────────────────────────────────────────────────────────

/** Build a spawnFn that yields the canned text chunks and exits with code 0. */
function fakeSpawn(stdoutChunks: readonly string[]): SpawnFn {
  return (_binary, _args, _env) => ({
    chunks: (async function* () {
      for (const c of stdoutChunks) yield c;
    })(),
    wait: Promise.resolve({ exitCode: 0 }),
  });
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

// ─── resolveChatProvider ───────────────────────────────────────────────

describe('resolveChatProvider — fallback chain', () => {
  it('returns "claude" when neither chat_provider nor brain_provider is set', () => {
    expect(resolveChatProvider({})).toBe('claude');
  });

  it('returns "claude" when config is null/undefined (defensive default)', () => {
    expect(resolveChatProvider(null)).toBe('claude');
    expect(resolveChatProvider(undefined)).toBe('claude');
  });

  it('honors chat_provider override — codex', () => {
    expect(resolveChatProvider({ chat_provider: 'codex' })).toBe('codex');
  });

  it('honors chat_provider override — ollama (local LLM)', () => {
    expect(resolveChatProvider({ chat_provider: 'ollama' })).toBe('ollama');
  });

  it('falls back to brain_provider when chat_provider is unset', () => {
    expect(resolveChatProvider({ brain_provider: 'gemini' })).toBe('gemini');
  });

  it('chat_provider wins over brain_provider when both are set', () => {
    expect(resolveChatProvider({ chat_provider: 'gemini', brain_provider: 'codex' })).toBe('gemini');
  });

  it('returns "claude" for out-of-set values (defensive)', () => {
    // Corrupt config shouldn't crash the REPL boot path.
    expect(resolveChatProvider({ chat_provider: 'nonsense-provider' as unknown as ChatProviderName })).toBe('claude');
  });
});

// ─── buildReplProvider — real adapter ──────────────────────────────────

describe('buildReplProvider — real round-trip', () => {
  it('builds a working claude adapter that returns real text via injected spawn', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['hello from ', 'mock-claude']) });
    const resp = await adapter.send([{ role: 'user', content: 'selam' }]);
    // Real text passes through — not the legacy "provider not yet wired" skeleton.
    expect(resp.text).toBe('hello from mock-claude');
    expect(resp.text).not.toContain('not yet wired');
    expect(resp.stopReason).toBe('end_turn');
  });

  it('codex adapter spawns the codex binary (not claude)', async () => {
    const seen: string[] = [];
    const spy: SpawnFn = (binary, args, _env) => {
      seen.push(binary);
      seen.push(...args);
      return {
        chunks: (async function* () {
          yield 'codex-response';
        })(),
        wait: Promise.resolve({ exitCode: 0 }),
      };
    };
    const adapter = buildReplProvider('codex', { spawnFn: spy });
    const resp = await adapter.send([{ role: 'user', content: 'hi' }]);
    expect(resp.text).toBe('codex-response');
    expect(seen[0]).toBe('codex');
    // codex one-shot: `codex exec --full-auto <prompt>` (ADR-017).
    expect(seen).toContain('exec');
  });

  it('streams chunks as they arrive and yields a final done marker', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['a', 'b', 'c']) });
    expect(adapter.stream).toBeDefined();
    const collected: string[] = [];
    let final: { text?: string; stopReason: string } | undefined;
    for await (const chunk of adapter.stream!([{ role: 'user', content: 'q' }])) {
      if (chunk.text) collected.push(chunk.text);
      if (chunk.done) final = chunk.done;
    }
    expect(collected).toEqual(['a', 'b', 'c']);
    expect(final?.text).toBe('abc');
    expect(final?.stopReason).toBe('end_turn');
  });

  it('throws a clear error for an unknown provider name (no silent skeleton fallback)', () => {
    expect(() => buildReplProvider('bogus' as ChatProviderName))
      .toThrow(/Unknown REPL provider: "bogus"/);
  });

  it('builds an ollama adapter that talks to the HTTP server via injected fetch', async () => {
    const adapter = buildReplProvider('ollama', {
      fetchFn: fakeFetch({ response: 'hello-from-ollama' }),
    });
    const resp = await adapter.send([{ role: 'user', content: 'selam' }]);
    expect(resp.text).toBe('hello-from-ollama');
    expect(resp.stopReason).toBe('end_turn');
  });

  it('ollama adapter surfaces HTTP errors (no silent skeleton)', async () => {
    const adapter = buildReplProvider('ollama', {
      fetchFn: fakeFetch({ error: 'nope' }, 500),
    });
    await expect(adapter.send([{ role: 'user', content: 'x' }])).rejects.toThrow(/Ollama request failed/);
  });
});
