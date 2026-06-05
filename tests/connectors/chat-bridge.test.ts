/**
 * BOT chat bridge tests (§4G) — Telegram as a full agentic conversation head.
 *
 * makeChatResponder wraps the native agentic loop (runChatNativeLoop) into a
 * simple (sessionId, text) → reply for connectors. Two correctness properties
 * the advisor flagged as blocking: (1) per-session SERIALIZATION (stateful chat
 * corrupts under concurrent turns), (2) Telegram 4096-char chunking.
 */

import { describe, it, expect, vi } from 'vitest';
import { makeChatResponder, chunkMessage } from '../../src/connectors/chat-bridge.js';
import type { ChatProviderAdapter, McpToolDispatcher } from '../../src/cli/commands/chat-native.js';

function fakeProvider(reply: string): ChatProviderAdapter {
  return { async send() { return { text: reply, stopReason: 'end_turn' as const }; } };
}
// Hermetic dispatcher — never spawn the real CLI bridge in unit tests.
const noopDispatcher: McpToolDispatcher = { async dispatch() { return ''; } };

describe('makeChatResponder', () => {
  it('returns the model reply for a plain chat message', async () => {
    const respond = makeChatResponder({
      provider: fakeProvider('Merhaba! Sprint 232 tamamlandı.'),
      dispatcher: noopDispatcher,
    });
    const reply = await respond('telegram-555', 'bana kısa bir şiir yaz lütfen');
    expect(reply).toContain('Sprint 232');
  });

  it('🔴 serializes turns per session — a second turn never overlaps the first', async () => {
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];
    const provider: ChatProviderAdapter = {
      async send() {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise<void>((r) => gates.push(r));
        active--;
        return { text: 'ok', stopReason: 'end_turn' as const };
      },
    };
    const respond = makeChatResponder({ provider, dispatcher: noopDispatcher });

    const p1 = respond('s1', 'first');
    const p2 = respond('s1', 'second');
    // Let microtasks settle; only ONE send must be in-flight (serialized).
    await vi.waitFor(() => expect(gates.length).toBe(1));
    gates[0]!();                                   // release turn 1
    await vi.waitFor(() => expect(gates.length).toBe(2)); // now turn 2 starts
    gates[1]!();
    await Promise.all([p1, p2]);
    expect(maxActive).toBe(1);                      // never two in flight
  });

  it('different sessions run concurrently (no cross-session head-of-line blocking)', async () => {
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];
    const provider: ChatProviderAdapter = {
      async send() {
        active++; maxActive = Math.max(maxActive, active);
        await new Promise<void>((r) => gates.push(r));
        active--;
        return { text: 'ok', stopReason: 'end_turn' as const };
      },
    };
    const respond = makeChatResponder({ provider, dispatcher: noopDispatcher });
    const a = respond('sA', 'x');
    const b = respond('sB', 'y');
    await vi.waitFor(() => expect(gates.length).toBe(2)); // both in flight
    gates.forEach((g) => g());
    await Promise.all([a, b]);
    expect(maxActive).toBe(2);
  });

  it('a provider failure resolves to a non-empty error string, never rejects (bot must reply)', async () => {
    const provider: ChatProviderAdapter = { async send() { throw new Error('claude spawn ENOENT'); } };
    const respond = makeChatResponder({ provider, dispatcher: noopDispatcher });
    const reply = await respond('s1', 'hi');
    expect(reply.length).toBeGreaterThan(0); // gracefulErrors → tagged error turn, not a throw
  });
});

describe('makeChatResponder — agentic mode (slice 2: model tool_use, gated)', () => {
  it('🔴 model-driven RISKY tool → parked durably + inner NOT executed (dispatcher chokepoint)', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { listBotActions } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bot-agentic-'));
    try {
      let turn = 0;
      const provider: ChatProviderAdapter = {
        async send() {
          turn++;
          if (turn === 1) {
            return {
              stopReason: 'tool_use' as const,
              toolCalls: [{ id: 't1', name: 'deckent_plan', args: { directive: 'Sprint 300' } }],
            };
          }
          return { text: 'Onayını istedim — approve yazınca çalışacak.', stopReason: 'end_turn' as const };
        },
      };
      const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'SHOULD NOT RUN') };
      const respond = makeChatResponder({ agentic: true, root, provider, dispatcher: innerSpy });

      const reply = await respond('555', 'plan a new sprint please');
      expect(innerSpy.dispatch).not.toHaveBeenCalled();          // risky never executed
      const parked = listBotActions(root);
      expect(parked).toHaveLength(1);                            // durably parked
      expect(parked[0]).toMatchObject({ tool: 'deckent_plan', channelId: '555' });
      expect(reply.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('model-driven READ-ONLY tool → inner executes (grounded), nothing parked', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { listBotActions } = await import('../../src/connectors/bot-action-store.js');
    const root = mkdtempSync(join(tmpdir(), 'bot-agentic-'));
    try {
      let turn = 0;
      const provider: ChatProviderAdapter = {
        async send() {
          turn++;
          if (turn === 1) {
            return { stopReason: 'tool_use' as const, toolCalls: [{ id: 't1', name: 'deckent_status', args: {} }] };
          }
          return { text: 'Sprint 232 tamam.', stopReason: 'end_turn' as const };
        },
      };
      const innerSpy: McpToolDispatcher = { dispatch: vi.fn(async () => 'STATUS: sprint-232 done') };
      const respond = makeChatResponder({ agentic: true, root, provider, dispatcher: innerSpy });

      await respond('555', 'how is the sprint');
      expect(innerSpy.dispatch).toHaveBeenCalledWith('deckent_status', {}); // read-only auto-ran
      expect(listBotActions(root)).toHaveLength(0);                          // nothing parked
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('chunkMessage', () => {
  it('returns a single chunk when under the limit', () => {
    expect(chunkMessage('short', 4000)).toEqual(['short']);
  });

  it('splits oversized text into chunks each within the limit', () => {
    const big = Array.from({ length: 50 }, (_, i) => `line ${i} ${'x'.repeat(200)}`).join('\n');
    const chunks = chunkMessage(big, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
    expect(chunks.join('\n').replace(/\n+/g, '\n')).toContain('line 49');
  });

  it('hard-splits a single oversized line with no newline boundary', () => {
    const chunks = chunkMessage('y'.repeat(2500), 1000);
    expect(chunks.length).toBe(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });
});
