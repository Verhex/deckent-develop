/**
 * CHAT-A (306-012) — adapter-wire smoke + slash-parity tests.
 *
 * Contract 1: natural-language messages reach adapter.send() — real reply, not classifier.
 * Contract 2: slash commands (/status /recall /plan) route through chatAgenticDispatch,
 *             not through the keyword classifier (buildChatReply).
 *
 * Unit-level: pure function calls, no server, no gitignored state.
 * E2E-level:  real HTTP server via startTestServer + setChatStreamAdapter seam.
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  resolveChatReply,
  chatAgenticDispatch,
} from '../../src/api/chat-handler.js';
import { setChatStreamAdapter } from '../../src/api/server.js';
import type {
  ChatProviderAdapter,
  ChatMessage,
  ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';

// ─── helpers ──────────────────────────────────────────────────────────────

function recordingAdapter(reply: string): ChatProviderAdapter & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  return {
    calls,
    async send(messages: ChatMessage[]): Promise<ProviderResponse> {
      calls.push(messages);
      return { text: reply, stopReason: 'end_turn' };
    },
  };
}

// ─── 1. adapter.send smoke: natural-lang → real reply, not classifier ─────

describe('natural-language → adapter.send() (CHAT-A smoke)', () => {
  it('calls adapter.send with the user message and returns its reply', async () => {
    const adapter = recordingAdapter('Gerçek sağlayıcı yanıtı buraya gelir.');
    const reply = await resolveChatReply('sprint nasıl çalışır?', {}, { adapter });

    expect(reply).toBe('Gerçek sağlayıcı yanıtı buraya gelir.');
    expect(reply).not.toContain('Anlamadım');
    // adapter.send called exactly once with the correct message
    expect(adapter.calls.length).toBe(1);
    expect(adapter.calls[0]?.[0]).toEqual({ role: 'user', content: 'sprint nasıl çalışır?' });
  });

  it('does not fall back to the classifier for unrecognized natural-language text', async () => {
    const adapter = recordingAdapter('adapter-reply');
    const reply = await resolveChatReply('tell me about task routing', {}, { adapter });

    expect(reply).toBe('adapter-reply');
    // classifier fallback would contain "Anlamadım"
    expect(reply).not.toContain('Anlamadım');
  });

  it('adapter.send is NOT called for keyword commands (backward-compat)', async () => {
    const adapter = recordingAdapter('ADAPTER-SENTINEL');
    const ctx = { status: () => 'Sprint 306: 4/8 done' };
    const reply = await resolveChatReply('status', ctx, { adapter });

    expect(adapter.calls.length).toBe(0);
    expect(reply).toContain('Sprint 306');
    expect(reply).not.toContain('ADAPTER-SENTINEL');
  });
});

// ─── 2. slash-parity: /status → chatAgenticDispatch, not classifier ────────

describe('chatAgenticDispatch — slash-command routing', () => {
  it('/status returns sprint status via dispatch', () => {
    const ctx = { status: () => 'Sprint 306: 5/8 tasks done' };
    const result = chatAgenticDispatch('/status', ctx);

    expect(result).not.toBeNull();
    expect(result).toContain('Sprint 306');
    expect(result).toContain('5/8');
  });

  it('/durum is an alias for /status', () => {
    const ctx = { status: () => 'Sprint 306: idle' };
    const result = chatAgenticDispatch('/durum', ctx);

    expect(result).not.toBeNull();
    expect(result).toContain('Sprint 306');
  });

  it('/recall returns guidance (not null)', () => {
    const result = chatAgenticDispatch('/recall', {});
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('/plan returns guidance (not null)', () => {
    const result = chatAgenticDispatch('/plan', {});
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('unknown slash command returns an error string (not null)', () => {
    const result = chatAgenticDispatch('/unknown-cmd', {});
    expect(result).not.toBeNull();
    expect(result).toContain('/unknown-cmd');
  });

  it('non-slash input returns null (caller handles via classifier or adapter)', () => {
    expect(chatAgenticDispatch('status', {})).toBeNull();
    expect(chatAgenticDispatch('hello world', {})).toBeNull();
    expect(chatAgenticDispatch('', {})).toBeNull();
  });
});

// ─── 3. resolveChatReply — /status goes to dispatch, not adapter/classifier

describe('resolveChatReply — /status routed to chatAgenticDispatch', () => {
  it('/status handled by dispatch (adapter.send not called)', async () => {
    const adapter = recordingAdapter('ADAPTER-SENTINEL-SHOULD-NOT-APPEAR');
    const ctx = { status: () => 'Sprint 306: active' };
    const reply = await resolveChatReply('/status', ctx, { adapter });

    // dispatch handles it → adapter.send never called
    expect(adapter.calls.length).toBe(0);
    expect(reply).toContain('Sprint 306');
    expect(reply).not.toContain('ADAPTER-SENTINEL-SHOULD-NOT-APPEAR');
  });

  it('keyword "status" (no slash) routes to classifier, not dispatch, not adapter', async () => {
    const adapter = recordingAdapter('ADAPTER-SENTINEL-SHOULD-NOT-APPEAR');
    const ctx = { status: () => 'Sprint 306: 3/6 done' };
    const reply = await resolveChatReply('status', ctx, { adapter });

    expect(adapter.calls.length).toBe(0);
    expect(reply).toContain('Sprint 306');
    expect(reply).not.toContain('ADAPTER-SENTINEL-SHOULD-NOT-APPEAR');
  });

  it('/recall reply does not hit adapter.send', async () => {
    const adapter = recordingAdapter('ADAPTER-SENTINEL');
    const reply = await resolveChatReply('/recall', {}, { adapter });

    expect(adapter.calls.length).toBe(0);
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).not.toContain('ADAPTER-SENTINEL');
  });
});

// ─── 4. E2E: POST /api/chat with seam-injected adapter ────────────────────

describe('POST /api/chat — adapter-wire E2E (CHAT-A)', () => {
  let handle: TestServerHandle | null = null;

  afterEach(async () => {
    setChatStreamAdapter(null);
    if (handle) {
      await handle.close();
      handle = null;
    }
  });

  it('natural-lang message returns real adapter reply (not classifier)', async () => {
    setChatStreamAdapter(recordingAdapter('Gerçek adapter yanıtı.'));
    handle = await startTestServer({ apiToken: 'tok-306012' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'deckent nedir?' }),
    });

    expect(res.status).toBe(200);
    const { reply } = res.json<{ reply: string }>();
    expect(reply).toBe('Gerçek adapter yanıtı.');
    expect(reply).not.toContain('Anlamadım');
  });

  it('/status message returns dispatch result (adapter not consulted)', async () => {
    setChatStreamAdapter(recordingAdapter('ADAPTER-SENTINEL'));
    handle = await startTestServer({ apiToken: 'tok-306012' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '/status' }),
    });

    expect(res.status).toBe(200);
    const { reply } = res.json<{ reply: string }>();
    // dispatch returns sprint status (may be "idle — no sprint yet" in empty test env)
    expect(reply).not.toContain('ADAPTER-SENTINEL');
    expect(reply.length).toBeGreaterThan(0);
  });
});
