// tests/agent/anthropic-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = {
  system: 'sys', model: 'claude-fable-5',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
};
function fakeFetch(sse: string, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, body: (async function* () { yield new TextEncoder().encode(sse); })() })) as unknown as typeof fetch;
}
async function drain(a: { send(r: ProviderRequest): AsyncIterable<ProviderEvent> }, r: ProviderRequest): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = []; for await (const e of a.send(r)) out.push(e); return out;
}

describe('createAnthropicAdapter', () => {
  it('streams text deltas + usage + done', async () => {
    const sse =
      'event: message_start\ndata: {"message":{"usage":{"input_tokens":5}}}\n\n' +
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"text"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
      'event: content_block_stop\ndata: {"index":0}\n\n' +
      'event: message_delta\ndata: {"usage":{"output_tokens":3}}\n\n' +
      'event: message_stop\ndata: {}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'text-delta', text: 'Hi' });
    expect(evs).toContainEqual({ type: 'usage', inputTokens: 5, outputTokens: 3 });
    expect(evs[evs.length - 1]).toEqual({ type: 'done', stopReason: 'stop' });
  });
  it('accumulates a tool_use block from input_json_delta fragments', async () => {
    const sse =
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"\\"x\\"}"}}\n\n' +
      'event: content_block_stop\ndata: {"index":0}\n\n' +
      'event: message_stop\ndata: {}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'toolu_1', name: 'read_file', args: { path: 'x' } });
  });
  it('throws on non-ok status', async () => {
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch('', false, 429) });
    await expect(drain(a, req)).rejects.toThrow(/429/);
  });
  it('synthesizes an index-scoped id when the tool_use block omits an id', async () => {
    const sse =
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","name":"read_file"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n' +
      'event: content_block_stop\ndata: {"index":0}\n\n' +
      'event: message_stop\ndata: {}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'toolu-read_file-0', name: 'read_file', args: {} });
  });
  it('throws when the stream carries a protocol error event', async () => {
    const sse =
      'event: message_start\ndata: {"message":{"usage":{"input_tokens":5}}}\n\n' +
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch(sse) });
    await expect(drain(a, req)).rejects.toThrow(/overloaded_error/);
  });
});
