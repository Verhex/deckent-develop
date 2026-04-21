/**
 * Incoming Message Router — bridges messaging connectors to the nervous system.
 *
 * Gelen mesajları EventBus üzerinden DeckentEvent olarak yayınlar.
 * Nervous system detectors bu event'leri dinleyerek komut parse, auth check,
 * ve suggest-30m notification gibi aksiyonlar alabilir.
 *
 * Sprint 149 — Task 149-015
 */

import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ConnectorId } from './types.js';
import { eventBus } from '../orchestra/event-bus.js';
import type { DeckentEvent } from '../orchestra/event-stream.js';
import { CHANNELS } from '../orchestra/event-stream.js';

// ─── Sequence Counter ──────────────────────────────────────────

let routerSequence = 0;

/** Reset sequence counter (exported for testing). */
export function _resetSequence(): void {
  routerSequence = 0;
}

// ─── Webhook Key Validation ────────────────────────────────────

/**
 * Timing-safe comparison of webhook keys to prevent timing attacks.
 * Both values are converted to buffers and compared with constant-time algorithm.
 */
export function validateWebhookKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided, 'utf-8');
  const expectedBuf = Buffer.from(expected, 'utf-8');

  // Length mismatch — still do constant-time comparison to avoid timing leak
  if (providedBuf.length !== expectedBuf.length) {
    // Compare against itself to burn the same amount of time
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

// ─── Connector-Specific Payload Parsing ────────────────────────

/** Parsed webhook payload normalized to IncomingMessage fields. */
export interface ParsedWebhookPayload {
  id: string;
  fromUser: string;
  channelId: string;
  text: string;
  timestamp: string;
  raw: unknown;
}

/**
 * Parse Discord webhook payload into normalized fields.
 * Discord webhook format: { id, author: { id }, channel_id, content, timestamp }
 */
export function parseDiscordWebhook(body: unknown): ParsedWebhookPayload | null {
  if (!body || typeof body !== 'object') return null;

  const b = body as Record<string, unknown>;
  const author = b['author'] as Record<string, unknown> | undefined;

  const id = typeof b['id'] === 'string' ? b['id'] : '';
  const fromUser = typeof author?.['id'] === 'string' ? author['id'] : '';
  const channelId = typeof b['channel_id'] === 'string' ? b['channel_id'] : '';
  const text = typeof b['content'] === 'string' ? b['content'] : '';
  const timestamp = typeof b['timestamp'] === 'string' ? b['timestamp'] : new Date().toISOString();

  if (!id || !text) return null;

  return { id, fromUser, channelId, text, timestamp, raw: body };
}

/**
 * Parse Telegram webhook payload into normalized fields.
 * Telegram update format: { message: { message_id, from: { id }, chat: { id }, text, date } }
 */
export function parseTelegramWebhook(body: unknown): ParsedWebhookPayload | null {
  if (!body || typeof body !== 'object') return null;

  const b = body as Record<string, unknown>;
  const message = b['message'] as Record<string, unknown> | undefined;
  if (!message) return null;

  const from = message['from'] as Record<string, unknown> | undefined;
  const chat = message['chat'] as Record<string, unknown> | undefined;

  const messageId = message['message_id'];
  const id = typeof messageId === 'number' ? String(messageId) : typeof messageId === 'string' ? messageId : '';
  const fromUser = from?.['id'] !== undefined ? String(from['id']) : '';
  const channelId = chat?.['id'] !== undefined ? String(chat['id']) : '';
  const text = typeof message['text'] === 'string' ? message['text'] : '';
  const date = typeof message['date'] === 'number' ? new Date(message['date'] * 1000).toISOString() : new Date().toISOString();

  if (!id || !text) return null;

  return { id, fromUser, channelId, text, timestamp: date, raw: body };
}

/**
 * Parse webhook payload based on connector type.
 * Returns null if the payload is invalid or unrecognized.
 */
export function parseWebhookPayload(connector: ConnectorId, body: unknown): ParsedWebhookPayload | null {
  switch (connector) {
    case 'discord':
      return parseDiscordWebhook(body);
    case 'telegram':
      return parseTelegramWebhook(body);
    default:
      // Generic fallback: expect { id, fromUser, channelId, text }
      if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        const id = typeof b['id'] === 'string' ? b['id'] : '';
        const fromUser = typeof b['fromUser'] === 'string' ? b['fromUser'] : '';
        const channelId = typeof b['channelId'] === 'string' ? b['channelId'] : '';
        const text = typeof b['text'] === 'string' ? b['text'] : '';
        if (!id || !text) return null;
        return {
          id,
          fromUser,
          channelId,
          text,
          timestamp: new Date().toISOString(),
          raw: body,
        };
      }
      return null;
  }
}

// ─── Valid Connector IDs ───────────────────────────────────────

const VALID_CONNECTORS = new Set<string>(['discord', 'telegram', 'whatsapp', 'slack', 'email']);

export function isValidConnectorId(value: string): value is ConnectorId {
  return VALID_CONNECTORS.has(value);
}

// ─── Incoming Message Router ───────────────────────────────────

/**
 * Routes incoming messages from connectors to the nervous system via EventBus.
 *
 * Each incoming message is converted to a DeckentEvent and published.
 * Nervous system detectors subscribe to the event bus and can react
 * to incoming messages (command parsing, auth check, notifications).
 */
export class IncomingMessageRouter {
  /**
   * Route an incoming message to the nervous system.
   *
   * Creates a DeckentEvent with:
   * - source: 'connector'
   * - target: '*' (broadcast to all listeners)
   * - channel: CHANNELS.NOTIFY
   * - payload: message metadata (connectorId, fromUser, text, channelId)
   */
  route(msg: IncomingMessage): void {
    const event: DeckentEvent = {
      timestamp: new Date().toISOString(),
      sequence: ++routerSequence,
      protocol_version: '1.0',
      source: 'deckent',
      target: '*',
      channel: CHANNELS.NOTIFY,
      payload: {
        type: 'INCOMING_MESSAGE',
        connectorId: msg.connector,
        fromUser: msg.fromUser,
        channelId: msg.channelId,
        text: msg.text,
        messageId: msg.id,
        originalTimestamp: msg.timestamp,
      },
    };

    eventBus.publish(event);
  }
}
