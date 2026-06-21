import { describe, it, expect } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';

// Minimal fake grammY Bot capturing the calls the streaming path makes.
function fakeGrammyBot() {
  const calls: { method: string; args: unknown[] }[] = [];
  const handlers: Record<string, (ctx: unknown) => void> = {};
  class FakeBot {
    constructor(public token: string) {}
    on(filter: string, h: (ctx: unknown) => void) { handlers[filter] = h; }
    async start() { /* long-poll no-op in tests */ }
    async stop() { calls.push({ method: 'stop', args: [] }); }
    api = {
      sendMessage: async (...a: unknown[]) => { calls.push({ method: 'sendMessage', args: a }); return { message_id: 4242 }; },
      editMessageText: async (...a: unknown[]) => { calls.push({ method: 'editMessageText', args: a }); return true; },
      sendChatAction: async (...a: unknown[]) => { calls.push({ method: 'sendChatAction', args: a }); return true; },
    };
  }
  return { FakeBot: FakeBot as unknown as new (t: string) => unknown, calls, handlers };
}

describe('TelegramConnector streaming capabilities', () => {
  it('sendMessageReturningId returns the message_id; editMessage + sendChatAction call bot.api', async () => {
    const { FakeBot, calls } = fakeGrammyBot();
    const tg = new TelegramConnector(FakeBot as never);
    await tg.startOutbound({ enabled: true, token: 't' });

    const id = await tg.sendMessageReturningId!({ connector: 'telegram', channelId: '99', text: 'hi' });
    expect(id).toBe('4242');

    await tg.sendChatAction!('99', 'typing');
    await tg.editMessage!('99', '4242', 'edited', 'HTML');

    expect(calls.map((c) => c.method)).toEqual(['sendMessage', 'sendChatAction', 'editMessageText']);
    const edit = calls.find((c) => c.method === 'editMessageText')!;
    // grammY editMessageText signature: (chatId, messageId, text, other?) — NO undefined positional.
    expect(edit.args[0]).toBe('99');
    expect(edit.args[1]).toBe(4242);
    expect(edit.args[2]).toBe('edited');
  });
});
