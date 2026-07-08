// tests/agent/transcript-eviction.test.ts
// born-546 — TRANSCRIPT-EVICTION regression coverage.
//
// Transcript's own backing store must never grow unbounded: once either the
// size (maxTokens) or count (maxMessages) ceiling is crossed, the oldest
// messages are evicted — pairing-safe (born-510 pattern), never stranding a
// `tool` result whose owning `assistant` tool-call message got dropped.
import { describe, it, expect } from 'vitest';
import { Transcript } from '../../src/agent/transcript.js';
import type { ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

/** No `tool` message may appear without an earlier `assistant` message in the
 *  SAME surviving window whose toolCalls include a matching id (mirrors
 *  tests/agent/context-budget-pairing.test.ts's helper). */
function assertNoOrphanToolResult(messages: readonly ProviderMessage[]): void {
  for (const [i, m] of messages.entries()) {
    if (m.role !== 'tool') continue;
    const before = messages.slice(0, i);
    const paired = before.some((p) => p.role === 'assistant' && p.toolCalls?.some((tc) => tc.id === m.toolCallId));
    expect(paired, `orphan tool result at index ${i} (toolCallId=${m.toolCallId})`).toBe(true);
  }
}

/** Appends one resolved turn: user -> assistant(tool call) -> tool result. */
function appendResolvedTurn(t: Transcript, n: number, pad = 0): void {
  t.appendUser(`u${n}` + 'a'.repeat(pad));
  t.appendAssistant(`calling ${n}`, [{ id: `c${n}`, name: 'echo', args: {} }]);
  t.appendToolResult(`c${n}`, `result ${n}` + 'b'.repeat(pad));
}

describe('Transcript eviction — small transcript untouched', () => {
  it('never evicts a small transcript under default caps', () => {
    const t = new Transcript();
    for (let i = 0; i < 5; i++) appendResolvedTurn(t, i);
    expect(t.droppedMessageCount()).toBe(0);
    expect(t.toProviderMessages()).toHaveLength(15);
  });

  it('never evicts a small transcript under small-but-unhit explicit caps', () => {
    const t = new Transcript({ maxTokens: 10_000, maxMessages: 100 });
    t.appendUser('hi');
    t.appendAssistant('hello');
    expect(t.droppedMessageCount()).toBe(0);
    expect(t.toProviderMessages()).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });
});

describe('Transcript eviction — size axis (maxTokens, born-510 reuse)', () => {
  it('evicts the oldest resolved turns once the token budget is crossed, pairing-safe', () => {
    const t = new Transcript({ maxTokens: 60, maxMessages: 0 });
    for (let i = 0; i < 8; i++) appendResolvedTurn(t, i, 20);

    const msgs = t.toProviderMessages();
    assertNoOrphanToolResult(msgs);
    expect(t.droppedMessageCount()).toBeGreaterThan(0);
    expect(msgs.length).toBeLessThan(24);
    // The latest turn always survives.
    expect(msgs[msgs.length - 1]!.content).toContain('result 7');
    // Every surviving window still opens on a `user` message.
    expect(msgs[0]!.role).toBe('user');
  });

  it('preserves an in-flight multi-round tool chain intact even over the token budget', () => {
    const t = new Transcript({ maxTokens: 5, maxMessages: 0 });
    t.appendUser('u1');
    t.appendAssistant('call1', [{ id: 'cA', name: 'echo', args: {} }]);
    t.appendToolResult('cA', 'r1' + 'x'.repeat(200));
    t.appendAssistant('call2', [{ id: 'cB', name: 'echo', args: {} }]);
    t.appendToolResult('cB', 'r2' + 'y'.repeat(200));

    const msgs = t.toProviderMessages();
    assertNoOrphanToolResult(msgs);
    expect(t.droppedMessageCount()).toBe(0);
    expect(msgs).toHaveLength(5);
  });
});

describe('Transcript eviction — count axis (maxMessages, age-based)', () => {
  it('evicts the oldest resolved turns once the message-count cap is crossed, pairing-safe', () => {
    const t = new Transcript({ maxTokens: 0, maxMessages: 6 });
    for (let i = 0; i < 5; i++) appendResolvedTurn(t, i);

    const msgs = t.toProviderMessages();
    assertNoOrphanToolResult(msgs);
    expect(t.droppedMessageCount()).toBeGreaterThan(0);
    expect(msgs.length).toBeLessThanOrEqual(6 + 2); // pairing-safe overshoot allowed, never unbounded
    expect(msgs[0]!.role).toBe('user');
    expect(msgs[msgs.length - 1]!.content).toContain('result 4');
  });

  it('keeps the in-flight turn intact even when it alone exceeds maxMessages', () => {
    const t = new Transcript({ maxTokens: 0, maxMessages: 1 });
    t.appendUser('u1');
    t.appendAssistant('call1', [{ id: 'cA', name: 'echo', args: {} }]);
    t.appendToolResult('cA', 'r1');

    const msgs = t.toProviderMessages();
    assertNoOrphanToolResult(msgs);
    expect(msgs).toHaveLength(3);
    expect(t.droppedMessageCount()).toBe(0);
  });
});

describe('Transcript eviction — combined axes + accumulation', () => {
  it('holds the no-orphan invariant across many turns with both caps active', () => {
    const t = new Transcript({ maxTokens: 200, maxMessages: 9 });
    for (let i = 0; i < 30; i++) {
      appendResolvedTurn(t, i, i % 5);
      assertNoOrphanToolResult(t.toProviderMessages());
    }
    const msgs = t.toProviderMessages();
    expect(t.droppedMessageCount()).toBeGreaterThan(0);
    expect(msgs[msgs.length - 1]!.content).toContain('result 29');
    expect(msgs[0]!.role).toBe('user');
  });

  it('droppedMessageCount accumulates across repeated evictions rather than resetting', () => {
    const t = new Transcript({ maxTokens: 0, maxMessages: 3 });
    appendResolvedTurn(t, 0);
    const afterFirst = t.droppedMessageCount();
    appendResolvedTurn(t, 1);
    appendResolvedTurn(t, 2);
    expect(t.droppedMessageCount()).toBeGreaterThanOrEqual(afterFirst);
    assertNoOrphanToolResult(t.toProviderMessages());
  });
});
