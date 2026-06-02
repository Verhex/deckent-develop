/**
 * chat-stream — F2-007 token-streaming surface (Sprint 219 T-219-007).
 *
 * Verifies `streamChatMessage` and `streamToSseLines` against mock
 * ChatProviderAdapter implementations. No HTTP, no spawning, no
 * gitignored state — hermetic.
 */
import { describe, it, expect } from 'vitest';

import { streamChatMessage, streamToSseLines } from '../../src/api/chat-stream.js';
import type {
  ChatProviderAdapter,
  ChatMessage,
  ProviderResponse,
  StreamChunk,
} from '../../src/cli/commands/chat-native.js';

// ─── helpers ──────────────────────────────────────────────────────────

/** Streaming adapter that emits a preset chunk sequence then a `done` marker. */
function streamingAdapter(chunks: string[]): ChatProviderAdapter {
  return {
    async send() {
      return { text: chunks.join(''), stopReason: 'end_turn' };
    },
    async *stream(): AsyncIterable<StreamChunk> {
      for (const piece of chunks) {
        yield { text: piece };
      }
      yield { done: { text: chunks.join(''), stopReason: 'end_turn' } };
    },
  };
}

/** Non-streaming adapter — returns the full reply in one `send` call. */
function sendOnlyAdapter(reply: string): ChatProviderAdapter {
  return {
    async send(_messages: ChatMessage[]): Promise<ProviderResponse> {
      return { text: reply, stopReason: 'end_turn' };
    },
  };
}

/** Adapter whose stream/send always throws. */
function throwingAdapter(message: string): ChatProviderAdapter {
  return {
    async send() {
      throw new Error(message);
    },
    async *stream(): AsyncIterable<StreamChunk> {
      throw new Error(message);
      // unreachable but satisfies TS
      yield {};
    },
  };
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

// ─── tests ────────────────────────────────────────────────────────────

describe('streamChatMessage', () => {
  it('forwards each provider stream chunk as a ChatStreamEvent chunk', async () => {
    const adapter = streamingAdapter(['Hel', 'lo,', ' world']);
    const events = await collect(streamChatMessage('hi', adapter));

    const chunks = events.filter((e) => e.type === 'chunk');
    expect(chunks.map((c) => (c as { text: string }).text)).toEqual(['Hel', 'lo,', ' world']);
  });

  it('accumulates chunks and emits a terminal `done` event with the full reply', async () => {
    const adapter = streamingAdapter(['Hel', 'lo,', ' world']);
    const events = await collect(streamChatMessage('hi', adapter));

    const last = events[events.length - 1];
    expect(last?.type).toBe('done');
    expect((last as { reply: string }).reply).toBe('Hello, world');
  });

  it('falls back to `send()` when `stream()` is not implemented', async () => {
    const adapter = sendOnlyAdapter('full single shot');
    const events = await collect(streamChatMessage('hi', adapter));

    const chunks = events.filter((e) => e.type === 'chunk');
    expect(chunks.length).toBe(1);
    expect((chunks[0] as { text: string }).text).toBe('full single shot');

    const done = events.find((e) => e.type === 'done');
    expect((done as { reply: string }).reply).toBe('full single shot');
  });

  it('emits an error event (not a throw) when the provider rejects', async () => {
    const adapter = throwingAdapter('boom');
    const events = await collect(streamChatMessage('hi', adapter));

    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect((err as { message: string }).message).toContain('boom');
    // No `done` event when the stream aborts via error.
    expect(events.find((e) => e.type === 'done')).toBeUndefined();
  });

  it('rejects empty / whitespace-only message with an error event and no provider call', async () => {
    let callCount = 0;
    const adapter: ChatProviderAdapter = {
      async send() {
        callCount++;
        return { text: 'never', stopReason: 'end_turn' };
      },
    };

    const events = await collect(streamChatMessage('   ', adapter));
    expect(callCount).toBe(0);
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    expect((events[0] as { message: string }).message).toMatch(/required/);
  });

  it('streamToSseLines formats each event as a `data: ${JSON}\\n\\n` SSE frame', async () => {
    const adapter = streamingAdapter(['ab', 'cd']);
    const lines = await collect(streamToSseLines(streamChatMessage('hi', adapter)));

    // 2 chunk events + 1 done event = 3 SSE frames
    expect(lines.length).toBe(3);
    for (const line of lines) {
      expect(line.startsWith('data: ')).toBe(true);
      expect(line.endsWith('\n\n')).toBe(true);
    }
    // The body between `data: ` and `\n\n` must be valid JSON.
    const first = JSON.parse(lines[0]!.slice('data: '.length, -2)) as { type: string };
    expect(first.type).toBe('chunk');
  });
});
