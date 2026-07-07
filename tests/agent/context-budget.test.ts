// tests/agent/context-budget.test.ts
import { describe, it, expect } from 'vitest';
import { estimateTokens, estimateMessageTokens, fitMessagesToBudget } from '../../src/agent/context-budget.js';
import type { ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

const user = (content: string): ProviderMessage => ({ role: 'user', content });
const assistant = (content: string, toolCalls?: ProviderMessage['toolCalls']): ProviderMessage =>
  toolCalls ? { role: 'assistant', content, toolCalls } : { role: 'assistant', content };
const tool = (content: string, toolCallId: string): ProviderMessage => ({ role: 'tool', content, toolCallId });

describe('estimateTokens / estimateMessageTokens', () => {
  it('estimates ~chars/4, rounded up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('counts tool-call names + serialized args plus the message envelope', () => {
    const plain = estimateMessageTokens(assistant('hi'));
    const withCall = estimateMessageTokens(assistant('hi', [{ id: 'c1', name: 'echo', args: { v: 'x'.repeat(100) } }]));
    expect(withCall).toBeGreaterThan(plain);
  });
});

describe('fitMessagesToBudget', () => {
  it('returns the input unchanged when it already fits', () => {
    const msgs = [user('hello'), assistant('world')];
    const fit = fitMessagesToBudget(msgs, 10_000);
    expect(fit.droppedCount).toBe(0);
    expect(fit.messages).toEqual(msgs);
  });

  it('returns the input unchanged for a non-positive budget (fitting disabled)', () => {
    const msgs = [user('x'.repeat(400))];
    expect(fitMessagesToBudget(msgs, 0).droppedCount).toBe(0);
    expect(fitMessagesToBudget(msgs, -5).droppedCount).toBe(0);
  });

  it('drops the oldest messages first and keeps the newest window', () => {
    const msgs = [
      user('a'.repeat(400)),      // ~104 tok
      assistant('b'.repeat(400)),
      user('c'.repeat(400)),
      assistant('d'.repeat(400)),
    ];
    const fit = fitMessagesToBudget(msgs, 250);
    expect(fit.droppedCount).toBeGreaterThan(0);
    expect(fit.messages[fit.messages.length - 1]).toEqual(msgs[msgs.length - 1]);
    // The kept window is a suffix of the input.
    expect(fit.messages).toEqual(msgs.slice(fit.droppedCount));
  });

  it('never opens the window on an orphan tool result — advances to a user turn', () => {
    const msgs = [
      user('q1' + 'x'.repeat(400)),
      assistant('calling', [{ id: 'c1', name: 'echo', args: {} }]),
      tool('result ' + 'y'.repeat(300), 'c1'),
      user('q2'),
      assistant('final answer'),
    ];
    // Budget chosen so the naive cut would land on the tool result.
    const fit = fitMessagesToBudget(msgs, 120);
    expect(fit.droppedCount).toBeGreaterThan(0);
    expect(fit.messages[0]!.role).toBe('user');
    // No tool message without its assistant tool-call partner in the window.
    for (const [i, m] of fit.messages.entries()) {
      if (m.role === 'tool') {
        const before = fit.messages.slice(0, i);
        expect(before.some((p) => p.role === 'assistant' && p.toolCalls?.some((tc) => tc.id === m.toolCallId))).toBe(true);
      }
    }
  });

  it('always keeps the final message even when it alone exceeds the budget', () => {
    const msgs = [user('old'), user('x'.repeat(4000))];
    const fit = fitMessagesToBudget(msgs, 50);
    expect(fit.messages.length).toBeGreaterThanOrEqual(1);
    expect(fit.messages[fit.messages.length - 1]).toEqual(msgs[1]);
  });

  it('handles an empty transcript', () => {
    const fit = fitMessagesToBudget([], 100);
    expect(fit).toEqual({ messages: [], droppedCount: 0, estimatedTokens: 0 });
  });
});
