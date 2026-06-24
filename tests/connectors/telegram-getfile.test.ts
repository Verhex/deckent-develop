/**
 * Task 8 — TDD: TelegramConnector.getFileBuffer
 *
 * Tests that getFileBuffer:
 *   1. calls bot.api.getFile(fileId) to get the file path
 *   2. builds the correct download URL (https://api.telegram.org/file/bot<token>/<file_path>)
 *   3. fetches the URL and returns the buffer + mime from file extension
 *   4. stores the token from start() config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';

// ─── Fake grammY Bot ─────────────────────────────────────────────────────────

function createFakeBot(token: string, filePath: string) {
  const instance = {
    on: vi.fn(),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    api: {
      sendMessage: vi.fn(async () => ({})),
      editMessageText: vi.fn(async () => ({})),
      sendChatAction: vi.fn(async () => ({})),
      sendPhoto: vi.fn(async () => ({})),
      sendDocument: vi.fn(async () => ({})),
      getFile: vi.fn(async (_fileId: string) => ({
        file_id: _fileId,
        file_path: filePath,
        file_size: 1024,
      })),
    },
  };

  const MockBot = vi.fn(() => instance) as unknown as { new(token: string): typeof instance };
  return { MockBot, instance, token };
}

// ─── Fake fetch ──────────────────────────────────────────────────────────────

function makeFakeFetch(body: Buffer) {
  return vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TelegramConnector.getFileBuffer', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns buffer + mime for a JPEG file (extension → image/jpeg)', async () => {
    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const { MockBot } = createFakeBot('bot123:ABC', 'photos/file_1234.jpg');

    const fakeFetch = makeFakeFetch(imageBytes);
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const connector = new TelegramConnector(MockBot as any);
    await connector.start({ enabled: true, token: 'bot123:ABC' });

    const result = await connector.getFileBuffer!('AgAB_test_file_id');

    // buffer content matches
    expect(Buffer.compare(result.data, imageBytes)).toBe(0);
    // mime derived from extension
    expect(result.mime).toBe('image/jpeg');
    // filename
    expect(result.filename).toBe('file_1234.jpg');
  });

  it('builds the correct download URL from the stored token', async () => {
    const { MockBot, instance } = createFakeBot('botTOK:XYZ', 'documents/file_abcd.pdf');
    const pdfBytes = Buffer.from('%PDF-1.4');

    const fakeFetch = makeFakeFetch(pdfBytes);
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const connector = new TelegramConnector(MockBot as any);
    await connector.start({ enabled: true, token: 'botTOK:XYZ' });

    await connector.getFileBuffer!('some_doc_file_id');

    // getFile called with the fileId
    expect(instance.api.getFile).toHaveBeenCalledWith('some_doc_file_id');
    // fetch called with the correct Telegram download URL
    expect(fakeFetch).toHaveBeenCalledWith(
      'https://api.telegram.org/file/botbotTOK:XYZ/documents/file_abcd.pdf',
    );
  });

  it('handles PNG extension → image/png mime', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const { MockBot } = createFakeBot('botTOK:A', 'photos/snap.png');

    const fakeFetch = makeFakeFetch(pngBytes);
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const connector = new TelegramConnector(MockBot as any);
    await connector.start({ enabled: true, token: 'botTOK:A' });

    const result = await connector.getFileBuffer!('file_png');
    expect(result.mime).toBe('image/png');
    expect(result.filename).toBe('snap.png');
  });

  it('falls back to application/octet-stream for unknown extension', async () => {
    const data = Buffer.from('binary data');
    const { MockBot } = createFakeBot('botTOK:B', 'files/data.bin');

    const fakeFetch = makeFakeFetch(data);
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const connector = new TelegramConnector(MockBot as any);
    await connector.start({ enabled: true, token: 'botTOK:B' });

    const result = await connector.getFileBuffer!('file_bin');
    expect(result.mime).toBe('application/octet-stream');
  });

  it('throws when bot is not started', async () => {
    const connector = new TelegramConnector();
    await expect(connector.getFileBuffer!('any_id')).rejects.toThrow('Telegram connector not started');
  });
});
