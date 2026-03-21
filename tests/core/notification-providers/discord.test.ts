import { describe, it, expect, vi } from 'vitest';
import { DiscordNotificationProvider } from '../../../src/core/notification-providers/discord.js';
import type { HttpClient, DiscordPayload } from '../../../src/core/notification-providers/discord.js';
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

describe('DiscordNotificationProvider', () => {
  it('sends POST request to webhook URL', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http, '1.0.0');

    await provider.send('https://discord.com/api/webhooks/123/abc', makeEvent());

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('https://discord.com/api/webhooks/123/abc');
  });

  it('sends embed with correct title for sprint_complete', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http, '1.0.0');

    await provider.send('https://discord.com/hook', makeEvent({ type: 'sprint_complete' }));

    const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const payload = JSON.parse(body) as DiscordPayload;
    expect(payload.embeds[0]!.title).toBe('Sprint Complete');
  });

  it('sends embed with correct title for sprint_failed', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http, '1.0.0');

    await provider.send('https://discord.com/hook', makeEvent({ type: 'sprint_failed' }));

    const body = (http.post as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    const payload = JSON.parse(body) as DiscordPayload;
    expect(payload.embeds[0]!.title).toBe('Sprint Failed');
  });

  it('uses green color for sprint_complete', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ type: 'sprint_complete' }));
    expect(embed.color).toBe(0x00cc00);
  });

  it('uses red color for sprint_failed', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ type: 'sprint_failed' }));
    expect(embed.color).toBe(0xcc0000);
  });

  it('uses red color for task_nogo', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ type: 'task_nogo' }));
    expect(embed.color).toBe(0xcc0000);
  });

  it('uses yellow color for usage_warning', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ type: 'usage_warning' }));
    expect(embed.color).toBe(0xcccc00);
  });

  it('includes description from event summary', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ summary: 'All tasks done' }));
    expect(embed.description).toBe('All tasks done');
  });

  it('includes details field when event has details', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ details: 'Extra info' }));
    expect(embed.fields).toBeDefined();
    expect(embed.fields![0]!.name).toBe('Details');
    expect(embed.fields![0]!.value).toBe('Extra info');
  });

  it('omits fields when event has no details', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent({ details: undefined }));
    expect(embed.fields).toBeUndefined();
  });

  it('includes footer with version', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http, '2.3.4');

    const embed = provider.buildEmbed(makeEvent());
    expect(embed.footer).toBeDefined();
    expect(embed.footer!.text).toBe('deckent v2.3.4');
  });

  it('includes timestamp in embed', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent());
    expect(embed.timestamp).toBeDefined();
    // ISO 8601 format check
    expect(new Date(embed.timestamp!).toISOString()).toBe(embed.timestamp);
  });

  it('uses default version 0.1.0 when not specified', async () => {
    const http = makeMockHttpClient();
    const provider = new DiscordNotificationProvider(http);

    const embed = provider.buildEmbed(makeEvent());
    expect(embed.footer!.text).toBe('deckent v0.1.0');
  });

  it('propagates HTTP errors', async () => {
    const http: HttpClient = {
      post: vi.fn().mockRejectedValue(new Error('discord API error')),
    };
    const provider = new DiscordNotificationProvider(http);

    await expect(provider.send('https://discord.com/hook', makeEvent())).rejects.toThrow('discord API error');
  });
});
