import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  defaultSubscriptionSpawn,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// Task 380-014 (born-513) — `/clear` previously only emptied the JS-side
// `transcript` array; a warm PersistentClaudeSession (chat-session.ts) keeps
// its OWN conversation history alive inside the same long-lived child
// process, so the model kept silently recalling pre-/clear context. Verifies:
//   1. /clear still empties the transcript (regression guard).
//   2. /clear calls `provider.exit()` when the provider duck-types as a
//      PersistentClaudeSession (warm-child context reset).
//   3. /clear does NOT touch `.exit` (and does not throw) when the provider
//      has no such capability (subscription one-shot / codex / gemini / test
//      fakes) — preserves the pre-fix contract for every non-persistent caller.
//   4. This file's own spawn-site (`defaultSubscriptionSpawn`) no longer
//      crashes the process on a real ENOENT spawn (born-509's fix mirrored
//      here, the one spawn-site 380-005 did not cover).

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

/** Provider that duck-types as a PersistentClaudeSession (adds `.exit()`). */
function queuedPersistentProvider(responses: ProviderResponse[]): {
  adapter: ChatProviderAdapter & { exit(): Promise<void> };
  sendSpy: ReturnType<typeof vi.fn>;
  exitSpy: ReturnType<typeof vi.fn>;
} {
  const { adapter, sendSpy } = queuedProvider(responses);
  const exitSpy = vi.fn(async () => undefined);
  return { adapter: { ...adapter, exit: exitSpy }, sendSpy, exitSpy };
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

describe('runChatNativeLoop — /clear context reset (T-380-014)', () => {
  it('/clear still empties the transcript when the provider has no exit()', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'one', stopReason: 'end_turn' },
      { text: 'two', stopReason: 'end_turn' },
    ]);
    const { dispatcher } = fakeDispatcher();

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('first', '/clear', 'second'),
    }));

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(transcript).toEqual([
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('does not call .exit and does not throw for a non-persistent provider', async () => {
    const { adapter } = queuedProvider([{ text: 'ok', stopReason: 'end_turn' }]);
    const { dispatcher } = fakeDispatcher();

    await expect(runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/clear', 'second'),
    }))).resolves.toBeDefined();
  });

  it('/clear calls provider.exit() when the provider exposes it (warm-child reset)', async () => {
    const { adapter, sendSpy, exitSpy } = queuedPersistentProvider([
      { text: 'one', stopReason: 'end_turn' },
      { text: 'two', stopReason: 'end_turn' },
    ]);
    const { dispatcher } = fakeDispatcher();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('first', '/clear', 'second'),
    }));

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it('/clear resets context: the resumed turn cannot see pre-clear history in what is sent', async () => {
    // The loop passes the LIVE transcript array by reference into send(), so
    // snapshot the messages at call-time (not via sendSpy.mock.calls, which
    // would observe later mutations — e.g. the assistant reply pushed right
    // after this same call returns).
    const snapshots: Array<Array<{ role: string; content: string }>> = [];
    const exitSpy = vi.fn(async () => undefined);
    const responses: ProviderResponse[] = [
      { text: 'reply-to-first', stopReason: 'end_turn' },
      { text: 'reply-to-second', stopReason: 'end_turn' },
    ];
    const sendSpy = vi.fn(async (messages: Array<{ role: string; content: string }>) => {
      snapshots.push([...messages]);
      const next = responses.shift();
      if (!next) throw new Error('response queue exhausted');
      return next;
    });
    const adapter: ChatProviderAdapter & { exit(): Promise<void> } = { send: sendSpy, exit: exitSpy };
    const { dispatcher } = fakeDispatcher();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('first', '/clear', 'second'),
    }));

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(snapshots).toEqual([
      [{ role: 'user', content: 'first' }],
      [{ role: 'user', content: 'second' }],
    ]);
  });

  it('/clear awaits a slow exit() before dispatching the next turn', async () => {
    let exited = false;
    const exitSpy = vi.fn(() => new Promise<void>((resolve) => {
      setTimeout(() => { exited = true; resolve(); }, 10);
    }));
    const sendSpy = vi.fn(async () => {
      expect(exited).toBe(true);
      return { text: 'ok', stopReason: 'end_turn' } as ProviderResponse;
    });
    const adapter: ChatProviderAdapter & { exit(): Promise<void> } = { send: sendSpy, exit: exitSpy };
    const { dispatcher } = fakeDispatcher();

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('/clear', 'second'),
    }));

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

describe('defaultSubscriptionSpawn — error listener (T-380-014, born-509 gap in this file)', () => {
  const ENOENT_BINARY = '/nonexistent/deckent-enoent-test-380-014-xyz';

  it('a real ENOENT spawn does not crash the process and rejects chunks iteration', async () => {
    const { chunks, wait } = defaultSubscriptionSpawn(ENOENT_BINARY, [], { ...process.env });
    const iterator = chunks[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toBeInstanceOf(Error);
    await wait;
  });

  it('wait resolves with a null exitCode even though close is not guaranteed after error', async () => {
    const { wait } = defaultSubscriptionSpawn(ENOENT_BINARY, [], { ...process.env });
    const result = await wait;
    expect(result.exitCode).toBeNull();
  });
});
