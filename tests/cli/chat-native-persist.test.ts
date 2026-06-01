import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  getRecentTurns,
  type ChatNativeOptions,
  type ChatMemoryAdapter,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ChatMessage,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function stubDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'ok') };
}

function mockMemory(
  history: Array<{ role: string; content: string }> = [],
): { adapter: ChatMemoryAdapter; appendSpy: ReturnType<typeof vi.fn>; historySpy: ReturnType<typeof vi.fn> } {
  const appendSpy = vi.fn(() => 0);
  const historySpy = vi.fn(() => history);
  const adapter: ChatMemoryAdapter = {
    appendChatTurn: appendSpy,
    getChatHistory: historySpy,
  };
  return { adapter, appendSpy, historySpy };
}

function baseOpts(
  overrides: Partial<ChatNativeOptions> & Pick<ChatNativeOptions, 'provider' | 'dispatcher' | 'input'>,
): ChatNativeOptions {
  return { output: vi.fn(), ...overrides };
}

// ─── Test 1: turn persist ────────────────────────────────────────────

describe('chat-native persist — turn persist', () => {
  it('appends user and assistant turns to memory with correct sessionId', async () => {
    const sendSpy = vi.fn(async () => ({ text: 'reply', stopReason: 'end_turn' as const }));
    const provider: ChatProviderAdapter = { send: sendSpy };
    const { adapter, appendSpy } = mockMemory();

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hello'),
      memory: adapter,
      sessionId: 'persist-session-1',
    }));

    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(appendSpy).toHaveBeenNthCalledWith(1, 'persist-session-1', 'user', 'hello');
    expect(appendSpy).toHaveBeenNthCalledWith(2, 'persist-session-1', 'assistant', 'reply');
  });

  it('auto-generates sessionId when not provided and persists with it', async () => {
    const { adapter, appendSpy } = mockMemory();
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'auto', stopReason: 'end_turn' as const })),
    };

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('test'),
      memory: adapter,
      // no sessionId — auto-generated
    }));

    expect(appendSpy).toHaveBeenCalledTimes(2);
    const [firstCall] = appendSpy.mock.calls;
    // sessionId auto-generated as `chat-<timestamp>` — starts with "chat-"
    expect(firstCall[0]).toMatch(/^chat-\d+/);
    expect(firstCall[1]).toBe('user');
    expect(firstCall[2]).toBe('test');
  });
});

// ─── Test 2: resume yükle ────────────────────────────────────────────

describe('chat-native persist — resume yükle', () => {
  it('pre-populates transcript with prior history when resumeLimit > 0', async () => {
    const priorHistory = [
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
    ];
    const { adapter, historySpy } = mockMemory(priorHistory);
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'new answer', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('new question'),
      memory: adapter,
      sessionId: 'resume-session',
      resumeLimit: 10,
    }));

    // getChatHistory called with the session id and resumeLimit
    expect(historySpy).toHaveBeenCalledWith('resume-session', 10);

    // Prior history is at the front of the transcript
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'old question' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'old answer' });
    // New turn follows
    expect(transcript[2]).toMatchObject({ role: 'user', content: 'new question' });
    expect(transcript[3]).toMatchObject({ role: 'assistant', content: 'new answer' });
  });

  it('does not call getChatHistory when resumeLimit is 0 (default)', async () => {
    const { adapter, historySpy } = mockMemory([
      { role: 'user', content: 'should-not-appear' },
    ]);
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'fresh', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hi'),
      memory: adapter,
      sessionId: 'no-resume',
      resumeLimit: 0,
    }));

    expect(historySpy).not.toHaveBeenCalled();
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'hi' });
  });
});

// ─── Test 3: boş history ─────────────────────────────────────────────

describe('chat-native persist — boş history', () => {
  it('handles empty getChatHistory gracefully — fresh session starts with no prior turns', async () => {
    const { adapter, appendSpy } = mockMemory([]);
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'hello back', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hello'),
      memory: adapter,
      sessionId: 'empty-history',
      resumeLimit: 5,
    }));

    // No pre-populated turns — starts fresh
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'hello back' });
    expect(appendSpy).toHaveBeenCalledTimes(2);
  });

  it('works without memory adapter at all — no-op, backward compatible', async () => {
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'no-mem', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('ping'),
      // no memory option
    }));

    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'ping' });
  });
});

// ─── Test 4: window truncate ─────────────────────────────────────────

describe('chat-native persist — window truncate', () => {
  it('only sends last N turns to provider when contextWindowSize is set', async () => {
    const sentMessages: ChatMessage[][] = [];
    const provider: ChatProviderAdapter = {
      send: vi.fn(async (msgs) => {
        sentMessages.push([...msgs]);
        return { text: 'ok', stopReason: 'end_turn' as const };
      }),
    };
    const { adapter } = mockMemory([]);

    // Send 3 turns but contextWindowSize = 2 → provider only ever sees 2 msgs at most
    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('msg1', 'msg2', 'msg3'),
      memory: adapter,
      sessionId: 'window-session',
      contextWindowSize: 2,
    }));

    // Each provider.send call receives at most 2 messages
    for (const sent of sentMessages) {
      expect(sent.length).toBeLessThanOrEqual(2);
    }
  });

  it('getRecentTurns returns full transcript when contextWindowSize exceeds length', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ];
    expect(getRecentTurns(msgs, 10)).toEqual(msgs);
    expect(getRecentTurns(msgs, undefined)).toEqual(msgs);
  });

  it('getRecentTurns slices to last N when transcript is longer than window', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: '4' },
    ];
    const result = getRecentTurns(msgs, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ content: '3' });
    expect(result[1]).toMatchObject({ content: '4' });
  });
});
