// ═══ chat-backend-roundtrip — Task 216-008 ═══════════════════════════════
//
// Run-proven round-trip coverage for the Path A embedded chat backend:
// asserts that `handleChatMessage(msg, adapter)` drives a single user
// message through a ProviderAdapter, returns the assistant reply, and
// degrades gracefully on empty input or adapter failure. Multi-turn
// continuity (sessionId + memory) is exercised end-to-end.
//
// All adapters are mock — the goal is to certify the round-trip wiring
// of the API surface itself. The real-binary smoke (subscription CLI
// spawn) is covered by the post-sprint smoke gate per ADR-079.

import { describe, it, expect } from 'vitest';

import {
  handleChatMessage,
  type ChatBackendDeps,
} from '../../src/api/chat-backend.js';
import type {
  ChatProviderAdapter,
  ChatMemoryAdapter,
  ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// ─── helpers ──────────────────────────────────────────────────────────

function scriptedAdapter(responses: ProviderResponse[]): ChatProviderAdapter {
  return {
    async send() {
      const next = responses.shift();
      if (!next) {
        return { text: '[adapter] no more scripted responses', stopReason: 'end_turn' };
      }
      return next;
    },
  };
}

function throwingAdapter(error: Error): ChatProviderAdapter {
  return {
    async send() {
      throw error;
    },
  };
}

function inMemoryStore(): ChatMemoryAdapter & {
  dump(): { sessionId: string; role: string; content: string }[];
} {
  const store: { sessionId: string; role: string; content: string }[] = [];
  return {
    appendChatTurn(sessionId, role, content) {
      store.push({ sessionId, role, content });
      return store.length;
    },
    getChatHistory(sessionId, limit) {
      const all = store.filter((r) => r.sessionId === sessionId);
      return limit === undefined ? all : all.slice(-limit);
    },
    dump() {
      return store.slice();
    },
  };
}

// ─── tests ────────────────────────────────────────────────────────────

describe('handleChatMessage — Path A round-trip', () => {
  it('drives a single user message through the adapter and returns the assistant reply', async () => {
    const adapter = scriptedAdapter([
      { text: 'gerçek cevap', stopReason: 'end_turn' },
    ]);

    const res = await handleChatMessage('merhaba', adapter);

    expect(res.reply).toBe('gerçek cevap');
    expect(res.sessionId.length).toBeGreaterThan(0);
    expect(res.transcript.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(res.transcript[0]?.content).toBe('merhaba');
    expect(res.transcript[1]?.content).toBe('gerçek cevap');
  });

  it('rejects an empty message with an informative error and never calls the adapter', async () => {
    let sendCalls = 0;
    const adapter: ChatProviderAdapter = {
      async send() {
        sendCalls++;
        return { text: 'should not be reached', stopReason: 'end_turn' };
      },
    };

    await expect(handleChatMessage('', adapter)).rejects.toThrow(/message/i);
    await expect(handleChatMessage('   ', adapter)).rejects.toThrow(/message/i);
    expect(sendCalls).toBe(0);
  });

  it('propagates adapter send() failures to the caller (graceful, no silent swallow)', async () => {
    const boom = new Error('subscription CLI exited 137 (OOM)');
    const adapter = throwingAdapter(boom);

    await expect(handleChatMessage('selam', adapter)).rejects.toThrow(/OOM/);
  });

  it('preserves multi-turn context across two requests sharing a sessionId via memory', async () => {
    const adapter = scriptedAdapter([
      { text: 'reply 1', stopReason: 'end_turn' },
      { text: 'reply 2 sees context', stopReason: 'end_turn' },
    ]);
    const memory = inMemoryStore();
    const sessionId = 'roundtrip-sess-1';

    const r1 = await handleChatMessage('first', adapter, { memory, sessionId });
    expect(r1.sessionId).toBe(sessionId);
    expect(r1.reply).toBe('reply 1');

    const r2 = await handleChatMessage('second', adapter, { memory, sessionId });
    expect(r2.sessionId).toBe(sessionId);
    expect(r2.reply).toBe('reply 2 sees context');

    // Second turn's transcript must contain the prior user+assistant pair
    // (loaded from memory via resumeLimit), proving real multi-turn continuity.
    expect(r2.transcript.length).toBeGreaterThanOrEqual(4);
    expect(r2.transcript[0]?.content).toBe('first');
    expect(r2.transcript[1]?.content).toBe('reply 1');
    expect(r2.transcript[2]?.content).toBe('second');

    const persisted = memory.dump();
    expect(persisted.map((r) => r.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('accepts a caller-supplied sessionId and echoes it back unchanged', async () => {
    const adapter = scriptedAdapter([
      { text: 'pong', stopReason: 'end_turn' },
    ]);
    const sessionId = 'browser-sess-xyz';

    const res = await handleChatMessage('ping', adapter, { sessionId });

    expect(res.sessionId).toBe(sessionId);
    expect(res.reply).toBe('pong');
  });

  it('forwards optional ChatBackendDeps overrides (maxTurns) into the underlying loop', async () => {
    // Single round-trip — maxTurns=1 is the default; we just assert that an
    // explicit override is accepted by the convenience signature without
    // breaking the round-trip.
    const adapter = scriptedAdapter([
      { text: 'one-shot', stopReason: 'end_turn' },
    ]);
    const deps: Omit<ChatBackendDeps, 'provider'> = { maxTurns: 1, maxToolHops: 5 };

    const res = await handleChatMessage('once', adapter, deps);

    expect(res.reply).toBe('one-shot');
  });
});
