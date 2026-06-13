// tests/agent/message-roundtrip.test.ts
// The adapters must serialize an assistant turn's tool_calls so the provider
// can correlate the following tool-result message (native round-trip, §13).
import { describe, it, expect } from 'vitest';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

// Capture the request body the adapter POSTs, then return a trivial done-stream.
function captureFetch(sink: { body?: any }): typeof fetch {
  return (async (_url: string, init: { body: string }) => {
    sink.body = JSON.parse(init.body);
    return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode('data: [DONE]\n\n'); })() };
  }) as unknown as typeof fetch;
}

const roundTrip: ProviderRequest = {
  system: 'sys', model: 'm',
  messages: [
    { role: 'user', content: 'read x' },
    { role: 'assistant', content: 'sure', toolCalls: [{ id: 'tc1', name: 'read_file', args: { path: 'x' } }] },
    { role: 'tool', content: 'FILE BODY', toolCallId: 'tc1' },
  ],
  tools: [],
};

describe('assistant tool_calls round-trip', () => {
  it('OpenAI: assistant message carries tool_calls; tool message carries tool_call_id', async () => {
    const sink: { body?: any } = {};
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: captureFetch(sink) });
    for await (const _ of a.send(roundTrip)) { /* drain */ }
    const msgs = sink.body.messages;
    const assistant = msgs.find((m: any) => m.role === 'assistant');
    expect(assistant.tool_calls).toEqual([
      { id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } },
    ]);
    const tool = msgs.find((m: any) => m.role === 'tool');
    expect(tool).toEqual({ role: 'tool', tool_call_id: 'tc1', content: 'FILE BODY' });
  });

  it('Anthropic: assistant message is text+tool_use blocks; tool result is a user tool_result block', async () => {
    const sink: { body?: any } = {};
    const a = createAnthropicAdapter({ apiKey: 'k', fetchImpl: captureFetch(sink) });
    for await (const _ of a.send(roundTrip)) { /* drain */ }
    const msgs = sink.body.messages;
    const assistant = msgs.find((m: any) => m.role === 'assistant');
    expect(assistant.content).toEqual([
      { type: 'text', text: 'sure' },
      { type: 'tool_use', id: 'tc1', name: 'read_file', input: { path: 'x' } },
    ]);
    const toolMsg = msgs[msgs.length - 1];
    expect(toolMsg).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'FILE BODY' }] });
  });

  it('Anthropic: an assistant turn with tool_use but no text omits the text block', async () => {
    const sink: { body?: any } = {};
    const a = createAnthropicAdapter({ apiKey: 'k', fetchImpl: captureFetch(sink) });
    const req: ProviderRequest = { system: 's', model: 'm', tools: [], messages: [
      { role: 'assistant', content: '', toolCalls: [{ id: 't0', name: 'ls', args: {} }] },
    ] };
    for await (const _ of a.send(req)) { /* drain */ }
    const assistant = sink.body.messages.find((m: any) => m.role === 'assistant');
    expect(assistant.content).toEqual([{ type: 'tool_use', id: 't0', name: 'ls', input: {} }]);
  });
});
