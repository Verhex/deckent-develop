// BOT-001 (MASTER-PLAN §4G) — ConnectorNotificationAdapter.
//
// Bridges the DECKENT→USER:NOTIFY stream (WIRE-001 NotifyDispatcher) to the
// messaging connectors: a sprint notification fans out to each enabled connector
// at its OWN chat id. Reuses the NotificationAdapter contract so connectors get
// the same throttled notify() stream as the CLI/file/MCP adapters.
//
// Fail-safe (advisor): a connector that throws OR hangs must NOT block the
// awaited notify() in the sprint lifecycle — each send is timeout-guarded and
// per-target error-isolated. Delivery to a real platform is user-verified; these
// tests prove the wiring + the fail-safe.

import { describe, it, expect } from 'vitest';
import { makeConnectorNotificationAdapter } from '../../src/connectors/connector-notify-adapter.js';
import type { ConnectorId, IMessageConnector, OutgoingMessage } from '../../src/connectors/types.js';
import type { Notification } from '../../src/core/notification-dispatcher.js';

function fakeConnector(
  id: ConnectorId,
  behavior: { throw?: boolean; hang?: boolean } = {},
): IMessageConnector & { sent: OutgoingMessage[] } {
  const sent: OutgoingMessage[] = [];
  return {
    id,
    name: id,
    sent,
    start: async () => {},
    stop: async () => {},
    sendMessage: async (msg: OutgoingMessage) => {
      if (behavior.throw) throw new Error('boom');
      if (behavior.hang) await new Promise(() => {}); // never resolves
      sent.push(msg);
    },
    onMessage: () => {},
    isHealthy: () => true,
  };
}

function notif(priority: Notification['priority'] = 'info'): Notification {
  return {
    priority,
    event: 'task-done',
    title: 'Sprint done',
    summary: '5 tasks complete',
    sprintId: 'sprint-1',
    timestamp: '2026-06-05T00:00:00.000Z',
  };
}

describe('ConnectorNotificationAdapter (BOT-001)', () => {
  it('sends to each connector at its own chat id, with the notification text', async () => {
    const tg = fakeConnector('telegram');
    const dc = fakeConnector('discord');
    const adapter = makeConnectorNotificationAdapter([
      { connector: tg, chatId: 'TG-123' },
      { connector: dc, chatId: 'DC-999' },
    ]);

    await adapter.send(notif());

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0]?.channelId).toBe('TG-123');
    expect(tg.sent[0]?.text).toContain('Sprint done');
    expect(tg.sent[0]?.text).toContain('5 tasks complete');
    expect(dc.sent).toHaveLength(1);
    expect(dc.sent[0]?.channelId).toBe('DC-999');
  });

  it('isAvailable reflects whether any target is configured', () => {
    expect(makeConnectorNotificationAdapter([{ connector: fakeConnector('telegram'), chatId: 'x' }]).isAvailable()).toBe(true);
    expect(makeConnectorNotificationAdapter([]).isAvailable()).toBe(false);
  });

  it('fail-safe: a throwing connector is swallowed; other connectors still receive', async () => {
    const bad = fakeConnector('telegram', { throw: true });
    const good = fakeConnector('discord');
    const adapter = makeConnectorNotificationAdapter([
      { connector: bad, chatId: 'x' },
      { connector: good, chatId: 'y' },
    ]);

    await expect(adapter.send(notif())).resolves.toBeUndefined();
    expect(good.sent).toHaveLength(1);
  });

  it('fail-safe: a hanging connector is timed out, not awaited forever', async () => {
    const hang = fakeConnector('telegram', { hang: true });
    const adapter = makeConnectorNotificationAdapter([{ connector: hang, chatId: 'x' }], { timeoutMs: 40 });
    // Resolves via the timeout rather than hanging the sprint's awaited notify().
    await expect(adapter.send(notif('critical'))).resolves.toBeUndefined();
  });

  // BOT-LEN — a notification longer than Telegram's 4096-char cap is SPLIT into
  // multiple messages (lossless), never hard-cut. The bot is meaningless if it
  // truncates: the operator must see the whole content.
  it('lossless: a notification over the Telegram limit is split, never cut', async () => {
    const tg = fakeConnector('telegram');
    const adapter = makeConnectorNotificationAdapter([{ connector: tg, chatId: 'TG' }]);
    const longSummary = 'L'.repeat(9000);
    await adapter.send({
      priority: 'info', event: 'task-done', title: 'Big', summary: longSummary,
      sprintId: 's', timestamp: '2026-06-15T00:00:00.000Z',
    });
    expect(tg.sent.length).toBeGreaterThan(1);                       // split, not one giant msg
    for (const m of tg.sent) expect(m.text.length).toBeLessThanOrEqual(4096); // each fits Telegram
    const joined = tg.sent.map((m) => m.text).join('');
    expect(joined).toContain(longSummary);                           // nothing lost
    expect(joined).not.toContain('truncated');                       // not cut
  });
});
