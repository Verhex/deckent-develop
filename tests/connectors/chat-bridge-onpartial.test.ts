/**
 * chat-bridge onPartial streaming hook (Faz-1 T3)
 *
 * Verifies that ChatResponderDeps.onPartial is invoked with cumulative text
 * as the reply streams, so the bot can edit a Telegram message in-place.
 */

import { describe, it, expect } from 'vitest';
import { makeChatResponder } from '../../src/connectors/chat-bridge.js';
import type { ChatProviderAdapter, McpToolDispatcher, StreamChunk } from '../../src/cli/commands/chat-native.js';

// Hermetic noop dispatcher — never spawn the real CLI bridge.
const noopDispatcher: McpToolDispatcher = { async dispatch() { return ''; } };

// Fake provider that streams two text deltas then done.
// Matches the real StreamChunk shape: { text?: string; done?: ProviderResponse }
const fakeStreamingProvider: ChatProviderAdapter = {
  async send() {
    // Fallback (should not be called when stream() is defined and drained).
    return { text: 'Hello', stopReason: 'end_turn' as const };
  },
  async *stream(): AsyncIterable<StreamChunk> {
    yield { text: 'Hel' };
    yield { text: 'lo' };
    yield { done: { text: 'Hello', stopReason: 'end_turn' as const } };
  },
};

describe('chat-bridge onPartial', () => {
  it('invokes onPartial with cumulative text as the reply streams', async () => {
    const partials: string[] = [];
    const responder = makeChatResponder({
      provider: fakeStreamingProvider,
      dispatcher: noopDispatcher,
      onPartial: (_sid, txt) => partials.push(txt),
    });
    const reply = await responder('chan1', 'hi');
    expect(reply).toContain('Hello');
    expect(partials.length).toBeGreaterThan(0);
    // cumulative contract — last partial contains the first chunk's text
    expect(partials[partials.length - 1]).toContain('Hel');
  });

  it('does not affect existing callers when onPartial is absent', async () => {
    // No onPartial → no error, reply still works normally.
    const responder = makeChatResponder({
      provider: fakeStreamingProvider,
      dispatcher: noopDispatcher,
    });
    const reply = await responder('chan2', 'hi');
    expect(reply).toContain('Hello');
  });
});
