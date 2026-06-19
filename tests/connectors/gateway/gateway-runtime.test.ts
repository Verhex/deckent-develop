// tests/connectors/gateway/gateway-runtime.test.ts
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { runRuntimeLoop } from '../../../src/connectors/gateway/gateway-runtime.js';
import { encodeFrame, decodeFrames, type GatewayResponse } from '../../../src/connectors/gateway/gateway-ipc.js';

describe('gateway-runtime loop', () => {
  it('answers a message request with a final response frame', async () => {
    const input = new Readable({ read() {} });
    const out: string[] = [];
    runRuntimeLoop({
      input,
      output: (line) => out.push(line),
      respond: async (text) => `echo: ${text}`,
    });

    input.push(encodeFrame({ id: 'r1', chatKey: 'telegram:1', kind: 'message', text: 'ping' }));
    // allow the async respond microtask to settle
    await new Promise((r) => setTimeout(r, 0));

    const { frames } = decodeFrames(out.join(''));
    const resp = frames[0] as Extract<GatewayResponse, { kind: 'final' }>;
    expect(resp.id).toBe('r1');
    expect(resp.kind).toBe('final');
    expect(resp.parts.join('')).toBe('echo: ping');
  });
});
