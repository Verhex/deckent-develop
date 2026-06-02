import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// ─── Helpers ────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

/** Provider stub returning queued responses (send only — no stream). */
function queuedProvider(responses: ProviderResponse[]): ChatProviderAdapter {
  const remaining = [...responses];
  return {
    async send() {
      const next = remaining.shift();
      if (!next) throw new Error('queuedProvider exhausted');
      return next;
    },
  };
}

const noopDispatcher: McpToolDispatcher = { async dispatch() { return 'noop'; } };

// ─── Layout wire (Fix 1) ────────────────────────────────────────────

describe('runChatNativeLoop — layoutEnabled chrome', () => {
  it('emits user message, assistant header and separator when layoutEnabled', async () => {
    const out: string[] = [];
    await runChatNativeLoop({
      provider: queuedProvider([{ text: 'merhaba', stopReason: 'end_turn' }]),
      dispatcher: noopDispatcher,
      input: lines('selam'),
      output: (l) => out.push(l),
      layoutEnabled: true,
    });
    const joined = out.join('\n');
    // chat-layout is TTY-aware: on a non-TTY test stream it emits plain
    // prefixes, so we assert structure (the user line is echoed + the reply),
    // not raw ANSI.
    expect(joined).toContain('selam');
    expect(joined).toContain('merhaba');
    // More chrome lines than the bare reply alone (header/separator present).
    expect(out.length).toBeGreaterThan(1);
  });

  it('does NOT echo the user line when layoutEnabled is absent (default off)', async () => {
    const out: string[] = [];
    await runChatNativeLoop({
      provider: queuedProvider([{ text: 'merhaba', stopReason: 'end_turn' }]),
      dispatcher: noopDispatcher,
      input: lines('selam'),
      output: (l) => out.push(l),
    });
    expect(out.join('\n')).not.toContain('selam');
    expect(out.join('\n')).toContain('merhaba');
  });
});

// ─── Thinking indicator wire (Fix 2) ────────────────────────────────

describe('runChatNativeLoop — thinkingIndicator', () => {
  it('starts after header and stops once output is produced', async () => {
    const events: string[] = [];
    const indicator = {
      start: () => events.push('start'),
      stop: () => events.push('stop'),
    };
    await runChatNativeLoop({
      provider: queuedProvider([{ text: 'cevap', stopReason: 'end_turn' }]),
      dispatcher: noopDispatcher,
      input: lines('soru'),
      output: () => events.push('output'),
      thinkingIndicator: indicator,
    });
    // start fires before any output; stop fires on the first output byte.
    expect(events).toContain('start');
    expect(events).toContain('stop');
    expect(events.indexOf('start')).toBeLessThan(events.indexOf('output'));
    expect(events.indexOf('stop')).toBeLessThanOrEqual(events.indexOf('output'));
  });

  it('stops the indicator even on an empty response (finally safety net)', async () => {
    const stop = vi.fn();
    await runChatNativeLoop({
      provider: queuedProvider([{ text: '', stopReason: 'end_turn' }]),
      dispatcher: noopDispatcher,
      input: lines('soru'),
      output: vi.fn(),
      thinkingIndicator: { start: vi.fn(), stop },
    });
    expect(stop).toHaveBeenCalled();
  });

  it('stops the indicator exactly once across multiple output chunks', async () => {
    const stop = vi.fn();
    const start = vi.fn();
    // Streaming provider emits two text chunks → output called twice, but
    // the indicator must stop only on the first.
    const streamingProvider: ChatProviderAdapter = {
      async send() { return { text: 'unused', stopReason: 'end_turn' }; },
      async *stream() {
        yield { text: 'foo' };
        yield { text: 'bar', done: { text: 'foobar', stopReason: 'end_turn' } };
      },
    };
    await runChatNativeLoop({
      provider: streamingProvider,
      dispatcher: noopDispatcher,
      input: lines('soru'),
      output: vi.fn(),
      thinkingIndicator: { start, stop },
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
