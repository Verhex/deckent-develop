import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatMemoryAdapter,
  type ChatProviderAdapter,
  type McpToolDispatcher,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function stubProvider(text: string): ChatProviderAdapter {
  return { send: vi.fn(async () => ({ text, stopReason: 'end_turn' as const })) };
}

function stubDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'ok') };
}

function mockMemory(
  history: Array<{ role: string; content: string }> = [],
): { adapter: ChatMemoryAdapter; appendSpy: ReturnType<typeof vi.fn> } {
  const appendSpy = vi.fn(() => 0);
  const adapter: ChatMemoryAdapter = {
    appendChatTurn: appendSpy,
    getChatHistory: vi.fn(() => history),
  };
  return { adapter, appendSpy };
}

function baseOpts(
  overrides: Partial<ChatNativeOptions> & Pick<ChatNativeOptions, 'provider' | 'dispatcher' | 'input'>,
): ChatNativeOptions {
  return { output: vi.fn(), ...overrides };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('chat-native memory wire — turn kaydet', () => {
  it('appends user and assistant turns to memory after each exchange', async () => {
    const { adapter, appendSpy } = mockMemory();
    const provider = stubProvider('pong');

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('ping'),
      memory: adapter,
      sessionId: 'test-session',
    }));

    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(appendSpy).toHaveBeenNthCalledWith(1, 'test-session', 'user', 'ping');
    expect(appendSpy).toHaveBeenNthCalledWith(2, 'test-session', 'assistant', 'pong');
  });

  it('does not append assistant turn when provider returns empty text', async () => {
    const { adapter, appendSpy } = mockMemory();
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })),
    };

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hello'),
      memory: adapter,
      sessionId: 'empty-reply',
    }));

    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledWith('empty-reply', 'user', 'hello');
  });
});

describe('chat-native memory wire — resume oku', () => {
  it('pre-populates transcript with history from memory when resumeLimit > 0', async () => {
    const priorHistory = [
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer' },
    ];
    const { adapter } = mockMemory(priorHistory);
    const provider = stubProvider('new answer');
    const outputSpy = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('new question'),
      memory: adapter,
      sessionId: 'resume-session',
      resumeLimit: 10,
      output: outputSpy,
    }));

    expect(transcript[0]).toMatchObject({ role: 'user', content: 'prior question' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'prior answer' });
    expect(transcript[2]).toMatchObject({ role: 'user', content: 'new question' });
    expect(transcript[3]).toMatchObject({ role: 'assistant', content: 'new answer' });
  });
});

describe('chat-native memory wire — boş history', () => {
  it('works normally when getChatHistory returns empty array (fresh session)', async () => {
    const { adapter, appendSpy } = mockMemory([]);
    const provider = stubProvider('hello');

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hi'),
      memory: adapter,
      sessionId: 'fresh-session',
      resumeLimit: 5,
    }));

    // No pre-populated turns from history.
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(appendSpy).toHaveBeenCalledWith('fresh-session', 'user', 'hi');
  });

  it('works normally without memory option at all (backward compat)', async () => {
    const provider = stubProvider('reply');

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('question'),
    }));

    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'question' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'reply' });
  });
});

describe('chat-native memory wire — idempotent', () => {
  it('each turn is persisted exactly once — no double-appends per user message', async () => {
    const { adapter, appendSpy } = mockMemory();
    const provider = stubProvider('response');

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('msg1', 'msg2'),
      memory: adapter,
      sessionId: 'idempotent-session',
    }));

    // 2 user turns + 2 assistant turns = exactly 4 appends.
    expect(appendSpy).toHaveBeenCalledTimes(4);
    const calls = appendSpy.mock.calls;
    expect(calls[0]).toEqual(['idempotent-session', 'user', 'msg1']);
    expect(calls[1]).toEqual(['idempotent-session', 'assistant', 'response']);
    expect(calls[2]).toEqual(['idempotent-session', 'user', 'msg2']);
    expect(calls[3]).toEqual(['idempotent-session', 'assistant', 'response']);
  });
});
