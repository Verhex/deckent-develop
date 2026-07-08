// tests/agent/openai-toolcall-id.test.ts
// Covers task 387-021 (born-544): OpenAI-compatible backends are not guaranteed to
// emit unique tool-call ids across parallel calls in one turn — a collision would
// let the agent loop match a tool_result to the wrong call.
import { describe, it, expect } from 'vitest';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import type { ProviderEvent, ProviderMessage, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = {
  system: 'sys', model: 'gpt-4.1',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
};

function fakeFetch(sse: string): typeof fetch {
  return (async () => ({
    ok: true, status: 200,
    body: (async function* () { yield new TextEncoder().encode(sse); })(),
  })) as unknown as typeof fetch;
}
async function drain(adapter: { send(r: ProviderRequest): AsyncIterable<ProviderEvent> }, r: ProviderRequest): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of adapter.send(r)) out.push(e);
  return out;
}
function toolCallEvents(evs: ProviderEvent[]): Array<Extract<ProviderEvent, { type: 'tool-call' }>> {
  return evs.filter((e): e is Extract<ProviderEvent, { type: 'tool-call' }> => e.type === 'tool-call');
}

describe('openai adapter — tool-call id uniqueness', () => {
  it('disambiguates when the backend echoes the same explicit id for two parallel calls', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_dup","function":{"name":"read_file","arguments":"{\\"path\\":\\"a\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_dup","function":{"name":"read_file","arguments":"{\\"path\\":\\"b\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const calls = toolCallEvents(await drain(a, req));
    expect(calls).toHaveLength(2);
    // Unique ids
    expect(new Set(calls.map((c) => c.id)).size).toBe(2);
    // First occurrence keeps the backend id verbatim; the collision is renamed.
    expect(calls[0]?.id).toBe('call_dup');
    expect(calls[1]?.id).toBe('call_dup-dup1');
    // Args stay correctly paired with their own call, not swapped by the rename.
    expect(calls[0]?.args).toEqual({ path: 'a' });
    expect(calls[1]?.args).toEqual({ path: 'b' });
  });

  it('disambiguates three-way id collisions with incrementing suffixes', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"same","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"same","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"same","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const calls = toolCallEvents(await drain(a, req));
    expect(calls.map((c) => c.id)).toEqual(['same', 'same-dup1', 'same-dup2']);
    expect(new Set(calls.map((c) => c.id)).size).toBe(3);
  });

  it('a disambiguated id correlates the correct tool_result on the round-trip (toOpenAIMessage)', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_dup","function":{"name":"read_file","arguments":"{\\"path\\":\\"a\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_dup","function":{"name":"read_file","arguments":"{\\"path\\":\\"b\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const calls = toolCallEvents(await drain(a, req));
    const [first, second] = calls;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // Simulate the agent loop building the next-turn request: an assistant
    // message carrying both tool calls, followed by their tool-role results
    // keyed by the (now-unique) emitted ids.
    const assistantMsg: ProviderMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: first!.id, name: first!.name, args: first!.args },
        { id: second!.id, name: second!.name, args: second!.args },
      ],
    };
    const resultForSecond: ProviderMessage = { role: 'tool', content: 'result-for-b', toolCallId: second!.id };

    const followUp: ProviderRequest = { ...req, messages: [...req.messages, assistantMsg, resultForSecond] };
    const secondSse = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    let capturedBody: { messages: Array<Record<string, unknown>> } | undefined;
    const capturingFetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init!.body as string) as { messages: Array<Record<string, unknown>> };
      return {
        ok: true, status: 200,
        body: (async function* () { yield new TextEncoder().encode(secondSse); })(),
      };
    }) as unknown as typeof fetch;
    const a2 = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: capturingFetch });
    await drain(a2, followUp);

    expect(capturedBody).toBeDefined();
    const wireAssistant = capturedBody!.messages.find((m) => m['role'] === 'assistant' && Array.isArray(m['tool_calls'])) as
      | { tool_calls: Array<{ id: string }> }
      | undefined;
    const wireToolResult = capturedBody!.messages.find((m) => m['role'] === 'tool') as { tool_call_id: string } | undefined;
    expect(wireAssistant?.tool_calls.map((tc) => tc.id)).toEqual([first!.id, second!.id]);
    expect(wireToolResult?.tool_call_id).toBe(second!.id);
    // The tool result must correlate to the SECOND call's id, not the first —
    // proving the rename did not scramble which result belongs to which call.
    expect(wireToolResult?.tool_call_id).not.toBe(first!.id);
  });

  it('regression: distinct explicit ids and omitted-id synthesis are unaffected by dedup', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_a","function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"name":"read_file","arguments":"{}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const calls = toolCallEvents(await drain(a, req));
    expect(calls.map((c) => c.id)).toEqual(['call_a', 'call-read_file-1']);
  });
});
