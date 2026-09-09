import { describe, expect, it, vi } from 'vitest';
import {
  probeRequestMeasurementAuthority,
  resolveLlamaCppServerRoot,
  resolveNativeSelection,
} from '../../src/cli/repl/native-transport.js';
import { deriveMeasurementAuthority, measureProviderRequest } from '../../src/agent/context-budget.js';
import type { ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

describe('resolveLlamaCppServerRoot', () => {
  it.each([
    ['http://127.0.0.1:8080/v1', 'http://127.0.0.1:8080'],
    ['http://127.0.0.1:8080/v1/', 'http://127.0.0.1:8080'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080'],
  ])('strips OpenAI-compatible /v1 from %s', (input, expected) => {
    expect(resolveLlamaCppServerRoot(input)).toBe(expected);
  });
});

describe('llama.cpp measurement root URLs', () => {
  it('calls /tokenize and /apply-template at the server root when endpoint ends with /v1', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      calls.push(String(input));
      const url = String(input);
      if (url.includes('/apply-template')) {
        return new Response(JSON.stringify({ prompt: 'hello world' }), { status: 200 });
      }
      if (url.includes('/tokenize')) {
        return new Response(JSON.stringify({ count: 3 }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: 'Qwen3.8-27B' },
      {
        projectRoot: process.cwd(),
        env: {},
        config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } },
        fetchFn,
      },
    );
    expect('error' in resolved).toBe(false);
    if ('error' in resolved) return;
    const measurement = resolved.adapter.requestMeasurement;
    expect(measurement).toBeDefined();
    const result = await measurement!.measure({
      model: resolved.model,
      system: '',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    }, new AbortController().signal);
    expect(result?.inputTokens).toBeGreaterThan(0);
    expect(calls.some((url) => url.startsWith('http://127.0.0.1:8080/apply-template'))).toBe(true);
    expect(calls.some((url) => url.startsWith('http://127.0.0.1:8080/tokenize'))).toBe(true);
    expect(calls.some((url) => url.includes('/v1/tokenize'))).toBe(false);
  });

  it('typed probe reports http-404 when root tokenize is missing', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(probeRequestMeasurementAuthority({
      providerName: 'local-llm',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'Qwen3.8-27B',
      fetchFn,
    })).resolves.toEqual({ state: 'unavailable', reason: 'http-404' });
  });

  it('typed probe reports exact-available when root routes succeed', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/apply-template')) {
        return new Response(JSON.stringify({ prompt: 'probe' }), { status: 200 });
      }
      if (url.includes('/tokenize')) {
        return new Response(JSON.stringify({ count: 2 }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    await expect(probeRequestMeasurementAuthority({
      providerName: 'local-llm',
      endpoint: 'http://127.0.0.1:8080/v1',
      model: 'Qwen3.8-27B',
      fetchFn,
    })).resolves.toMatchObject({ state: 'exact-available', provenance: 'llama.cpp-apply-template-tokenize' });
  });

  it('hosted openai selection reports unsupported-endpoint', async () => {
    await expect(probeRequestMeasurementAuthority({
      providerName: 'openai',
      model: 'gpt-5',
    })).resolves.toEqual({ state: 'unavailable', reason: 'unsupported-endpoint' });
  });
});

function bodyOf(init: RequestInit | undefined): Record<string, any> {
  return JSON.parse(String(init?.body)) as Record<string, any>;
}

