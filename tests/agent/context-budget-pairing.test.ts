// tests/agent/context-budget-pairing.test.ts
// born-510 — CONTEXT-BUDGET-ORPHAN-TOOLRESULT regression coverage.
//
// fitMessagesToBudget() must never return a window that opens on a `tool`
// result whose matching `assistant` tool-call message got cut out — that is
// a dangling tool_result with no tool_use, which providers hard-reject.
// Targeted at the exact failure mode: a budget cut landing precisely on the
// boundary between an assistant tool-call message and its trailing tool
// result(s).
import { describe, it, expect } from 'vitest';
import { estimateMessageTokens, fitMessagesToBudget } from '../../src/agent/context-budget.js';
import type { ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

const user = (content: string): ProviderMessage => ({ role: 'user', content });
const assistant = (content: string, toolCalls?: ProviderMessage['toolCalls']): ProviderMessage =>
  toolCalls ? { role: 'assistant', content, toolCalls } : { role: 'assistant', content };
const tool = (content: string, toolCallId: string): ProviderMessage => ({ role: 'tool', content, toolCallId });

/** No `tool` message may appear in the window without an earlier `assistant`
 *  message in the SAME window whose toolCalls include a matching id. */
function assertNoOrphanToolResult(messages: readonly ProviderMessage[]): void {
  for (const [i, m] of messages.entries()) {
    if (m.role !== 'tool') continue;
    const before = messages.slice(0, i);
    const paired = before.some((p) => p.role === 'assistant' && p.toolCalls?.some((tc) => tc.id === m.toolCallId));
    expect(paired, `orphan tool result at index ${i} (toolCallId=${m.toolCallId})`).toBe(true);
  }
}

describe('fitMessagesToBudget — orphan tool_result regression (born-510)', () => {
  it('never leaves an orphan tool_result when the budget cut lands exactly on the tool-result boundary', () => {
    const msgs = [
      user('u1' + 'a'.repeat(400)),
      assistant('a1' + 'b'.repeat(400)),
      user('q2'),
      assistant('calling', [{ id: 'c1', name: 'echo', args: {} }]),
      tool('result' + 'c'.repeat(300), 'c1'),
    ];
    // Sized so the trailing tool result (81 tok) alone fits but tool+its
    // owning assistant call (81+8=89 tok) together do not — the exact split
    // point that used to strand the tool result as a lone orphan.
    expect(estimateMessageTokens(msgs[4]!)).toBe(81);
    expect(estimateMessageTokens(msgs[3]!)).toBe(8);
    const fit = fitMessagesToBudget(msgs, 85);

    assertNoOrphanToolResult(fit.messages);
    // Old (pre-fix) behavior would have returned a lone [tool] window here.
    expect(fit.messages.length).toBeGreaterThan(1);
    expect(fit.messages[fit.messages.length - 1]).toEqual(msgs[msgs.length - 1]);
    // The current turn (from `q2` onward) is pairing-complete and fully kept.
    expect(fit.messages).toEqual(msgs.slice(2));
    expect(fit.droppedCount).toBe(2);
  });

  it('preserves an in-flight multi-round tool chain (no interleaving user message) even over budget', () => {
    const msgs = [
      user('u1'),
      assistant('call1', [{ id: 'cA', name: 'echo', args: {} }]),
      tool('r1' + 'x'.repeat(200), 'cA'),
      assistant('call2', [{ id: 'cB', name: 'echo', args: {} }]),
      tool('r2' + 'y'.repeat(200), 'cB'),
    ];
    // Budget far too small for the whole chain — there is no earlier `user`
    // message to fall back to, so the entire in-flight turn must be kept
    // intact rather than splitting it and orphaning a tool result.
    const fit = fitMessagesToBudget(msgs, 10);

    assertNoOrphanToolResult(fit.messages);
    expect(fit.droppedCount).toBe(0);
    expect(fit.messages).toEqual(msgs);
  });

  it('holds the no-orphan invariant across every possible budget cut point (two resolved turns)', () => {
    const msgs = [
      user('u1' + 'a'.repeat(200)),
      assistant('call1', [{ id: 'cA', name: 'echo', args: {} }]),
      tool('r1' + 'x'.repeat(200), 'cA'),
      user('u2' + 'b'.repeat(50)),
      assistant('call2', [{ id: 'cB', name: 'echo', args: {} }]),
      tool('r2' + 'y'.repeat(200), 'cB'),
    ];
    const total = msgs.reduce((n, m) => n + estimateMessageTokens(m), 0);

    for (let budget = 1; budget <= total; budget++) {
      const fit = fitMessagesToBudget(msgs, budget);
      assertNoOrphanToolResult(fit.messages);
      expect(fit.messages[fit.messages.length - 1]).toEqual(msgs[msgs.length - 1]);
      expect(fit.messages).toEqual(msgs.slice(fit.droppedCount));
    }
  });

  it('does not regress normal (non-pairing) compaction when the window already fits', () => {
    const msgs = [user('hello'), assistant('hi there')];
    const fit = fitMessagesToBudget(msgs, 10_000);
    expect(fit.droppedCount).toBe(0);
    expect(fit.messages).toEqual(msgs);
  });
});
