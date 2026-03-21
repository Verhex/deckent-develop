// ─── Integration Test: Notification Flow E2E ──────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  NotificationDispatcher,
  isInteractiveTerminal,
  type NotificationConfig,
  type NotificationEvent,
  type NotificationProvider,
} from '../../src/core/notifications.js';
import {
  WebhookNotificationProvider,
  type HttpClient as WebhookHttpClient,
  type WebhookPayload,
} from '../../src/core/notification-providers/webhook.js';
import {
  DiscordNotificationProvider,
  type HttpClient as DiscordHttpClient,
  type DiscordPayload,
} from '../../src/core/notification-providers/discord.js';
import {
  SlackNotificationProvider,
  type HttpClient as SlackHttpClient,
  type SlackPayload,
} from '../../src/core/notification-providers/slack.js';
import {
  validateNotificationConfig,
  resolveNotificationConfig,
  getDefaultNotificationConfig,
} from '../../src/core/notification-config.js';

// ─── Mock helpers ─────────────────────────────────────────────────────

function createMockHttpClient(): WebhookHttpClient & { calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = [];
  return {
    calls,
    post: vi.fn().mockImplementation(async (url: string, body: string) => {
      calls.push({ url, body });
      return { statusCode: 200 };
    }),
  };
}

function createFailingHttpClient(failCount: number = 999): WebhookHttpClient & { attempts: number } {
  let attempts = 0;
  return {
    get attempts() { return attempts; },
    set attempts(v) { attempts = v; },
    post: vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts <= failCount) {
        throw new Error('Connection refused');
      }
      return { statusCode: 200 };
    }),
  };
}

// ─── Test data ────────────────────────────────────────────────────────

const SPRINT_COMPLETE_EVENT: NotificationEvent = {
  type: 'sprint_complete',
  summary: 'Sprint 032 completed: 4/4 tasks DONE',
  details: 'Coverage: 85%, Duration: 120s',
};

const SPRINT_FAILED_EVENT: NotificationEvent = {
  type: 'sprint_failed',
  summary: 'Sprint 032 failed: 3/4 tasks NO_GO',
};

const TASK_NOGO_EVENT: NotificationEvent = {
  type: 'task_nogo',
  summary: 'Task 032-003 failed: scope violation',
};

const USAGE_WARNING_EVENT: NotificationEvent = {
  type: 'usage_warning',
  summary: '5hr usage at 90%',
};

// ═══ Tests ════════════════════════════════════════════════════════════

