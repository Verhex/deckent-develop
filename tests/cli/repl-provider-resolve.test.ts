/**
 * REPL provider-resolve tests (Sprint 221 Task 221-005).
 *
 * Covers the extension of `buildReplProvider` (src/cli/entry.ts) onto the
 * ollama + openai-compatible (deepseek/qwen/glm) branches, plus the
 * NET-error wrap for an unreachable Ollama server. The Sprint 220 Task
 * 220-001 surface (claude/codex/gemini subscription spawn + the original
 * 4 provider-resolve cases) is covered by `tests/cli/native-repl-wire.test.ts`;
 * this file focuses on the *new* branches introduced by 221-005 so the
 * suite remains tightly scoped to the task delta.
 *
 * Hermetic: spawn + fetch are injected. No real binary, no network.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────

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

// ─── Dynamic imports after mocks are wired ──────────────────────────────

type ReplProviderName =
  | 'claude' | 'codex' | 'gemini' | 'ollama'
  | 'deepseek' | 'qwen' | 'glm';

interface ChatMsg { role: string; content: string }
interface ProviderResp { text?: string; stopReason: string }
interface ChatAdapter {
  send(messages: readonly ChatMsg[]): Promise<ProviderResp>;
}

type SpawnFn = (
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => { chunks: AsyncIterable<string>; wait: Promise<{ exitCode: number | null }> };

let buildReplProvider: (
  name: ReplProviderName,
  opts?: { spawnFn?: SpawnFn; fetchFn?: typeof fetch },
) => ChatAdapter;

beforeAll(async () => {
  const entryMod = await import('../../src/cli/entry.js');
  buildReplProvider = entryMod.buildReplProvider as typeof buildReplProvider;
});

// ─── Helpers ────────────────────────────────────────────────────────────

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

/** Fetch that simulates an unreachable host (connection refused). */
function refusingFetch(reason = 'connect ECONNREFUSED 127.0.0.1:11434'): typeof fetch {
  return (((_input: unknown, _init?: unknown) =>
    Promise.reject(new TypeError(`fetch failed: ${reason}`))) as unknown) as typeof fetch;
}

// ─── 1. chat_provider=ollama → ollama-adapter (HTTP, not spawn) ─────────

