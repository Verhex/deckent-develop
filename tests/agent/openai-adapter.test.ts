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
      { type: 'done' },
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
    expect(evs[evs.length - 1]).toEqual({ type: 'done' });
  });
  it('throws on a non-ok HTTP status', async () => {
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch('', false, 500) });
    await expect(drain(a, req)).rejects.toThrow(/500/);
  });
});
