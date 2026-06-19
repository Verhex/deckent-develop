// tests/connectors/gateway/gateway-ipc.test.ts
import { describe, it, expect } from 'vitest';
import { encodeFrame, decodeFrames, type GatewayRequest } from '../../../src/connectors/gateway/gateway-ipc.js';

describe('gateway-ipc', () => {
  it('encodes one frame per line', () => {
    const req: GatewayRequest = { id: 'a1', chatKey: 'telegram:1', kind: 'message', text: 'hi' };
    expect(encodeFrame(req)).toBe(JSON.stringify(req) + '\n');
  });

  it('decodes complete frames and keeps a trailing partial line', () => {
    const a = encodeFrame({ id: '1', chatKey: 'telegram:1', kind: 'message', text: 'one' });
    const b = encodeFrame({ id: '2', chatKey: 'telegram:1', kind: 'message', text: 'two' });
    const { frames, rest } = decodeFrames(a + b + '{"partial":');
    expect(frames).toHaveLength(2);
    expect((frames[1] as GatewayRequest).text).toBe('two');
    expect(rest).toBe('{"partial":');
  });

  it('skips malformed lines without throwing', () => {
    const good = encodeFrame({ id: '1', chatKey: 'telegram:1', kind: 'message', text: 'ok' });
    const { frames } = decodeFrames('not json\n' + good);
    expect(frames).toHaveLength(1);
  });
});
