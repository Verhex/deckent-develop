// tests/agent/openai-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = {
  system: 'sys', model: 'gpt-4.1',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
};

// Build a fake fetch that returns a streaming body of the given SSE string.
function fakeFetch(sse: string, ok = true, status = 200): typeof fetch {
  return (async () => ({
    ok, status,
    body: (async function* () { yield new TextEncoder().encode(sse); })(),
  })) as unknown as typeof fetch;
}
async function drain(adapter: { send(r: ProviderRequest): AsyncIterable<ProviderEvent> }, r: ProviderRequest): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of adapter.send(r)) out.push(e);
  return out;
}

describe('createOpenAIAdapter', () => {
  it('streams text deltas then usage then done', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toEqual([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'usage', inputTokens: 5, outputTokens: 2 },
      { type: 'done', stopReason: 'stop' },
    ]);
  });
  it('accumulates a streamed tool-call across delta fragments', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"pa"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"x\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'call_1', name: 'read_file', args: { path: 'x' } });
    expect(evs[evs.length - 1]).toEqual({ type: 'done', stopReason: 'tool_calls' });
  });
  it('throws on a non-ok HTTP status', async () => {
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch('', false, 500) });
    await expect(drain(a, req)).rejects.toThrow(/500/);
  });
  it('flushes accumulated tool-calls when the stream finishes with finish_reason:stop (R6 silent-drop)', async () => {
    // vLLM/Ollama/Azure/proxies often close a tool-call stream with 'stop' (or
    // omit finish_reason) instead of the spec 'tool_calls'. Pre-fix the loop only
    // emitted on 'tool_calls', so the accumulated call was silently dropped.
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","function":{"name":"read_file","arguments":"{\\"pa"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"y\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'call_9', name: 'read_file', args: { path: 'y' } });
    expect(evs[evs.length - 1]).toEqual({ type: 'done', stopReason: 'stop' });
  });
  it('flushes accumulated tool-calls when the stream ends with no finish_reason at all', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_x","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'call_x', name: 'read_file', args: {} });
  });
  it('does not double-emit when finish_reason:tool_calls already flushed the accumulator', async () => {
    // The in-loop emission clears the accumulator, so the stream-end flush must
    // not re-emit the same call.
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    const toolCalls = evs.filter((e) => e.type === 'tool-call');
    expect(toolCalls).toHaveLength(1);
  });
  it('synthesizes unique ids for same-named parallel tool calls with omitted ids', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    const ids = evs.filter((e): e is Extract<ProviderEvent, { type: 'tool-call' }> => e.type === 'tool-call').map((e) => e.id);
    expect(ids).toEqual(['call-read_file-0', 'call-read_file-1']);
  });
});

describe('openai-compatible http error detail (LOCAL-LLM-MODEL-IDENTITY-001)', () => {
  it('surfaces the SAFE upstream error body instead of an opaque status line', async () => {
    const { createOpenAIAdapter, OpenAICompatHttpError } = await import('../../src/agent/provider-tooluse/openai.js');
    const fetchImpl = (async () => new Response(JSON.stringify({
      error: { message: 'model not found: Qwen3.8-27B', type: 'invalid_request_error', code: 'model_not_found' },
    }), { status: 400 })) as unknown as typeof fetch;
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const events = adapter.send({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], model: 'Qwen3.8-27B' });
    await expect((async () => { for await (const _ of events) { /* drain */ } })())
      .rejects.toSatisfy((err: unknown) => err instanceof OpenAICompatHttpError
        && err.status === 400
        && err.upstreamCode === 'model_not_found'
        && err.upstreamMessage === 'model not found: Qwen3.8-27B'
        && err.message.includes('model not found: Qwen3.8-27B'));
  });

  it('wraps connection failures as an honest connect error (cold-start class)', async () => {
    const { createOpenAIAdapter } = await import('../../src/agent/provider-tooluse/openai.js');
    const fetchImpl = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const events = adapter.send({ system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], model: 'm' });
    await expect((async () => { for await (const _ of events) { /* drain */ } })())
      .rejects.toThrow(/openai-compatible connect failed — fetch failed/);
  });
});
