/**
 * Contract tests for OpenRouterProvider (Sprint 360 Task 360-006).
 *
 * goCriteria: fake-fetch send() round-trip + usage-map + error-path + single-retry;
 * secret NEVER plain-written to process.env (test: process.env stays clean);
 * `tsc` clean.
 *
 * Fully hermetic: `fetchImpl` is injected (zero network), `loadSecretsImpl` is
 * injected (zero disk I/O — `.deck` is never read from), and `process.env` is
 * snapshotted/restored around every test so this suite leaves zero global state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider, createOpenRouterAdapter } from '../../src/providers/openrouter.js';
import { ProviderError } from '../../src/core/provider.js';

const OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';
const DECKENT_OPENROUTER_API_KEY_ENV = 'DECKENT_OPENROUTER_API_KEY';

// ─── Helpers ─────────────────────────────────────────────────────────

function fakeSecrets(key: string | undefined): (projectRoot: string) => Record<string, string> {
  return () => (key ? { [OPENROUTER_API_KEY_ENV]: key } : {});
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeProvider(overrides: Parameters<typeof createOpenRouterAdapter>[1] = {}) {
  return createOpenRouterAdapter('/fake/project', {
    loadSecretsImpl: fakeSecrets('test-key-abc123'),
    ...overrides,
  });
}

// Every env var these tests could theoretically touch — snapshot + restore.
const TOUCHED_ENV = [OPENROUTER_API_KEY_ENV, DECKENT_OPENROUTER_API_KEY_ENV];
let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
  envSnapshot = {};
  for (const key of TOUCHED_ENV) envSnapshot[key] = process.env[key];
});

afterEach(() => {
  for (const key of TOUCHED_ENV) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
  vi.restoreAllMocks();
});

// ─── send() round-trip + usage-map (goNogo) ───────────────────────────

describe('OpenRouterProvider.send()', () => {
  it('POSTs /chat/completions and maps a real OpenRouter response (content + usage + model)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'gen-1718000000-abcdef',
        model: 'openai/o3-mini',
        choices: [{ message: { role: 'assistant', content: 'The answer is 42.' } }],
        usage: {
          prompt_tokens: 1024,
          completion_tokens: 512,
          total_tokens: 1536,
          prompt_tokens_details: { cached_tokens: 256 },
          completion_tokens_details: { reasoning_tokens: 128 },
        },
      }),
    );
    const provider = makeProvider({ fetchImpl });

    const result = await provider.send(
      [{ role: 'user', content: 'What is 6*7?' }],
      'openai/o3-mini',
    );

    expect(result.content).toBe('The answer is 42.');
    expect(result.model).toBe('openai/o3-mini');
    expect(result.usage).toEqual({ inputTokens: 1024, outputTokens: 512 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer test-key-abc123');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('openai/o3-mini');
    expect(body.stream).toBe(false);
  });

  it('honors a config-overridden baseURL (trailing slash stripped)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = makeProvider({ fetchImpl, baseURL: 'https://custom.gateway.example/v9/' });

    await provider.send([{ role: 'user', content: 'hi' }], 'anthropic/claude-3.7-sonnet');

    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://custom.gateway.example/v9/chat/completions');
  });

  it('surfaces tool_calls when the model requests tools', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } },
              ],
            },
          },
        ],
      }),
    );
    const provider = makeProvider({ fetchImpl });

    const result = await provider.send(
      [{ role: 'user', content: 'read a.ts' }],
      'openai/gpt-4o',
      { tools: [{ type: 'function', function: { name: 'read_file' } }] },
    );

    expect(result.toolCalls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } },
    ]);
  });

  it('rejects a blank model id without ever calling fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = makeProvider({ fetchImpl });

    await expect(provider.send([{ role: 'user', content: 'hi' }], '')).rejects.toThrow(ProviderError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ─── Error path (hata-yolu, goNogo) ────────────────────────────────────

describe('OpenRouterProvider error path', () => {
  it('throws honestly (no silent-empty) when the deck secret is missing — never calls fetch', async () => {
    const fetchImpl = vi.fn();
    const provider = makeProvider({ fetchImpl, loadSecretsImpl: fakeSecrets(undefined) });

    await expect(provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o')).rejects.toThrow(
      /OPENROUTER_API_KEY/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws with the real status + body on a 4xx — no retry (client error)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { message: 'invalid api key' } }));
    const provider = makeProvider({ fetchImpl });

    await expect(
      provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o'),
    ).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never resolves to an empty/undefined result on failure — always throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const provider = makeProvider({ fetchImpl });

    await expect(provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o')).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

// ─── Single retry (retry-tek, goNogo) ─────────────────────────────────

describe('OpenRouterProvider single-retry', () => {
  it('retries exactly once on a network error, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'recovered' } }] }));
    const provider = makeProvider({ fetchImpl });

    const result = await provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o');

    expect(result.content).toBe('recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries exactly once on a network error, then throws honestly if it fails again', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    const provider = makeProvider({ fetchImpl });

    await expect(provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o')).rejects.toThrow(
      /ECONNRESET/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 1 initial + 1 retry, never more
  });

  it('retries exactly once on a transient 5xx, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: 'upstream overloaded' }))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'ok now' } }] }));
    const provider = makeProvider({ fetchImpl });

    const result = await provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o');

    expect(result.content).toBe('ok now');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries exactly once on a transient 5xx, then throws with the real status if it fails again', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'still down' }));
    const provider = makeProvider({ fetchImpl });

    await expect(provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o')).rejects.toThrow(/500/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// ─── extractUsage() — TaskResult tokenUsage shape ─────────────────────

describe('OpenRouterProvider.extractUsage()', () => {
  it('maps a real OpenRouter usage block into the normalized TokenUsage shape', () => {
    const provider = makeProvider();
    const raw = JSON.stringify({
      model: 'openai/o3-mini',
      choices: [{ message: { content: 'hi' } }],
      usage: {
        prompt_tokens: 1024,
        completion_tokens: 512,
        total_tokens: 1536,
        prompt_tokens_details: { cached_tokens: 256 },
        completion_tokens_details: { reasoning_tokens: 128 },
      },
    });

    expect(provider.extractUsage(raw)).toEqual({
      inputTokens: 1024,
      outputTokens: 512,
      cacheReadTokens: 256,
      cacheCreationTokens: 0,
      reasoningTokens: 128,
      totalTokens: 1536,
      source: 'provider-adapter',
    });
  });

  it('falls back to inputTokens + outputTokens when total_tokens is absent', () => {
    const provider = makeProvider();
    const raw = JSON.stringify({ usage: { prompt_tokens: 30, completion_tokens: 12 } });
    expect(provider.extractUsage(raw)?.totalTokens).toBe(42);
  });

  it('returns null for no usage, empty usage, or malformed input', () => {
    const provider = makeProvider();
    expect(provider.extractUsage(JSON.stringify({ choices: [] }))).toBeNull();
    expect(provider.extractUsage(JSON.stringify({ usage: {} }))).toBeNull();
    expect(provider.extractUsage('not json')).toBeNull();
    expect(provider.extractUsage('')).toBeNull();
  });
});

// ─── Secret never plain-written to env (goNogo) ────────────────────────

describe('OpenRouterProvider — no plain-env secret write', () => {
  it('never assigns the resolved key to process.env, across success, retry, and error paths', async () => {
    delete process.env[OPENROUTER_API_KEY_ENV];
    delete process.env[DECKENT_OPENROUTER_API_KEY_ENV];

    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'nope' }));
    const provider = makeProvider({ fetchImpl, loadSecretsImpl: fakeSecrets('super-secret-value') });

    await provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o'); // success w/ 1 retry
    await provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o').catch(() => undefined); // 401

    expect(process.env[OPENROUTER_API_KEY_ENV]).toBeUndefined();
    expect(process.env[DECKENT_OPENROUTER_API_KEY_ENV]).toBeUndefined();
  });

  it('isAvailable()/diagnoseAvailability() resolve the key without ever touching process.env', async () => {
    delete process.env[OPENROUTER_API_KEY_ENV];
    const provider = makeProvider({ loadSecretsImpl: fakeSecrets('another-secret') });

    await expect(provider.isAvailable()).resolves.toBe(true);
    const detail = await provider.diagnoseAvailability();
    expect(detail.available).toBe(true);

    expect(process.env[OPENROUTER_API_KEY_ENV]).toBeUndefined();
  });

  it('isAvailable() is false (never throws) when the deck secret is absent', async () => {
    const provider = makeProvider({ loadSecretsImpl: fakeSecrets(undefined) });
    await expect(provider.isAvailable()).resolves.toBe(false);
    const detail = await provider.diagnoseAvailability();
    expect(detail.available).toBe(false);
    expect(detail.authStatus).toBe('missing');
  });

  it('resolves DECKENT_OPENROUTER_API_KEY as a fallback when the bare key is absent ($DECK: dual-lookup parity)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }));
    const provider = makeProvider({
      fetchImpl,
      loadSecretsImpl: () => ({ DECKENT_OPENROUTER_API_KEY: 'prefixed-secret' }),
    });

    await provider.send([{ role: 'user', content: 'hi' }], 'openai/gpt-4o');

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.headers['Authorization']).toBe('Bearer prefixed-secret');
  });
});

// ─── Interface shape sanity (ProviderAdapter contract) ─────────────────

describe('OpenRouterProvider — ProviderAdapter contract shape', () => {
  it('exposes the required ProviderAdapter surface', () => {
    const provider = makeProvider();
    expect(provider.name).toBe('openrouter');
    expect(Array.isArray(provider.supportedModels)).toBe(true);
    expect(provider.supportedModels.length).toBeGreaterThan(0);
    expect(typeof provider.spawn).toBe('function');
    expect(typeof provider.kill).toBe('function');
    expect(typeof provider.listWorkers).toBe('function');
    expect(typeof provider.buildCommand).toBe('function');
    expect(typeof provider.buildPlannerInvocation).toBe('function');
    expect(provider.listWorkers()).toEqual([]);
    expect(provider.buildCommand('anthropic/claude-3.7-sonnet' as never, '/tmp/prompt.txt')).toMatch(
      /openrouter/,
    );
  });

  it('executes planner calls as single-attempt http + in-process requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      model: 'anthropic/claude-3.7-sonnet',
      choices: [{ message: { content: '{"tasks":[],"reasoning":"proof"}' } }],
    }));
    const provider = makeProvider({ fetchImpl });
    const invocation = provider.buildPlannerInvocation(
      'plan this repository',
      'anthropic/claude-3.7-sonnet',
    );

    expect(invocation).toMatchObject({
      calledProvider: 'openrouter',
      calledModel: 'anthropic/claude-3.7-sonnet',
      transport: 'http',
      executionBackend: 'in-process',
    });
    const outcome = await invocation.execute({ timeoutMs: 1234 });
    expect(outcome).toMatchObject({
      status: 0,
      stdout: '{"tasks":[],"reasoning":"proof"}',
    });
    expect(outcome).not.toHaveProperty('usage');
    expect(outcome).not.toHaveProperty('usageEnvelopeDigestRef');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body).toMatchObject({
      model: 'anthropic/claude-3.7-sonnet',
      messages: [{ role: 'user', content: 'plan this repository' }],
    });
  });

  it('carries rich provider usage and an opaque deterministic envelope digest', async () => {
    const usage = {
      prompt_tokens: 1024,
      completion_tokens: 512,
      total_tokens: 1536,
      prompt_tokens_details: { cached_tokens: 256 },
      completion_tokens_details: { reasoning_tokens: 128 },
    };
    const response = (completionTokens = 512) => jsonResponse(200, {
      model: 'anthropic/claude-3.7-sonnet',
      choices: [{ message: { content: '{"tasks":[],"reasoning":"proof"}' } }],
      usage: { ...usage, completion_tokens: completionTokens },
    });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(513));
    const provider = makeProvider({ fetchImpl });

    const first = await provider.buildPlannerInvocation(
      'plan this repository', 'anthropic/claude-3.7-sonnet',
    ).execute({ timeoutMs: 1234 });
    const replay = await provider.buildPlannerInvocation(
      'plan this repository', 'anthropic/claude-3.7-sonnet',
    ).execute({ timeoutMs: 1234 });
    const changed = await provider.buildPlannerInvocation(
      'plan this repository', 'anthropic/claude-3.7-sonnet',
    ).execute({ timeoutMs: 1234 });

    expect(first.usage).toEqual({
      inputTokens: 1024,
      outputTokens: 512,
      cacheReadTokens: 256,
      cacheCreationTokens: 0,
      reasoningTokens: 128,
      totalTokens: 1536,
      source: 'provider-adapter',
    });
    expect(first.usageEnvelopeDigestRef).toMatch(/^provider-usage-envelope:[a-f0-9]{64}$/u);
    // This is deliberately a value digest, not unique call evidence or a settlement key.
    expect(replay.usageEnvelopeDigestRef).toBe(first.usageEnvelopeDigestRef);
    expect(changed.usageEnvelopeDigestRef).not.toBe(first.usageEnvelopeDigestRef);
    expect(first.usageEnvelopeDigestRef).not.toContain('plan this repository');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ prompt_tokens: 100 }],
    [{ completion_tokens: 50 }],
    [{ prompt_tokens: 100, completion_tokens: '50' }],
    [{ prompt_tokens: -1, completion_tokens: 50 }],
  ])('keeps partial or malformed provider usage unknown: %j', async (usage) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      model: 'anthropic/claude-3.7-sonnet',
      choices: [{ message: { content: '{"tasks":[],"reasoning":"proof"}' } }],
      usage,
    }));
    const provider = makeProvider({ fetchImpl });

    const outcome = await provider.buildPlannerInvocation(
      'plan this repository', 'anthropic/claude-3.7-sonnet',
    ).execute({ timeoutMs: 1234 });

    expect(outcome).not.toHaveProperty('usage');
    expect(outcome).not.toHaveProperty('usageEnvelopeDigestRef');
  });

  it('does not retry an ambiguous planner network failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ambiguous transport failure'));
    const provider = makeProvider({ fetchImpl });
    const invocation = provider.buildPlannerInvocation('plan', 'openai/gpt-4o');

    const outcome = await invocation.execute({ timeoutMs: 1234 });
    expect(outcome.status).toBeNull();
    expect(outcome.error).toBeInstanceOf(ProviderError);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('is constructible via the createOpenRouterAdapter factory', () => {
    const provider = createOpenRouterAdapter('/fake/project');
    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });
});

// ─── reasoning extension (OPENROUTER-PROVIDER, row 477) ───────────────
//
// OpenRouter's `reasoning` field is DEFAULT-ON at the API level and was measured
// (2026-07-20) at ~85% of response cost: an identical evaluator verdict took
// 20.7s with reasoning on vs 3.1s with `{ enabled: false }`, 233 vs 0 reasoning
// tokens, same NO_GO judgement. These tests pin BOTH directions — that the field
// is sent when configured, and that an unconfigured adapter stays byte-identical
// to the pre-row-477 request (no accidental behavior change for existing users).

describe('OpenRouterProvider — reasoning extension (row 477)', () => {
  it('omits `reasoning` entirely when unconfigured (byte-identical to pre-477 body)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = makeProvider({ fetchImpl });

    await provider.send([{ role: 'user', content: 'hi' }], 'some/model:free');

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect('reasoning' in body).toBe(false);
  });

  it('sends the configured `reasoning` object verbatim', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }),
    );
    const provider = makeProvider({ fetchImpl, reasoning: { enabled: false } });

    await provider.send([{ role: 'user', content: 'hi' }], 'some/model:free');

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    // Verbatim: Deckent does not reshape OpenRouter's own contract.
    expect(body.reasoning).toEqual({ enabled: false });
    // The canonical fields must be untouched by the extension.
    expect(body.model).toBe('some/model:free');
    expect(body.stream).toBe(false);
  });

  it('forwards reasoning to a spawned worker via ENV, never argv (win32-safe)', () => {
    const spawnImpl = vi.fn().mockReturnValue({
      pid: 4242,
      on: vi.fn(),
      once: vi.fn(),
      unref: vi.fn(),
      kill: vi.fn(),
    });
    const provider = makeProvider({
      spawnImpl,
      reasoning: { enabled: false },
      projectDir: process.cwd(),
      workerEntryPath: '/fake/worker-entry.js',
    });

    provider.spawn('t-477', 'some/model:free' as never, 'prompt');

    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [, args, spawnOpts] = spawnImpl.mock.calls[0]!;
    // JSON must NOT ride on argv — it would have to survive a cmd.exe wrapper.
    expect(args.join(' ')).not.toContain('reasoning');
    expect(spawnOpts.env['DECKENT_HTTP_EXTRA_BODY']).toBe(
      JSON.stringify({ reasoning: { enabled: false } }),
    );
  });

  it('sets no extra-body env when reasoning is unconfigured', () => {
    const spawnImpl = vi.fn().mockReturnValue({
      pid: 4243, on: vi.fn(), once: vi.fn(), unref: vi.fn(), kill: vi.fn(),
    });
    const provider = makeProvider({
      spawnImpl,
      projectDir: process.cwd(),
      workerEntryPath: '/fake/worker-entry.js',
    });

    provider.spawn('t-477-b', 'some/model:free' as never, 'prompt');

    const [, , spawnOpts] = spawnImpl.mock.calls[0]!;
    expect(spawnOpts.env['DECKENT_HTTP_EXTRA_BODY']).toBeUndefined();
  });
});

// ─── error-in-200 envelope (K5 root-cause, row 477) — host-side send() twin ───

describe('OpenRouterProvider — error-in-200 envelope (K5)', () => {
  it('throws ProviderError with the embedded upstream cause instead of empty content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      error: { message: 'Upstream error from Nvidia: ResourceExhausted', code: 502 },
    }));
    const provider = makeProvider({ fetchImpl });
    await expect(
      provider.send([{ role: 'user', content: 'hi' }], 'some/model:free'),
    ).rejects.toThrowError(/error-in-200 envelope: Upstream error from Nvidia: ResourceExhausted \(code 502\)/);
  });

  it('throws on 200 with no choices at all', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'gen-y' }));
    const provider = makeProvider({ fetchImpl });
    await expect(
      provider.send([{ role: 'user', content: 'hi' }], 'some/model:free'),
    ).rejects.toThrowError(/error-in-200 envelope: response has no choices/);
  });
});
