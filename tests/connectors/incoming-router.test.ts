import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IncomingMessageRouter,
  _resetSequence,
  validateWebhookKey,
  parseDiscordWebhook,
  parseTelegramWebhook,
  parseWebhookPayload,
  isValidConnectorId,
} from '../../src/connectors/incoming-router.js';
import { eventBus } from '../../src/orchestra/event-bus.js';
import type { IncomingMessage } from '../../src/connectors/types.js';
import type { DeckentEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeIncomingMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id: 'msg-001',
    connector: 'discord',
    fromUser: 'user-123',
    channelId: 'chan-456',
    text: 'deploy yap',
    timestamp: '2026-04-20T12:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('IncomingMessageRouter', () => {
  let router: IncomingMessageRouter;
  let publishSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    router = new IncomingMessageRouter();
    _resetSequence();
    publishSpy = vi.spyOn(eventBus, 'publish').mockImplementation(() => {});
  });

  afterEach(() => {
    publishSpy.mockRestore();
  });

  it('should emit event on eventBus when routing a message', () => {
    const msg = makeIncomingMessage();
    router.route(msg);

    expect(publishSpy).toHaveBeenCalledOnce();
    const event = publishSpy.mock.calls[0]![0] as DeckentEvent;
    expect(event.protocol_version).toBe('1.0');
    expect(event.source).toBe('deckent');
    expect(event.target).toBe('*');
    expect(event.channel).toBe('DECKENT→USER:NOTIFY');
  });

  it('should include connectorId, fromUser, and text in event payload', () => {
    const msg = makeIncomingMessage({
      connector: 'telegram',
      fromUser: 'tg-user-789',
      text: 'status check',
    });
    router.route(msg);

    const event = publishSpy.mock.calls[0]![0] as DeckentEvent;
    const payload = event.payload as Record<string, unknown>;
    expect(payload['type']).toBe('INCOMING_MESSAGE');
    expect(payload['connectorId']).toBe('telegram');
    expect(payload['fromUser']).toBe('tg-user-789');
    expect(payload['text']).toBe('status check');
    expect(payload['channelId']).toBe('chan-456');
    expect(payload['messageId']).toBe('msg-001');
  });

  it('should emit separate events for multiple messages', () => {
    router.route(makeIncomingMessage({ id: 'msg-1', text: 'first' }));
    router.route(makeIncomingMessage({ id: 'msg-2', text: 'second' }));
    router.route(makeIncomingMessage({ id: 'msg-3', text: 'third' }));

    expect(publishSpy).toHaveBeenCalledTimes(3);

    // Verify incrementing sequence
    const seq1 = (publishSpy.mock.calls[0]![0] as DeckentEvent).sequence;
    const seq2 = (publishSpy.mock.calls[1]![0] as DeckentEvent).sequence;
    const seq3 = (publishSpy.mock.calls[2]![0] as DeckentEvent).sequence;
    expect(seq1).toBe(1);
    expect(seq2).toBe(2);
    expect(seq3).toBe(3);
  });
});

describe('validateWebhookKey', () => {
  it('should return true for matching keys', () => {
    expect(validateWebhookKey('my-secret-key', 'my-secret-key')).toBe(true);
  });

  it('should return false for mismatched keys', () => {
    expect(validateWebhookKey('wrong-key', 'correct-key')).toBe(false);
  });

  it('should return false for empty provided key', () => {
    expect(validateWebhookKey('', 'some-key')).toBe(false);
  });

  it('should return false for empty expected key', () => {
    expect(validateWebhookKey('some-key', '')).toBe(false);
  });

  it('should return false for different length keys', () => {
    expect(validateWebhookKey('short', 'much-longer-key-here')).toBe(false);
  });
});

describe('parseDiscordWebhook', () => {
  it('should parse valid Discord webhook payload', () => {
    const payload = {
      id: 'discord-msg-123',
      author: { id: 'discord-user-456' },
      channel_id: 'discord-chan-789',
      content: 'hello from discord',
      timestamp: '2026-04-20T12:00:00.000Z',
    };

    const result = parseDiscordWebhook(payload);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('discord-msg-123');
    expect(result!.fromUser).toBe('discord-user-456');
    expect(result!.channelId).toBe('discord-chan-789');
    expect(result!.text).toBe('hello from discord');
    expect(result!.timestamp).toBe('2026-04-20T12:00:00.000Z');
    expect(result!.raw).toBe(payload);
  });

  it('should return null for missing content', () => {
    expect(parseDiscordWebhook({ id: 'x', author: { id: 'u' }, channel_id: 'c' })).toBeNull();
  });

  it('should return null for null/undefined payload', () => {
    expect(parseDiscordWebhook(null)).toBeNull();
    expect(parseDiscordWebhook(undefined)).toBeNull();
  });
});

describe('parseTelegramWebhook', () => {
  it('should parse valid Telegram webhook payload', () => {
    const payload = {
      message: {
        message_id: 42,
        from: { id: 100200300 },
        chat: { id: -100123456789 },
        text: 'selam telegram',
        date: 1776700800, // 2026-04-20T12:00:00Z
      },
    };

    const result = parseTelegramWebhook(payload);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('42');
    expect(result!.fromUser).toBe('100200300');
    expect(result!.channelId).toBe('-100123456789');
    expect(result!.text).toBe('selam telegram');
    expect(result!.raw).toBe(payload);
  });

  it('should return null for missing message field', () => {
    expect(parseTelegramWebhook({ update_id: 123 })).toBeNull();
  });

  it('should return null for missing text', () => {
    expect(parseTelegramWebhook({ message: { message_id: 1, from: { id: 1 }, chat: { id: 1 } } })).toBeNull();
  });
});

describe('parseWebhookPayload', () => {
  it('should dispatch to Discord parser for discord connector', () => {
    const result = parseWebhookPayload('discord', {
      id: 'msg-1',
      author: { id: 'u-1' },
      channel_id: 'c-1',
      content: 'test',
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe('test');
  });

  it('should dispatch to Telegram parser for telegram connector', () => {
    const result = parseWebhookPayload('telegram', {
      message: { message_id: 1, from: { id: 1 }, chat: { id: 1 }, text: 'merhaba', date: 1776700800 },
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe('merhaba');
  });

  it('should use generic parser for unknown connectors', () => {
    const result = parseWebhookPayload('slack', {
      id: 'slack-1',
      fromUser: 'user-1',
      channelId: 'channel-1',
      text: 'slack message',
    });
    expect(result).not.toBeNull();
    expect(result!.text).toBe('slack message');
  });

  it('should return null for invalid payload', () => {
    expect(parseWebhookPayload('discord', 'invalid')).toBeNull();
    expect(parseWebhookPayload('telegram', {})).toBeNull();
  });
});

describe('isValidConnectorId', () => {
  it('should accept valid connector ids', () => {
    expect(isValidConnectorId('discord')).toBe(true);
    expect(isValidConnectorId('telegram')).toBe(true);
    expect(isValidConnectorId('whatsapp')).toBe(true);
    expect(isValidConnectorId('slack')).toBe(true);
    expect(isValidConnectorId('email')).toBe(true);
  });

  it('should reject invalid connector ids', () => {
    expect(isValidConnectorId('signal')).toBe(false);
    expect(isValidConnectorId('')).toBe(false);
    expect(isValidConnectorId('DISCORD')).toBe(false);
  });
});
