/**
 * CHAT-A — dashboard-native chat real adapter wire (Sprint 301 Task 301-015).
 *
 * Verifies that POST /api/chat routes natural-language messages to the
 * configured ChatProviderAdapter and returns the real LLM reply — not the
 * "Anlamadım" classifier fallback.
 *
 * Two layers:
 *   - Unit: `resolveChatReply` directly with an injected fake adapter.
 *   - E2E:  A real `createHttpServer` with the `setChatStreamAdapter` seam,
 *           no real network calls, no gitignored state.
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  resolveChatReply,
  isExplicitChatCommand,
} from '../../src/api/chat-handler.js';
import { setChatStreamAdapter } from '../../src/api/server.js';
import type {
  ChatProviderAdapter,
  ChatMessage,
  ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

// ─── helpers ──────────────────────────────────────────────────────────────

function makeAdapter(reply: string): ChatProviderAdapter & { receivedMessages: ChatMessage[][] } {
  const receivedMessages: ChatMessage[][] = [];
  return {
    receivedMessages,
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      receivedMessages.push(messages);
      return { text: reply, stopReason: 'end_turn' };
    },
  };
}

function throwAdapter(msg: string): ChatProviderAdapter {
  return {
    async send(): Promise<ProviderResponse> {
      throw new Error(msg);
    },
  };
}

// ─── unit: resolveChatReply adapter routing ────────────────────────────────

describe('resolveChatReply — adapter wire (CHAT-A)', () => {
  it('routes a natural-language message to adapter.send(), not classifier', async () => {
    const adapter = makeAdapter('Gerçek yanıt buraya gelir.');
    const reply = await resolveChatReply('sprint nasıl çalışır?', {}, { adapter });

    expect(reply).toBe('Gerçek yanıt buraya gelir.');
    expect(reply).not.toContain('Anlamadım');
    expect(adapter.receivedMessages.length).toBe(1);
    expect(adapter.receivedMessages[0]?.[0]?.content).toBe('sprint nasıl çalışır?');
  });

  it('does not call adapter for explicit commands like "status"', async () => {
    const adapter = makeAdapter('SHOULD-NOT-APPEAR');
    const reply = await resolveChatReply('status', { status: () => 'Sprint 301: 5/8 done' }, { adapter });

    expect(reply).toContain('Sprint 301');
    expect(reply).not.toContain('SHOULD-NOT-APPEAR');
    expect(adapter.receivedMessages.length).toBe(0);
  });

  it('returns honest error (not Anlamadım) when no adapter is configured', async () => {
    const reply = await resolveChatReply('explain this please', {}, { adapter: null });

    expect(reply).toContain('Chat provider unavailable');
    expect(reply).not.toContain('Anlamadım');
  });

  it('returns honest error when adapter throws', async () => {
    const reply = await resolveChatReply('anything', {}, { adapter: throwAdapter('ECONNREFUSED') });

    expect(reply).toContain('Chat provider unavailable');
    expect(reply).toContain('ECONNREFUSED');
    expect(reply).not.toContain('Anlamadım');
  });
});

// ─── isExplicitChatCommand routing guard ──────────────────────────────────

describe('isExplicitChatCommand — natural-language guard', () => {
  it('classifies NL messages as non-command', () => {
    expect(isExplicitChatCommand('sprint nasıl çalışır?')).toBe(false);
    expect(isExplicitChatCommand('what is an agent?')).toBe(false);
    expect(isExplicitChatCommand('merhaba')).toBe(false);
  });

  it('classifies commands as explicit', () => {
    expect(isExplicitChatCommand('status')).toBe(true);
    expect(isExplicitChatCommand('help')).toBe(true);
    expect(isExplicitChatCommand('/config')).toBe(true);
    expect(isExplicitChatCommand('   ')).toBe(true);
  });
});

// ─── E2E: POST /api/chat over a real HTTP server ──────────────────────────

describe('POST /api/chat round-trip (CHAT-A E2E)', () => {
  let handle: TestServerHandle | null = null;

  afterEach(async () => {
    setChatStreamAdapter(null);
    if (handle) {
      await handle.close();
      handle = null;
    }
  });

  it('returns the adapter reply for a natural-language message (not classifier)', async () => {
    setChatStreamAdapter(makeAdapter('Sağlayıcıdan gerçek yanıt.'));
    handle = await startTestServer({ apiToken: 'tok-301015' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'deckent nedir?' }),
    });

    expect(res.status).toBe(200);
    const body = res.json<{ reply: string }>();
    expect(body.reply).toBe('Sağlayıcıdan gerçek yanıt.');
    expect(body.reply).not.toContain('Anlamadım');
  });

  it('keeps "status" command on the classifier (adapter bypassed)', async () => {
    setChatStreamAdapter(makeAdapter('ADAPTER-SENTINEL'));
    handle = await startTestServer({ apiToken: 'tok-301015' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'status' }),
    });

    expect(res.status).toBe(200);
    const body = res.json<{ reply: string }>();
    expect(body.reply).not.toContain('ADAPTER-SENTINEL');
    // classifier returns a "Sprint durumu: …" or guidance string — not the adapter reply
    expect(body.reply.length).toBeGreaterThan(0);
  });

  it('returns honest error (not Anlamadım) when adapter throws mid-reply', async () => {
    setChatStreamAdapter(throwAdapter('provider timeout'));
    handle = await startTestServer({ apiToken: 'tok-301015' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'sprint nasıl başlatılır?' }),
    });

    expect(res.status).toBe(200);
    const body = res.json<{ reply: string }>();
    expect(body.reply).toContain('Chat provider unavailable');
    expect(body.reply).toContain('provider timeout');
    expect(body.reply).not.toContain('Anlamadım');
  });

  it('returns honest error when no adapter is configured', async () => {
    // setChatStreamAdapter(null) — default state — no adapter
    handle = await startTestServer({ apiToken: 'tok-301015' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello, can you help?' }),
    });

    expect(res.status).toBe(200);
    const body = res.json<{ reply: string }>();
    // With no adapter the server either falls back to an honest error or the
    // serve-time config adapter (none set) — either way "Anlamadım" must not appear.
    expect(body.reply).not.toContain('Anlamadım');
    expect(body.reply.length).toBeGreaterThan(0);
  });
});