describe('Notification Flow Integration', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let stdoutCalls: string[];

  beforeEach(() => {
    originalStdoutWrite = process.stdout.write;
    stdoutCalls = [];
    process.stdout.write = vi.fn().mockImplementation((data: string | Uint8Array) => {
      stdoutCalls.push(typeof data === 'string' ? data : data.toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    vi.restoreAllMocks();
  });

  // ─── NotificationConfig creation and validation ──────────────────

  describe('NotificationConfig validation', () => {
    it('validates a correct config with all providers', () => {
      const config: NotificationConfig = {
        terminal: true,
        webhook: 'https://hooks.example.com/webhook',
        discord: 'https://discord.com/api/webhooks/123/abc',
        slack: 'https://hooks.slack.com/services/T/B/X',
        events: ['sprint_complete', 'sprint_failed'],
      };

      const errors = validateNotificationConfig(config);
      expect(errors).toEqual([]);
    });

    it('rejects invalid URLs', () => {
      const config: NotificationConfig = {
        webhook: 'not-a-url',
        discord: 'ftp://invalid.com',
      };

      const errors = validateNotificationConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('webhook'))).toBe(true);
      expect(errors.some((e) => e.includes('discord'))).toBe(true);
    });

    it('rejects invalid event types', () => {
      const config: NotificationConfig = {
        events: ['sprint_complete', 'invalid_event' as never],
      };

      const errors = validateNotificationConfig(config);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('invalid');
    });

    it('resolves config with defaults', () => {
      const resolved = resolveNotificationConfig(undefined);
      expect(resolved.terminal).toBe(true);
      expect(resolved.events).toContain('sprint_complete');
      expect(resolved.events).toContain('sprint_failed');
    });

    it('preserves user overrides in resolved config', () => {
      const resolved = resolveNotificationConfig({
        terminal: false,
        webhook: 'https://example.com/hook',
        events: ['sprint_complete'],
      });
      expect(resolved.terminal).toBe(false);
      expect(resolved.webhook).toBe('https://example.com/hook');
      expect(resolved.events).toEqual(['sprint_complete']);
    });
  });

  // ─── Terminal bell ────────────────────────────────────────────────

  describe('Terminal bell notification', () => {
    it('sends terminal bell on sprint_complete when TTY', async () => {
      // Mock isTTY
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: true,
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);

      expect(count).toBe(1);
      expect(stdoutCalls).toContain('\x07');

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });

    it('does not send bell when terminal=false', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: false,
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
      expect(stdoutCalls).not.toContain('\x07');

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });

    it('does not send bell in non-interactive mode', async () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, writable: true, configurable: true });

      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: true,
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
    });
  });

  // ─── Webhook POST body ───────────────────────────────────────────

  describe('Webhook notification', () => {
    it('sends correct POST body with event data', async () => {
      const httpClient = createMockHttpClient();
      const provider = new WebhookNotificationProvider(httpClient, 'deckent-test', '/tmp/test-log.json');

      await provider.send('https://hooks.example.com/hook', SPRINT_COMPLETE_EVENT);

      expect(httpClient.calls).toHaveLength(1);
      const body = JSON.parse(httpClient.calls[0]!.body) as WebhookPayload;
      expect(body.event).toBe('sprint_complete');
      expect(body.summary).toBe(SPRINT_COMPLETE_EVENT.summary);
      expect(body.project).toBe('deckent-test');
      expect(body.timestamp).toBeTruthy();
    });

    it('retries once on failure then throws', async () => {
      const httpClient = createFailingHttpClient(2);
      const provider = new WebhookNotificationProvider(httpClient, 'deckent-test', '/tmp/test-log.json');

      await expect(
        provider.send('https://hooks.example.com/hook', SPRINT_COMPLETE_EVENT),
      ).rejects.toThrow('Connection refused');

      // 2 attempts total (1 original + 1 retry)
      expect(httpClient.post).toHaveBeenCalledTimes(2);
    });

    it('succeeds on retry after first failure', async () => {
      const httpClient = createFailingHttpClient(1);
      const provider = new WebhookNotificationProvider(httpClient, 'deckent-test', '/tmp/test-log.json');

      // Fails first, succeeds second
      await provider.send('https://hooks.example.com/hook', SPRINT_COMPLETE_EVENT);
      expect(httpClient.post).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Discord embed format ────────────────────────────────────────

  describe('Discord notification', () => {
    it('builds correct embed format for sprint_complete', () => {
      const httpClient = createMockHttpClient();
      const provider = new DiscordNotificationProvider(httpClient, '1.0.0');

      const embed = provider.buildEmbed(SPRINT_COMPLETE_EVENT);

      expect(embed.title).toBe('Sprint Complete');
      expect(embed.description).toBe(SPRINT_COMPLETE_EVENT.summary);
      expect(embed.color).toBe(0x00cc00); // green
      expect(embed.footer!.text).toBe('deckent v1.0.0');
    });

    it('uses red color for sprint_failed', () => {
      const httpClient = createMockHttpClient();
      const provider = new DiscordNotificationProvider(httpClient);

      const embed = provider.buildEmbed(SPRINT_FAILED_EVENT);
      expect(embed.color).toBe(0xcc0000); // red
      expect(embed.title).toBe('Sprint Failed');
    });

    it('uses yellow color for usage_warning', () => {
      const httpClient = createMockHttpClient();
      const provider = new DiscordNotificationProvider(httpClient);

      const embed = provider.buildEmbed(USAGE_WARNING_EVENT);
      expect(embed.color).toBe(0xcccc00); // yellow
    });

    it('includes details as embed fields', () => {
      const httpClient = createMockHttpClient();
      const provider = new DiscordNotificationProvider(httpClient);

      const embed = provider.buildEmbed(SPRINT_COMPLETE_EVENT);
      expect(embed.fields).toBeTruthy();
      expect(embed.fields!.length).toBeGreaterThan(0);
      expect(embed.fields![0]!.name).toBe('Details');
    });

    it('sends correct payload via HTTP', async () => {
      const httpClient = createMockHttpClient();
      const provider = new DiscordNotificationProvider(httpClient, '1.0.0');

      await provider.send('https://discord.com/api/webhooks/123/abc', SPRINT_COMPLETE_EVENT);

      expect(httpClient.calls).toHaveLength(1);
      const payload = JSON.parse(httpClient.calls[0]!.body) as DiscordPayload;
      expect(payload.embeds).toHaveLength(1);
      expect(payload.embeds[0]!.title).toBe('Sprint Complete');
    });
  });

  // ─── Slack blocks format ─────────────────────────────────────────

  describe('Slack notification', () => {
    it('builds correct Block Kit payload', () => {
      const httpClient = createMockHttpClient();
      const provider = new SlackNotificationProvider(httpClient, '1.0.0');

      const payload = provider.buildPayload(SPRINT_COMPLETE_EVENT);

      expect(payload.blocks).toBeTruthy();
      expect(payload.blocks.length).toBeGreaterThanOrEqual(3);

      // Header block
      const headerBlock = payload.blocks.find((b) => b.type === 'header');
      expect(headerBlock).toBeTruthy();
      expect(headerBlock!.text!.text).toBe('Sprint Complete');

      // Section block with summary
      const sectionBlock = payload.blocks.find((b) => b.type === 'section' && b.text?.text === SPRINT_COMPLETE_EVENT.summary);
      expect(sectionBlock).toBeTruthy();

      // Context block with version
      const contextBlock = payload.blocks.find((b) => b.type === 'context');
      expect(contextBlock).toBeTruthy();
      expect(contextBlock!.elements![0]!.text).toContain('deckent v1.0.0');
    });

    it('includes details section when present', () => {
      const httpClient = createMockHttpClient();
      const provider = new SlackNotificationProvider(httpClient);

      const payload = provider.buildPayload(SPRINT_COMPLETE_EVENT);
      // Should have header, summary section, details section, context
      expect(payload.blocks.length).toBeGreaterThanOrEqual(4);
    });

    it('includes fallback text', () => {
      const httpClient = createMockHttpClient();
      const provider = new SlackNotificationProvider(httpClient);

      const payload = provider.buildPayload(SPRINT_COMPLETE_EVENT);
      expect(payload.text).toContain('Sprint Complete');
      expect(payload.text).toContain(SPRINT_COMPLETE_EVENT.summary);
    });

    it('sends payload via HTTP', async () => {
      const httpClient = createMockHttpClient();
      const provider = new SlackNotificationProvider(httpClient);

      await provider.send('https://hooks.slack.com/services/T/B/X', SPRINT_COMPLETE_EVENT);

      expect(httpClient.calls).toHaveLength(1);
      const payload = JSON.parse(httpClient.calls[0]!.body) as SlackPayload;
      expect(payload.blocks).toBeTruthy();
    });
  });

  // ─── Event filtering ─────────────────────────────────────────────

  describe('Event filter', () => {
    it('fires for sprint_complete when included in events list', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: true,
        events: ['sprint_complete', 'sprint_failed'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBeGreaterThan(0);

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });

    it('does not fire for task_nogo when not in events list', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: true,
        events: ['sprint_complete', 'sprint_failed'],
      };

      const count = await dispatcher.dispatch(TASK_NOGO_EVENT, config);
      expect(count).toBe(0);

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });

    it('uses default events when not specified', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: true,
        // No events specified -> defaults to ['sprint_complete', 'sprint_failed']
      };

      const completedCount = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(completedCount).toBeGreaterThan(0);

      const nogoCount = await dispatcher.dispatch(TASK_NOGO_EVENT, config);
      expect(nogoCount).toBe(0);

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });
  });

  // ─── Missing config ──────────────────────────────────────────────

  describe('Missing config scenarios', () => {
    it('no webhook provider registered means no webhook dispatch', async () => {
      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: false,
        webhook: 'https://hooks.example.com/hook',
        events: ['sprint_complete'],
      };

      // No webhook provider set
      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
    });

    it('no discord URL means no discord dispatch', async () => {
      const httpClient = createMockHttpClient();
      const dispatcher = new NotificationDispatcher();
      dispatcher.setDiscordProvider(new DiscordNotificationProvider(httpClient));

      const config: NotificationConfig = {
        terminal: false,
        // No discord URL
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
    });

    it('empty config dispatches nothing', async () => {
      const dispatcher = new NotificationDispatcher();
      const config: NotificationConfig = {
        terminal: false,
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────

  describe('Error handling', () => {
    it('webhook failure does not crash the dispatcher', async () => {
      const failingClient = createFailingHttpClient();
      const webhookProvider = new WebhookNotificationProvider(failingClient, 'test', '/tmp/test-log.json');

      const dispatcher = new NotificationDispatcher();
      dispatcher.setWebhookProvider(webhookProvider);

      const config: NotificationConfig = {
        terminal: false,
        webhook: 'https://hooks.example.com/hook',
        events: ['sprint_complete'],
      };

      // Should not throw - dispatcher catches provider errors
      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      // Webhook failed, so count should be 0 from webhook
      expect(count).toBe(0);
    });

    it('discord failure does not crash the dispatcher', async () => {
      const failingClient = createFailingHttpClient();
      const discordProvider = new DiscordNotificationProvider(failingClient);

      const dispatcher = new NotificationDispatcher();
      dispatcher.setDiscordProvider(discordProvider);

      const config: NotificationConfig = {
        terminal: false,
        discord: 'https://discord.com/api/webhooks/123/abc',
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
    });

    it('slack failure does not crash the dispatcher', async () => {
      const failingClient = createFailingHttpClient();
      const slackProvider = new SlackNotificationProvider(failingClient);

      const dispatcher = new NotificationDispatcher();
      dispatcher.setSlackProvider(slackProvider);

      const config: NotificationConfig = {
        terminal: false,
        slack: 'https://hooks.slack.com/services/T/B/X',
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      expect(count).toBe(0);
    });

    it('one failing provider does not prevent others from dispatching', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const failingClient = createFailingHttpClient();
      const successClient = createMockHttpClient();

      const dispatcher = new NotificationDispatcher();
      dispatcher.setWebhookProvider(new WebhookNotificationProvider(failingClient, 'test', '/tmp/test-log.json'));
      dispatcher.setDiscordProvider(new DiscordNotificationProvider(successClient));

      const config: NotificationConfig = {
        terminal: true,
        webhook: 'https://hooks.example.com/hook',
        discord: 'https://discord.com/api/webhooks/123/abc',
        events: ['sprint_complete'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);
      // Terminal bell (1) + discord success (1) = 2. Webhook failed = 0.
      expect(count).toBe(2);

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });
  });

  // ─── Full E2E ────────────────────────────────────────────────────

  describe('Full E2E: config -> dispatch -> all providers', () => {
    it('dispatches to terminal + webhook + discord + slack', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const webhookClient = createMockHttpClient();
      const discordClient = createMockHttpClient();
      const slackClient = createMockHttpClient();

      const dispatcher = new NotificationDispatcher();
      dispatcher.setWebhookProvider(new WebhookNotificationProvider(webhookClient, 'deckent', '/tmp/test-log.json'));
      dispatcher.setDiscordProvider(new DiscordNotificationProvider(discordClient, '1.0.0'));
      dispatcher.setSlackProvider(new SlackNotificationProvider(slackClient, '1.0.0'));

      const config: NotificationConfig = {
        terminal: true,
        webhook: 'https://hooks.example.com/hook',
        discord: 'https://discord.com/api/webhooks/123/abc',
        slack: 'https://hooks.slack.com/services/T/B/X',
        events: ['sprint_complete', 'sprint_failed'],
      };

      const count = await dispatcher.dispatch(SPRINT_COMPLETE_EVENT, config);

      // terminal(1) + webhook(1) + discord(1) + slack(1) = 4
      expect(count).toBe(4);

      // Verify terminal bell
      expect(stdoutCalls).toContain('\x07');

      // Verify webhook body
      const webhookBody = JSON.parse(webhookClient.calls[0]!.body) as WebhookPayload;
      expect(webhookBody.event).toBe('sprint_complete');
      expect(webhookBody.project).toBe('deckent');

      // Verify discord embed
      const discordBody = JSON.parse(discordClient.calls[0]!.body) as DiscordPayload;
      expect(discordBody.embeds[0]!.title).toBe('Sprint Complete');
      expect(discordBody.embeds[0]!.color).toBe(0x00cc00);

      // Verify slack blocks
      const slackBody = JSON.parse(slackClient.calls[0]!.body) as SlackPayload;
      expect(slackBody.blocks.find((b) => b.type === 'header')!.text!.text).toBe('Sprint Complete');

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });

    it('filters task_nogo when not in events list', async () => {
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true, configurable: true });

      const webhookClient = createMockHttpClient();

      const dispatcher = new NotificationDispatcher();
      dispatcher.setWebhookProvider(new WebhookNotificationProvider(webhookClient, 'deckent', '/tmp/test-log.json'));

      const config: NotificationConfig = {
        terminal: true,
        webhook: 'https://hooks.example.com/hook',
        events: ['sprint_complete', 'sprint_failed'],
      };

      const count = await dispatcher.dispatch(TASK_NOGO_EVENT, config);
      expect(count).toBe(0);
      expect(webhookClient.calls).toHaveLength(0);

      Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, writable: true, configurable: true });
    });
  });
});
