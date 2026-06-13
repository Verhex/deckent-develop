// tests/agent/sse.test.ts
import { describe, it, expect } from 'vitest';
import { parseSSE, type SSEEvent } from '../../src/agent/provider-tooluse/sse.js';

async function* bytes(...parts: string[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  for (const p of parts) yield enc.encode(p);
}
async function collect(stream: AsyncIterable<SSEEvent>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

describe('parseSSE', () => {
  it('parses data-only events (OpenAI style), split arbitrarily across chunks', async () => {
    const evs = await collect(parseSSE(bytes('data: {"a":', '1}\n\n', 'data: [DONE]\n\n')));
    expect(evs).toEqual([{ event: undefined, data: '{"a":1}' }, { event: undefined, data: '[DONE]' }]);
  });
  it('parses event+data records (Anthropic style)', async () => {
    const evs = await collect(parseSSE(bytes('event: message_start\ndata: {"x":1}\n\n')));
    expect(evs).toEqual([{ event: 'message_start', data: '{"x":1}' }]);
  });
  it('handles CRLF line endings and ignores comment/other lines', async () => {
    const evs = await collect(parseSSE(bytes(': comment\r\nevent: ping\r\ndata: hi\r\n\r\n')));
    expect(evs).toEqual([{ event: 'ping', data: 'hi' }]);
  });
  it('yields a trailing event with no final blank line', async () => {
    const evs = await collect(parseSSE(bytes('data: tail')));
    expect(evs).toEqual([{ event: undefined, data: 'tail' }]);
  });
});
