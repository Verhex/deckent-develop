// ═══ Sprint 353 T-353-009 — ChatTurnQueue (TERM-2 chat-turn çekirdeği) ═══════
//
// Hermes-user-msg rule under test: background-completed work must never be
// injected MID-TURN — it queues, and only drains as sequential new turns once
// the active user turn ends. Pure controller test (no REPL/Ink involved),
// same shape as tests/cli/repl-confirm-queue.test.ts's createConfirmQueue coverage.

import { describe, it, expect } from 'vitest';
import { createChatTurnQueue, type ChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';

function bg(source: string, summary: string) {
  return { source, summary };
}

describe('createChatTurnQueue — Hermes bg-completed-work queue', () => {
  it('starts empty with userTurnActive false', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    expect(q.userTurnActive).toBe(false);
    expect(q.size()).toBe(0);
    expect(q.drainAsTurns()).toEqual([]);
  });

  it('mid-turn: bg-events are queued, NOT injected — drainAsTurns is a no-op while userTurnActive', () => {
    const q = createChatTurnQueue();
    q.userTurnActive = true;

    q.enqueueBg(bg('sprint-353', 'sprint 353 finished'));
    q.enqueueBg(bg('autonomous-tick', 'tick #7 completed'));
    expect(q.size()).toBe(2);

    // Draining mid-turn must not inject and must not consume the queue.
    expect(q.drainAsTurns()).toEqual([]);
    expect(q.size()).toBe(2);
  });

  it('turn-end: drain returns sequential turn payloads in arrival order, then clears', () => {
    const q = createChatTurnQueue();
    q.userTurnActive = true;
    q.enqueueBg(bg('sprint-353', 'sprint 353 finished'));
    q.enqueueBg(bg('autonomous-tick', 'tick #7 completed'));
    q.userTurnActive = false;

    const drained = q.drainAsTurns();
    expect(drained).toEqual([
      { source: 'sprint-353', events: [bg('sprint-353', 'sprint 353 finished')] },
      { source: 'autonomous-tick', events: [bg('autonomous-tick', 'tick #7 completed')] },
    ]);
    expect(q.size()).toBe(0);
    expect(q.drainAsTurns()).toEqual([]); // draining an empty queue is a no-op
  });

  it('coalesce: consecutive same-source events merge into one bucket/payload', () => {
    const q = createChatTurnQueue();
    q.enqueueBg(bg('sprint-353', 'task 001 done'));
    q.enqueueBg(bg('sprint-353', 'task 002 done'));
    q.enqueueBg(bg('sprint-353', 'task 003 done'));
    expect(q.size()).toBe(1); // 3 events, 1 coalesced bucket

    const drained = q.drainAsTurns();
    expect(drained).toEqual([
      {
        source: 'sprint-353',
        events: [
          bg('sprint-353', 'task 001 done'),
          bg('sprint-353', 'task 002 done'),
          bg('sprint-353', 'task 003 done'),
        ],
      },
    ]);
  });

  it('coalesce: a different-source event in between keeps buckets separate, order preserved', () => {
    const q = createChatTurnQueue();
    q.enqueueBg(bg('sprint-353', 'a1'));
    q.enqueueBg(bg('sprint-353', 'a2'));
    q.enqueueBg(bg('watch-x', 'w1'));
    q.enqueueBg(bg('sprint-353', 'a3')); // same source as a1/a2 but NOT consecutive → new bucket
    expect(q.size()).toBe(3);

    const drained = q.drainAsTurns();
    expect(drained.map((p) => p.source)).toEqual(['sprint-353', 'watch-x', 'sprint-353']);
    expect(drained[0]?.events).toEqual([bg('sprint-353', 'a1'), bg('sprint-353', 'a2')]);
    expect(drained[1]?.events).toEqual([bg('watch-x', 'w1')]);
    expect(drained[2]?.events).toEqual([bg('sprint-353', 'a3')]);
  });

  it('resuming after a drain starts a fresh bucket even for a repeated source', () => {
    const q = createChatTurnQueue();
    q.enqueueBg(bg('sprint-353', 'first batch'));
    expect(q.drainAsTurns()).toHaveLength(1);

    q.enqueueBg(bg('sprint-353', 'second batch'));
    const drained = q.drainAsTurns();
    expect(drained).toEqual([{ source: 'sprint-353', events: [bg('sprint-353', 'second batch')] }]);
  });
});
