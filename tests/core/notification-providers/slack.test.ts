import { describe, it, expect, vi } from 'vitest';
import { SlackNotificationProvider } from '../../../src/core/notification-providers/slack.js';
import type { HttpClient, SlackPayload } from '../../../src/core/notification-providers/slack.js';
import type { NotificationEvent } from '../../../src/core/notifications.js';

// ─── Helpers ────────────────────────────────────────────────────────

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

// ─── Tests ──────────────────────────────────────────────────────────

describe('SlackNotificationProvider', () => {
  it('sends POST request to webhook URL', async () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http, '1.0.0');

    await provider.send('https://hooks.slack.com/services/xxx', makeEvent());

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('https://hooks.slack.com/services/xxx');
  });

  it('builds payload with header block', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http, '1.0.0');

    const payload = provider.buildPayload(makeEvent({ type: 'sprint_complete' }));
    const header = payload.blocks.find(b => b.type === 'header');
    expect(header).toBeDefined();
    expect(header!.text!.text).toBe('Sprint Complete');
  });

  it('builds payload with correct header for sprint_failed', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ type: 'sprint_failed' }));
    const header = payload.blocks.find(b => b.type === 'header');
    expect(header!.text!.text).toBe('Sprint Failed');
  });

  it('builds payload with correct header for task_nogo', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ type: 'task_nogo' }));
    const header = payload.blocks.find(b => b.type === 'header');
    expect(header!.text!.text).toBe('Task NO-GO');
  });

  it('builds payload with correct header for usage_warning', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ type: 'usage_warning' }));
    const header = payload.blocks.find(b => b.type === 'header');
    expect(header!.text!.text).toBe('Usage Warning');
  });

  it('includes summary in section block', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ summary: 'All done' }));
    const sections = payload.blocks.filter(b => b.type === 'section');
    const summaryBlock = sections.find(b => b.text?.text === 'All done');
    expect(summaryBlock).toBeDefined();
    expect(summaryBlock!.text!.type).toBe('mrkdwn');
  });

  it('includes details in a section block when present', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ details: 'Extra details' }));
    const sections = payload.blocks.filter(b => b.type === 'section');
    const detailBlock = sections.find(b => b.fields && b.fields.length > 0);
    expect(detailBlock).toBeDefined();
    expect(detailBlock!.fields![0]!.text).toContain('Extra details');
  });

  it('omits details section when no details', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ details: undefined }));
    const sections = payload.blocks.filter(b => b.type === 'section');
    const detailBlock = sections.find(b => b.fields && b.fields.length > 0);
    expect(detailBlock).toBeUndefined();
  });

  it('includes context block with version', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http, '3.2.1');

    const payload = provider.buildPayload(makeEvent());
    const ctx = payload.blocks.find(b => b.type === 'context');
    expect(ctx).toBeDefined();
    expect(ctx!.elements![0]!.text).toBe('deckent v3.2.1');
  });

  it('includes fallback text for non-block clients', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent({ summary: 'test msg' }));
    expect(payload.text).toContain('Sprint Complete');
    expect(payload.text).toContain('test msg');
  });

  it('uses default version 0.1.0 when not specified', () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    const payload = provider.buildPayload(makeEvent());
    const ctx = payload.blocks.find(b => b.type === 'context');
    expect(ctx!.elements![0]!.text).toBe('deckent v0.1.0');
  });

  it('propagates HTTP errors from send', async () => {
    const http: HttpClient = {
      post: vi.fn().mockRejectedValue(new Error('slack API error')),
    };
    const provider = new SlackNotificationProvider(http);

    await expect(
      provider.send('https://hooks.slack.com/services/xxx', makeEvent())
    ).rejects.toThrow('slack API error');
  });

  it('sends JSON body with correct content type', async () => {
    const http = makeMockHttpClient();
    const provider = new SlackNotificationProvider(http);

    await provider.send('https://hooks.slack.com/services/xxx', makeEvent());

    const opts = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]![2] as { headers: Record<string, string> };
    expect(opts.headers['Content-Type']).toBe('application/json');
  });
});
