import { describe, it, expect, vi } from 'vitest';

import {
  resolveChatAdapter,
  type ResolveChatAdapterOptions,
} from '../../src/cli/commands/chat-provider-parity.js';
import type { SubscriptionSpawnFn } from '../../src/cli/commands/chat-native.js';

// ─── Test helpers ─────────────────────────────────────────────────────

/** Fake spawn that emits fixed chunks and records what it was called with. */
function fakeSpawn(chunks: string[] = ['ok'], capture: Record<string, unknown> = {}): SubscriptionSpawnFn {
  return (binary, args, env) => {
    capture['binary'] = binary;
    capture['args'] = [...args];
    capture['env'] = env;
    const iterable: AsyncIterable<string> = {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    };
    return { chunks: iterable, wait: Promise.resolve({ exitCode: 0 }) };
  };
}

/** Fake fetch that returns a JSON body. */
function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  })) as unknown as typeof fetch;
}

// ─── Provider-parity: all 5 providers return a ChatProviderAdapter ────

describe('resolveChatAdapter — provider parity', () => {
  it('claude → adapter with send + stream', async () => {
    const cap: Record<string, unknown> = {};
    const adapter = resolveChatAdapter('claude', { spawnFn: fakeSpawn(['hello'], cap) });

    expect(typeof adapter.send).toBe('function');
    expect(typeof adapter.stream).toBe('function');

    const res = await adapter.send([{ role: 'user', content: 'hi' }]);
    expect(res.stopReason).toBe('end_turn');
    expect(res.text).toBe('hello');
    expect(cap['binary']).toBe('claude');
    expect((cap['args'] as string[])[0]).toBe('--print');
  });

  it('codex → adapter uses codex binary with exec --full-auto args', async () => {
    const cap: Record<string, unknown> = {};
    const adapter = resolveChatAdapter('codex', { spawnFn: fakeSpawn(['codex-out'], cap) });

    const res = await adapter.send([{ role: 'user', content: 'plan' }]);
    expect(res.stopReason).toBe('end_turn');
    expect(res.text).toBe('codex-out');
    expect(cap['binary']).toBe('codex');
    expect(cap['args'] as string[]).toContain('exec');
    expect(cap['args'] as string[]).toContain('--full-auto');
  });

  it('gemini → adapter uses gemini binary with -p flag', async () => {
    const cap: Record<string, unknown> = {};
    const adapter = resolveChatAdapter('gemini', { spawnFn: fakeSpawn(['gem-out'], cap) });

    const res = await adapter.send([{ role: 'user', content: 'hello' }]);
    expect(res.stopReason).toBe('end_turn');
    expect(res.text).toBe('gem-out');
    expect(cap['binary']).toBe('gemini');
    expect((cap['args'] as string[])[0]).toBe('-p');
  });

  it('ollama → zero-API HTTP adapter calls /api/generate (no ANTHROPIC_API_KEY needed)', async () => {
    const fetch = fakeFetch({ response: 'llama says hello' });
    const adapter = resolveChatAdapter('ollama', {
      fetchFn: fetch,
      ollamaHost: 'http://localhost:11434',
      ollamaModel: 'llama3',
    });

    expect(typeof adapter.send).toBe('function');
    expect(adapter.stream).toBeUndefined();

    const res = await adapter.send([{ role: 'user', content: 'hi' }]);
    expect(res.text).toBe('llama says hello');
    expect(res.stopReason).toBe('end_turn');
    expect(fetch).toHaveBeenCalledOnce();
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    expect(url).toContain('/api/generate');
  });

  it('openai-compatible → HTTP /v1/chat/completions adapter', async () => {
    const body = {
      choices: [{ message: { content: 'openai compat response' } }],
    };
    const fetch = fakeFetch(body);
    const adapter = resolveChatAdapter('openai-compatible', {
      fetchFn: fetch,
      openaiCompatBaseUrl: 'http://localhost:8080',
      openaiCompatModel: 'mistral',
    });

    const res = await adapter.send([{ role: 'user', content: 'test' }]);
    expect(res.text).toBe('openai compat response');
    expect(res.stopReason).toBe('end_turn');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    expect(url).toContain('/v1/chat/completions');
  });
});

