import { describe, it, expect } from 'vitest';

import {
  handleChatBackendRequest,
  type ChatBackendDeps,
} from '../../src/api/chat-backend.js';
import type {
  ChatProviderAdapter,
  ChatMemoryAdapter,
  ProviderResponse,
} from '../../src/cli/commands/chat-native.js';

// ─── helpers ──────────────────────────────────────────────────────────

/** Scripted adapter — pops one canned ProviderResponse per send call. */
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

/** In-memory ChatMemoryAdapter — minimal SQLite stand-in. */
function inMemoryStore(): ChatMemoryAdapter & { dump(): unknown[] } {
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

describe('handleChatBackendRequest', () => {
  it('routes a single user message through a mock adapter and returns the assistant reply', async () => {
    const provider = scriptedAdapter([
      { text: 'hello from server', stopReason: 'end_turn' },
    ]);

    const deps: ChatBackendDeps = { provider };
    const res = await handleChatBackendRequest({ message: 'merhaba' }, deps);

    expect(res.reply).toBe('hello from server');
    expect(res.sessionId.length).toBeGreaterThan(0);
    // transcript: user + assistant
    expect(res.transcript.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(res.transcript[0]?.content).toBe('merhaba');
  });

  it('dispatches a tool call (MCP path) and feeds the result back into the loop', async () => {
    const provider = scriptedAdapter([
      {
        stopReason: 'tool_use',
        text: 'thinking…',
        toolCalls: [{ id: 'call-1', name: 'deckent_status', args: {} }],
      },
      { text: 'sprint is healthy', stopReason: 'end_turn' },
    ]);

    let dispatched: { name: string; args: Record<string, unknown> } | null = null;
    const dispatcher = {
      async dispatch(name: string, args: Record<string, unknown>) {
        dispatched = { name, args };
        return JSON.stringify({ ok: true, sprint: 214 });
      },
    };

    const res = await handleChatBackendRequest(
      { message: 'status?' },
      { provider, dispatcher },
    );

    expect(dispatched).toEqual({ name: 'deckent_status', args: {} });
    expect(res.reply).toBe('sprint is healthy');
    // transcript carries: user, assistant(tool_use), tool, assistant(end_turn)
    expect(res.transcript.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    const toolTurn = res.transcript.find((m) => m.role === 'tool');
    expect(toolTurn?.content).toContain('"sprint":214');
  });

  it('rejects an empty / whitespace-only message with an informative error', async () => {
    const provider = scriptedAdapter([
      { text: 'should never be called', stopReason: 'end_turn' },
    ]);
    const deps: ChatBackendDeps = { provider };

    await expect(handleChatBackendRequest({ message: '' }, deps)).rejects.toThrow(/message/i);
    await expect(handleChatBackendRequest({ message: '   ' }, deps)).rejects.toThrow(/message/i);
  });

  it('preserves multi-turn context across two requests sharing a sessionId via memory', async () => {
    const provider = scriptedAdapter([
      { text: 'reply 1', stopReason: 'end_turn' },
      { text: 'reply 2 with context', stopReason: 'end_turn' },
    ]);

    const memory = inMemoryStore();
    const sessionId = 'browser-sess-42';
    const deps: ChatBackendDeps = { provider, memory };

    const r1 = await handleChatBackendRequest(
      { message: 'first', sessionId },
      deps,
    );
    expect(r1.sessionId).toBe(sessionId);
    expect(r1.reply).toBe('reply 1');

    const r2 = await handleChatBackendRequest(
      { message: 'second', sessionId },
      deps,
    );
    expect(r2.sessionId).toBe(sessionId);
    expect(r2.reply).toBe('reply 2 with context');

    // Memory should now contain: (user,assistant) x 2 for this session
    const persisted = memory.dump().filter(
      (r): r is { sessionId: string; role: string; content: string } =>
        typeof r === 'object' && r !== null && (r as { sessionId: string }).sessionId === sessionId,
    );
    expect(persisted.length).toBe(4);
    expect(persisted.map((r) => r.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(persisted[0]?.content).toBe('first');
    expect(persisted[2]?.content).toBe('second');

    // Second request must have loaded prior turns from memory → transcript
    // starts with the user+assistant pair from r1.
    expect(r2.transcript.length).toBeGreaterThanOrEqual(4);
    expect(r2.transcript[0]?.content).toBe('first');
  });

  it('falls back to a noop dispatcher when neither dispatcher nor toolRegistry is provided', async () => {
    const provider = scriptedAdapter([
      {
        stopReason: 'tool_use',
        toolCalls: [{ id: 'call-x', name: 'unknown_tool', args: {} }],
        text: '',
      },
      { text: 'continued after tool', stopReason: 'end_turn' },
    ]);

    const res = await handleChatBackendRequest(
      { message: 'go' },
      { provider },
    );

    // The noop dispatcher returns an mcp-error string; loop continues to
    // end_turn — so the user-visible reply is the final assistant text.
    expect(res.reply).toBe('continued after tool');
    const toolTurn = res.transcript.find((m) => m.role === 'tool');
    expect(toolTurn?.content).toMatch(/\[mcp-error\]/);
  });
});
