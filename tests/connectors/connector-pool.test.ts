import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectorPool } from '../../src/connectors/connector-pool.js';
import type {
  ConnectorConfig,
  ConnectorId,
  IMessageConnector,
  IncomingMessage,
  MessageHandler,
  OutgoingMessage,
} from '../../src/connectors/types.js';

/** Minimal mock connector for testing */
interface MockConnector extends IMessageConnector {
  _handlers: MessageHandler[];
  _started: boolean;
  _stopped: boolean;
  _sentMessages: OutgoingMessage[];
  _healthy: boolean;
  _startError: Error | undefined;
  _sendError: Error | undefined;
  simulateIncoming: (msg: IncomingMessage) => void;
}

function createMockConnector(id: ConnectorId, name: string): MockConnector {
  const handlers: MessageHandler[] = [];
  const sentMessages: OutgoingMessage[] = [];
  let started = false;
  let stopped = false;
  let healthy = true;
  let startError: Error | undefined;
  let sendError: Error | undefined;

  const mock = {
    id,
    name,

    get _handlers() { return handlers; },
    get _sentMessages() { return sentMessages; },

    get _started() { return started; },
    set _started(val: boolean) { started = val; },

    get _stopped() { return stopped; },
    set _stopped(val: boolean) { stopped = val; },

    get _healthy() { return healthy; },
    set _healthy(val: boolean) { healthy = val; },

    get _startError() { return startError; },
    set _startError(err: Error | undefined) { startError = err; },

    get _sendError() { return sendError; },
    set _sendError(err: Error | undefined) { sendError = err; },

    async start(config: ConnectorConfig): Promise<void> {
      if (startError) throw startError;
      started = true;
    },

    async stop(): Promise<void> {
      stopped = true;
    },

    async sendMessage(msg: OutgoingMessage): Promise<void> {
      if (sendError) throw sendError;
      sentMessages.push(msg);
    },

    onMessage(handler: MessageHandler): void {
      handlers.push(handler);
    },

    isHealthy(): boolean {
      return healthy;
    },

    simulateIncoming(msg: IncomingMessage): void {
      for (const h of handlers) h(msg);
    },
  };

  return mock;
}

function makeIncomingMessage(connector: ConnectorId): IncomingMessage {
  return {
    id: `msg-${connector}-1`,
    connector,
    fromUser: 'user-1',
    channelId: 'ch-1',
    text: 'hello',
    timestamp: '2026-04-20T10:00:00.000Z',
  };
}

