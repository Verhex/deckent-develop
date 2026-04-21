import { describe, it, expect, vi } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';
import type { ConnectorConfig, OutgoingMessage } from '../../src/connectors/types.js';

// ─── Mock Telegraf ──────────────────────────────────────────────────

type TextHandler = (ctx: {
  message: { message_id: number; text: string; date: number };
  from: { id: number };
  chat: { id: number };
}) => void;

function createMockTelegraf() {
  let textHandler: TextHandler | undefined;

  const instance = {
    on: vi.fn((event: string, handler: TextHandler) => {
      if (event === 'text') {
        textHandler = handler;
      }
    }),
    launch: vi.fn(async () => {}),
    stop: vi.fn(),
    telegram: {
      sendMessage: vi.fn(async () => ({})),
    },
    /** Simulate an incoming text message */
    _simulateText(msgId: number, userId: number, chatId: number, text: string, date: number) {
      if (!textHandler) throw new Error('No text handler registered');
      textHandler({
        message: { message_id: msgId, text, date },
        from: { id: userId },
        chat: { id: chatId },
      });
    },
  };

  const MockTelegraf = vi.fn(() => instance) as unknown as {
    new (token: string): typeof instance;
  };

  return { MockTelegraf, instance };
}

function makeConfig(overrides: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return {
    enabled: true,
    token: 'bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('TelegramConnector', () => {
  it('start with token — bot launched, text handler registered', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);

    await connector.start(makeConfig());

    expect(MockTelegraf).toHaveBeenCalledWith('bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
    expect(instance.on).toHaveBeenCalledWith('text', expect.any(Function));
    expect(instance.launch).toHaveBeenCalledTimes(1);
    expect(connector.isStarted).toBe(true);
    expect(connector.isHealthy()).toBe(true);
  });

  it('start disabled — no-op, bot not created', async () => {
    const { MockTelegraf } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);

    await connector.start(makeConfig({ enabled: false }));

    expect(MockTelegraf).not.toHaveBeenCalled();
    expect(connector.isStarted).toBe(false);
    expect(connector.isHealthy()).toBe(false);
  });

  it('incoming text handler — message emitted to registered handlers', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);
    const handler = vi.fn();

    connector.onMessage(handler);
    await connector.start(makeConfig());

    // Simulate incoming text message
    instance._simulateText(42, 100200, 300400, 'Merhaba Deckent!', 1713600000);

    expect(handler).toHaveBeenCalledTimes(1);
    const msg = handler.mock.calls[0][0];
    expect(msg.id).toBe('42');
    expect(msg.connector).toBe('telegram');
    expect(msg.fromUser).toBe('100200');
    expect(msg.channelId).toBe('300400');
    expect(msg.text).toBe('Merhaba Deckent!');
    expect(msg.timestamp).toBe(new Date(1713600000 * 1000).toISOString());
    expect(msg.raw).toEqual({ message_id: 42, text: 'Merhaba Deckent!', date: 1713600000 });
  });

  it('sendMessage — delegates to bot.telegram.sendMessage', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);

    await connector.start(makeConfig());

    const outgoing: OutgoingMessage = {
      connector: 'telegram',
      channelId: '300400',
      text: 'Sprint 149 tamamlandı!',
    };
    await connector.sendMessage(outgoing);

    expect(instance.telegram.sendMessage).toHaveBeenCalledWith('300400', 'Sprint 149 tamamlandı!');
  });

  it('stop — bot stopped, connector becomes unhealthy', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);

    await connector.start(makeConfig());
    expect(connector.isHealthy()).toBe(true);

    await connector.stop();

    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(connector.isStarted).toBe(false);
    expect(connector.isHealthy()).toBe(false);
  });

  it('sendMessage before start — throws error', async () => {
    const connector = new TelegramConnector();
    const outgoing: OutgoingMessage = {
      connector: 'telegram',
      channelId: '300400',
      text: 'test',
    };

    await expect(connector.sendMessage(outgoing)).rejects.toThrow('Telegram connector not started');
  });
});
