// ─── Slack Notification Provider ────────────────────────────────────
import type { NotificationEvent, NotificationProvider } from '../notifications.js';

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text: string }>;
  fields?: Array<{ type: string; text: string }>;
}

export interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

export interface HttpClient {
  post(url: string, body: string, options: { timeout: number; headers: Record<string, string> }): Promise<{ statusCode: number }>;
}

function getHeaderForEvent(type: string): string {
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

export class SlackNotificationProvider implements NotificationProvider {
  private httpClient: HttpClient;
  private version: string;

  constructor(httpClient: HttpClient, version?: string) {
    this.httpClient = httpClient;
    this.version = version ?? '0.1.0';
  }

  async send(webhookUrl: string, event: NotificationEvent): Promise<void> {
    const payload = this.buildPayload(event);
    const body = JSON.stringify(payload);

    await this.httpClient.post(webhookUrl, body, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Build the Slack Block Kit payload.
   */
  buildPayload(event: NotificationEvent): SlackPayload {
    const blocks: SlackBlock[] = [];

    // Header block
    blocks.push({
      type: 'header',
      text: { type: 'plain_text', text: getHeaderForEvent(event.type) },
    });

    // Section block with summary
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: event.summary },
    });

    // Details section (if present)
    if (event.details) {
      blocks.push({
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Details:*\n${event.details}` },
        ],
      });
    }

    // Context block with version
    blocks.push({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `deckent v${this.version}` },
      ],
    });

    // Fallback text for non-block-compatible clients
    const fallbackText = `${getHeaderForEvent(event.type)}: ${event.summary}`;

    return { text: fallbackText, blocks };
  }
}
