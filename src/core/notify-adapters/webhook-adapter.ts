// ═══ Webhook Notification Adapter — R4 WIRE (B11) ════════════════════════════
// Bridges the dormant WebhookNotificationProvider (notification-providers/webhook.ts,
// previously zero prod-caller) into the canonical NotifyDispatcher chain so a
// DECKENT→USER:NOTIFY notification also reaches a generic outbound HTTP webhook
// (CI / PagerDuty / Zapier / n8n / Slack-incoming / a custom dashboard) — a reach
// the Telegram/Discord connector adapter does NOT cover.
//
// Wired from notify_channel='webhook' + notify_url (the legacy config fields that
// the dashboard surfaced but nothing ever read). The provider keeps its 1-retry +
// JSONL delivery log; this adapter only maps the canonical Notification onto the
// provider's NotificationEvent and gates availability on a configured URL.
//
// Fail-safe: the dispatcher already isolates adapter errors (a webhook timeout or
// non-2xx never crashes the sprint), so this adapter may throw freely.

import type { Notification, NotificationAdapter } from '../notification-dispatcher.js';
import type { NotificationEvent } from '../notifications.js';
import { WebhookNotificationProvider, type HttpClient } from '../notification-providers/webhook.js';

/**
 * Production HttpClient backed by Node's native fetch (Node 24+, zero runtime
 * dependency — ADR-010). Aborts on the provider-supplied timeout so a hanging
 * endpoint never blocks the notify pipeline.
 */
export const fetchHttpClient: HttpClient = {
  async post(url, body, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: options.headers,
        body,
        signal: controller.signal,
      });
      return { statusCode: res.status };
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * NotificationAdapter that delivers each notification to a single outbound
 * webhook URL via {@link WebhookNotificationProvider}.
 */
export class WebhookNotificationAdapter implements NotificationAdapter {
  readonly name = 'webhook';

  constructor(
    private readonly url: string,
    private readonly provider: WebhookNotificationProvider,
  ) {}

  /** Available only when a non-empty URL is configured. */
  isAvailable(): boolean {
    return this.url.trim().length > 0;
  }

  async send(notification: Notification): Promise<void> {
    // The widened NotificationEventType (notifications.ts) accepts the canonical
    // event name, so the webhook payload carries the real event verbatim. Title +
    // summary are joined so a flat webhook consumer gets the human-readable line.
    const event: NotificationEvent = {
      type: notification.event,
      summary: `${notification.title}: ${notification.summary}`,
      ...(notification.details !== undefined ? { details: notification.details } : {}),
    };
    await this.provider.send(this.url, event);
  }
}

export interface BuildWebhookAdapterOptions {
  /** Outbound webhook URL (from notify_url). */
  url: string;
  /** Project name surfaced in the webhook payload. */
  projectName: string;
  /** Delivery-log path override (default: <cwd>/.deckent/notification-log.json). */
  logPath?: string;
  /** Injectable HTTP client (tests pass a recorder; prod uses fetchHttpClient). */
  httpClient?: HttpClient;
}

/**
 * Construct a webhook NotificationAdapter ready to register on the global
 * NotifyDispatcher. Reuses the existing provider so retry + delivery-logging
 * behavior is identical to the (formerly dormant) standalone path.
 */
export function buildWebhookNotificationAdapter(
  options: BuildWebhookAdapterOptions,
): NotificationAdapter {
  const provider = new WebhookNotificationProvider(
    options.httpClient ?? fetchHttpClient,
    options.projectName,
    options.logPath,
  );
  return new WebhookNotificationAdapter(options.url, provider);
}
