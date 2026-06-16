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
  let callbackHandler: ((ctx: any) => void) | undefined;

  const instance = {
    on: vi.fn((event: string, handler: any) => {
      if (event === 'text') textHandler = handler;
      if (event === 'callback_query') callbackHandler = handler;
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
    /** Simulate an inline-button press (callback_query). Returns the ack spy. */
    _simulateCallback(userId: number, chatId: number, data: string) {
      if (!callbackHandler) throw new Error('No callback_query handler registered');
      const answerCbQuery = vi.fn(async () => ({}));
      callbackHandler({ callbackQuery: { id: 'cb1', data }, from: { id: userId }, chat: { id: chatId }, answerCbQuery });
      return answerCbQuery;
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

  it('start does NOT await launch() — resolves even though long-poll launch never settles (BOT-002)', async () => {
    // Telegraf v4 launch() in long-polling mode does not resolve until stop();
    // awaiting it would hang startup. start() must fire launch() and return.
    const { MockTelegraf, instance } = createMockTelegraf();
    instance.launch = vi.fn(() => new Promise<void>(() => {})); // never settles
    const connector = new TelegramConnector(MockTelegraf as any);

    await Promise.race([
      connector.start(makeConfig()),
      new Promise((_, rej) => setTimeout(() => rej(new Error('start() hung on launch()')), 200)),
    ]);

    expect(instance.launch).toHaveBeenCalledTimes(1);
    expect(connector.isStarted).toBe(true);
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

  // ─── Rich-approval bot: inline buttons + callback presses ─────────────

  it('sendMessage with buttons — renders reply_markup.inline_keyboard with callback_data', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);
    await connector.start(makeConfig());

    await connector.sendMessage({
      connector: 'telegram',
      channelId: '300400',
      text: 'Approval required',
      buttons: [[
        { text: '✓ Approve', callbackData: 'approve:backlog-x' },
        { text: '✗ Reject', callbackData: 'reject:backlog-x' },
      ]],
    });

    expect(instance.telegram.sendMessage).toHaveBeenCalledWith('300400', 'Approval required', {
      reply_markup: {
        inline_keyboard: [[
          { text: '✓ Approve', callback_data: 'approve:backlog-x' },
          { text: '✗ Reject', callback_data: 'reject:backlog-x' },
        ]],
      },
    });
  });

  it('sendMessage with parseMode — passes parse_mode (rich text), combinable with buttons', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);
    await connector.start(makeConfig());

    await connector.sendMessage({
      connector: 'telegram',
      channelId: '300400',
      text: '<b>Approval</b>',
      parseMode: 'HTML',
      buttons: [[{ text: '✓', callbackData: 'approve:x' }]],
    });

    expect(instance.telegram.sendMessage).toHaveBeenCalledWith('300400', '<b>Approval</b>', {
      reply_markup: { inline_keyboard: [[{ text: '✓', callback_data: 'approve:x' }]] },
      parse_mode: 'HTML',
    });
  });

  it('callback_query press — forwards callback_data to onCallback and acks the press', async () => {
    const { MockTelegraf, instance } = createMockTelegraf();
    const connector = new TelegramConnector(MockTelegraf as any);
    const onCb = vi.fn();
    connector.onCallback(onCb);
    await connector.start(makeConfig());

    const ack = instance._simulateCallback(100200, 300400, 'approve:backlog-x');

    expect(onCb).toHaveBeenCalledTimes(1);
    expect(onCb.mock.calls[0][0]).toEqual({
      connector: 'telegram',
      channelId: '300400',
      fromUser: '100200',
      data: 'approve:backlog-x',
    });
    expect(ack).toHaveBeenCalledTimes(1); // spinner cleared
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
