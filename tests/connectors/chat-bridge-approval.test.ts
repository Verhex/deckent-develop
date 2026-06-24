import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { makeSendApproval } from '../../src/connectors/chat-bridge.js';
import { CapabilityRegistry } from '../../src/connectors/capabilities/registry.js';
import type { Capability } from '../../src/connectors/capabilities/types.js';
import type { OutgoingMessage } from '../../src/connectors/types.js';

// A confirm-tier capability with a known preview.
const mailish: Capability = {
  id: 'send_mail',
  titleKey: 't',
  tier: 'external',
  defaultPolicy: 'confirm',
  edition: 'solo',
  paramsSchema: z.object({ to: z.string() }),
  preview: (a: any) => `*To:* ${a.to}`,
  run: async () => ({ text: 'sent' }),
};

function makeRegistry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(mailish);
  return r;
}

describe('makeSendApproval', () => {
  it('sends a buttoned HTML preview via sendMessageReturningId and returns the message id', async () => {
    const sent: OutgoingMessage[] = [];
    const connector = {
      id: 'telegram',
      sendMessage: vi.fn(async (m: OutgoingMessage) => { sent.push(m); }),
      sendMessageReturningId: vi.fn(async (m: OutgoingMessage) => { sent.push(m); return 'mid-9'; }),
    };
    const registry = makeRegistry();
    const send = makeSendApproval(connector, registry, 'en');
    const mid = await send('chan-123', 'act-7', 'send_mail', { to: 'a@x.com' });

    // Returns the platform message id (for later edit-on-resolve)
    expect(mid).toBe('mid-9');
    // sendMessageReturningId is preferred over sendMessage
    expect(connector.sendMessageReturningId).toHaveBeenCalledTimes(1);
    expect(connector.sendMessage).not.toHaveBeenCalled();

    const msg = sent[0]!;
    expect(msg.parseMode).toBe('HTML');
    // preview text rendered in the HTML body
    expect(msg.text).toContain('a@x.com');
    // header present
    expect(msg.text).toContain('Approval required');
    // channelId is the chat channel, not the action id
    expect(msg.channelId).toBe('chan-123');
    // buttons row
    expect(msg.buttons).toHaveLength(1);
    const row = msg.buttons![0]!;
    expect(row[0]!.callbackData).toBe('approve:act-7');
    expect(row[1]!.callbackData).toBe('reject:act-7');
  });

  it('falls back to sendMessage when sendMessageReturningId is absent — returns empty string (sent, no id)', async () => {
    const sent: OutgoingMessage[] = [];
    const connector = {
      id: 'telegram',
      sendMessage: vi.fn(async (m: OutgoingMessage) => { sent.push(m); }),
    };
    const registry = makeRegistry();
    const send = makeSendApproval(connector, registry, 'en');
    const mid = await send('chan-42', 'act-8', 'send_mail', { to: 'b@x.com' });

    // Empty string = sent but no id available (sendMessage-only connector)
    expect(mid).toBe('');
    expect(mid).not.toBe(false); // not false → sent
    expect(connector.sendMessage).toHaveBeenCalledTimes(1);
    expect(sent[0]!.channelId).toBe('chan-42');
    expect(sent[0]!.buttons![0]![0]!.callbackData).toBe('approve:act-8');
  });

  it('returns false when connector has no sendMessage', async () => {
    const connector = { id: 'noop' };
    const registry = makeRegistry();
    const send = makeSendApproval(connector as any, registry, 'en');
    const mid = await send('chan-1', 'act-9', 'send_mail', { to: 'c@x.com' });
    expect(mid).toBe(false);
  });

  it('uses default preview fallback when capability not in registry — returns "" (sent, no id)', async () => {
    const sent: OutgoingMessage[] = [];
    const connector = {
      id: 'telegram',
      sendMessage: vi.fn(async (m: OutgoingMessage) => { sent.push(m); }),
    };
    const registry = new CapabilityRegistry(); // empty — 'send_mail' not registered
    const send = makeSendApproval(connector, registry, 'en');
    const mid = await send('chan-5', 'act-10', 'send_mail', { to: 'd@x.com' });
    // '' = sent via sendMessage-only connector (no id); !== false = approval was sent
    expect(mid).toBe('');
    expect(mid).not.toBe(false);
    // fallback preview includes the capId and args JSON
    expect(sent[0]!.text).toContain('send_mail');
  });

  it('i18n: Turkish header appears when lang=tr', async () => {
    const sent: OutgoingMessage[] = [];
    const connector = {
      id: 'telegram',
      sendMessage: vi.fn(async (m: OutgoingMessage) => { sent.push(m); }),
    };
    const registry = makeRegistry();
    const send = makeSendApproval(connector, registry, 'tr');
    await send('chan-tr', 'act-tr', 'send_mail', { to: 'e@x.com' });
    expect(sent[0]!.text).toContain('çalıştırılmadı');
  });
});
