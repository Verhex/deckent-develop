// ─── Discord Notification Provider ──────────────────────────────────
import type { NotificationEvent, NotificationProvider } from '../notifications.js';

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordPayload {
  embeds: DiscordEmbed[];
}

export interface HttpClient {
  post(url: string, body: string, options: { timeout: number; headers: Record<string, string> }): Promise<{ statusCode: number }>;
}

// Color constants (decimal)
const COLOR_GREEN = 0x00cc00;
const COLOR_RED = 0xcc0000;
const COLOR_YELLOW = 0xcccc00;
const COLOR_BLUE = 0x0066cc;

function getColorForEvent(type: string): number {
  switch (type) {
    case 'sprint_complete':
      return COLOR_GREEN;
    case 'sprint_failed':
      return COLOR_RED;
    case 'task_nogo':
      return COLOR_RED;
    case 'usage_warning':
      return COLOR_YELLOW;
    default:
      return COLOR_BLUE;
  }
}

function getTitleForEvent(type: string): string {
  switch (type) {
    case 'sprint_complete':
      return 'Sprint Complete';
    case 'sprint_failed':
      return 'Sprint Failed';
    case 'task_nogo':
      return 'Task NO-GO';
    case 'usage_warning':
      return 'Usage Warning';
    default:
      return 'Notification';
  }
}

export class DiscordNotificationProvider implements NotificationProvider {
  private httpClient: HttpClient;
  private version: string;

  constructor(httpClient: HttpClient, version?: string) {
    this.httpClient = httpClient;
    this.version = version ?? '0.1.0';
  }

  async send(webhookUrl: string, event: NotificationEvent): Promise<void> {
    const embed: DiscordEmbed = {
      title: getTitleForEvent(event.type),
      description: event.summary,
      color: getColorForEvent(event.type),
      timestamp: new Date().toISOString(),
      footer: { text: `deckent v${this.version}` },
    };

    if (event.details) {
      embed.fields = [
        { name: 'Details', value: event.details, inline: false },
      ];
    }

    const payload: DiscordPayload = { embeds: [embed] };
    const body = JSON.stringify(payload);

    await this.httpClient.post(webhookUrl, body, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Build the embed payload without sending (useful for testing).
   */
  buildEmbed(event: NotificationEvent): DiscordEmbed {
    const embed: DiscordEmbed = {
      title: getTitleForEvent(event.type),
      description: event.summary,
      color: getColorForEvent(event.type),
      timestamp: new Date().toISOString(),
      footer: { text: `deckent v${this.version}` },
    };

    if (event.details) {
      embed.fields = [
        { name: 'Details', value: event.details, inline: false },
      ];
    }

    return embed;
  }
}
