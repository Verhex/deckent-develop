// tests/connectors/incoming-command-router-identity.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeIncomingCommandRouter } from '../../src/connectors/incoming-command-router.js';
import type { IncomingMessage } from '../../src/connectors/types.js';

function msg(o: Partial<IncomingMessage> = {}): IncomingMessage {
  return { id: 'm1', connector: 'telegram', fromUser: 'u1', channelId: 'c1', text: 'hello', timestamp: '2026-06-26T00:00:00.000Z', ...o };
}

describe('router passes full message (fromUser) to onChat', () => {
  it('forwards channelId, text, and the full IncomingMessage (incl. fromUser)', async () => {
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({ authorizedChatIds: ['c1'], resolve: async () => 'resolved', onChat });
    handler(msg({ fromUser: 'alice', text: 'durum?' }));
    await vi.waitFor(() => expect(onChat).toHaveBeenCalled());
    expect(onChat).toHaveBeenCalledWith('c1', 'durum?', expect.objectContaining({ fromUser: 'alice', connector: 'telegram' }));
  });
  it('still drops unauthorized senders (gate unchanged)', async () => {
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({ authorizedChatIds: ['c1'], resolve: async () => 'resolved', onChat });
    handler(msg({ channelId: 'stranger' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onChat).not.toHaveBeenCalled();
  });
});
