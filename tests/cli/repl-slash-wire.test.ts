import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// Sprint 221 T-221-001 — runChatNativeLoop slash-wire tests.
// Verifies that handleReplCommand is called from inside the loop so /exit,
// /quit, /clear are handled BEFORE provider dispatch — for any input source.

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function queuedProvider(responses: ProviderResponse[]): {
  adapter: ChatProviderAdapter;
  sendSpy: ReturnType<typeof vi.fn>;
} {
  const remaining = [...responses];
  const sendSpy = vi.fn(async () => {
    const next = remaining.shift();
    if (!next) throw new Error('queuedProvider: response queue exhausted');
    return next;
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(): { dispatcher: McpToolDispatcher; dispatchSpy: ReturnType<typeof vi.fn> } {
  const dispatchSpy = vi.fn(async () => 'tool-ok');
  return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return {
    output: vi.fn(),
    ...overrides,
  };
}

describe('runChatNativeLoop — slash command wire (T-221-001)', () => {
  it('/exit breaks the loop without calling provider', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/exit'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(transcript).toEqual([]);
  });

  it('/quit breaks the loop without calling provider', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/quit'),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(transcript).toEqual([]);
  });

  it('/clear empties the transcript and continues; subsequent line reaches provider', async () => {
    // First turn populates transcript, then /clear wipes it, then a fresh
    // turn arrives and is dispatched normally. After loop end, transcript
    // contains only the post-/clear turn (and its assistant reply).
    const { adapter, sendSpy } = queuedProvider([
      { text: 'one', stopReason: 'end_turn' },
      { text: 'two', stopReason: 'end_turn' },
    ]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('first', '/clear', 'second'),
      output,
    }));

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(transcript).toEqual([
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('normal line falls through to provider (slash does not swallow regular input)', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'hi back', stopReason: 'end_turn' },
    ]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('hello'),
      output,
    }));

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(transcript).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi back' },
    ]);
  });

  it('uppercase /EXIT is normalized and breaks the loop', async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher } = fakeDispatcher();
    const output = vi.fn();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('  /EXIT  '),
      output,
    }));

    expect(sendSpy).not.toHaveBeenCalled();
    expect(transcript).toEqual([]);
  });
});
