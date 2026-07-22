/**
 * Tests for OllamaAdapter (Sprint 190 W-F F-11)
 *
 * Covers:
 *   - isAvailable() returns false when the server is unreachable
 *   - isAvailable() returns true when /api/tags responds with 200
 *   - detect() returns model list + version from mocked HTTP responses
 *   - complete() POSTs the right body and parses the response/stats
 *   - diagnoseAvailability() shape (binaryFound/available/hints)
 *   - parseOllamaOutput() helper
 *   - model-registry integration: ollama tier mapping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { OllamaAdapter, parseOllamaOutput, createOllamaAdapter } from '../../src/providers/ollama.js';
import { modelRegistry } from '../../src/core/model-registry.js';

const PROJECT_DIR = '/tmp/test-ollama-project';

function mockFetchSequence(responses: Array<() => Response | Promise<Response>>): typeof fetch {
  let i = 0;
  return (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const fn = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return fn ? fn() : new Response('', { status: 500 });
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OllamaAdapter.isAvailable', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when the Ollama server is unreachable', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl: failingFetch });
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('returns true when /api/tags returns 200', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({ models: [{ name: 'qwen2.5-coder:7b' }] }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('returns false when /api/tags returns a non-2xx status', async () => {
    const fetchImpl = mockFetchSequence([
      () => new Response('Internal Error', { status: 500 }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    expect(await adapter.isAvailable()).toBe(false);
  });
});

describe('OllamaAdapter.detect', () => {
  it('reports models + version from the mocked endpoints', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({ models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llama3:8b' }] }),
      () => jsonResponse({ version: '0.1.30' }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const d = await adapter.detect();

    expect(d.available).toBe(true);
    expect(d.ready).toBe(true);
    expect(d.models).toEqual(['qwen2.5-coder:7b', 'llama3:8b']);
    expect(d.version).toBe('0.1.30');
    expect(d.auth).toBe('none');
    expect(d.reason).toMatch(/reachable/i);
  });

  it('reports not-ready when the server is offline', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl: failingFetch });
    const d = await adapter.detect();

    expect(d.ready).toBe(false);
    expect(d.available).toBe(false);
    expect(d.models).toEqual([]);
    expect(d.reason).toMatch(/failed|not reachable/i);
  });

  it('reports ready=partial when /api/tags responds without any models (Sprint 192 Task 192-007)', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({}),
      () => jsonResponse({ version: '0.1.0' }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const d = await adapter.detect();

    // Server reachable but no models pulled → actionable partial state.
    expect(d.available).toBe(false);
    expect(d.ready).toBe('partial');
    expect(d.models).toEqual([]);
    expect(d.reason).toMatch(/no models/i);
  });

  it('reports ready=partial with empty models array from /api/tags (Sprint 192 Task 192-007)', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({ models: [] }),
      () => jsonResponse({ version: '0.1.0' }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const d = await adapter.detect();

    expect(d.ready).toBe('partial');
    expect(d.available).toBe(false);
    expect(d.models).toEqual([]);
  });

  it('reports ready=true once at least one model is present (Sprint 192 Task 192-007)', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({ models: [{ name: 'llama3:8b' }] }),
      () => jsonResponse({ version: '0.1.0' }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const d = await adapter.detect();

    expect(d.ready).toBe(true);
    expect(d.available).toBe(true);
    expect(d.models).toEqual(['llama3:8b']);
  });
});

describe('OllamaAdapter.complete', () => {
  it('POSTs to /api/generate and parses response + token stats', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({
        response: 'Hello, world.',
        prompt_eval_count: 12,
        eval_count: 7,
        done: true,
      });
    }) as unknown as typeof fetch;

    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const result = await adapter.complete('Merhaba', 'qwen2.5-coder:7b');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/api\/generate$/);
    expect(calls[0]!.init?.method).toBe('POST');

    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.model).toBe('qwen2.5-coder:7b'); // apiId resolved from registry
    expect(body.prompt).toBe('Merhaba');
    expect(body.stream).toBe(false);

    expect(result.response).toBe('Hello, world.');
    expect(result.stats).toEqual({ inputTokens: 12, outputTokens: 7 });
  });

  it('throws ProviderError when the server returns non-2xx', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    await expect(adapter.complete('x', 'qwen2.5-coder:7b')).rejects.toThrow(/500/);
  });

  it('rejects unsupported models', async () => {
    const adapter = new OllamaAdapter(PROJECT_DIR);
    await expect(adapter.complete('x', 'sonnet' as never)).rejects.toThrow(/Unsupported model/i);
  });
});

describe('OllamaAdapter.diagnoseAvailability', () => {
  it('shapes the result with hints when server is offline', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl: failingFetch });
    const diag = await adapter.diagnoseAvailability();

    expect(diag.name).toBe('ollama');
    expect(diag.available).toBe(false);
    expect(diag.binaryFound).toBe(false);
    expect(diag.authMethod).toBe('none');
    expect(diag.hints.some(h => /ollama serve/i.test(h))).toBe(true);
  });

  it('shapes the result with available=true when server responds', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({ models: [{ name: 'qwen2.5-coder:7b' }] }),
      () => jsonResponse({ version: '0.1.30' }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const diag = await adapter.diagnoseAvailability();

    expect(diag.available).toBe(true);
    expect(diag.partial).toBe(false);
    expect(diag.version).toBe('0.1.30');
    expect(diag.versionStatus).toBe('ok');
    expect(diag.authStatus).toBe('ok');
  });

  it('shapes the result with partial=true when server reachable but no models (Sprint 192 Task 192-007)', async () => {
    const fetchImpl = mockFetchSequence([
      () => jsonResponse({ models: [] }),
      () => jsonResponse({ version: '0.1.30' }),
    ]);
    const adapter = new OllamaAdapter(PROJECT_DIR, { fetchImpl });
    const diag = await adapter.diagnoseAvailability();

    expect(diag.available).toBe(false);
    expect(diag.partial).toBe(true);
    expect(diag.binaryFound).toBe(true);
    expect(diag.authStatus).toBe('ok');
    expect(diag.hints.some(h => /ollama pull/i.test(h))).toBe(true);
  });
});

describe('parseOllamaOutput', () => {
  it('parses a standard /api/generate JSON response', () => {
    const out = parseOllamaOutput(
      JSON.stringify({ response: 'Hi', prompt_eval_count: 3, eval_count: 1 }),
    );
    expect(out.response).toBe('Hi');
    expect(out.stats).toEqual({ inputTokens: 3, outputTokens: 1 });
  });

  it('falls back to raw text when the body is not JSON', () => {
    const out = parseOllamaOutput('plain text');
    expect(out.response).toBe('plain text');
    expect(out.stats).toBeUndefined();
  });

  it('handles /api/chat-shaped message.content', () => {
    const out = parseOllamaOutput(JSON.stringify({ message: { content: 'streamed' } }));
    expect(out.response).toBe('streamed');
  });

  it('returns empty response for empty input', () => {
    expect(parseOllamaOutput('').response).toBe('');
  });
});

describe('Ollama model-registry integration', () => {
  it('registers 4 ollama models across the tier ladder', () => {
    const ollamaModels = modelRegistry.getByProvider('ollama');
    expect(ollamaModels.length).toBe(4);
    const ids = ollamaModels.map(m => m.id).sort();
    expect(ids).toEqual(['llama3.2:3b', 'llama3:8b', 'qwen2.5-coder:32b', 'qwen2.5-coder:7b']);
  });

  it('maps qwen2.5-coder:32b → premium tier and llama3.2:3b → economy tier', () => {
    expect(modelRegistry.getTier('qwen2.5-coder:32b')).toBe('premium');
    expect(modelRegistry.getTier('llama3.2:3b')).toBe('economy');
  });

  it('costPerMillion is zero for local Ollama models', () => {
    for (const m of modelRegistry.getByProvider('ollama')) {
      expect(m.costPerMillion.input).toBe(0);
      expect(m.costPerMillion.output).toBe(0);
    }
  });

  it('getModelForTier() walks the tier ladder', () => {
    const adapter = new OllamaAdapter(PROJECT_DIR);
    expect(adapter.getModelForTier('premium')).toBe('qwen2.5-coder:32b');
    expect(adapter.getModelForTier('economy')).toBe('llama3.2:3b');
  });
});

describe('OllamaAdapter.host resolution', () => {
  it('respects DECKENT_OLLAMA_HOST env override', () => {
    const prev = process.env['DECKENT_OLLAMA_HOST'];
    process.env['DECKENT_OLLAMA_HOST'] = 'http://192.168.1.10:11434';
    try {
      const adapter = new OllamaAdapter(PROJECT_DIR);
      expect(adapter.getHost()).toBe('http://192.168.1.10:11434');
    } finally {
      if (prev === undefined) delete process.env['DECKENT_OLLAMA_HOST'];
      else process.env['DECKENT_OLLAMA_HOST'] = prev;
    }
  });

  it('respects the explicit host constructor option (trims trailing slash)', () => {
    const adapter = new OllamaAdapter(PROJECT_DIR, { host: 'http://example.com:11434/' });
    expect(adapter.getHost()).toBe('http://example.com:11434');
  });
});

describe('createOllamaAdapter factory', () => {
  it('returns an OllamaAdapter instance', () => {
    const adapter = createOllamaAdapter(PROJECT_DIR);
    expect(adapter).toBeInstanceOf(OllamaAdapter);
    expect(adapter.name).toBe('ollama');
  });
});
