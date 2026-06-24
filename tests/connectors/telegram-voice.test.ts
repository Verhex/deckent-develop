import { describe, it, expect, vi } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';

// ---------- fake Bot factory (mirrors telegram-sendmedia.test.ts) ----------
function mockBot() {
  const api = {
    sendMessage: vi.fn(async () => ({})),
    sendPhoto: vi.fn(async () => ({})),
    sendDocument: vi.fn(async () => ({})),
    sendVoice: vi.fn(async () => ({})),
    sendChatAction: vi.fn(async () => ({})),
    editMessageText: vi.fn(async () => ({})),
  };
  const instance = {
    on: vi.fn(),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    api,
  };
  const Bot = vi.fn(() => instance) as unknown as { new (t: string): typeof instance };
  return { Bot, instance };
}

class FakeInputFile { constructor(public data: Buffer, public filename?: string) {} }

const cfg = { enabled: true, token: 'tok' } as never;

// ---------- outbound: sendVoice ----------
describe('TelegramConnector.sendVoice', () => {
  it('calls api.sendVoice(channelId, InputFile(data))', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);
    await c.startOutbound(cfg);

    const audio = { data: Buffer.from([0xde, 0xad]), mime: 'audio/ogg' };
    await c.sendVoice('99', audio);

    expect(instance.api.sendVoice).toHaveBeenCalledTimes(1);
    const [chatId, file] = instance.api.sendVoice.mock.calls[0]!;
    expect(chatId).toBe('99');
    expect((file as FakeInputFile).data).toEqual(audio.data);
  });

  it('throws if bot not started', async () => {
    const c = new TelegramConnector();
    await expect(c.sendVoice('1', { data: Buffer.alloc(0), mime: 'audio/ogg' })).rejects.toThrow('not started');
  });
});

// ---------- inbound: message:voice ----------
describe('TelegramConnector inbound message:voice', () => {
  it('emits IncomingMessage with raw.voice.fileId + mime', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);

    // Capture the registered voice handler
    let voiceHandler: ((ctx: unknown) => void) | undefined;
    instance.on.mockImplementation((filter: string, handler: (ctx: unknown) => void) => {
      if (filter === 'message:voice') voiceHandler = handler;
    });

    await c.start(cfg);

    const received: unknown[] = [];
    c.onMessage((msg) => received.push(msg));

    // Simulate an inbound voice update
    const fakeCtx = {
      message: {
        message_id: 42,
        date: 1700000000,
        voice: { file_id: 'voice_file_abc', mime_type: 'audio/ogg', duration: 5 },
      },
      from: { id: 7 },
      chat: { id: 99 },
    };

    expect(voiceHandler).toBeDefined();
    voiceHandler!(fakeCtx);

    expect(received).toHaveLength(1);
    const msg = received[0] as { text: string; raw: { voice: { fileId: string; mime: string } } };
    expect(msg.text).toBe('');
    expect(msg.raw.voice.fileId).toBe('voice_file_abc');
    expect(msg.raw.voice.mime).toBe('audio/ogg');
  });

  it('falls back to audio/ogg when mime_type is missing', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);

    let voiceHandler: ((ctx: unknown) => void) | undefined;
    instance.on.mockImplementation((filter: string, handler: (ctx: unknown) => void) => {
      if (filter === 'message:voice') voiceHandler = handler;
    });

    await c.start(cfg);
    const received: unknown[] = [];
    c.onMessage((msg) => received.push(msg));

    const fakeCtx = {
      message: { message_id: 1, date: 1700000000, voice: { file_id: 'v2' } },
      from: { id: 5 },
      chat: { id: 11 },
    };

    voiceHandler!(fakeCtx);

    const msg = received[0] as { raw: { voice: { mime: string } } };
    expect(msg.raw.voice.mime).toBe('audio/ogg');
  });
});
