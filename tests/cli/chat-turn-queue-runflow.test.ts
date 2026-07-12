// ═══ TERM5-QUEUE (Sprint 427, Task 427-004) — enqueueCorrelatedResult ═══════
//
// Covers the new idle-produce-vs-active-buffer mechanism layered on top of
// ChatTurnQueue's existing (untouched) enqueueBg/drainAsTurns/size trio:
// - idle -> the correlated event is produced as a turn immediately.
// - mid-turn -> it is buffered only (Hermes rule, same as a plain enqueueBg),
//   and surfaces later through the EXISTING drainAsTurns() at turn-end.
// - `enabled=false` (the caller's own run_flow_v2-style gate) -> zero
//   production: nothing is buffered, nothing is returned.
// - coalescing with an already-buffered same-source bucket still applies,
//   since this reuses enqueueBg verbatim.
//
// Same pure-controller style as the sibling tests/cli/chat-turn-queue.test.ts
// (Sprint 353 T-353-009) — no REPL/Ink involved, that file's own baseline
// coverage is left untouched.

import { describe, it, expect } from 'vitest';
import { createChatTurnQueue, type ChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';

function bg(source: string, summary: string) {
  return { source, summary };
}

describe('ChatTurnQueue.enqueueCorrelatedResult — idle-wake (TERM5-QUEUE, 427-004)', () => {
  it('idle + enabled=true: produces the turn immediately and clears the buffer', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    expect(q.userTurnActive).toBe(false);

    const produced = q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), true);

    expect(produced).toEqual([{ source: 'flow-abc', events: [bg('flow-abc', 'sprint-427 — 2/2 DONE')] }]);
    expect(q.size()).toBe(0); // drained, not left buffered
  });

  it('mid-turn + enabled=true: buffers only, returns [] — Hermes no-inject rule preserved', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    q.userTurnActive = true;

    const produced = q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), true);

    expect(produced).toEqual([]);
    expect(q.size()).toBe(1); // buffered, not dropped
  });

  it('mid-turn buffered event surfaces via the EXISTING drainAsTurns() once the turn ends', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    q.userTurnActive = true;
    q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), true);
    expect(q.drainAsTurns()).toEqual([]); // still a no-op mid-turn

    q.userTurnActive = false;
    const drained = q.drainAsTurns();

    expect(drained).toEqual([{ source: 'flow-abc', events: [bg('flow-abc', 'sprint-427 — 2/2 DONE')] }]);
    expect(q.size()).toBe(0);
  });

  it('enabled=false while idle: zero production — nothing buffered, nothing returned', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    expect(q.userTurnActive).toBe(false);

    const produced = q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), false);

    expect(produced).toEqual([]);
    expect(q.size()).toBe(0);
  });

  it('enabled=false mid-turn: zero production — byte-identical to never calling the method', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    q.userTurnActive = true;

    const produced = q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), false);

    expect(produced).toEqual([]);
    expect(q.size()).toBe(0);
    expect(q.drainAsTurns()).toEqual([]); // confirms nothing was ever buffered
  });

  it('coalesces with an already-buffered same-source bucket (reuses enqueueBg verbatim)', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    q.userTurnActive = true;
    q.enqueueBg(bg('flow-abc', 'task 001 done'));

    const produced = q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), true);
    expect(produced).toEqual([]); // still mid-turn
    expect(q.size()).toBe(1); // coalesced into the same bucket, not a second one

    q.userTurnActive = false;
    const drained = q.drainAsTurns();
    expect(drained).toEqual([
      {
        source: 'flow-abc',
        events: [bg('flow-abc', 'task 001 done'), bg('flow-abc', 'sprint-427 — 2/2 DONE')],
      },
    ]);
  });

  it('idle + enabled=true also drains any OTHER already-buffered bucket alongside the new one', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    q.userTurnActive = true;
    q.enqueueBg(bg('autonomous-tick', 'tick #7 completed'));
    q.userTurnActive = false;

    const produced = q.enqueueCorrelatedResult(bg('flow-abc', 'sprint-427 — 2/2 DONE'), true);

    expect(produced).toEqual([
      { source: 'autonomous-tick', events: [bg('autonomous-tick', 'tick #7 completed')] },
      { source: 'flow-abc', events: [bg('flow-abc', 'sprint-427 — 2/2 DONE')] },
    ]);
    expect(q.size()).toBe(0);
  });

  it('baseline sanity: enqueueBg/drainAsTurns/size behavior is unaffected by this addition', () => {
    const q: ChatTurnQueue = createChatTurnQueue();
    q.enqueueBg(bg('sprint-1', 'a'));
    q.enqueueBg(bg('sprint-1', 'b'));
    expect(q.size()).toBe(1);
    expect(q.drainAsTurns()).toEqual([{ source: 'sprint-1', events: [bg('sprint-1', 'a'), bg('sprint-1', 'b')] }]);
    expect(q.size()).toBe(0);
  });
});
