// Unit coverage for the webhook NotificationAdapter (R4/B11 WIRE) + the
// config→webhook gate resolver. Complements the end-to-end faithful wire test in
// tests/core/notify-webhook-bootstrap.test.ts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWebhookNotificationAdapter } from '../../../src/core/notify-adapters/webhook-adapter.js';
import { resolveWebhookBootstrapOption } from '../../../src/core/notify-bootstrap.js';
import { createNotification } from '../../../src/core/notification-dispatcher.js';
import type { HttpClient } from '../../../src/core/notification-providers/webhook.js';

class RecordingHttpClient implements HttpClient {
  readonly calls: Array<{ url: string; body: string }> = [];
  async post(url: string, body: string): Promise<{ statusCode: number }> {
    this.calls.push({ url, body });
    return { statusCode: 200 };
  }
}

describe('WebhookNotificationAdapter', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-wh-adapter-'));
    logPath = join(tmpDir, 'notification-log.json');
  });
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  it('maps a canonical Notification onto the webhook payload (lossless event)', async () => {
    const rec = new RecordingHttpClient();
    const adapter = buildWebhookNotificationAdapter({
      url: 'https://example.test/hook',
      projectName: 'proj',
      logPath,
      httpClient: rec,
    });

    expect(adapter.name).toBe('webhook');
    expect(adapter.isAvailable()).toBe(true);

    await adapter.send(createNotification('task-no-go', 's1', 'Title', 'Summary', 'det'));

    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]!.url).toBe('https://example.test/hook');
    const payload = JSON.parse(rec.calls[0]!.body) as Record<string, unknown>;
    expect(payload['event']).toBe('task-no-go');
    expect(payload['summary']).toBe('Title: Summary');
    expect(payload['details']).toBe('det');
    expect(payload['project']).toBe('proj');
  });

  it('is unavailable when no URL is configured', () => {
    const adapter = buildWebhookNotificationAdapter({
      url: '',
      projectName: 'proj',
      logPath,
      httpClient: new RecordingHttpClient(),
    });
    expect(adapter.isAvailable()).toBe(false);
  });
});

describe('resolveWebhookBootstrapOption', () => {
  it('returns the webhook option when channel=webhook and a URL is set', () => {
    expect(
      resolveWebhookBootstrapOption({ notify_channel: 'webhook', notify_url: 'https://x', projectName: 'p' }),
    ).toEqual({ url: 'https://x', projectName: 'p' });
  });

  it('defaults the project name when absent', () => {
    expect(
      resolveWebhookBootstrapOption({ notify_channel: 'webhook', notify_url: 'https://x' }),
    ).toEqual({ url: 'https://x', projectName: 'deckent' });
  });

  it('returns undefined for a non-webhook channel', () => {
    expect(
      resolveWebhookBootstrapOption({ notify_channel: 'slack', notify_url: 'https://x' }),
    ).toBeUndefined();
  });

  it('returns undefined when the URL is missing', () => {
    expect(
      resolveWebhookBootstrapOption({ notify_channel: 'webhook', notify_url: null }),
    ).toBeUndefined();
  });
});
