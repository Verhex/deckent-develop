/**
 * POST /api/chat — adapter-backed routing (Sprint 282 Task 282-002, DASH-UX-1).
 *
 * Verifies that natural-language messages are routed to the configured
 * ChatProviderAdapter (real reply), explicit slash/commands stay on the
 * `buildChatReply` classifier, and a missing/failing adapter yields an HONEST
 * i18n error — never a silent classifier fallback ("Anlamadım").
 *
 * Unit tests drive `resolveChatReply` directly (pure, hermetic). The E2E block
 * boots a real `createHttpServer` and injects a deterministic adapter via the
 * `setChatStreamAdapter` seam — no spawning, no gitignored state.
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

// ─── mock adapters ────────────────────────────────────────────────────

/** Records the messages it received and returns a fixed reply. */
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

/** send() always throws — exercises the honest-error catch path. */
function throwingAdapter(message: string): ChatProviderAdapter {
  return {
    async send(): Promise<ProviderResponse> {
      throw new Error(message);
    },
  };
}

/** send() resolves with empty text — exercises the empty-reply honest error. */
function emptyAdapter(): ChatProviderAdapter {
  return {
    async send(): Promise<ProviderResponse> {
      return { text: '', stopReason: 'end_turn' };
    },
  };
}

// ─── unit: resolveChatReply ─────────────────────────────────────────────

describe('resolveChatReply', () => {
  it('routes a natural-language message to the adapter (not the classifier)', async () => {
    const adapter = recordingAdapter('Sprint, takım hedeflerine ulaşmak için zaman-kutulu bir iş döngüsüdür.');
    const reply = await resolveChatReply('merhaba, sprint nedir?', {}, { adapter });

    expect(reply).toBe('Sprint, takım hedeflerine ulaşmak için zaman-kutulu bir iş döngüsüdür.');
    expect(reply).not.toContain('Anlamadım');
    // The NL message reached the adapter exactly once.
    expect(adapter.calls.length).toBe(1);
    expect(adapter.calls[0]?.[0]?.content).toBe('merhaba, sprint nedir?');
  });

  it('keeps explicit commands on the classifier and never calls the adapter', async () => {
    const adapter = recordingAdapter('ADAPTER-SENTINEL-SHOULD-NOT-APPEAR');
    const reply = await resolveChatReply('status', { status: () => 'Sprint 282: 5/12 done' }, { adapter });

    expect(reply).toContain('Sprint 282');
    expect(reply).not.toContain('ADAPTER-SENTINEL-SHOULD-NOT-APPEAR');
    expect(adapter.calls.length).toBe(0);
  });

  it('returns an honest i18n error (en) when no adapter is configured', async () => {
    const reply = await resolveChatReply('tell me a joke', {}, { adapter: null });

    expect(reply).toContain('Chat provider unavailable');
    expect(reply).not.toContain('Anlamadım');
  });

  it('returns the Turkish honest error when lang=tr', async () => {
    const reply = await resolveChatReply('bir şaka anlat', {}, { adapter: null, lang: 'tr' });

    expect(reply).toContain('Sohbet sağlayıcısı kullanılamıyor');
    expect(reply).not.toContain('Anlamadım');
  });

  it('surfaces the adapter failure reason in the honest error', async () => {
    const reply = await resolveChatReply('anything', {}, { adapter: throwingAdapter('spawn ENOENT') });

    expect(reply).toContain('Chat provider unavailable');
    expect(reply).toContain('spawn ENOENT');
  });

  it('treats an empty adapter reply as an honest error (not silence)', async () => {
    const reply = await resolveChatReply('anything', {}, { adapter: emptyAdapter() });

    expect(reply).toContain('Chat provider unavailable');
    expect(reply.length).toBeGreaterThan('Chat provider unavailable'.length);
  });
});

describe('isExplicitChatCommand', () => {
  it('matches status/help commands and slash-prefixed input', () => {
    expect(isExplicitChatCommand('status')).toBe(true);
    expect(isExplicitChatCommand('durum nedir?')).toBe(true);
    expect(isExplicitChatCommand('help')).toBe(true);
    expect(isExplicitChatCommand('/anything')).toBe(true);
    expect(isExplicitChatCommand('   ')).toBe(true); // empty → command list
  });

  it('does not match natural-language messages', () => {
    expect(isExplicitChatCommand('merhaba, sprint nedir?')).toBe(false);
    expect(isExplicitChatCommand('explain the architecture to me')).toBe(false);
  });
});

// ─── E2E: POST /api/chat over a real server (seam-injected adapter) ──────

describe('POST /api/chat (E2E, adapter-backed)', () => {
  let handle: TestServerHandle | null = null;

  afterEach(async () => {
    setChatStreamAdapter(null); // reset module-level seam between tests
    if (handle) {
      await handle.close();
      handle = null;
    }
  });

  it('returns the adapter reply for a natural-language message', async () => {
    setChatStreamAdapter(recordingAdapter('Gerçek sağlayıcı yanıtı.'));
    handle = await startTestServer({ apiToken: 'tok-282002' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'merhaba, sprint nedir?' }),
    });

    expect(res.status).toBe(200);
    const { reply } = res.json<{ reply: string }>();
    expect(reply).toBe('Gerçek sağlayıcı yanıtı.');
    expect(reply).not.toContain('Anlamadım');
  });

  it('keeps explicit "status" on the classifier (adapter not consulted)', async () => {
    setChatStreamAdapter(recordingAdapter('ADAPTER-SENTINEL'));
    handle = await startTestServer({ apiToken: 'tok-282002' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'status' }),
    });

    expect(res.status).toBe(200);
    const { reply } = res.json<{ reply: string }>();
    expect(reply).toContain('durum'); // "Sprint durumu: …" classifier prefix
    expect(reply).not.toContain('ADAPTER-SENTINEL');
  });

  it('returns an honest error (not "Anlamadım") when the adapter throws', async () => {
    setChatStreamAdapter(throwingAdapter('provider boom'));
    handle = await startTestServer({ apiToken: 'tok-282002' });

    const res = await call(handle, '/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: 'merhaba, sprint nedir?' }),
    });

    expect(res.status).toBe(200);
    const { reply } = res.json<{ reply: string }>();
    expect(reply).toContain('Chat provider unavailable');
    expect(reply).toContain('provider boom');
    expect(reply).not.toContain('Anlamadım');
  });
});
