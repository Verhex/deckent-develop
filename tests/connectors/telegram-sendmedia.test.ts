import { describe, it, expect, vi } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';
import type { MediaAttachment } from '../../src/connectors/types.js';

function mockBot() {
  const api = { sendMessage: vi.fn(async () => ({})), sendPhoto: vi.fn(async () => ({})), sendDocument: vi.fn(async () => ({})),
    sendChatAction: vi.fn(async () => ({})), editMessageText: vi.fn(async () => ({})) };
  const instance = { on: vi.fn(), start: vi.fn(async () => {}), stop: vi.fn(async () => {}), api };
  const Bot = vi.fn(() => instance) as unknown as { new (t: string): typeof instance };
  return { Bot, instance };
}
class FakeInputFile { constructor(public data: Buffer, public filename: string) {} }

const cfg = { enabled: true, token: 'x' } as never;
const png: MediaAttachment = { kind: 'photo', filename: 's.png', mime: 'image/png', data: Buffer.from([1, 2, 3]), caption: 'cap' };

describe('TelegramConnector.sendMedia', () => {
  it('photo → sendPhoto(channelId, InputFile(data,filename), {caption})', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);
    await c.startOutbound(cfg);
    await c.sendMedia('123', png);
    expect(instance.api.sendPhoto).toHaveBeenCalledTimes(1);
    const [chat, file, extra] = instance.api.sendPhoto.mock.calls[0]!;
    expect(chat).toBe('123');
    expect((file as FakeInputFile).data).toEqual(png.data);
    expect((extra as { caption: string }).caption).toBe('cap');
  });
  it('document → sendDocument', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);
    await c.startOutbound(cfg);
    await c.sendMedia('123', { ...png, kind: 'document', filename: 'f.pdf', mime: 'application/pdf' });
    expect(instance.api.sendDocument).toHaveBeenCalledTimes(1);
  });
}
);