describe('ConnectorPool', () => {
  let pool: ConnectorPool;

  beforeEach(() => {
    pool = new ConnectorPool();
  });

  it('should register connectors and broadcast in parallel', async () => {
    const discord = createMockConnector('discord', 'Discord');
    const telegram = createMockConnector('telegram', 'Telegram');

    pool.register(discord);
    pool.register(telegram);

    const results = await pool.broadcast(
      { channelId: 'ch-1', text: 'test message' },
      ['discord', 'telegram'],
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ connector: 'discord', success: true });
    expect(results[1]).toEqual({ connector: 'telegram', success: true });
    expect(discord._sentMessages).toHaveLength(1);
    expect(discord._sentMessages[0]!.text).toBe('test message');
    expect(telegram._sentMessages).toHaveLength(1);
  });

  it('should handle partial failure — failed connector does not block others', async () => {
    const discord = createMockConnector('discord', 'Discord');
    const telegram = createMockConnector('telegram', 'Telegram');
    const whatsapp = createMockConnector('whatsapp', 'WhatsApp');

    // Telegram will fail
    telegram._sendError = new Error('Connection lost');

    pool.register(discord);
    pool.register(telegram);
    pool.register(whatsapp);

    const results = await pool.broadcast(
      { channelId: 'ch-1', text: 'important' },
      ['discord', 'telegram', 'whatsapp'],
    );

    expect(results).toHaveLength(3);

    const discordResult = results.find((r) => r.connector === 'discord');
    const telegramResult = results.find((r) => r.connector === 'telegram');
    const whatsappResult = results.find((r) => r.connector === 'whatsapp');

    expect(discordResult?.success).toBe(true);
    expect(telegramResult?.success).toBe(false);
    expect(telegramResult?.error).toBe('Connection lost');
    expect(whatsappResult?.success).toBe(true);
  });

  it('should return error for not-registered connector', async () => {
    const discord = createMockConnector('discord', 'Discord');
    pool.register(discord);

    const results = await pool.broadcast(
      { channelId: 'ch-1', text: 'hello' },
      ['discord', 'slack'],  // slack is not registered
    );

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ connector: 'discord', success: true });
    expect(results[1]).toEqual({ connector: 'slack', success: false, error: 'Not registered' });
  });

  it('should manage startAll and stopAll lifecycle', async () => {
    const discord = createMockConnector('discord', 'Discord');
    const telegram = createMockConnector('telegram', 'Telegram');
    const whatsapp = createMockConnector('whatsapp', 'WhatsApp');

    const startSpyDiscord = vi.spyOn(discord, 'start');
    const startSpyTelegram = vi.spyOn(telegram, 'start');
    const startSpyWhatsapp = vi.spyOn(whatsapp, 'start');
    const stopSpyDiscord = vi.spyOn(discord, 'stop');
    const stopSpyTelegram = vi.spyOn(telegram, 'stop');

    pool.register(discord);
    pool.register(telegram);
    pool.register(whatsapp);

    const configs: Partial<Record<ConnectorId, ConnectorConfig>> = {
      discord: { enabled: true, token: 'discord-token' },
      telegram: { enabled: true, token: 'telegram-token' },
      whatsapp: { enabled: false, token: '' },  // disabled
    };

    await pool.startAll(configs);

    expect(startSpyDiscord).toHaveBeenCalledWith(configs.discord);
    expect(startSpyTelegram).toHaveBeenCalledWith(configs.telegram);
    // WhatsApp disabled — start should NOT have been called
    expect(startSpyWhatsapp).not.toHaveBeenCalled();

    await pool.stopAll();

    expect(stopSpyDiscord).toHaveBeenCalled();
    expect(stopSpyTelegram).toHaveBeenCalled();
  });

  it('should fan out onAnyMessage to all registered connectors', () => {
    const discord = createMockConnector('discord', 'Discord');
    const telegram = createMockConnector('telegram', 'Telegram');

    pool.register(discord);
    pool.register(telegram);

    const received: IncomingMessage[] = [];
    pool.onAnyMessage((msg) => received.push(msg));

    // Simulate incoming from Discord
    discord.simulateIncoming(makeIncomingMessage('discord'));

    // Simulate incoming from Telegram
    telegram.simulateIncoming(makeIncomingMessage('telegram'));

    expect(received).toHaveLength(2);
    expect(received[0]!.connector).toBe('discord');
    expect(received[1]!.connector).toBe('telegram');
  });

  it('should return empty results for empty targets', async () => {
    const discord = createMockConnector('discord', 'Discord');
    pool.register(discord);

    const results = await pool.broadcast(
      { channelId: 'ch-1', text: 'to nobody' },
      [],
    );

    expect(results).toEqual([]);
    expect(discord._sentMessages).toHaveLength(0);
  });

  it('should handle startAll with connector start failure gracefully', async () => {
    const discord = createMockConnector('discord', 'Discord');
    const telegram = createMockConnector('telegram', 'Telegram');

    discord._startError = new Error('Auth failed');
    const startSpyTelegram = vi.spyOn(telegram, 'start');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    pool.register(discord);
    pool.register(telegram);

    await pool.startAll({
      discord: { enabled: true, token: 'bad-token' },
      telegram: { enabled: true, token: 'good-token' },
    });

    // Discord failed, but Telegram should still have started
    expect(startSpyTelegram).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('discord'),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it('should support get, has, and getAll accessors', () => {
    const discord = createMockConnector('discord', 'Discord');
    const telegram = createMockConnector('telegram', 'Telegram');

    pool.register(discord);
    pool.register(telegram);

    expect(pool.has('discord')).toBe(true);
    expect(pool.has('slack')).toBe(false);
    expect(pool.get('discord')).toBe(discord);
    expect(pool.get('slack')).toBeUndefined();
    expect(pool.getAll()).toHaveLength(2);
  });

  describe('broadcastAll', () => {
    it('sends to ALL registered connectors without explicit targets', async () => {
      const discord = createMockConnector('discord', 'Discord');
      const telegram = createMockConnector('telegram', 'Telegram');
      const whatsapp = createMockConnector('whatsapp', 'WhatsApp');

      pool.register(discord);
      pool.register(telegram);
      pool.register(whatsapp);

      const results = await pool.broadcastAll({ channelId: 'broadcast-ch', text: 'system alert' });

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(discord._sentMessages[0]?.text).toBe('system alert');
      expect(telegram._sentMessages[0]?.text).toBe('system alert');
      expect(whatsapp._sentMessages[0]?.text).toBe('system alert');
    });

    it('returns empty array when no connectors are registered', async () => {
      const results = await pool.broadcastAll({ channelId: 'ch', text: 'hello' });
      expect(results).toEqual([]);
    });

    it('per-connector error isolation: a failing connector does not block others', async () => {
      const discord = createMockConnector('discord', 'Discord');
      const telegram = createMockConnector('telegram', 'Telegram');

      telegram._sendError = new Error('timeout');

      pool.register(discord);
      pool.register(telegram);

      const results = await pool.broadcastAll({ channelId: 'ch', text: 'alert' });

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.connector === 'discord')?.success).toBe(true);
      expect(results.find((r) => r.connector === 'telegram')?.success).toBe(false);
      expect(results.find((r) => r.connector === 'telegram')?.error).toBe('timeout');
      expect(discord._sentMessages).toHaveLength(1);
    });
  });
});
