/**
 * Tests for OpenAICompatibleAdapter (Sprint 214 Task 214-014)
 *
 * Covers:
 *   - send() round-trip via fetch mock: URL, body, Bearer auth, response parse
 *   - isAvailable() reflects apiKey env var (set vs unset)
 *   - DeepSeek/Qwen/GLM preset shapes (baseURL + apiKeyEnv)
 *   - Error path: non-2xx throws ProviderError; missing key throws
 *   - Unsupported model throws ProviderError
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  OpenAICompatibleAdapter,
  OPENAI_COMPAT_PRESETS,
  type ChatMessage,
} from '../../src/providers/openai-compatible.js';
import { ProviderError } from '../../src/core/provider.js';

interface CapturedRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: string;
}

function mockFetchOk(
  responseBody: unknown,
  captured: CapturedRequest[] = [],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: typeof input === 'string' ? input : (input as URL).toString(),
      method: init?.method,
      headers: extractHeaders(init?.headers),
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function mockFetchStatus(status: number, body = 'upstream error'): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

function extractHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return out;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h.map(([k, v]) => [k.toLowerCase(), v]));
  }
  return Object.fromEntries(
    Object.entries(h as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

function makeAdapter(fetchImpl: typeof fetch): OpenAICompatibleAdapter {
  return new OpenAICompatibleAdapter({
    name: 'test-provider',
    baseURL: 'https://api.example.com/v1',
    apiKeyEnv: 'TEST_PROVIDER_KEY',
    models: ['test-model-a', 'test-model-b'],
    fetchImpl,
  });
}

const MESSAGES: ChatMessage[] = [
  { role: 'user', content: 'Hello' },
];

describe('OpenAICompatibleAdapter.send', () => {
  const ORIGINAL_KEY = process.env['TEST_PROVIDER_KEY'];

  beforeEach(() => {
    process.env['TEST_PROVIDER_KEY'] = 'sk-test-123';
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env['TEST_PROVIDER_KEY'];
    } else {
      process.env['TEST_PROVIDER_KEY'] = ORIGINAL_KEY;
    }
  });

  it('round-trips a request through fetch with correct URL, body, and Bearer header', async () => {
    const captured: CapturedRequest[] = [];
    const fetchImpl = mockFetchOk(
      {
        model: 'test-model-a',
        choices: [{ message: { content: 'Hi there!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      captured,
    );
    const adapter = makeAdapter(fetchImpl);

    const result = await adapter.send(MESSAGES, 'test-model-a', { temperature: 0.5 });

    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.url).toBe('https://api.example.com/v1/chat/completions');
    expect(req.method).toBe('POST');
    expect(req.headers['authorization']).toBe('Bearer sk-test-123');
    expect(req.headers['content-type']).toBe('application/json');

    const parsedBody = JSON.parse(req.body);
    expect(parsedBody.model).toBe('test-model-a');
    expect(parsedBody.messages).toEqual(MESSAGES);
    expect(parsedBody.temperature).toBe(0.5);
    expect(parsedBody.stream).toBe(false);

    expect(result.content).toBe('Hi there!');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(result.model).toBe('test-model-a');
  });

  it('throws ProviderError when the apiKey env var is unset', async () => {
    delete process.env['TEST_PROVIDER_KEY'];
    const fetchImpl = mockFetchOk({ choices: [{ message: { content: '' } }] });
    const adapter = makeAdapter(fetchImpl);

    await expect(adapter.send(MESSAGES, 'test-model-a')).rejects.toThrow(ProviderError);
    await expect(adapter.send(MESSAGES, 'test-model-a')).rejects.toThrow(/TEST_PROVIDER_KEY/);
  });

  it('throws ProviderError on non-2xx upstream responses', async () => {
    const fetchImpl = mockFetchStatus(429, 'rate limited');
    const adapter = makeAdapter(fetchImpl);

    await expect(adapter.send(MESSAGES, 'test-model-a')).rejects.toThrow(/429/);
  });

  it('throws ProviderError for unsupported models', async () => {
    const fetchImpl = mockFetchOk({ choices: [{ message: { content: '' } }] });
    const adapter = makeAdapter(fetchImpl);

    await expect(adapter.send(MESSAGES, 'unknown-model')).rejects.toThrow(/Unsupported model/);
  });
});

describe('OpenAICompatibleAdapter.isAvailable', () => {
  const ORIGINAL_KEY = process.env['TEST_PROVIDER_KEY'];

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env['TEST_PROVIDER_KEY'];
    } else {
      process.env['TEST_PROVIDER_KEY'] = ORIGINAL_KEY;
    }
  });

  it('returns true when the apiKey env var is set', async () => {
    process.env['TEST_PROVIDER_KEY'] = 'sk-present';
    const adapter = makeAdapter(mockFetchOk({}));
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('returns false when the apiKey env var is unset', async () => {
    delete process.env['TEST_PROVIDER_KEY'];
    const adapter = makeAdapter(mockFetchOk({}));
    expect(await adapter.isAvailable()).toBe(false);
  });

  it('diagnoseAvailability() surfaces a hint when the key is missing', async () => {
    delete process.env['TEST_PROVIDER_KEY'];
    const adapter = makeAdapter(mockFetchOk({}));
    const d = await adapter.diagnoseAvailability();
    expect(d.available).toBe(false);
    expect(d.authStatus).toBe('missing');
    expect(d.hints.join(' ')).toMatch(/TEST_PROVIDER_KEY/);
  });
});

describe('OPENAI_COMPAT_PRESETS', () => {
  it('DeepSeek preset has the documented baseURL and apiKeyEnv', () => {
    const deepseek = OPENAI_COMPAT_PRESETS.deepseek();
    expect(deepseek.name).toBe('deepseek');
    expect(deepseek.baseURL).toBe('https://api.deepseek.com/v1');
    expect(deepseek.apiKeyEnv).toBe('DEEPSEEK_API_KEY');
    expect(deepseek.supportedModels.length).toBeGreaterThan(0);
  });

  it('Qwen (DashScope compat-mode) preset is wired correctly', () => {
    const qwen = OPENAI_COMPAT_PRESETS.qwen();
    expect(qwen.name).toBe('qwen');
    expect(qwen.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(qwen.apiKeyEnv).toBe('DASHSCOPE_API_KEY');
  });

  it('GLM (Zhipu) preset is wired correctly', () => {
    const glm = OPENAI_COMPAT_PRESETS.glm();
    expect(glm.name).toBe('zhipu');
    expect(glm.baseURL).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(glm.apiKeyEnv).toBe('ZHIPU_API_KEY');
  });
});

describe('OpenAICompatibleAdapter spawn-mode stubs', () => {
  it('spawn() throws — HTTP-only adapter', () => {
    const adapter = makeAdapter(mockFetchOk({}));
    expect(() => adapter.spawn('t1', 'test-model-a' as never, 'prompt')).toThrow(/HTTP-only/);
  });

  it('listWorkers() returns empty array', () => {
    const adapter = makeAdapter(mockFetchOk({}));
    expect(adapter.listWorkers()).toEqual([]);
  });
});
