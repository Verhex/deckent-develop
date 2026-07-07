import { describe, it, expect, vi } from 'vitest';

import { resolveChatAdapter } from '../../src/cli/commands/chat-provider-parity.js';
import type { SubscriptionSpawnFn } from '../../src/cli/commands/chat-native.js';

// ─── born-526 · PROVIDER-PARITY-ROBUST regression coverage ───────────────
//
// Three defects fixed in chat-provider-parity.ts (REPL bulgu 77+109 +
// born-518-devir P1-12/P1-13):
//   1. CLI subprocess exit-code was never inspected — a failed subscription
//      call (expired auth / rate limit / crash) reported as an empty success.
//   2. Ollama / openai-compatible HTTP calls had no timeout/AbortController —
//      an unresponsive local server hung the REPL turn forever.
//   3. subscriptionEnv() stripped ANTHROPIC_*/GEMINI_*/GOOGLE_* keys but not
//      OPENAI_API_KEY/DECKENT_OPENAI_API_KEY, so a codex spawn could fall
//      back to API-key billing instead of subscription/OAuth.

/** Fake spawn with an injectable exit code — records the env it was called with. */
function fakeSpawnWithExit(
  chunks: string[],
  exitCode: number | null,
  capture: Record<string, unknown> = {},
): SubscriptionSpawnFn {
  return (binary, args, env) => {
    capture['binary'] = binary;
    capture['args'] = [...args];
    capture['env'] = env;
    const iterable: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    };
    return { chunks: iterable, wait: Promise.resolve({ exitCode }) };
  };
}

/**
 * Fake fetch that never resolves on its own — simulates an unresponsive
 * server — but, like the real `fetch`, rejects with an AbortError once its
 * `init.signal` fires. Proves the adapter's AbortController wiring actually
 * cancels the in-flight call instead of hanging until the test times out.
 */
function hangingFetch(): typeof fetch {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  })) as unknown as typeof fetch;
}

// ─── Bug 1: subprocess exit-code inspection ───────────────────────────────

describe('provider-parity-robust — subprocess exit-code', () => {
  it('send() rejects (not a silent empty success) on non-zero exit code', async () => {
    const adapter = resolveChatAdapter('claude', {
      spawnFn: fakeSpawnWithExit([], 1),
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/exited with code 1/);
  });

  it('send() error message includes the provider binary name and any collected stdout', async () => {
    const adapter = resolveChatAdapter('codex', {
      spawnFn: fakeSpawnWithExit(['partial output'], 2),
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/codex.*exited with code 2.*partial output/s);
  });

  it('stream() rejects on non-zero exit code instead of yielding a done chunk', async () => {
    const adapter = resolveChatAdapter('gemini', {
      spawnFn: fakeSpawnWithExit(['chunk1'], 1),
    });
    expect(adapter.stream).toBeDefined();
    const iterate = async () => {
      const collected: string[] = [];
      for await (const chunk of adapter.stream!([{ role: 'user', content: 'hi' }])) {
        if (chunk.text) collected.push(chunk.text);
      }
    };
    await expect(iterate()).rejects.toThrow(/exited with code 1/);
  });

  it('send() still resolves normally on exit code 0 (no regression)', async () => {
    const adapter = resolveChatAdapter('claude', {
      spawnFn: fakeSpawnWithExit(['hello'], 0),
    });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('hello');
    expect(res.stopReason).toBe('end_turn');
  });

  it('send() still resolves normally on a null exit code (signal-terminated, ambiguous — not treated as failure)', async () => {
    const adapter = resolveChatAdapter('claude', {
      spawnFn: fakeSpawnWithExit(['hello'], null),
    });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('hello');
  });
});

// ─── Bug 2: Ollama / openai-compatible HTTP timeout ───────────────────────

describe('provider-parity-robust — HTTP timeout (no hang)', () => {
  it('ollama adapter times out against an unresponsive server instead of hanging forever', async () => {
    const adapter = resolveChatAdapter('ollama', {
      fetchFn: hangingFetch(),
      httpTimeoutMs: 50,
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/timed out/i);
  }, 2_000);

  it('openai-compatible adapter times out against an unresponsive server instead of hanging forever', async () => {
    const adapter = resolveChatAdapter('openai-compatible', {
      fetchFn: hangingFetch(),
      httpTimeoutMs: 50,
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/timed out/i);
  }, 2_000);

  it('DECKENT_CHAT_HTTP_TIMEOUT_MS env var overrides the default/opts timeout', async () => {
    const prior = process.env['DECKENT_CHAT_HTTP_TIMEOUT_MS'];
    process.env['DECKENT_CHAT_HTTP_TIMEOUT_MS'] = '50';
    try {
      const adapter = resolveChatAdapter('ollama', {
        fetchFn: hangingFetch(),
        httpTimeoutMs: 60_000, // would hang for the test duration if the env var were ignored
      });
      await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/timed out/i);
    } finally {
      if (prior === undefined) delete process.env['DECKENT_CHAT_HTTP_TIMEOUT_MS'];
      else process.env['DECKENT_CHAT_HTTP_TIMEOUT_MS'] = prior;
    }
  }, 2_000);

  it('a fast-responding server is unaffected by the timeout wiring', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ response: 'fast reply' }),
    })) as unknown as typeof fetch;
    const adapter = resolveChatAdapter('ollama', { fetchFn, httpTimeoutMs: 5_000 });
    const res = await adapter.send([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('fast reply');
  });
});

// ─── Bug 3: codex subscriptionEnv() strips OPENAI_API_KEY ─────────────────

describe('provider-parity-robust — codex subscriptionEnv credential scrub', () => {
  it('codex spawn env has OPENAI_API_KEY and DECKENT_OPENAI_API_KEY stripped', async () => {
    const priorOpenai = process.env['OPENAI_API_KEY'];
    const priorDeck = process.env['DECKENT_OPENAI_API_KEY'];
    process.env['OPENAI_API_KEY'] = 'sk-should-be-stripped';
    process.env['DECKENT_OPENAI_API_KEY'] = 'deck-should-be-stripped';
    try {
      const cap: Record<string, unknown> = {};
      const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawnWithExit(['ok'], 0, cap) });
      await adapter.send([{ role: 'user', content: 'test' }]);
      const env = cap['env'] as NodeJS.ProcessEnv;
      expect(env['OPENAI_API_KEY']).toBeUndefined();
      expect(env['DECKENT_OPENAI_API_KEY']).toBeUndefined();
    } finally {
      if (priorOpenai === undefined) delete process.env['OPENAI_API_KEY'];
      else process.env['OPENAI_API_KEY'] = priorOpenai;
      if (priorDeck === undefined) delete process.env['DECKENT_OPENAI_API_KEY'];
      else process.env['DECKENT_OPENAI_API_KEY'] = priorDeck;
    }
  });

  it('claude/gemini spawns also have OPENAI keys stripped (unconditional, symmetric with gemini keys)', async () => {
    const priorOpenai = process.env['OPENAI_API_KEY'];
    process.env['OPENAI_API_KEY'] = 'sk-should-be-stripped';
    try {
      const cap: Record<string, unknown> = {};
      const adapter = resolveChatAdapter('claude', { spawnFn: fakeSpawnWithExit(['ok'], 0, cap) });
      await adapter.send([{ role: 'user', content: 'test' }]);
      expect((cap['env'] as NodeJS.ProcessEnv)['OPENAI_API_KEY']).toBeUndefined();
    } finally {
      if (priorOpenai === undefined) delete process.env['OPENAI_API_KEY'];
      else process.env['OPENAI_API_KEY'] = priorOpenai;
    }
  });
});
