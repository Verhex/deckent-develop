/**
 * BOT-002 — incoming command router tests (§4G).
 *
 * The router turns an inbound bot message ("approve <id>" / "reject <id>") into
 * an approval-gate resolution. The single most important property is SENDER
 * AUTHORIZATION: only the configured chat id(s) may command; an unauthorized
 * sender's valid command must NEVER reach the resolver (silent-ignore — no ack,
 * so the bot is not an oracle for strangers).
 */

import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from '../../src/connectors/types.js';
import {
  parseCommand,
  makeIncomingCommandRouter,
} from '../../src/connectors/incoming-command-router.js';

function msg(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'm1',
    connector: 'telegram',
    fromUser: 'u1',
    channelId: '7374744018',
    text: 'approve abc123',
    timestamp: '2026-06-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('parseCommand', () => {
  it('parses "approve <id>" and "reject <id>"', () => {
    expect(parseCommand('approve abc123')).toEqual({ action: 'approve', id: 'abc123' });
    expect(parseCommand('reject xyz')).toEqual({ action: 'reject', id: 'xyz' });
  });

  it('is case-insensitive and tolerates a leading slash + extra whitespace', () => {
    expect(parseCommand('  APPROVE  Trig-9 ')).toEqual({ action: 'approve', id: 'Trig-9' });
    expect(parseCommand('/reject  abc')).toEqual({ action: 'reject', id: 'abc' });
  });

  it('default-denies anything that is not exactly verb + one id', () => {
    expect(parseCommand('hello there')).toBeNull();
    expect(parseCommand('approve')).toBeNull();            // no id
    expect(parseCommand('approve a b')).toBeNull();        // two ids
    expect(parseCommand('approveall x')).toBeNull();       // not the verb
    expect(parseCommand('')).toBeNull();
  });
});

describe('makeIncomingCommandRouter — authorization (security core)', () => {
  it('🔴 unauthorized sender + valid command → resolver NOT called, no reply (silent)', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const reply = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
      reply,
    });

    handler(msg({ channelId: '999-stranger', text: 'approve abc123' }));
    await vi.waitFor(() => {
      // give the fire-and-forget microtask a chance; assert nothing happened
      expect(resolve).not.toHaveBeenCalled();
    });
    expect(reply).not.toHaveBeenCalled();
  });
});

describe('makeIncomingCommandRouter — authorized dispatch', () => {
  it('authorized "approve <id>" → resolve(id,"approve") + success ack', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const reply = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
      reply,
    });

    handler(msg({ text: 'approve abc123' }));
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('abc123', 'approve'));
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    const [chan, text] = reply.mock.calls[0]!;
    expect(chan).toBe('7374744018');
    expect(text).toContain('abc123');
  });

  it('authorized "reject <id>" → resolve(id,"reject")', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
    });
    handler(msg({ text: 'reject t-9' }));
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('t-9', 'reject'));
  });

  it('resolver returns "not-found" → authorized sender still gets a (distinct) ack', async () => {
    const resolve = vi.fn(async () => 'not-found' as const);
    const reply = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
      reply,
    });
    handler(msg({ text: 'approve gone' }));
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    expect(reply.mock.calls[0]![1]).toContain('gone');
  });

  it('authorized chatter (non-command) → resolver not called, silent (no reply spam)', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const reply = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
      reply,
    });
    handler(msg({ text: 'how is the sprint going?' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolve).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('a throwing resolver never escapes the handler (fail-safe)', async () => {
    const resolve = vi.fn(async () => { throw new Error('boom'); });
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
    });
    expect(() => handler(msg({ text: 'approve x' }))).not.toThrow();
    await vi.waitFor(() => expect(resolve).toHaveBeenCalled());
  });
});

describe('makeIncomingCommandRouter — chat fallback (onChat)', () => {
  it('authorized non-command → onChat(channelId, text), resolve NOT called', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
      onChat,
    });
    handler(msg({ text: 'sprint durumu nedir?' }));
    await vi.waitFor(() => expect(onChat).toHaveBeenCalledWith('7374744018', 'sprint durumu nedir?'));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('🔴 UNAUTHORIZED non-command → onChat NOT called (chat inherits the same auth chokepoint)', async () => {
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve: vi.fn(async () => 'resolved' as const),
      onChat,
    });
    handler(msg({ channelId: '999-stranger', text: 'run rm -rf /' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onChat).not.toHaveBeenCalled();
  });

  it('a command still routes to resolve, NOT onChat', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const onChat = vi.fn(async () => {});
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve,
      onChat,
    });
    handler(msg({ text: 'approve abc' }));
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('abc', 'approve'));
    expect(onChat).not.toHaveBeenCalled();
  });

  it('no onChat configured → authorized non-command is silently ignored (back-compat)', async () => {
    const resolve = vi.fn(async () => 'resolved' as const);
    const handler = makeIncomingCommandRouter({ authorizedChatIds: ['7374744018'], resolve });
    expect(() => handler(msg({ text: 'just chatting' }))).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(resolve).not.toHaveBeenCalled();
  });

  it('a throwing onChat never escapes the handler (fail-safe)', async () => {
    const onChat = vi.fn(async () => { throw new Error('chat boom'); });
    const handler = makeIncomingCommandRouter({
      authorizedChatIds: ['7374744018'],
      resolve: vi.fn(async () => 'resolved' as const),
      onChat,
    });
    expect(() => handler(msg({ text: 'hello' }))).not.toThrow();
    await vi.waitFor(() => expect(onChat).toHaveBeenCalled());
  });
});
