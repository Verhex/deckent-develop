// ─── Webhook Notification Provider ──────────────────────────────────
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { NotificationEvent, NotificationProvider } from '../notifications.js';

export interface WebhookPayload {
  event: string;
  summary: string;
  details?: string;
  timestamp: string;
  project: string;
}

export interface WebhookLogEntry {
  url: string;
  event: string;
  status: 'success' | 'error';
  statusCode?: number;
  timestamp: string;
  errorMessage?: string;
}

export interface HttpClient {
  post(url: string, body: string, options: { timeout: number; headers: Record<string, string> }): Promise<{ statusCode: number }>;
}

export class WebhookNotificationProvider implements NotificationProvider {
  private httpClient: HttpClient;
  private projectName: string;
  private logPath: string;

  constructor(httpClient: HttpClient, projectName: string, logPath?: string) {
    this.httpClient = httpClient;
    this.projectName = projectName;
    this.logPath = logPath ?? join('.deckent', 'notification-log.json');
  }

  async send(url: string, event: NotificationEvent): Promise<void> {
    const payload: WebhookPayload = {
      event: event.type,
      summary: event.summary,
      details: event.details,
      timestamp: new Date().toISOString(),
      project: this.projectName,
    };

    const body = JSON.stringify(payload);
    let lastError: Error | null = null;

    // 1 retry (2 attempts total)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.httpClient.post(url, body, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' },
        });
        this.writeLog({ url, event: event.type, status: 'success', statusCode: result.statusCode, timestamp: new Date().toISOString() });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    this.writeLog({ url, event: event.type, status: 'error', timestamp: new Date().toISOString(), errorMessage: lastError?.message });
    throw lastError!;
  }

  private writeLog(entry: WebhookLogEntry): void {
    try {
      const dir = dirname(this.logPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      let entries: WebhookLogEntry[] = [];
      if (existsSync(this.logPath)) {
        try {
          entries = JSON.parse(readFileSync(this.logPath, 'utf-8')) as WebhookLogEntry[];
        } catch {
          entries = [];
        }
      }

      entries.push(entry);

      // Keep last 100 entries
      if (entries.length > 100) {
        entries = entries.slice(entries.length - 100);
      }

      writeFileSync(this.logPath, JSON.stringify(entries, null, 2), 'utf-8');
    } catch {
      // Silently ignore log errors
    }
  }
}
