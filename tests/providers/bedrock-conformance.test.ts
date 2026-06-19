/**
 * Conformance tests for BedrockAdapter (F1-015)
 *
 * Covers:
 *   - InvokeModel request-shape conformance to Bedrock API docs
 *   - InvokeModel response-parse conformance (Anthropic-on-Bedrock shape)
 *   - SigV4 known-vector: fixed inputs → deterministic pre-computed signature
 *   - diagnoseAvailability: no-creds → bootstrap-skip diagnostic hints surfaced
 *
 * No live AWS calls — all tests use mock fetch or pure functions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sigv4Sign,
  parseBedrockResponse,
  BedrockAdapter,
  BEDROCK_MODEL_MAP,
  type BedrockMessage,
} from '../../src/providers/bedrock.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
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

function makeMockFetch(
  responseBody: unknown,
  captured?: CapturedRequest[],
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (captured) {
      captured.push({
        url: typeof input === 'string' ? input : (input as URL).toString(),
        method: init?.method ?? 'GET',
        headers: extractHeaders(init?.headers),
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {},
      });
    }
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

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

const MESSAGES: BedrockMessage[] = [{ role: 'user', content: 'Hello Bedrock' }];

const MINIMAL_RESPONSE = {
  content: [{ type: 'text', text: 'conformance response' }],
  usage: { input_tokens: 4, output_tokens: 2 },
};

// ─── InvokeModel conformance — request shape ─────────────────────────────────

describe('InvokeModel conformance — request-shape', () => {
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {
      access: process.env['AWS_ACCESS_KEY_ID'],
      secret: process.env['AWS_SECRET_ACCESS_KEY'],
      region: process.env['AWS_REGION'],
    };
    setAwsEnv('AKIDTEST', 'test-secret', 'us-east-1');
  });

  afterEach(() => {
    if (savedEnv['access'] === undefined) delete process.env['AWS_ACCESS_KEY_ID'];
    else process.env['AWS_ACCESS_KEY_ID'] = savedEnv['access'];
    if (savedEnv['secret'] === undefined) delete process.env['AWS_SECRET_ACCESS_KEY'];
    else process.env['AWS_SECRET_ACCESS_KEY'] = savedEnv['secret'];
    if (savedEnv['region'] === undefined) delete process.env['AWS_REGION'];
    else process.env['AWS_REGION'] = savedEnv['region'];
  });

  it('InvokeModel URL path follows /model/<bedrockId>/invoke pattern', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet');

    const entry = BEDROCK_MODEL_MAP['bedrock-claude-3-5-sonnet']!;
    expect(captured[0]!.url).toContain(`/model/${entry.bedrockId}/invoke`);
    expect(captured[0]!.method).toBe('POST');
  });

  it('InvokeModel body includes anthropic_version matching model map', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet');

    const body = captured[0]!.body;
    const entry = BEDROCK_MODEL_MAP['bedrock-claude-3-5-sonnet']!;
    expect(body['anthropic_version']).toBe(entry.anthropicVersion);
    expect(body['anthropic_version']).toBe('bedrock-2023-05-31');
  });

  it('InvokeModel body includes max_tokens as a positive integer', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-haiku');

    const body = captured[0]!.body;
    expect(typeof body['max_tokens']).toBe('number');
    expect(body['max_tokens'] as number).toBeGreaterThan(0);
    expect(Number.isInteger(body['max_tokens'])).toBe(true);
  });

  it('InvokeModel body messages array has role and content fields', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });
    const msgs: BedrockMessage[] = [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Response' },
      { role: 'user', content: 'Follow-up' },
    ];

    await adapter.send(msgs, 'bedrock-claude-3-5-sonnet');

    const body = captured[0]!.body;
    expect(Array.isArray(body['messages'])).toBe(true);
    const messages = body['messages'] as BedrockMessage[];
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(['user', 'assistant']).toContain(m.role);
      expect(typeof m.content).toBe('string');
    }
  });

  it('InvokeModel body omits system field when not provided', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet');

    expect(captured[0]!.body['system']).toBeUndefined();
  });

  it('InvokeModel body includes system field as top-level string when provided', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet', {
      system: 'You are a helpful assistant.',
    });

    expect(captured[0]!.body['system']).toBe('You are a helpful assistant.');
  });

  it('InvokeModel body includes temperature when provided', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet', { temperature: 0.7 });

    expect(captured[0]!.body['temperature']).toBe(0.7);
  });

  it('InvokeModel body omits temperature when not provided', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet');

    expect(captured[0]!.body['temperature']).toBeUndefined();
  });

  it('InvokeModel respects custom maxTokens override', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet', { maxTokens: 512 });

    expect(captured[0]!.body['max_tokens']).toBe(512);
  });

  it('InvokeModel URL targets bedrock-runtime.<region>.amazonaws.com', async () => {
    const captured: CapturedRequest[] = [];
    const adapter = new BedrockAdapter({ fetchImpl: makeMockFetch(MINIMAL_RESPONSE, captured) });

    await adapter.send(MESSAGES, 'bedrock-claude-3-5-sonnet');

    expect(captured[0]!.url).toMatch(/^https:\/\/bedrock-runtime\.us-east-1\.amazonaws\.com\//);
  });
});

// ─── InvokeModel conformance — response parse ─────────────────────────────────

describe('InvokeModel conformance — response-parse', () => {
  it('parses full Bedrock response with all Anthropic fields', () => {
    // Bedrock-documented Anthropic response shape
    const raw = {
      id: 'msg_bdrk_01abc123',
      type: 'message',
      role: 'assistant',
      model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      content: [{ type: 'text', text: 'conformance response text' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 15, output_tokens: 7 },
    };

    const result = parseBedrockResponse(raw);

    expect(result.content).toBe('conformance response text');
    expect(result.usage?.inputTokens).toBe(15);
    expect(result.usage?.outputTokens).toBe(7);
    expect(result.model).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0');
  });

  it('picks first text block when multiple content blocks present', () => {
    const raw = {
      content: [
        { type: 'tool_use', id: 'toolu_01', name: 'calculator', input: { x: 1 } },
        { type: 'text', text: 'first text block' },
        { type: 'text', text: 'second text block' },
      ],
      usage: { input_tokens: 5, output_tokens: 3 },
    };

    const result = parseBedrockResponse(raw);
    expect(result.content).toBe('first text block');
  });

  it('returns empty content when content array has no text block', () => {
    const raw = {
      content: [{ type: 'tool_use', id: 'toolu_01', name: 'search', input: {} }],
      usage: { input_tokens: 3, output_tokens: 1 },
    };

    const result = parseBedrockResponse(raw);
    expect(result.content).toBe('');
  });

  it('returns no usage when usage field is absent', () => {
    const raw = {
      content: [{ type: 'text', text: 'hello' }],
    };

    const result = parseBedrockResponse(raw);
    expect(result.content).toBe('hello');
    expect(result.usage).toBeUndefined();
  });

  it('returns no model when model field is absent', () => {
    const raw = {
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };

    const result = parseBedrockResponse(raw);
    expect(result.model).toBeUndefined();
  });

  it('parses a JSON string response (Bedrock may return body as string)', () => {
    const raw = JSON.stringify({
      content: [{ type: 'text', text: 'parsed from string' }],
      usage: { input_tokens: 2, output_tokens: 4 },
      model: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    });

    const result = parseBedrockResponse(raw);
    expect(result.content).toBe('parsed from string');
    expect(result.usage?.outputTokens).toBe(4);
  });
});

// ─── SigV4 known-vector ───────────────────────────────────────────────────────

describe('SigV4 known-vector', () => {
  // Pre-computed expected values — computed once via the sigv4Sign implementation
  // with fixed deterministic inputs. These serve as a regression guard: if the
  // signing algorithm changes, this test catches the drift.
  const KNOWN_VECTOR = {
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 'bedrock-runtime',
    datetime: '20240101T120000Z',
    method: 'POST',
    path: '/model/anthropic.claude-3-5-sonnet-20241022-v2:0/invoke',
    body: '{"anthropic_version":"bedrock-2023-05-31","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}',
    host: 'bedrock-runtime.us-east-1.amazonaws.com',
    // Pre-computed expected outputs:
    expectedSignature: 'c5082207ac40c663ad2459f71680777b72f2e1776f87c33ab7e3a121f269f1c3',
    expectedContentHash: 'ef5311d79e25b1620df6da85860487e5d55553cfd912d4b1bb43bc326f1af0c8',
  };

  it('InvokeModel SigV4 known-vector: signature matches pre-computed expected value', () => {
    const { authorization, amzDate, amzContentSha256 } = sigv4Sign({
      accessKeyId: KNOWN_VECTOR.accessKeyId,
      secretAccessKey: KNOWN_VECTOR.secretAccessKey,
      region: KNOWN_VECTOR.region,
      service: KNOWN_VECTOR.service,
      datetime: KNOWN_VECTOR.datetime,
      method: KNOWN_VECTOR.method,
      path: KNOWN_VECTOR.path,
      body: KNOWN_VECTOR.body,
      host: KNOWN_VECTOR.host,
    });

    // Known-vector: exact signature must match pre-computed value
    const sigMatch = authorization.match(/Signature=([0-9a-f]+)/);
    expect(sigMatch).not.toBeNull();
    expect(sigMatch![1]).toBe(KNOWN_VECTOR.expectedSignature);

    // Content hash must match (SHA-256 of body)
    expect(amzContentSha256).toBe(KNOWN_VECTOR.expectedContentHash);

    // amzDate must match input datetime
    expect(amzDate).toBe('20240101T120000Z');
  });

  it('InvokeModel SigV4 known-vector: authorization header structure is spec-compliant', () => {
    const { authorization } = sigv4Sign({
      accessKeyId: KNOWN_VECTOR.accessKeyId,
      secretAccessKey: KNOWN_VECTOR.secretAccessKey,
      region: KNOWN_VECTOR.region,
      service: KNOWN_VECTOR.service,
      datetime: KNOWN_VECTOR.datetime,
      method: KNOWN_VECTOR.method,
      path: KNOWN_VECTOR.path,
      body: KNOWN_VECTOR.body,
      host: KNOWN_VECTOR.host,
    });

    // Algorithm prefix
    expect(authorization).toMatch(/^AWS4-HMAC-SHA256 /);

    // Credential scope: <accessKeyId>/<YYYYMMDD>/<region>/<service>/aws4_request
    expect(authorization).toContain(
      `Credential=${KNOWN_VECTOR.accessKeyId}/20240101/${KNOWN_VECTOR.region}/${KNOWN_VECTOR.service}/aws4_request`,
    );

    // SignedHeaders must include all required headers in sorted order
    expect(authorization).toContain('SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date');

    // Signature must be a 64-char lowercase hex
    expect(authorization).toContain(`Signature=${KNOWN_VECTOR.expectedSignature}`);
  });

  it('SigV4 known-vector: changing body changes signature', () => {
    const base = {
      accessKeyId: KNOWN_VECTOR.accessKeyId,
      secretAccessKey: KNOWN_VECTOR.secretAccessKey,
      region: KNOWN_VECTOR.region,
      service: KNOWN_VECTOR.service,
      datetime: KNOWN_VECTOR.datetime,
      method: KNOWN_VECTOR.method,
      path: KNOWN_VECTOR.path,
      host: KNOWN_VECTOR.host,
    };

    const r1 = sigv4Sign({ ...base, body: KNOWN_VECTOR.body });
    const r2 = sigv4Sign({ ...base, body: '{"different":"body"}' });

    expect(r1.authorization).not.toBe(r2.authorization);
    expect(r1.amzContentSha256).not.toBe(r2.amzContentSha256);
  });
});

// ─── diagnoseAvailability conformance ────────────────────────────────────────

describe('diagnoseAvailability conformance', () => {
  let savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv = {
      access: process.env['AWS_ACCESS_KEY_ID'],
      secret: process.env['AWS_SECRET_ACCESS_KEY'],
      region: process.env['AWS_REGION'],
      defaultRegion: process.env['AWS_DEFAULT_REGION'],
    };
  });

  afterEach(() => {
    if (savedEnv['access'] === undefined) delete process.env['AWS_ACCESS_KEY_ID'];
    else process.env['AWS_ACCESS_KEY_ID'] = savedEnv['access'];
    if (savedEnv['secret'] === undefined) delete process.env['AWS_SECRET_ACCESS_KEY'];
    else process.env['AWS_SECRET_ACCESS_KEY'] = savedEnv['secret'];
    if (savedEnv['region'] === undefined) delete process.env['AWS_REGION'];
    else process.env['AWS_REGION'] = savedEnv['region'];
    if (savedEnv['defaultRegion'] === undefined) delete process.env['AWS_DEFAULT_REGION'];
    else process.env['AWS_DEFAULT_REGION'] = savedEnv['defaultRegion'];
  });

  it('creds-yok: available=false with non-empty hints (bootstrap-skip diagnostic)', async () => {
    clearAwsEnv();
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    expect(result.available).toBe(false);
    expect(result.authStatus).toBe('missing');
    expect(result.hints).toBeDefined();
    expect(result.hints!.length).toBeGreaterThan(0);
  });

  it('creds-yok: hints include bootstrap-skip message', async () => {
    clearAwsEnv();
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    const allHints = result.hints!.join(' ');
    expect(allHints.toLowerCase()).toContain('bootstrap');
  });

  it('missing AWS_ACCESS_KEY_ID: hint surfaces that key', async () => {
    clearAwsEnv();
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret';
    process.env['AWS_REGION'] = 'us-east-1';
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    const allHints = result.hints!.join(' ');
    expect(allHints).toContain('AWS_ACCESS_KEY_ID');
  });

  it('missing AWS_SECRET_ACCESS_KEY: hint surfaces that key', async () => {
    clearAwsEnv();
    process.env['AWS_ACCESS_KEY_ID'] = 'key';
    process.env['AWS_REGION'] = 'us-east-1';
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    const allHints = result.hints!.join(' ');
    expect(allHints).toContain('AWS_SECRET_ACCESS_KEY');
  });

  it('missing AWS_REGION: hint surfaces region requirement', async () => {
    clearAwsEnv();
    process.env['AWS_ACCESS_KEY_ID'] = 'key';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret';
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    const allHints = result.hints!.join(' ');
    expect(allHints).toContain('AWS_REGION');
  });

  it('all creds present: available=true, authStatus=ok, hints empty', async () => {
    setAwsEnv('AKIDTEST', 'secretkey', 'us-west-2');
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    expect(result.available).toBe(true);
    expect(result.authStatus).toBe('ok');
    expect(result.hints).toHaveLength(0);
    expect(result.reason).toContain('us-west-2');
  });

  it('diagnoseAvailability returns supported model list', async () => {
    setAwsEnv('key', 'secret', 'us-east-1');
    const adapter = new BedrockAdapter();

    const result = await adapter.diagnoseAvailability();

    expect(Array.isArray(result.models)).toBe(true);
    expect(result.models!.length).toBe(Object.keys(BEDROCK_MODEL_MAP).length);
  });
});