describe('llama.cpp measurement wire parity (real-binary evidence, b10398 router)', () => {
  const request: ProviderRequest = {
    model: 'Qwen3.8-27B',
    system: 'SYSPROMPT',
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'read_file', args: { path: 'a.txt' } }] },
      { role: 'tool', toolCallId: 'c1', content: 'red green blue' },
    ],
    tools: [{ name: 'read_file', description: 'D', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }],
  };

  function capture() {
    const calls: Array<{ url: string; body: Record<string, any> }> = [];
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, body: bodyOf(init) });
      if (url.endsWith('/apply-template')) return new Response(JSON.stringify({ prompt: 'rendered' }), { status: 200 });
      if (url.endsWith('/tokenize')) return new Response(JSON.stringify({ tokens: [1, 2, 3, 4] }), { status: 200 });
      return new Response('{}', { status: 404 });
    });
    return { calls, fetchFn };
  }

  it('sends the system prompt as a role:system message, OpenAI function tools and model on tokenize', async () => {
    const { calls, fetchFn } = capture();
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: request.model },
      { projectRoot: process.cwd(), env: {}, config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } }, fetchFn },
    );
    if ('error' in resolved) throw new Error(resolved.error);
    const result = await resolved.adapter.requestMeasurement!.measure(request, new AbortController().signal);
    expect(result).toEqual({ inputTokens: 4, provenance: 'llama.cpp-apply-template-tokenize' });
    const template = calls.find((c) => c.url.endsWith('/apply-template'))!;
    expect(template.body['system']).toBeUndefined();
    expect(template.body['messages'][0]).toEqual({ role: 'system', content: 'SYSPROMPT' });
    expect(template.body['messages']).toHaveLength(4);
    expect(template.body['messages'][2]['tool_calls'][0]).toMatchObject({ type: 'function', function: { name: 'read_file' } });
    expect(template.body['messages'][3]).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
    expect(template.body['tools'][0]).toEqual({ type: 'function', function: { name: 'read_file', description: 'D', parameters: request.tools[0]!.input_schema } });
    expect(template.body['model']).toBe(request.model);
    const tokenize = calls.find((c) => c.url.endsWith('/tokenize'))!;
    expect(tokenize.body).toEqual({ model: request.model, content: 'rendered', add_special: true });
    expect(calls.every((c) => !Array.isArray(c.body['messages']) || c.body['messages'].length > 0)).toBe(true);
  });

  it('omits the tools field when the request carries no tools', async () => {
    const { calls, fetchFn } = capture();
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: request.model },
      { projectRoot: process.cwd(), env: {}, config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } }, fetchFn },
    );
    if ('error' in resolved) throw new Error(resolved.error);
    await resolved.adapter.requestMeasurement!.measure({ ...request, tools: [] }, new AbortController().signal);
    const template = calls.find((c) => c.url.endsWith('/apply-template'))!;
    expect('tools' in template.body).toBe(false);
  });

  it('measures an identical request once: the request-digest cache serves the repeat with zero fetches', async () => {
    const { calls, fetchFn } = capture();
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: request.model },
      { projectRoot: process.cwd(), env: {}, config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } }, fetchFn },
    );
    if ('error' in resolved) throw new Error(resolved.error);
    const identity = { provider: 'local-llm', model: request.model, contextWindowTokens: 131072, contextProvenance: 'configured-narrowing' as const };
    const first = await measureProviderRequest({ request, identity, capability: resolved.adapter.requestMeasurement! });
    const fetched = calls.length;
    const second = await measureProviderRequest({ request, identity, capability: resolved.adapter.requestMeasurement! });
    expect(first.quality).toBe('exact');
    expect(second).toEqual(first);
    expect(calls.length).toBe(fetched);
  });

  it('typed probe tokenizes with the model name so router mode accepts it', async () => {
    const { calls, fetchFn } = capture();
    await probeRequestMeasurementAuthority({ providerName: 'local-llm', endpoint: 'http://127.0.0.1:8080/v1', model: 'Qwen3.8-27B', fetchFn });
    const template = calls.find((c) => c.url.endsWith('/apply-template'))!;
    expect(template.body['messages'][0]).toEqual({ role: 'system', content: '' });
    expect(template.body['messages']).toHaveLength(2);
    expect(calls.find((c) => c.url.endsWith('/tokenize'))!.body['model']).toBe('Qwen3.8-27B');
  });
});

describe('deriveMeasurementAuthority', () => {
  const boot404 = { state: 'unavailable' as const, reason: 'http-404' as const };
  const bootExact = { state: 'exact-available' as const, provenance: 'llama.cpp-apply-template-tokenize' };
  const exact = { inputTokens: 10, quality: 'exact' as const, provenance: 'llama.cpp-apply-template-tokenize', requestDigest: 'd' };
  const upper = { inputTokens: 10, quality: 'conservative-upper-bound' as const, provenance: 'utf8-wire-bytes-plus-framing', requestDigest: 'd' };
  it('reports the boot probe before any request', () => {
    expect(deriveMeasurementAuthority(boot404, undefined)).toEqual(boot404);
    expect(deriveMeasurementAuthority(undefined, undefined)).toBeUndefined();
  });
  it('a later exact measurement overrides a timed-out or failed boot probe', () => {
    expect(deriveMeasurementAuthority({ state: 'unavailable', reason: 'timeout' }, exact as never))
      .toEqual({ state: 'exact-available', provenance: 'llama.cpp-apply-template-tokenize' });
  });
  it('a failing measurement after a passing probe is reported, keeping a typed boot reason when there is one', () => {
    expect(deriveMeasurementAuthority(bootExact, upper as never)).toEqual({ state: 'unavailable', reason: 'measurement-failed' });
    expect(deriveMeasurementAuthority(boot404, upper as never)).toEqual(boot404);
  });
});
