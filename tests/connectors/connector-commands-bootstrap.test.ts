/**
 * BOT-002 — inbound command transport bootstrap tests (§4G).
 *
 * bootstrapConnectorCommands brings up each enabled connector in INBOUND mode
 * (full start → non-blocking poll), registers the command router on it, and
 * returns a NotificationAdapter over the SAME instances (one instance, both
 * directions — no second poller, no 409). Hermetic via an injected fake connector.
 */

import { describe, it, expect, vi } from 'vitest';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, IncomingMessage, MessageHandler } from '../../src/connectors/types.js';

function fakeConnector(id: 'telegram' | 'discord') {
  let handler: MessageHandler | undefined;
  return {
    id,
    name: id,
    start: vi.fn(async () => {}),
    startOutbound: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
    isHealthy: () => true,
    _emit: (m: IncomingMessage) => handler?.(m),
  };
}

function incoming(text: string, channelId: string): IncomingMessage {
  return { id: 'm', connector: 'telegram', fromUser: 'u', channelId, text, timestamp: '2026-06-05T00:00:00Z' };
}

const cfg = { telegram: { enabled: true, token: 'bot:tok', chat_id: '555' } };

describe('bootstrapConnectorCommands', () => {
  it('starts the connector INBOUND (full start) and registers a command handler', async () => {
    const fake = fakeConnector('telegram');
    await bootstrapConnectorCommands('/root', cfg, { makeConnector: () => fake, resolve: vi.fn(async () => 'resolved') });
    expect(fake.start).toHaveBeenCalledTimes(1);     // full start = inbound poll
    expect(fake.startOutbound).not.toHaveBeenCalled();
    expect(fake.onMessage).toHaveBeenCalledTimes(1);
  });

  it('authorized "approve <id>" → resolve called + ack replied via the same connector', async () => {
    const fake = fakeConnector('telegram');
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', cfg, { makeConnector: () => fake, resolve });

    fake._emit(incoming('approve trig-9', '555'));
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledWith('trig-9', 'approve'));
    await vi.waitFor(() => expect(fake.sendMessage).toHaveBeenCalledTimes(1));
    const sent = fake.sendMessage.mock.calls[0]![0] as { channelId: string; text: string };
    expect(sent.channelId).toBe('555');
    expect(sent.text).toContain('trig-9');
  });

  it('unauthorized sender → resolve NOT called, no reply', async () => {
    const fake = fakeConnector('telegram');
    const resolve = vi.fn(async () => 'resolved' as const);
    await bootstrapConnectorCommands('/root', cfg, { makeConnector: () => fake, resolve });

    fake._emit(incoming('approve trig-9', '999-stranger'));
    await new Promise((r) => setTimeout(r, 20));
    expect(resolve).not.toHaveBeenCalled();
    expect(fake.sendMessage).not.toHaveBeenCalled();
  });

  it('returns a NotificationAdapter over the SAME instance (one instance, both directions)', async () => {
    const fake = fakeConnector('telegram');
    const { adapter } = await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
    });
    expect(adapter).not.toBeNull();
    await adapter!.send({ priority: 'info', event: 'task-done', sprintId: 's1', title: 'T', summary: 'done', timestamp: '2026-06-05T00:00:00Z' });
    expect(fake.sendMessage).toHaveBeenCalledTimes(1); // outbound via the inbound instance
  });

  it('dispose() stops every started connector', async () => {
    const fake = fakeConnector('telegram');
    const { dispose } = await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
    });
    await dispose();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it('authorized non-command → chat responder called + reply chunks sent (full conversation)', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'Sprint 232 tamamlandı, 0 tech debt.');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
    });
    fake._emit(incoming('durum ne alemde?', '555'));
    await vi.waitFor(() => expect(chat).toHaveBeenCalledWith('555', 'durum ne alemde?'));
    // a thinking ack + the reply land on the same chat
    await vi.waitFor(() => expect(fake.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2));
    const texts = fake.sendMessage.mock.calls.map((c) => (c[0] as { text: string }).text);
    expect(texts.some((t) => t.includes('Sprint 232'))).toBe(true);
  });

  it('unauthorized non-command → chat responder NOT called (RCE chokepoint)', async () => {
    const fake = fakeConnector('telegram');
    const chat = vi.fn(async () => 'should not run');
    await bootstrapConnectorCommands('/root', cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'resolved'),
      chat,
    });
    fake._emit(incoming('run anything', '999-stranger'));
    await new Promise((r) => setTimeout(r, 20));
    expect(chat).not.toHaveBeenCalled();
  });

  it('unresolved $DECK token → skipped, nothing started, adapter null', async () => {
    const make = vi.fn();
    const { adapter } = await bootstrapConnectorCommands('/root',
      { telegram: { enabled: true, token: '$DECK:TELEGRAM_TOKEN', chat_id: '555' } },
      { makeConnector: make as never, resolve: vi.fn(async () => 'resolved') });
    expect(make).not.toHaveBeenCalled();
    expect(adapter).toBeNull();
  });
});
