// tests/agent/anthropic-err-body.test.ts
// born-545 — ANTHROPIC-ERR-BODY: the thrown error on a non-ok Anthropic response
// must include the response body (debug-blind otherwise), and the success path
// must stay unaffected.
import { describe, it, expect } from 'vitest';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = {
  system: 'sys', model: 'claude-fable-5',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
};

function fakeFetchWithBody(text: string, ok: boolean, status: number): typeof fetch {
  return (async () => ({
    ok,
    status,
    body: (async function* () { yield new TextEncoder().encode(text); })(),
  })) as unknown as typeof fetch;
}

function fakeFetchNoBody(ok: boolean, status: number): typeof fetch {
  return (async () => ({ ok, status, body: null })) as unknown as typeof fetch;
}

async function drain(a: { send(r: ProviderRequest): AsyncIterable<ProviderEvent> }, r: ProviderRequest): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = []; for await (const e of a.send(r)) out.push(e); return out;
}

describe('anthropic adapter — error response body', () => {
  it('includes the response body text in the thrown error on a non-ok status', async () => {
    const errBody = JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens exceeds model limit' } });
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetchWithBody(errBody, false, 400) });
    await expect(drain(a, req)).rejects.toThrow(/400/);
    await expect(drain(a, req)).rejects.toThrow(/invalid_request_error/);
    await expect(drain(a, req)).rejects.toThrow(/max_tokens exceeds model limit/);
  });

  it('still throws a status-only error when the error response has no body', async () => {
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetchNoBody(false, 503) });
    await expect(drain(a, req)).rejects.toThrow(/503/);
  });

  it('does not affect the success path — text deltas + usage + done still stream through', async () => {
    const sse =
      'event: message_start\ndata: {"message":{"usage":{"input_tokens":5}}}\n\n' +
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"text"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
      'event: content_block_stop\ndata: {"index":0}\n\n' +
      'event: message_delta\ndata: {"usage":{"output_tokens":3}}\n\n' +
      'event: message_stop\ndata: {}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetchWithBody(sse, true, 200) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'text-delta', text: 'Hi' });
    expect(evs).toContainEqual({ type: 'usage', inputTokens: 5, outputTokens: 3 });
    expect(evs[evs.length - 1]).toEqual({ type: 'done', stopReason: 'stop' });
  });
});
