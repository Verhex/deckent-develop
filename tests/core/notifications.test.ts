import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotificationDispatcher,
  isInteractiveTerminal,
} from '../../src/core/notifications.js';
import type {
  NotificationEvent,
  NotificationConfig,
  NotificationProvider,
} from '../../src/core/notifications.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    type: 'sprint_complete',
    summary: 'Sprint 001 completed successfully',
    details: '10 tasks done',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<NotificationConfig> = {}): NotificationConfig {
  return {
    terminal: true,
    events: ['sprint_complete', 'sprint_failed'],
    ...overrides,
  };
}

function makeMockProvider(): NotificationProvider & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

// ─── isInteractiveTerminal ──────────────────────────────────────────

describe('isInteractiveTerminal', () => {
  it('returns boolean', () => {
    const result = isInteractiveTerminal();
    expect(typeof result).toBe('boolean');
  });
});

// ─── NotificationDispatcher ─────────────────────────────────────────

describe('NotificationDispatcher', () => {
  let dispatcher: NotificationDispatcher;

  beforeEach(() => {
    dispatcher = new NotificationDispatcher();
  });

  it('is a class that can be instantiated', () => {
    expect(dispatcher).toBeInstanceOf(NotificationDispatcher);
  });

  it('dispatch returns 0 when event type not in allowed events', async () => {
    const event = makeEvent({ type: 'usage_warning' });
    const config = makeConfig({ events: ['sprint_complete'] });
    const count = await dispatcher.dispatch(event, config);
    expect(count).toBe(0);
  });

  it('dispatch sends terminal bell when terminal is true and stdout is TTY', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    const event = makeEvent();
    const config = makeConfig({ terminal: true });
    const count = await dispatcher.dispatch(event, config);

    expect(count).toBeGreaterThanOrEqual(1);
    expect(writeSpy).toHaveBeenCalledWith('\x07');

    writeSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
  });

  it('dispatch skips terminal bell when terminal is false', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

    const event = makeEvent();
    const config = makeConfig({ terminal: false });
    await dispatcher.dispatch(event, config);

    expect(writeSpy).not.toHaveBeenCalledWith('\x07');

    writeSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
  });

  it('dispatch skips terminal bell when not interactive', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const origIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    const event = makeEvent();
    const config = makeConfig({ terminal: true });
    await dispatcher.dispatch(event, config);

    expect(writeSpy).not.toHaveBeenCalledWith('\x07');

    writeSpy.mockRestore();
    Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
  });

  it('dispatch calls webhook provider when webhook URL is set', async () => {
    const provider = makeMockProvider();
    dispatcher.setWebhookProvider(provider);

    const event = makeEvent();
    const config = makeConfig({ webhook: 'https://example.com/hook', terminal: false });
    const count = await dispatcher.dispatch(event, config);

    expect(provider.send).toHaveBeenCalledWith('https://example.com/hook', event);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('dispatch calls discord provider when discord URL is set', async () => {
    const provider = makeMockProvider();
    dispatcher.setDiscordProvider(provider);

    const event = makeEvent();
    const config = makeConfig({ discord: 'https://discord.com/api/webhooks/123', terminal: false });
    const count = await dispatcher.dispatch(event, config);

    expect(provider.send).toHaveBeenCalledWith('https://discord.com/api/webhooks/123', event);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('dispatch calls slack provider when slack URL is set', async () => {
    const provider = makeMockProvider();
    dispatcher.setSlackProvider(provider);

    const event = makeEvent();
    const config = makeConfig({ slack: 'https://hooks.slack.com/services/xxx', terminal: false });
    const count = await dispatcher.dispatch(event, config);

    expect(provider.send).toHaveBeenCalledWith('https://hooks.slack.com/services/xxx', event);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('dispatch silently ignores webhook provider errors', async () => {
    const provider = makeMockProvider();
    provider.send.mockRejectedValue(new Error('network error'));
    dispatcher.setWebhookProvider(provider);

    const event = makeEvent();
    const config = makeConfig({ webhook: 'https://example.com/hook', terminal: false });

    // Should not throw
    const count = await dispatcher.dispatch(event, config);
    expect(count).toBe(0);
  });

  it('dispatch silently ignores discord provider errors', async () => {
    const provider = makeMockProvider();
    provider.send.mockRejectedValue(new Error('discord error'));
    dispatcher.setDiscordProvider(provider);

    const event = makeEvent();
    const config = makeConfig({ discord: 'https://discord.com/api/webhooks/123', terminal: false });

    const count = await dispatcher.dispatch(event, config);
    expect(count).toBe(0);
  });

  it('dispatch uses default events when none specified', async () => {
    const provider = makeMockProvider();
    dispatcher.setWebhookProvider(provider);

    const event = makeEvent({ type: 'sprint_complete' });
    const config: NotificationConfig = { webhook: 'https://example.com/hook', terminal: false };
    const count = await dispatcher.dispatch(event, config);

    expect(provider.send).toHaveBeenCalled();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('dispatch returns total dispatched channel count', async () => {
    const webhook = makeMockProvider();
    const discord = makeMockProvider();
    dispatcher.setWebhookProvider(webhook);
    dispatcher.setDiscordProvider(discord);

    const event = makeEvent();
    const config = makeConfig({
      webhook: 'https://example.com/hook',
      discord: 'https://discord.com/api/webhooks/123',
      terminal: false,
    });

    const count = await dispatcher.dispatch(event, config);
    expect(count).toBe(2);
  });

  it('dispatch does not call provider when no URL is configured', async () => {
    const provider = makeMockProvider();
    dispatcher.setWebhookProvider(provider);

    const event = makeEvent();
    const config = makeConfig({ terminal: false });
    await dispatcher.dispatch(event, config);

    expect(provider.send).not.toHaveBeenCalled();
  });
});
