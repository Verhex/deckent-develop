/**
 * Task 8 — TDD: inbound photo/document → artifact → [attached] text prepend
 *
 * Tests that when an IncomingMessage with raw.media arrives on an authorized channel,
 * bootstrapConnectorCommands:
 *   1. calls getFileBuffer(fileId) on the connector
 *   2. registers the buffer as an artifact for the channelId
 *   3. prepends "[attached: <id>, <filename>]" (or TR equivalent) to the text
 *      that is passed to the chat responder (deps.chat)
 *
 * The fake connector exposes getFileBuffer so bootstrap can call it without starting
 * a real Telegram poll. Tests are hermetic (tmpdir, no real filesystem writes to project).
 */

import { describe, it, expect, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import type { IMessageConnector, IncomingMessage, MessageHandler } from '../../src/connectors/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-inbound-media-test-'));
}

/** Fake connector with getFileBuffer support. */
function fakeMediaConnector(fileBuffer: Buffer, mime: string, filename: string) {
  let handler: MessageHandler | undefined;

  const instance = {
    id: 'telegram' as const,
    name: 'Telegram',
    start: vi.fn(async () => {}),
    startOutbound: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
    isHealthy: () => true,
    getFileBuffer: vi.fn(async (_fileId: string) => ({ data: fileBuffer, mime, filename })),
    // expose for test simulation
    _emit: (m: IncomingMessage) => handler?.(m),
  } satisfies Omit<IMessageConnector, 'id'> & { id: 'telegram'; _emit: (m: IncomingMessage) => void };

  return instance;
}

/** Incoming message with raw.media (inbound photo simulation). */
function incomingPhoto(channelId: string, text: string = ''): IncomingMessage {
  return {
    id: 'msg-photo-1',
    connector: 'telegram',
    fromUser: 'u1',
    channelId,
    text,
    timestamp: new Date().toISOString(),
    raw: {
      media: {
        fileId: 'AgAB_photo_file_id',
        filename: 'photo.jpg',
        mime: 'image/jpeg',
      },
    },
  };
}

/** Incoming message with raw.media (inbound document simulation). */
function incomingDocument(channelId: string, text: string = ''): IncomingMessage {
  return {
    id: 'msg-doc-1',
    connector: 'telegram',
    fromUser: 'u1',
    channelId,
    text,
    timestamp: new Date().toISOString(),
    raw: {
      media: {
        fileId: 'BQABAgAD_doc_id',
        filename: 'report.pdf',
        mime: 'application/pdf',
      },
    },
  };
}

const cfg = { telegram: { enabled: true, token: 'bot:tok', chat_id: '555' } };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('inbound media → artifact → [attached] text', () => {
  it('photo message: getFileBuffer called, chat receives [attached: id, photo.jpg] prefix', async () => {
    const root = makeTmpRoot();
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const fake = fakeMediaConnector(jpegBytes, 'image/jpeg', 'photo.jpg');

    const chatCalls: Array<{ channelId: string; text: string }> = [];
    const chat = vi.fn(async (channelId: string, text: string) => {
      chatCalls.push({ channelId, text });
      return 'ok';
    });

    const resolve = vi.fn(async () => 'not-found' as const);

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve,
      chat,
    });

    fake._emit(incomingPhoto('555', 'mail this to alice'));

    // Wait for the async artifact+chat chain to complete
    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    // getFileBuffer was called with the photo's fileId
    expect(fake.getFileBuffer).toHaveBeenCalledWith('AgAB_photo_file_id');

    // chat received text containing [attached: <id>, photo.jpg]
    expect(chatCalls.length).toBe(1);
    const sentText = chatCalls[0]!.text;
    expect(sentText).toMatch(/\[attached: art_[0-9a-f]{8}, photo\.jpg\]/);
    expect(sentText).toContain('mail this to alice');
  });

  it('document message: getFileBuffer called with doc fileId, [attached] includes filename', async () => {
    const root = makeTmpRoot();
    const pdfBytes = Buffer.from('%PDF-1.4');
    const fake = fakeMediaConnector(pdfBytes, 'application/pdf', 'report.pdf');

    const chatCalls: Array<{ channelId: string; text: string }> = [];
    const chat = vi.fn(async (channelId: string, text: string) => {
      chatCalls.push({ channelId, text });
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
    });

    fake._emit(incomingDocument('555', 'summarize this'));

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    expect(fake.getFileBuffer).toHaveBeenCalledWith('BQABAgAD_doc_id');

    const sentText = chatCalls[0]!.text;
    expect(sentText).toMatch(/\[attached: art_[0-9a-f]{8}, report\.pdf\]/);
    expect(sentText).toContain('summarize this');
  });

  it('Turkish lang: uses [ek: id, filename] prefix', async () => {
    const root = makeTmpRoot();
    const bytes = Buffer.from('data');
    const fake = fakeMediaConnector(bytes, 'image/jpeg', 'photo.jpg');

    const chatCalls: Array<{ text: string }> = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatCalls.push({ text });
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
      lang: 'tr',
    });

    fake._emit(incomingPhoto('555', 'bunu mail at'));

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    const sentText = chatCalls[0]!.text;
    // Turkish key: [ek: id, filename]
    expect(sentText).toMatch(/\[ek: art_[0-9a-f]{8}, photo\.jpg\]/);
  });

  it('message without raw.media passes text through unchanged to chat', async () => {
    const root = makeTmpRoot();
    const fake = fakeMediaConnector(Buffer.from(''), 'image/jpeg', 'photo.jpg');

    const chatCalls: Array<{ text: string }> = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatCalls.push({ text });
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fake,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
    });

    // Plain text message, no raw.media
    fake._emit({
      id: 'm2',
      connector: 'telegram',
      fromUser: 'u1',
      channelId: '555',
      text: 'just a question',
      timestamp: new Date().toISOString(),
    });

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    // No [attached] prefix — text unchanged
    expect(chatCalls[0]!.text).toBe('just a question');
    // getFileBuffer NOT called
    expect(fake.getFileBuffer).not.toHaveBeenCalled();
  });

  it('getFileBuffer missing on connector: message still reaches chat (graceful degrade)', async () => {
    const root = makeTmpRoot();
    // Connector without getFileBuffer (simulates a connector that doesn't implement it)
    let handler: MessageHandler | undefined;
    const fakeNoGetFile = {
      id: 'telegram' as const,
      name: 'Telegram',
      start: vi.fn(async () => {}),
      startOutbound: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      sendMessage: vi.fn(async () => {}),
      onMessage: vi.fn((h: MessageHandler) => { handler = h; }),
      isHealthy: () => true,
      // NO getFileBuffer
      _emit: (m: IncomingMessage) => handler?.(m),
    };

    const chatCalls: Array<{ text: string }> = [];
    const chat = vi.fn(async (_channelId: string, text: string) => {
      chatCalls.push({ text });
      return 'ok';
    });

    await bootstrapConnectorCommands(root, cfg, {
      makeConnector: () => fakeNoGetFile,
      resolve: vi.fn(async () => 'not-found' as const),
      chat,
    });

    fakeNoGetFile._emit(incomingPhoto('555', 'mail this'));

    await vi.waitFor(() => expect(chatCalls.length).toBeGreaterThan(0));

    // Still reaches chat, but without [attached] prefix (graceful degrade)
    expect(chatCalls[0]!.text).toContain('mail this');
  });
});