// ─── Same contract: all providers produce { text, stopReason } ────────

describe('resolveChatAdapter — uniform contract', () => {
  it('all CLI providers produce the same ProviderResponse shape', async () => {
    const providers = ['claude', 'codex', 'gemini'] as const;
    for (const p of providers) {
      const adapter = resolveChatAdapter(p, { spawnFn: fakeSpawn(['response-text']) });
      const res = await adapter.send([{ role: 'user', content: 'hi' }]);
      expect(res).toMatchObject({ text: 'response-text', stopReason: 'end_turn' });
    }
  });

  it('all HTTP providers produce the same ProviderResponse shape', async () => {
    const ollamaAdapter = resolveChatAdapter('ollama', {
      fetchFn: fakeFetch({ response: 'from-ollama' }),
    });
    const openaiAdapter = resolveChatAdapter('openai-compatible', {
      fetchFn: fakeFetch({ choices: [{ message: { content: 'from-openai-compat' } }] }),
    });

    const r1 = await ollamaAdapter.send([{ role: 'user', content: 'x' }]);
    const r2 = await openaiAdapter.send([{ role: 'user', content: 'x' }]);

    expect(r1.stopReason).toBe('end_turn');
    expect(r2.stopReason).toBe('end_turn');
    expect(typeof r1.text).toBe('string');
    expect(typeof r2.text).toBe('string');
  });
});

// ─── Unknown provider → clear error ──────────────────────────────────

describe('resolveChatAdapter — error handling', () => {
  it('throws a descriptive error for unknown provider (no silent fallback)', () => {
    expect(() => resolveChatAdapter('gpt-4o')).toThrow(/Unknown REPL provider.*gpt-4o/);
  });

  it('error message lists all valid providers', () => {
    try {
      resolveChatAdapter('bogus');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('claude');
      expect(msg).toContain('codex');
      expect(msg).toContain('gemini');
      expect(msg).toContain('ollama');
      expect(msg).toContain('openai-compatible');
    }
  });

  it('ollama throws on HTTP error (not a silent empty response)', async () => {
    const adapter = resolveChatAdapter('ollama', {
      fetchFn: fakeFetch({}, 503),
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Ollama request failed/);
  });

  it('openai-compatible throws on HTTP error', async () => {
    const adapter = resolveChatAdapter('openai-compatible', {
      fetchFn: fakeFetch({}, 401),
    });
    await expect(adapter.send([{ role: 'user', content: 'hi' }])).rejects.toThrow(/OpenAI-compat request failed/);
  });
});

// ─── Ollama zero-API: no API-key env var needed ───────────────────────

describe('resolveChatAdapter — ollama zero-API', () => {
  it('ollama adapter never passes API keys to the fetch call', async () => {
    const headers: Record<string, string> = {};
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
      return { ok: true, status: 200, json: async () => ({ response: 'ok' }) };
    }) as unknown as typeof fetch;

    const adapter = resolveChatAdapter('ollama', { fetchFn: fetch });
    await adapter.send([{ role: 'user', content: 'hi' }]);

    expect(headers['authorization']).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
  });
});

// ─── Claude stream: strips env API keys before spawning ──────────────

describe('resolveChatAdapter — claude subscription env', () => {
  it('claude spawn env has ANTHROPIC_API_KEY stripped', async () => {
    const prior = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = 'test-key-should-be-stripped';
    try {
      const cap: Record<string, unknown> = {};
      const adapter = resolveChatAdapter('claude', { spawnFn: fakeSpawn(['hi'], cap) });
      await adapter.send([{ role: 'user', content: 'test' }]);
      expect((cap['env'] as NodeJS.ProcessEnv)['ANTHROPIC_API_KEY']).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = prior;
    }
  });
});

// ─── Fallback: opts omitted uses built-in defaults ───────────────────

describe('resolveChatAdapter — opts default fallback', () => {
  it('returns adapter when opts is omitted (uses production spawn/fetch)', () => {
    // Just verify the adapter is built without throwing when no opts supplied.
    // We don't call send() — that would hit a real binary.
    const adapter = resolveChatAdapter('claude');
    expect(typeof adapter.send).toBe('function');
  });
});
