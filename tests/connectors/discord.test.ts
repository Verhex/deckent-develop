import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- discord.js mock ---

type EventHandler = (...args: unknown[]) => void;

const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockLogin = vi.fn().mockResolvedValue('token');
const mockChannelSend = vi.fn().mockResolvedValue(undefined);
const mockChannelsFetch = vi.fn();

const eventHandlers = new Map<string, EventHandler[]>();

const mockClient = {
  on: vi.fn((event: string, handler: EventHandler) => {
    const handlers = eventHandlers.get(event) ?? [];
    handlers.push(handler);
    eventHandlers.set(event, handlers);
  }),
  login: mockLogin,
  destroy: mockDestroy,
  channels: { fetch: mockChannelsFetch },
  ws: { status: 0 },
};

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockClient),
  Events: { MessageCreate: 'messageCreate' },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
  },
}));

import { DiscordConnector } from '../../src/connectors/discord.js';
import type { ConnectorConfig } from '../../src/connectors/types.js';

function emitMockMessage(overrides: Record<string, unknown> = {}): void {
  const handlers = eventHandlers.get('messageCreate') ?? [];
  const msg = {
    id: 'msg-001',
    author: { id: 'user-42', bot: false },
    channelId: 'ch-100',
    content: 'hello deckent',
    createdTimestamp: 1713600000000,
    ...overrides,
  };
  for (const h of handlers) h(msg);
}

describe('DiscordConnector', () => {
  let connector: DiscordConnector;
  const enabledConfig: ConnectorConfig = {
    enabled: true,
    token: 'test-bot-token',
  };
  const disabledConfig: ConnectorConfig = {
    enabled: false,
    token: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    mockClient.ws.status = 0;
    connector = new DiscordConnector();
  });

  it('starts with token and logs in successfully', async () => {
    await connector.start(enabledConfig);

    expect(mockLogin).toHaveBeenCalledWith('test-bot-token');
    expect(connector.isStarted).toBe(true);
  });

  it('skips start when disabled', async () => {
    await connector.start(disabledConfig);

    expect(mockLogin).not.toHaveBeenCalled();
    expect(connector.isStarted).toBe(false);
  });

  it('triggers incoming message handler on MessageCreate', async () => {
    const received: unknown[] = [];
    connector.onMessage((msg) => received.push(msg));

    await connector.start(enabledConfig);
    emitMockMessage();

    expect(received).toHaveLength(1);
    const msg = received[0] as Record<string, unknown>;
    expect(msg).toMatchObject({
      id: 'msg-001',
      connector: 'discord',
      fromUser: 'user-42',
      channelId: 'ch-100',
      text: 'hello deckent',
    });
  });

  it('filters bot messages', async () => {
    const received: unknown[] = [];
    connector.onMessage((msg) => received.push(msg));

    await connector.start(enabledConfig);
    emitMockMessage({ author: { id: 'bot-99', bot: true } });

    expect(received).toHaveLength(0);
  });

  it('sends message to channel', async () => {
    const mockChannel = {
      isTextBased: () => true,
      send: mockChannelSend,
    };
    mockChannelsFetch.mockResolvedValue(mockChannel);

    await connector.start(enabledConfig);
    await connector.sendMessage({
      connector: 'discord',
      channelId: 'ch-200',
      text: 'deploy started',
    });

    expect(mockChannelsFetch).toHaveBeenCalledWith('ch-200');
    expect(mockChannelSend).toHaveBeenCalledWith('deploy started');
  });

  it('destroys client on stop', async () => {
    await connector.start(enabledConfig);
    await connector.stop();

    expect(mockDestroy).toHaveBeenCalled();
    expect(connector.isStarted).toBe(false);
  });

  it('reports healthy when WebSocket status is READY (0)', async () => {
    await connector.start(enabledConfig);
    expect(connector.isHealthy()).toBe(true);

    mockClient.ws.status = 5; // disconnected
    expect(connector.isHealthy()).toBe(false);
  });

  it('throws on sendMessage when not started', async () => {
    await expect(
      connector.sendMessage({ connector: 'discord', channelId: 'ch-1', text: 'hi' }),
    ).rejects.toThrow('Discord connector not started');
  });

  it('throws instead of silently dropping when the channel cannot be resolved (R6)', async () => {
    mockChannelsFetch.mockResolvedValue(null); // channel id not found
    await connector.start(enabledConfig);
    await expect(
      connector.sendMessage({ connector: 'discord', channelId: 'ch-missing', text: 'deploy started' }),
    ).rejects.toThrow(/not a sendable text channel/);
    expect(mockChannelSend).not.toHaveBeenCalled();
  });

  it('throws instead of silently dropping when the channel is not text-based (R6)', async () => {
    mockChannelsFetch.mockResolvedValue({ isTextBased: () => false, send: mockChannelSend });
    await connector.start(enabledConfig);
    await expect(
      connector.sendMessage({ connector: 'discord', channelId: 'ch-voice', text: 'hi' }),
    ).rejects.toThrow(/not a sendable text channel/);
    expect(mockChannelSend).not.toHaveBeenCalled();
  });
});
