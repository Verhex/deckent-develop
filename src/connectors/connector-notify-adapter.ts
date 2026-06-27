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
// timeout and per-target error isolation.
//
// Two paths:
//   makeConnectorNotificationAdapter — per-channel: each connector has its own chatId,
//     per-connector rich rendering (Telegram HTML). Use when chatIds differ per platform.
//   makeConnectorPoolNotificationAdapter — broadcast-to-all: fans out to ALL registered
//     connectors on the same channelId via ConnectorPool.broadcastAll. Plain text only.
//     Use for system-wide alerts where every active connector shares a broadcast channel.

import type { Notification, NotificationAdapter } from '../core/notification-dispatcher.js';
import type { IMessageConnector, InlineButton } from './types.js';
import type { ConnectorPool } from './connector-pool.js';
import { chunkMessage } from './message-format.js';
import { debugLog } from '../core/utils.js';

/** A started (outbound) connector plus the chat id notifications are sent to. */
export interface ConnectorTarget {
  connector: IMessageConnector;
  chatId: string;
}

export interface ConnectorNotifyOptions {
  /** Per-send timeout in ms (default 5000) — caps a slow/unreachable platform. */
  timeoutMs?: number;
  /**
   * Optional KPI summary hook — called after a `sprint-finalized` notification is
   * delivered. Returns the formatted summary string to broadcast, or null/undefined
   * to skip. Non-blocking: a throw or rejection is caught and logged, never
   * propagated to the caller.
   */
  kpiSummaryFn?: (sprintId: string) => Promise<string | null | undefined>;
}

const PRIORITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

function formatNotification(n: Notification): string {
  const emoji = PRIORITY_EMOJI[n.priority] ?? 'ℹ️';
  const head = `${emoji} [deckent] ${n.title}: ${n.summary}`;
  // Surface the actionable approve/reject commands (each carries its own short
  // code) so the operator can resolve the ask straight from the chat reply —
  // previously actions never reached the connector at all (only the CLI/event
  // surfaces showed "what to run"). Rendering is deterministic so commands survive verbatim.
  if (!n.actions || n.actions.length === 0) return head;
  const cmds = n.actions.map((a) => `${a.label}: ${a.cliCommand}`).join('  ·  ');
  return `${head}\n${cmds}`;
}

/** Escape the three characters Telegram's HTML parse_mode treats specially. */
function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Telegram HTML-formatted notification (rich-approval bot): bold title, the
 * fallback approve/reject commands as <code> (the inline buttons carry the real
 * action). Dynamic content is HTML-escaped so a triggerId/command containing
 * `<`/`>`/`&` never breaks the parse. Plain `formatNotification` still serves
 * connectors without rich text.
 */
function formatNotificationHtml(n: Notification): string {
  const emoji = PRIORITY_EMOJI[n.priority] ?? 'ℹ️';
  const head = `${emoji} <b>${htmlEscape(n.title)}</b>\n${htmlEscape(n.summary)}`;
  if (!n.actions || n.actions.length === 0) return head;
  const cmds = n.actions
    .map((a) => `${htmlEscape(a.label)}: <code>${htmlEscape(a.cliCommand)}</code>`)
    .join('\n');
  return `${head}\n${cmds}`;
}

/**
 * Build a single row of inline buttons from a notification's actions (rich-approval
 * bot). Only actions carrying a `callbackData` become buttons — text-only actions
 * keep their cliCommand in the rendered text. Returns undefined when no action is
 * button-actionable so the message stays a plain text send (back-compat).
 */
function buildActionButtons(actions: Notification['actions']): InlineButton[][] | undefined {
  if (!actions || actions.length === 0) return undefined;
  const row: InlineButton[] = actions
    .filter((a) => typeof a.callbackData === 'string' && a.callbackData.length > 0)
    .map((a) => ({ text: a.label, callbackData: a.callbackData! }));
  return row.length > 0 ? [row] : undefined;
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
 * Build a NotificationAdapter that broadcasts each notification to ALL connectors
 * registered in the pool on the same channelId, via ConnectorPool.broadcastAll.
 *
 * This is the optional broadcast-to-all path — use when every active connector
 * should receive the same notification on a shared broadcast channel (e.g. a
 * system-wide alert that every operator platform picks up). For per-connector
 * chat ids and rich per-platform rendering use makeConnectorNotificationAdapter.
 *
 * Fail-safe: the entire broadcastAll is wrapped in a timeout; a hung pool never
 * blocks the awaited notify() in the sprint lifecycle.
 */
export function makeConnectorPoolNotificationAdapter(
  pool: ConnectorPool,
  channelId: string,
  opts: ConnectorNotifyOptions = {},
): NotificationAdapter {
  const timeoutMs = opts.timeoutMs ?? 5000;
  return {
    name: 'connector-pool-broadcast',

    isAvailable(): boolean {
      return pool.getAll().length > 0;
    },

    async send(notification: Notification): Promise<void> {
      const text = formatNotification(notification);
      await withTimeout(pool.broadcastAll({ channelId, text }), timeoutMs).catch(() => undefined);
    },
  };
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
  return {
    name: 'connector-broadcast',

    isAvailable(): boolean {
      return targets.length > 0;
    },

    async send(notification: Notification): Promise<void> {
      // Rich-approval bot: actions that carry a callbackData become inline buttons,
      // attached to the LAST part so they render once, under the final message.
      // Button-incapable connectors ignore `buttons` and keep the cliCommand text.
      const buttons = buildActionButtons(notification.actions);
      await Promise.all(
        targets.map((t) =>
          withTimeout(
            (async (): Promise<void> => {
              // Per-connector rendering: Telegram gets HTML rich text (bold title,
              // <code> commands) + parse_mode; other connectors keep plain text so
              // they never display raw tags. BOT-1 + BOT-LEN: humanize then split
              // into platform-safe parts — never reject/cut.
              const isTelegram = t.connector.id === 'telegram';
              const rendered = isTelegram
                ? formatNotificationHtml(notification)
                : formatNotification(notification);
              const parts = chunkMessage(rendered);
              for (let i = 0; i < parts.length; i++) {
                const isLast = i === parts.length - 1;
                await t.connector.sendMessage({
                  connector: t.connector.id,
                  channelId: t.chatId,
                  text: parts[i]!,
                  ...(isTelegram ? { parseMode: 'HTML' as const } : {}),
                  ...(isLast && buttons ? { buttons } : {}),
                });
              }
            })(),
            timeoutMs,
          ).catch(() => undefined), // per-target isolation: a failure never propagates
        ),
      );

      // KPI summary hook: opt-in, non-blocking sprint-finalized broadcast.
      // A throw or rejection is caught and logged; it NEVER fails the notify path.
      if (notification.event === 'sprint-finalized' && opts.kpiSummaryFn) {
        try {
          const summary = await opts.kpiSummaryFn(notification.sprintId);
          if (summary) {
            await Promise.all(
              targets.map((t) =>
                withTimeout(
                  t.connector.sendMessage({
                    connector: t.connector.id,
                    channelId: t.chatId,
                    text: summary,
                  }),
                  timeoutMs,
                ).catch(() => undefined),
              ),
            );
          }
        } catch (err) {
          debugLog('connector-notify-adapter:kpi-summary', err);
        }
      }
    },
  };
}
