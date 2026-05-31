import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  getRecentTurns,
  type ChatMessage,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function echoProvider(responses: string[]): ChatProviderAdapter {
  const queue = [...responses];
  return {
    send: vi.fn(async (): Promise<ProviderResponse> => ({
      text: queue.shift() ?? 'ok',
      stopReason: 'end_turn',
    })),
  };
}

function capturingProvider(): {
  adapter: ChatProviderAdapter;
  calls: ChatMessage[][];
} {
  const calls: ChatMessage[][] = [];
  const adapter: ChatProviderAdapter = {
    send: vi.fn(async (messages: ChatMessage[]): Promise<ProviderResponse> => {
      calls.push([...messages]);
      return { text: 'reply', stopReason: 'end_turn' };
    }),
  };
  return { adapter, calls };
}

function nullDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'tool-result') };
}

function baseOpts(
  overrides: Partial<ChatNativeOptions> & {
    provider: ChatProviderAdapter;
    dispatcher: McpToolDispatcher;
    input: AsyncIterable<string>;
  },
): ChatNativeOptions {
  return { output: vi.fn(), ...overrides };
}

// ─── getRecentTurns unit tests ───────────────────────────────────────

describe('getRecentTurns', () => {
  it('returns full transcript when n is undefined (no truncation)', () => {
    const turns: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ];
    expect(getRecentTurns(turns, undefined)).toBe(turns);
  });

  it('returns full transcript when transcript.length <= n', () => {
    const turns: ChatMessage[] = [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: 'y' },
    ];
    expect(getRecentTurns(turns, 10)).toBe(turns);
  });

  it('returns last n turns when transcript longer than n', () => {
    const turns: ChatMessage[] = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `msg-${i}`,
    }));
    const result = getRecentTurns(turns, 5);
    expect(result).toHaveLength(5);
    expect(result[0].content).toBe('msg-10');
    expect(result[4].content).toBe('msg-14');
  });

  it('order preserved: last-n turns appear in original order', () => {
    const turns: ChatMessage[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
      { role: 'assistant', content: 'fourth' },
      { role: 'user', content: 'fifth' },
    ];
    const result = getRecentTurns(turns, 3);
    expect(result.map((t) => t.content)).toEqual(['third', 'fourth', 'fifth']);
  });
});

// ─── Context window in runChatNativeLoop ────────────────────────────

describe('runChatNativeLoop — multi-turn context window', () => {
  it('last N inject: only contextWindowSize turns sent to provider on each call', async () => {
    const { adapter, calls } = capturingProvider();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('turn1', 'turn2', 'turn3', 'turn4', 'turn5'),
      contextWindowSize: 3,
    }));

    // After turn5, transcript has 10 entries (5 user + 5 assistant).
    // The last call to provider should only have seen 3 turns.
    const lastCall = calls[calls.length - 1];
    expect(lastCall.length).toBeLessThanOrEqual(3);
  });

  it('window overflow truncate: large history with small window sends correct slice', async () => {
    const { adapter, calls } = capturingProvider();

    // 8 user inputs → 8 user + 8 assistant = 16 total turns in transcript by end
    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'),
      contextWindowSize: 4,
    }));

    // The last provider call should see at most 4 turns
    const lastCall = calls[calls.length - 1];
    expect(lastCall.length).toBeLessThanOrEqual(4);
  });

  it('first turn empty context: fresh session first message → only 1 user turn sent', async () => {
    const { adapter, calls } = capturingProvider();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('hello'),
      contextWindowSize: 10,
    }));

    // First (only) call: just 1 user message, transcript=[{role:user, content:'hello'}]
    expect(calls[0]).toHaveLength(1);
    expect(calls[0][0]).toEqual({ role: 'user', content: 'hello' });
  });

  it('order preserved: context turns arrive in correct chronological order', async () => {
    const { adapter, calls } = capturingProvider();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('alpha', 'beta', 'gamma'),
      contextWindowSize: 4,
    }));

    // On the 3rd user turn the transcript is:
    // [user:alpha, asst:reply, user:beta, asst:reply, user:gamma]  → 5 turns, window=4
    // So the 3rd call should receive the last 4: [asst:reply, user:beta, asst:reply, user:gamma]
    const thirdCall = calls[2];
    expect(thirdCall.length).toBeLessThanOrEqual(4);
    // Last entry must always be the current user turn
    expect(thirdCall[thirdCall.length - 1].role).toBe('user');
    expect(thirdCall[thirdCall.length - 1].content).toBe('gamma');
  });

  it('no contextWindowSize: full transcript sent (backward-compat)', async () => {
    const { adapter, calls } = capturingProvider();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('a', 'b', 'c'),
    }));

    // Without contextWindowSize, last call sees all 5 turns (3 user + 2 asst so far + current user)
    const lastCall = calls[calls.length - 1];
    expect(lastCall.length).toBe(5); // [user:a, asst:reply, user:b, asst:reply, user:c]
  });

  it('echoProvider regression: streaming path unaffected by context window', async () => {
    const chunks: { text?: string; done?: ProviderResponse }[][] = [
      [{ text: 'one', done: { text: 'one', stopReason: 'end_turn' } }],
      [{ text: 'two', done: { text: 'two', stopReason: 'end_turn' } }],
    ];
    let idx = 0;
    const adapter: ChatProviderAdapter = {
      send: vi.fn(),
      async *stream() {
        for (const c of chunks[idx++] ?? []) yield c;
      },
    };
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher: nullDispatcher(),
      input: lines('q1', 'q2'),
      output,
      contextWindowSize: 10,
    }));

    const assistantTurns = transcript.filter((t) => t.role === 'assistant');
    expect(assistantTurns[0].content).toBe('one');
    expect(assistantTurns[1].content).toBe('two');
  });
});