describe('buildReplProvider — ollama branch (Sprint 221 T-005)', () => {
  it('chat_provider=ollama uses the HTTP ollama adapter via injected fetch (no claude-spawn)', async () => {
    let spawned = false;
    const spawnSpy: SpawnFn = () => {
      spawned = true;
      return {
        chunks: (async function* () { yield 'should-not-run'; })(),
        wait: Promise.resolve({ exitCode: 0 }),
      };
    };
    const fetchSpy = vi.fn(((..._args: unknown[]) =>
      Promise.resolve(new Response(JSON.stringify({ response: 'hello-from-ollama' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))) as unknown as typeof fetch);

    const adapter = buildReplProvider('ollama', { spawnFn: spawnSpy, fetchFn: fetchSpy });
    const resp = await adapter.send([{ role: 'user', content: 'selam' }]);
    expect(resp.text).toBe('hello-from-ollama');
    expect(resp.stopReason).toBe('end_turn');
    expect(spawned).toBe(false); // ollama must NOT touch host CLI spawn
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('ollama posts to the /api/generate endpoint on localhost:11434 by default', async () => {
    let lastUrl = '';
    let lastBody = '';
    const fetchSpy = (((input: unknown, init?: unknown) => {
      lastUrl = String(input);
      const initObj = init as { body?: string } | undefined;
      lastBody = initObj?.body ?? '';
      return Promise.resolve(new Response(JSON.stringify({ response: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }) as unknown) as typeof fetch;

    const adapter = buildReplProvider('ollama', { fetchFn: fetchSpy });
    await adapter.send([{ role: 'user', content: 'x' }]);
    expect(lastUrl).toBe('http://localhost:11434/api/generate');
    expect(lastBody).toContain('"stream":false');
  });
});

// ─── 2. claude → subscription spawn (unchanged baseline) ────────────────

describe('buildReplProvider — claude subscription baseline', () => {
  it('claude routes through host CLI spawn (no fetch, no skeleton)', async () => {
    let fetched = false;
    const fetchSpy = (((..._args: unknown[]) => {
      fetched = true;
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as unknown) as typeof fetch;

    const adapter = buildReplProvider('claude', {
      spawnFn: fakeSpawn(['hello from ', 'mock-claude']),
      fetchFn: fetchSpy,
    });
    const resp = await adapter.send([{ role: 'user', content: 'selam' }]);
    expect(resp.text).toBe('hello from mock-claude');
    expect(resp.text).not.toContain('not yet wired');
    expect(fetched).toBe(false); // claude is spawn-based, must not hit fetch
  });
});

// ─── 3. openai-compatible → HTTP adapter (deepseek preset) ──────────────

describe('buildReplProvider — openai-compatible branch (Sprint 221 T-005)', () => {
  it('deepseek routes to the OpenAI-compatible HTTP adapter (POST /chat/completions)', async () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-test-deepseek';
    try {
      let lastUrl = '';
      let lastAuthHeader: string | undefined;
      const fetchSpy = (((input: unknown, init?: unknown) => {
        lastUrl = String(input);
        const initObj = init as { headers?: Record<string, string> } | undefined;
        lastAuthHeader = initObj?.headers?.['Authorization'];
        return Promise.resolve(new Response(JSON.stringify({
          choices: [{ message: { content: 'hello-from-deepseek' } }],
          usage: { prompt_tokens: 4, completion_tokens: 6 },
          model: 'deepseek-chat',
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }) as unknown) as typeof fetch;

      const adapter = buildReplProvider('deepseek', { fetchFn: fetchSpy });
      const resp = await adapter.send([{ role: 'user', content: 'selam' }]);
      expect(resp.text).toBe('hello-from-deepseek');
      expect(resp.stopReason).toBe('end_turn');
      expect(lastUrl).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(lastAuthHeader).toBe('Bearer sk-test-deepseek');
    } finally {
      delete process.env['DEEPSEEK_API_KEY'];
    }
  });

  it('qwen + glm presets also route to OpenAI-compatible HTTP (provider-parity)', async () => {
    process.env['DASHSCOPE_API_KEY'] = 'sk-test-qwen';
    process.env['ZHIPU_API_KEY'] = 'sk-test-glm';
    try {
      const seen: string[] = [];
      const fetchSpy = (((input: unknown, _init?: unknown) => {
        seen.push(String(input));
        return Promise.resolve(new Response(JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }), { status: 200 }));
      }) as unknown) as typeof fetch;

      const qwen = buildReplProvider('qwen', { fetchFn: fetchSpy });
      await qwen.send([{ role: 'user', content: 'x' }]);
      const glm = buildReplProvider('glm', { fetchFn: fetchSpy });
      await glm.send([{ role: 'user', content: 'y' }]);

      expect(seen[0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
      expect(seen[1]).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    } finally {
      delete process.env['DASHSCOPE_API_KEY'];
      delete process.env['ZHIPU_API_KEY'];
    }
  });

  it('deepseek without DEEPSEEK_API_KEY surfaces a clear ProviderError (no silent skeleton)', async () => {
    delete process.env['DEEPSEEK_API_KEY'];
    const adapter = buildReplProvider('deepseek', { fetchFn: fakeFetch({ choices: [] }) });
    await expect(adapter.send([{ role: 'user', content: 'x' }]))
      .rejects.toThrow(/DEEPSEEK_API_KEY/);
  });
});

// ─── 4. Ollama unreachable → NET error (no skeleton) ────────────────────

describe('buildReplProvider — ollama unreachable NET error (Sprint 221 T-005)', () => {
  // TERMINAL-I18N-NATIVE-001: the hint is the localized `chat.ollama_unreachable`
  // row (English in the default session language; Turkish under language=tr).
  it('connection-refused fetch is wrapped with a clear "Ollama (...) is unreachable" message', async () => {
    const adapter = buildReplProvider('ollama', { fetchFn: refusingFetch() });
    await expect(adapter.send([{ role: 'user', content: 'x' }]))
      .rejects.toThrow(/Ollama \(http:\/\/localhost:11434\) is unreachable/);
  });

  it('NET error mentions "ollama serve" hint so the user knows the fix', async () => {
    const adapter = buildReplProvider('ollama', { fetchFn: refusingFetch() });
    await expect(adapter.send([{ role: 'user', content: 'x' }]))
      .rejects.toThrow(/ollama serve/);
  });
});

// ─── 5. Unknown provider — clear error, no skeleton fallback ────────────

describe('buildReplProvider — unknown provider rejection', () => {
  it('unknown name throws a clear error mentioning the widened valid set', () => {
    expect(() => buildReplProvider('bogus' as ReplProviderName))
      .toThrow(/Unknown REPL provider: "bogus"/);
    expect(() => buildReplProvider('bogus' as ReplProviderName))
      .toThrow(/deepseek/); // widened set advertised
  });
});
