// BOT-001 (MASTER-PLAN §4G) — ConnectorNotificationAdapter.
//
// A NotificationAdapter (WIRE-001 contract) that fans a DECKENT→USER:NOTIFY
// notification out to messaging connectors (Telegram/Discord) — each at its own
// chat id. Plugged into the global NotifyDispatcher as an extra adapter, so a
// sprint notification reaches the operator's phone the same way it reaches the
// CLI terminal / MCP / file log.
//
// Fail-safe (advisor): notify() is awaited in the sprint lifecycle, so a
// connector that throws OR hangs must never block it. Each send is wrapped in a
// timeout and per-target error isolation. Use per-connector sendMessage (chat id
// differs per platform) — NOT ConnectorPool.broadcast (one channel for all).

import type { Notification, NotificationAdapter } from '../core/notification-dispatcher.js';
import type { IMessageConnector } from './types.js';
import { makeBotHumanizer, type BotHumanizer } from './bot-humanizer.js';

/** A started (outbound) connector plus the chat id notifications are sent to. */
export interface ConnectorTarget {
  connector: IMessageConnector;
  chatId: string;
}

export interface ConnectorNotifyOptions {
  /** Per-send timeout in ms (default 5000) — caps a slow/unreachable platform. */
  timeoutMs?: number;
  /**
   * BOT-1 bot-agent: rephrases + summarizes-to-fit each notification before send.
   * Absent → a passthrough humanizer (raw text, lossless chunk) — identical to the
   * pre-BOT-1 behavior, so this is zero-risk when the bot-agent is off.
   */
  humanizer?: BotHumanizer;
}

const PRIORITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

function formatNotification(n: Notification): string {
  const emoji = PRIORITY_EMOJI[n.priority] ?? 'ℹ️';
  return `${emoji} [deckent] ${n.title}: ${n.summary}`;
}

/** Resolve `undefined` after `ms` so a hanging send never blocks the caller. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p,
    new Promise<undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), ms);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]);
}

/**
 * Build a NotificationAdapter that delivers each notification to every target
 * connector at its configured chat id.
 */
export function makeConnectorNotificationAdapter(
  targets: ConnectorTarget[],
  opts: ConnectorNotifyOptions = {},
): NotificationAdapter {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const humanizer = opts.humanizer ?? makeBotHumanizer();
  return {
    name: 'connector-broadcast',

    isAvailable(): boolean {
      return targets.length > 0;
    },

    async send(notification: Notification): Promise<void> {
      // BOT-1 + BOT-LEN: humanize (when enabled) then split into Telegram-safe
      // parts — never reject/cut. Passthrough humanizer = lossless chunk only.
      const parts = await humanizer.toParts(formatNotification(notification));
      await Promise.all(
        targets.map((t) =>
          withTimeout(
            (async (): Promise<void> => {
              for (const text of parts) {
                await t.connector.sendMessage({
                  connector: t.connector.id,
                  channelId: t.chatId,
                  text,
                });
              }
            })(),
            timeoutMs,
          ).catch(() => undefined), // per-target isolation: a failure never propagates
        ),
      );
    },
  };
}
