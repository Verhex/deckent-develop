// ═══ Sprint 285 T-285-002 — REPL per-tool confirm QUEUE ══════════════════════
//
// Fix for the H1 latent fragility (docs/reviews/sprint-285/repl-tool-root-cause.md):
// the Ink confirm flow used ONE resolver slot (app.tsx confirmResolve), so a
// re-entrant/concurrent trigger overwrote the first resolver and orphaned it.
// `createConfirmQueue` (exported from app.tsx) replaces that with a FIFO queue:
// N tool calls = N cards shown in arrival order, none dropped; deny continues the
// rest; an 'a' (always) decision auto-applies to the same-tool remainder.
//
// Why .test.ts (directive named .tsx): ink-testing-library is NOT a project
// dependency (285-001 confirmed app.tsx cannot be rendered), so this test has no
// JSX; AND vitest.config.ts `include` is `tests/**/*.test.ts`, which excludes
// `.tsx` (a `.test.tsx` yields "No test files found"). The queue logic lives in a
// pure, React-free controller exactly so it can be unit-tested here against the
// REAL shared code path the Ink view uses.

import { describe, it, expect } from 'vitest';
import {
  createConfirmQueue,
  type ConfirmAnswer,
  type ConfirmQueue,
} from '../../src/cli/repl/app.js';

/** Enqueue a request and track how/whether it resolved (sync + awaitable). */
function track(queue: ConfirmQueue, summary: string, toolName?: string) {
  let settled: ConfirmAnswer | undefined;
  const promise = new Promise<ConfirmAnswer>((resolve) => {
    queue.enqueue({
      summary,
      ...(toolName ? { toolName } : {}),
      resolve: (a) => { settled = a; resolve(a); },
    });
  });
  return { promise, settled: () => settled };
}

describe('createConfirmQueue — FIFO per-tool confirm (H1 fix)', () => {
  it('3-confirm-sequential: each card is shown + resolved in arrival order', () => {
    let changes = 0;
    const q = createConfirmQueue(() => { changes += 1; });

    // Engine-style sequential dispatch: enqueue, answer, then the next enqueues.
    const a = track(q, 'cmd-0');
    expect(q.head()?.summary).toBe('cmd-0');
    expect(q.head()).toMatchObject({ index: 1, total: 1 });
    q.answer('y');
    expect(a.settled()).toBe('y');
    expect(q.head()).toBeNull();

    const b = track(q, 'cmd-1');
    q.answer('y');
    const c = track(q, 'cmd-2');
    q.answer('y');

    expect(b.settled()).toBe('y');
    expect(c.settled()).toBe('y');
    expect(q.size()).toBe(0);
    expect(changes).toBeGreaterThanOrEqual(6); // enqueue + answer each fire onChange
  });

  it('pending-not-overwritten: a 2nd trigger queues behind the 1st (no orphan)', async () => {
    const q = createConfirmQueue(() => { /* no-op */ });

    // Concurrent triggers WITHOUT answering between them — the exact case the old
    // single slot dropped. The head stays the FIRST; the second waits its turn.
    const a = track(q, 'cmd-a');
    const b = track(q, 'cmd-b');
    expect(q.size()).toBe(2);
    expect(q.head()?.summary).toBe('cmd-a');
    expect(q.head()).toMatchObject({ index: 1, total: 2 });

    q.answer('y');                       // resolves cmd-a (NOT cmd-b)
    expect(a.settled()).toBe('y');
    expect(b.settled()).toBeUndefined(); // cmd-b not yet answered
    expect(q.head()?.summary).toBe('cmd-b');
    expect(q.head()).toMatchObject({ index: 2, total: 2 });

    q.answer('n');                       // resolves cmd-b
    expect(b.settled()).toBe('n');
    expect(q.head()).toBeNull();

    // Both promises settle — neither is orphaned (the old single-slot orphaned a).
    await expect(Promise.all([a.promise, b.promise])).resolves.toEqual(['y', 'n']);
  });

  it('deny-continue: denying one card does NOT cancel the rest of the queue', () => {
    const q = createConfirmQueue(() => { /* no-op */ });
    const a = track(q, 'cmd-0');
    const b = track(q, 'cmd-1');
    const c = track(q, 'cmd-2');
    expect(q.size()).toBe(3);

    q.answer('n');                       // deny the first
    expect(a.settled()).toBe('n');
    expect(q.size()).toBe(2);            // queue NOT cleared — rest remain
    expect(q.head()?.summary).toBe('cmd-1');

    q.answer('y');
    q.answer('n');
    expect(b.settled()).toBe('y');
    expect(c.settled()).toBe('n');
    expect(q.size()).toBe(0);
  });

  it('always-applies-to-queue: an "a" decision auto-resolves the same-tool remainder', () => {
    const q = createConfirmQueue(() => { /* no-op */ });
    const a = track(q, 'run pwd', 'deckent_bash');
    const b = track(q, 'run ls', 'deckent_bash');   // same tool → auto-allowed by 'a'
    const c = track(q, 'write a.md', 'deckent_write_file'); // different tool → still asked
    expect(q.size()).toBe(3);

    q.answer('a');                       // always-allow deckent_bash
    expect(a.settled()).toBe('a');
    expect(b.settled()).toBe('a');       // same-tool remainder auto-resolved
    expect(c.settled()).toBeUndefined(); // different tool is NOT auto-resolved
    expect(q.size()).toBe(1);
    expect(q.head()?.summary).toBe('write a.md');

    q.answer('y');
    expect(c.settled()).toBe('y');
    expect(q.size()).toBe(0);
  });

  it('always without a toolName does NOT auto-apply (ALWAYS-tier safety)', () => {
    // The kill/cleanup ALWAYS-confirm tier triggers WITHOUT a toolName so an 'a'
    // here never auto-applies to anything queued behind it.
    const q = createConfirmQueue(() => { /* no-op */ });
    const a = track(q, 'kill --all');               // no toolName
    const b = track(q, 'cleanup');                  // no toolName
    q.answer('a');
    expect(a.settled()).toBe('a');
    expect(b.settled()).toBeUndefined();            // still must be asked
    expect(q.size()).toBe(1);
  });

  it('answering an empty queue is a no-op (defensive)', () => {
    let changes = 0;
    const q = createConfirmQueue(() => { changes += 1; });
    expect(q.head()).toBeNull();
    q.answer('y');                       // nothing pending
    expect(q.size()).toBe(0);
    expect(changes).toBe(0);             // no spurious re-render
  });

  it('[i/N] grows when a card arrives mid-burst', () => {
    const q = createConfirmQueue(() => { /* no-op */ });
    track(q, 'cmd-0');
    track(q, 'cmd-1');
    expect(q.head()).toMatchObject({ index: 1, total: 2 });
    track(q, 'cmd-2');                   // a third arrives before any answer
    expect(q.head()).toMatchObject({ index: 1, total: 3 });
    q.answer('y');
    expect(q.head()).toMatchObject({ index: 2, total: 3 });
  });
});
