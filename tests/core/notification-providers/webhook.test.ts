import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WebhookNotificationProvider } from '../../../src/core/notification-providers/webhook.js';
import type { HttpClient, WebhookLogEntry } from '../../../src/core/notification-providers/webhook.js';
import type { NotificationEvent } from '../../../src/core/notifications.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `webhook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    type: 'sprint_complete',
    summary: 'Sprint 001 completed',
    details: '10 tasks done',
    ...overrides,
  };
}

function makeMockHttpClient(statusCode = 200): HttpClient {
  return {
    post: vi.fn().mockResolvedValue({ statusCode }),
  };
}

function makeFailingHttpClient(error?: Error): HttpClient {
  return {
    post: vi.fn().mockRejectedValue(error ?? new Error('network failure')),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('WebhookNotificationProvider', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('sends POST request with correct JSON payload', async () => {
    const http = makeMockHttpClient();
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent());

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, { timeout: number; headers: Record<string, string> }];
    expect(url).toBe('https://example.com/hook');
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed['event']).toBe('sprint_complete');
    expect(parsed['summary']).toBe('Sprint 001 completed');
    expect(parsed['project']).toBe('test-project');
    expect(parsed['timestamp']).toBeDefined();
    expect(opts.timeout).toBe(5000);
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('includes details in payload when present', async () => {
    const http = makeMockHttpClient();
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent({ details: 'extra info' }));

    const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed['details']).toBe('extra info');
  });

  it('retries once on failure', async () => {
    const http = makeFailingHttpClient();
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await expect(provider.send('https://example.com/hook', makeEvent())).rejects.toThrow('network failure');
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('succeeds on retry after first failure', async () => {
    const http: HttpClient = {
      post: vi.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce({ statusCode: 200 }),
    };
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent());
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('logs successful webhook call', async () => {
    const http = makeMockHttpClient(201);
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent());

    expect(existsSync(logPath)).toBe(true);
    const entries = JSON.parse(readFileSync(logPath, 'utf-8')) as WebhookLogEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe('success');
    expect(entries[0]!.statusCode).toBe(201);
  });

  it('logs failed webhook call with error message', async () => {
    const http = makeFailingHttpClient(new Error('timeout'));
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await expect(provider.send('https://example.com/hook', makeEvent())).rejects.toThrow();

    expect(existsSync(logPath)).toBe(true);
    const entries = JSON.parse(readFileSync(logPath, 'utf-8')) as WebhookLogEntry[];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.status).toBe('error');
    expect(entries[0]!.errorMessage).toBe('timeout');
  });

  it('creates log directory if it does not exist', async () => {
    const http = makeMockHttpClient();
    const logPath = join(tmpRoot, 'deep', 'nested', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent());

    expect(existsSync(logPath)).toBe(true);
  });

  it('appends to existing log entries', async () => {
    const http = makeMockHttpClient();
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent({ type: 'sprint_complete' }));
    await provider.send('https://example.com/hook', makeEvent({ type: 'sprint_failed' }));

    const entries = JSON.parse(readFileSync(logPath, 'utf-8')) as WebhookLogEntry[];
    expect(entries).toHaveLength(2);
    expect(entries[0]!.event).toBe('sprint_complete');
    expect(entries[1]!.event).toBe('sprint_failed');
  });

  it('uses 5000ms timeout for HTTP requests', async () => {
    const http = makeMockHttpClient();
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent());

    const opts = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]![2] as { timeout: number };
    expect(opts.timeout).toBe(5000);
  });

  it('uses application/json content type', async () => {
    const http = makeMockHttpClient();
    const logPath = join(tmpRoot, '.deckent', 'notification-log.json');
    const provider = new WebhookNotificationProvider(http, 'test-project', logPath);

    await provider.send('https://example.com/hook', makeEvent());

    const opts = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]![2] as { headers: Record<string, string> };
    expect(opts.headers['Content-Type']).toBe('application/json');
  });
});
