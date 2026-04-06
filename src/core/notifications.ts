// ─── Notification Dispatcher ─────────────────────────────────────────
import { debugLog } from './utils.js';

export type NotificationEventType =
  | 'sprint_complete'
  | 'sprint_failed'
  | 'task_nogo'
  | 'usage_warning';

export interface NotificationEvent {
  type: NotificationEventType;
  summary: string;
  details?: string;
}

export interface NotificationConfig {
  terminal?: boolean;
  webhook?: string;
  discord?: string;
  slack?: string;
  events?: NotificationEventType[];
}

export interface NotificationProvider {
  send(url: string, event: NotificationEvent): Promise<void>;
}

// ─── Non-interactive detection ──────────────────────────────────────

export function isInteractiveTerminal(): boolean {
  if (typeof process === 'undefined') return false;
  if (typeof process.stdout === 'undefined') return false;
  if (typeof process.stdout.isTTY === 'undefined') return false;
  return process.stdout.isTTY === true;
}

// ─── NotificationDispatcher ─────────────────────────────────────────

export class NotificationDispatcher {
  private webhookProvider: NotificationProvider | null = null;
  private discordProvider: NotificationProvider | null = null;
  private slackProvider: NotificationProvider | null = null;

  /**
   * Register a webhook notification provider.
   */
  setWebhookProvider(provider: NotificationProvider): void {
    this.webhookProvider = provider;
  }

  /**
   * Register a discord notification provider.
   */
  setDiscordProvider(provider: NotificationProvider): void {
    this.discordProvider = provider;
  }

  /**
   * Register a slack notification provider.
   */
  setSlackProvider(provider: NotificationProvider): void {
    this.slackProvider = provider;
  }

  /**
   * Dispatch a notification event according to the given config.
   * Returns the number of channels that were dispatched to.
   */
  async dispatch(event: NotificationEvent, config: NotificationConfig): Promise<number> {
    // Check if this event type is in the allowed events list
    const allowedEvents = config.events ?? ['sprint_complete', 'sprint_failed'];
    if (!allowedEvents.includes(event.type)) {
      return 0;
    }

    let dispatched = 0;

    // Terminal bell
    if (config.terminal !== false) {
      if (isInteractiveTerminal()) {
        process.stdout.write('\x07');
        dispatched++;
      }
    }

    // Webhook
    if (config.webhook && this.webhookProvider) {
      try {
        await this.webhookProvider.send(config.webhook, event);
        dispatched++;
      } catch (e) {
        debugLog('NotificationDispatcher:dispatch:webhook', e);
      }
    }

    // Discord
    if (config.discord && this.discordProvider) {
      try {
        await this.discordProvider.send(config.discord, event);
        dispatched++;
      } catch (e) {
        debugLog('NotificationDispatcher:dispatch:discord', e);
      }
    }

    // Slack
    if (config.slack && this.slackProvider) {
      try {
        await this.slackProvider.send(config.slack, event);
        dispatched++;
      } catch (e) {
        debugLog('NotificationDispatcher:dispatch:slack', e);
      }
    }

    return dispatched;
  }
}
