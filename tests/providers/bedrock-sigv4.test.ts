/**
 * Tests for BedrockAdapter (F1-015/AS2-P4 first-slice)
 *
 * Covers:
 *   - sigv4Sign() with fixed inputs → known Authorization header components
 *   - parseBedrockResponse() with Anthropic response shape
 *   - BedrockAdapter.send() mock fetch → correct URL, SigV4 headers, response parse
 *   - BedrockAdapter.isAvailable() reflects AWS env vars
 *   - createBedrockAdapter() factory export
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sigv4Sign,
  parseBedrockResponse,
  BedrockAdapter,
  createBedrockAdapter,
  BEDROCK_MODEL_MAP,
  type BedrockMessage,
} from '../../src/providers/bedrock.js';
import { ProviderError } from '../../src/core/provider.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: string;
}

function extractHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => { out[k.toLowerCase()] = v; });
    return out;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries((h as [string, string][]).map(([k, v]) => [k.toLowerCase(), v]));
  }
  return Object.fromEntries(
    Object.entries(h as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

function mockFetchOk(responseBody: unknown, captured?: CapturedRequest[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (captured) {
      captured.push({
        url: typeof input === 'string' ? input : (input as URL).toString(),
        method: init?.method,
        headers: extractHeaders(init?.headers),
        body: typeof init?.body === 'string' ? init.body : '',
      });
    }
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function mockFetchError(status: number, body = 'error'): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

function makeAdapter(fetchImpl: typeof fetch): BedrockAdapter {
  return new BedrockAdapter({ fetchImpl });
}

// ─── AWS env helpers ─────────────────────────────────────────────────────────

function setAwsEnv(key: string, secret: string, region: string): void {
  process.env['AWS_ACCESS_KEY_ID'] = key;
  process.env['AWS_SECRET_ACCESS_KEY'] = secret;
  process.env['AWS_REGION'] = region;
}

function clearAwsEnv(): void {
  delete process.env['AWS_ACCESS_KEY_ID'];
  delete process.env['AWS_SECRET_ACCESS_KEY'];
  delete process.env['AWS_REGION'];
  delete process.env['AWS_DEFAULT_REGION'];
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sigv4Sign', () => {
  it('produces an Authorization header with correct algorithm, credential, signed-headers, and signature', () => {
    // Fixed inputs — reproducible across runs (no Date.now())
    const opts = {
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'bedrock-runtime',
      datetime: '20240101T120000Z',
      method: 'POST',
      path: '/model/anthropic.claude-3-5-sonnet-20241022-v2:0/invoke',
      body: '{"anthropic_version":"bedrock-2023-05-31","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}',
      host: 'bedrock-runtime.us-east-1.amazonaws.com',
    };

    const { authorization, amzDate, amzContentSha256 } = sigv4Sign(opts);

    // authorization must start with the algorithm
    expect(authorization).toMatch(/^AWS4-HMAC-SHA256 /);

    // Credential must contain access key and credential scope
    expect(authorization).toContain(`Credential=AKIDEXAMPLE/20240101/us-east-1/bedrock-runtime/aws4_request`);

    // SignedHeaders must include expected headers
    expect(authorization).toContain('SignedHeaders=');
    expect(authorization).toContain('content-type');
    expect(authorization).toContain('host');
    expect(authorization).toContain('x-amz-date');
    expect(authorization).toContain('x-amz-content-sha256');

    // Signature must be a 64-char hex string
    const sigMatch = authorization.match(/Signature=([0-9a-f]+)/);
    expect(sigMatch).not.toBeNull();
    expect(sigMatch![1]).toHaveLength(64);

    // amzDate matches input datetime
    expect(amzDate).toBe('20240101T120000Z');

    // amzContentSha256 is a 64-char hex hash of the body
    expect(amzContentSha256).toHaveLength(64);
    expect(amzContentSha256).toMatch(/^[0-9a-f]+$/);
  });

  it('produces a deterministic signature for fixed inputs', () => {
    const opts = {
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      service: 'bedrock-runtime',
      datetime: '20240101T120000Z',
      method: 'POST',
      path: '/model/anthropic.claude-3-5-sonnet-20241022-v2:0/invoke',
      body: '{"test":"deterministic"}',
      host: 'bedrock-runtime.us-east-1.amazonaws.com',
    };

    const result1 = sigv4Sign(opts);
    const result2 = sigv4Sign(opts);

    // Same inputs must produce identical signatures
    expect(result1.authorization).toBe(result2.authorization);
  });

  it('produces different signatures for different secret keys', () => {
    const base = {
      accessKeyId: 'AKIDEXAMPLE',
      region: 'us-east-1',
      service: 'bedrock-runtime',
      datetime: '20240101T120000Z',
      method: 'POST',
      path: '/model/anthropic.claude-3-5-sonnet-20241022-v2:0/invoke',
      body: '{"test":"keys"}',
      host: 'bedrock-runtime.us-east-1.amazonaws.com',
    };

    const r1 = sigv4Sign({ ...base, secretAccessKey: 'secret-key-A' });
    const r2 = sigv4Sign({ ...base, secretAccessKey: 'secret-key-B' });

    expect(r1.authorization).not.toBe(r2.authorization);
  });

  it('correctly encodes the credential scope with date from datetime', () => {
    const opts = {
      accessKeyId: 'TESTKEY123',
      secretAccessKey: 'test-secret',
      region: 'ap-southeast-1',
      service: 'bedrock-runtime',
      datetime: '20250315T090000Z',
      method: 'POST',
      path: '/model/anthropic.claude-3-5-haiku-20241022-v1:0/invoke',
      body: '{}',
      host: 'bedrock-runtime.ap-southeast-1.amazonaws.com',
    };

    const { authorization } = sigv4Sign(opts);

    // Date part (YYYYMMDD) must be derived from datetime
    expect(authorization).toContain('Credential=TESTKEY123/20250315/ap-southeast-1/bedrock-runtime/aws4_request');
  });
});

describe('parseBedrockResponse', () => {
  it('extracts text content from an Anthropic-on-Bedrock response', () => {
    const raw = {
      id: 'msg_01abc',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello from Bedrock!' }],
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const result = parseBedrockResponse(raw);

    expect(result.content).toBe('Hello from Bedrock!');
    expect(result.usage?.inputTokens).toBe(10);
    expect(result.usage?.outputTokens).toBe(5);
    expect(result.model).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
  });

  it('returns empty content when no text block present', () => {
    const raw = {
      content: [{ type: 'tool_use', id: 'x', name: 'calculator', input: {} }],
      usage: { input_tokens: 5, output_tokens: 2 },
    };

    const result = parseBedrockResponse(raw);
    expect(result.content).toBe('');
  });

  it('returns empty content and no usage when fields are absent', () => {
    const result = parseBedrockResponse({});
    expect(result.content).toBe('');
    expect(result.usage).toBeUndefined();
  });

  it('throws ProviderError for non-object response', () => {
    expect(() => parseBedrockResponse(null)).toThrow(ProviderError);
    expect(() => parseBedrockResponse('bad string')).toThrow(ProviderError);
  });

  it('accepts a JSON string and parses it', () => {
    const raw = JSON.stringify({
      content: [{ type: 'text', text: 'Parsed from string' }],
      usage: { input_tokens: 3, output_tokens: 7 },
    });
    const result = parseBedrockResponse(raw);
    expect(result.content).toBe('Parsed from string');
    expect(result.usage?.outputTokens).toBe(7);
  });
});

describe('BedrockAdapter.send', () => {
  let originalAccessKey: string | undefined;
  let originalSecretKey: string | undefined;
  let originalRegion: string | undefined;

  beforeEach(() => {
    originalAccessKey = process.env['AWS_ACCESS_KEY_ID'];
    originalSecretKey = process.env['AWS_SECRET_ACCESS_KEY'];
    originalRegion = process.env['AWS_REGION'];
    setAwsEnv('AKIDTEST', 'test-secret-key', 'us-east-1');
  });

  afterEach(() => {
    if (originalAccessKey === undefined) delete process.env['AWS_ACCESS_KEY_ID'];
    else process.env['AWS_ACCESS_KEY_ID'] = originalAccessKey;
    if (originalSecretKey === undefined) delete process.env['AWS_SECRET_ACCESS_KEY'];
    else process.env['AWS_SECRET_ACCESS_KEY'] = originalSecretKey;
    if (originalRegion === undefined) delete process.env['AWS_REGION'];
    else process.env['AWS_REGION'] = originalRegion;
  });

  const MESSAGES: BedrockMessage[] = [{ role: 'user', content: 'Hello Bedrock' }];

  it('sends a POST to the InvokeModel URL with SigV4 Authorization header', async () => {
    const captured: CapturedRequest[] = [];
    const responseBody = {
      content: [{ type: 'text', text: 'Hi from Bedrock!' }],
      usage: { input_tokens: 5, output_tokens: 4 },
    };
    const adapter = makeAdapter(mockFetchOk(responseBody, captured));

    const result = await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet');

    expect(captured).toHaveLength(1);
    const req = captured[0]!;

    // URL must target bedrock-runtime in the configured region
    expect(req.url).toContain('bedrock-runtime.us-east-1.amazonaws.com');
    expect(req.url).toContain('/model/');
    expect(req.url).toContain('/invoke');

    // Authorization header must be AWS4-HMAC-SHA256
    expect(req.headers['authorization']).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(req.headers['authorization']).toContain('Credential=AKIDTEST/');

    // SigV4 required headers must be present
    expect(req.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(req.headers['x-amz-content-sha256']).toHaveLength(64);

    // Response must be parsed correctly
    expect(result.content).toBe('Hi from Bedrock!');
    expect(result.usage?.inputTokens).toBe(5);
    expect(result.usage?.outputTokens).toBe(4);
  });

  it('request body includes anthropic_version and messages', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = makeAdapter(mockFetchOk({ content: [{ type: 'text', text: 'ok' }] }, captured));

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-haiku');

    const body = JSON.parse(captured[0]!.body) as Record<string, unknown>;
    expect(body['anthropic_version']).toBe('bedrock-2023-05-31');
    expect(Array.isArray(body['messages'])).toBe(true);
    expect((body['messages'] as unknown[]).length).toBe(1);
    expect(body['max_tokens']).toBeGreaterThan(0);
  });

  it('throws ProviderError on non-2xx response', async () => {
    const adapter = makeAdapter(mockFetchError(400, '{"error":"bad request"}'));
    await expect(adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet')).rejects.toThrow(ProviderError);
  });

  it('throws ProviderError for unsupported model', async () => {
    const adapter = makeAdapter(mockFetchOk({}));
    await expect(adapter.send(MESSAGES, 'nonexistent-model')).rejects.toThrow(ProviderError);
  });

  it('throws ProviderError when AWS credentials are missing', async () => {
    clearAwsEnv();
    const adapter = makeAdapter(mockFetchOk({}));
    await expect(adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet')).rejects.toThrow(ProviderError);
  });

  it('includes system prompt in body when provided', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = makeAdapter(mockFetchOk({ content: [{ type: 'text', text: 'ok' }] }, captured));

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet', { system: 'You are helpful.' });

    const body = JSON.parse(captured[0]!.body) as Record<string, unknown>;
    expect(body['system']).toBe('You are helpful.');
  });
});

describe('BedrockAdapter.isAvailable', () => {
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = {
      access: process.env['AWS_ACCESS_KEY_ID'],
      secret: process.env['AWS_SECRET_ACCESS_KEY'],
      region: process.env['AWS_REGION'],
    };
  });

  afterEach(() => {
    if (saved['access'] === undefined) delete process.env['AWS_ACCESS_KEY_ID'];
    else process.env['AWS_ACCESS_KEY_ID'] = saved['access'];
    if (saved['secret'] === undefined) delete process.env['AWS_SECRET_ACCESS_KEY'];
    else process.env['AWS_SECRET_ACCESS_KEY'] = saved['secret'];
    if (saved['region'] === undefined) delete process.env['AWS_REGION'];
    else process.env['AWS_REGION'] = saved['region'];
    delete process.env['AWS_DEFAULT_REGION'];
  });

  it('returns true when all three AWS env vars are set', async () => {
    setAwsEnv('key', 'secret', 'us-east-1');
    const adapter = new BedrockAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });

  it('returns false when ACCESS_KEY_ID is missing', async () => {
    delete process.env['AWS_ACCESS_KEY_ID'];
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret';
    process.env['AWS_REGION'] = 'us-east-1';
    const adapter = new BedrockAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it('returns false when SECRET_ACCESS_KEY is missing', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'key';
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    process.env['AWS_REGION'] = 'us-east-1';
    const adapter = new BedrockAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it('returns false when region is missing', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'key';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret';
    delete process.env['AWS_REGION'];
    delete process.env['AWS_DEFAULT_REGION'];
    const adapter = new BedrockAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(false);
  });

  it('accepts AWS_DEFAULT_REGION as a fallback for region', async () => {
    process.env['AWS_ACCESS_KEY_ID'] = 'key';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret';
    delete process.env['AWS_REGION'];
    process.env['AWS_DEFAULT_REGION'] = 'eu-west-1';
    const adapter = new BedrockAdapter();
    await expect(adapter.isAvailable()).resolves.toBe(true);
  });
});

describe('BedrockAdapter model map', () => {
  it('BEDROCK_MODEL_MAP contains expected internal IDs', () => {
    expect(BEDROCK_MODEL_MAP['bedrock-claude-3-5-sonnet']).toBeDefined();
    expect(BEDROCK_MODEL_MAP['bedrock-claude-3-5-haiku']).toBeDefined();
    expect(BEDROCK_MODEL_MAP['bedrock-claude-opus-4']).toBeDefined();
  });

  it('all entries have required fields', () => {
    for (const [id, entry] of Object.entries(BEDROCK_MODEL_MAP)) {
      expect(entry.bedrockId, `${id}.bedrockId`).toBeTruthy();
      expect(entry.anthropicVersion, `${id}.anthropicVersion`).toBeTruthy();
      expect(entry.defaultMaxTokens, `${id}.defaultMaxTokens`).toBeGreaterThan(0);
      // Internal IDs must start with "bedrock-"
      expect(id).toMatch(/^bedrock-/);
      // Bedrock IDs should contain "anthropic."
      expect(entry.bedrockId).toContain('anthropic.');
    }
  });

  it('adapter supportedModels lists all map keys', () => {
    const adapter = new BedrockAdapter();
    const mapKeys = Object.keys(BEDROCK_MODEL_MAP).sort();
    const adapterModels = [...adapter.supportedModels].sort();
    expect(adapterModels).toEqual(mapKeys);
  });
});

describe('BedrockAdapter spawn/kill/listWorkers stubs', () => {
  it('spawn throws ProviderError', () => {
    const adapter = new BedrockAdapter();
    expect(() => adapter.spawn('t-001', 'bedrock-claude-3-5-sonnet' as never, 'prompt')).toThrow(ProviderError);
  });

  it('kill is a no-op', () => {
    const adapter = new BedrockAdapter();
    expect(() => adapter.kill('t-001')).not.toThrow();
  });

  it('listWorkers returns empty array', () => {
    const adapter = new BedrockAdapter();
    expect(adapter.listWorkers()).toEqual([]);
  });
});

describe('createBedrockAdapter', () => {
  it('returns a BedrockAdapter', () => {
    const adapter = createBedrockAdapter('/tmp/test-root');
    expect(adapter).toBeInstanceOf(BedrockAdapter);
    expect(adapter.name).toBe('bedrock');
  });
});
