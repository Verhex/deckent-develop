// ═══ Task 360-009 — F11-016-STAB — Ink REPL stabilization slice (app.tsx) ════
//
// One render-test group per fix landed in src/cli/repl/app.tsx:
//   FIX-1 confirmKeyToAnswer   — confirm-modal key mapping (uppercase 'Y' used
//                                to DENY; stray keys mowed down the burst).
//   FIX-2 buildSegmentTurns    — head-once segment append, pulled OUT of the
//                                setState updater (impure-updater hazard).
//   FIX-3 clearScreen semantics— /clear + Ctrl-L now recreate the segmenter so
//                                the pre-clear in-flight partial cannot
//                                resurface (mechanism tested at the
//                                createStreamSegmenter seam).
//   FIX-4 truncateQueuePreview — code-point-safe queue-preview truncation.
//
// Why no Ink mount despite the `.tsx` extension: ink-testing-library is NOT a
// project dependency (confirmed sprints 285 / 354 / 359 — see
// tests/cli/repl/app-surface-wire.test.tsx), so this suite exercises the pure,
// JSX-free logic app.tsx exports for exactly this reason. Untested by design
// (needs a real PTY smoke, not a unit test): the useInput wiring itself and
// clearScreen's setState calls — the pure seams below are the decision logic
// those paths delegate to.

import { describe, it, expect } from 'vitest';
import {
  confirmKeyToAnswer,
  buildSegmentTurns,
  truncateQueuePreview,
  createConfirmQueue,
  type ConfirmAnswer,
  type Turn,
} from '../../../src/cli/repl/app.js';
import { createStreamSegmenter, type Segment } from '../../../src/cli/repl/stream-segmenter.js';

// ─── FIX-1: confirmKeyToAnswer — only documented keys decide a card ──────────

describe('confirmKeyToAnswer — confirm-modal key mapping (360-009 FIX-1)', () => {
  it('approves on y AND Y (uppercase used to deny — the regression this fix closes)', () => {
    expect(confirmKeyToAnswer('y', {})).toBe('y');
    expect(confirmKeyToAnswer('Y', {})).toBe('y');
  });

  it('always-approves on a AND A', () => {
    expect(confirmKeyToAnswer('a', {})).toBe('a');
    expect(confirmKeyToAnswer('A', {})).toBe('a');
  });

  it('denies on n AND N (the hint documents capital N)', () => {
    expect(confirmKeyToAnswer('n', {})).toBe('n');
    expect(confirmKeyToAnswer('N', {})).toBe('n');
  });

  it('Enter and Esc keep their pre-fix deny-default behavior', () => {
    expect(confirmKeyToAnswer('', { return: true })).toBe('n');
    expect(confirmKeyToAnswer('', { escape: true })).toBe('n');
  });

  it('ignores navigation keys (arrows arrive as empty input) instead of denying', () => {
    // Ink delivers arrow keys as input '' + a key flag outside this contract's
    // decide-set — mouse-wheel escape sequences surface the same way.
    expect(confirmKeyToAnswer('', {})).toBeNull();
  });

  it('ignores stray typed/pasted text (input bar is inactive during the modal)', () => {
    expect(confirmKeyToAnswer('x', {})).toBeNull();
    expect(confirmKeyToAnswer('q', {})).toBeNull();
    expect(confirmKeyToAnswer('yes', {})).toBeNull(); // batched paste — multi-char never decides
  });

  it('ignores ctrl/meta-modified keys (shortcuts never decide a card)', () => {
    expect(confirmKeyToAnswer('r', { ctrl: true })).toBeNull();
    expect(confirmKeyToAnswer('y', { meta: true })).toBeNull();
  });

  it('drives createConfirmQueue safely through a noisy key stream (burst survives)', () => {
    const answers: Array<{ card: number; answer: ConfirmAnswer }> = [];
    const q = createConfirmQueue(() => { /* head re-render — not under test */ });
    for (const card of [1, 2, 3]) {
      q.enqueue({ summary: `card ${card}`, toolName: 'write_file', resolve: (a) => answers.push({ card, answer: a }) });
    }
    const feed = (input: string, key: Parameters<typeof confirmKeyToAnswer>[1] = {}): void => {
      const a = confirmKeyToAnswer(input, key);
      if (a !== null) q.answer(a);
    };

    feed('', {});        // arrow noise — pre-fix this DENIED card 1
    feed('x', {});       // stray typing — pre-fix this DENIED card 1
    expect(q.size()).toBe(3); // burst intact
    feed('Y');           // uppercase approve — pre-fix this DENIED card 1
    expect(answers).toEqual([{ card: 1, answer: 'y' }]);
    feed('A');           // always → card 2 + same-tool cascade resolves card 3
    expect(answers).toEqual([
      { card: 1, answer: 'y' },
      { card: 2, answer: 'a' },
      { card: 3, answer: 'a' },
    ]);
    expect(q.size()).toBe(0);
  });
});

// ─── FIX-2: buildSegmentTurns — head-once append, pure by construction ───────

describe('buildSegmentTurns — head-once segment append (360-009 FIX-2)', () => {
  it('emits the head exactly once, before the first segment', () => {
    const first = buildSegmentTurns(false, 10, 'hello');
    expect(first.turns).toEqual([
      { id: 10, role: 'head', text: '' },
      { id: 11, role: 'seg', text: 'hello' },
    ]);
    expect(first.nextId).toBe(12);
  });

  it('appends only the segment once the head is already pushed', () => {
    const later = buildSegmentTurns(true, 12, 'world');
    expect(later.turns).toEqual([{ id: 12, role: 'seg', text: 'world' }]);
    expect(later.nextId).toBe(13);
  });

  it('is deterministic — a re-invoked updater cannot duplicate or drop the head', () => {
    // The pre-fix pushSegment mutated headPushed/idRef INSIDE the setTurns
    // updater; React may re-invoke an updater, so the second run saw mutated
    // refs and skipped the head. Pure build = identical output on every run.
    const a = buildSegmentTurns(false, 1, 'seg');
    const b = buildSegmentTurns(false, 1, 'seg');
    expect(a).toEqual(b);

    const base: Turn[] = [{ id: 0, role: 'user', text: 'q' }];
    const applyOnce = [...base, ...a.turns];
    const applyAgain = [...base, ...a.turns]; // simulated updater re-run
    expect(applyAgain).toEqual(applyOnce);
    expect(applyAgain.filter((t) => t.role === 'head')).toHaveLength(1);
  });
});

// ─── FIX-3: clearScreen × segmenter — stale in-flight buffer dropped ─────────

describe('clearScreen segmenter recreation — stale partial cannot resurface (360-009 FIX-3)', () => {
  it('REPRO — keeping the old segmenter resurfaces pre-clear text (the closed bug)', () => {
    // The pre-fix /clear + Ctrl-L paths only blanked the RENDERED partial
    // string; the segmenter instance kept buffering, so the next streamed
    // token stitched pre-clear text back onto the just-cleared screen.
    const segs: Segment[] = [];
    const survivor = createStreamSegmenter((s) => segs.push(s));
    survivor.feed('pre-clear partial');       // in-flight when the user clears
    expect(survivor.partial()).toBe('pre-clear partial'); // still buffered
    survivor.feed(' + next token\n');
    expect(segs).toEqual([{ kind: 'line', markdown: 'pre-clear partial + next token' }]);
  });

  it('FIX — a recreated segmenter starts empty; post-clear stream renders clean', () => {
    const segs: Segment[] = [];
    const recreated = createStreamSegmenter((s) => segs.push(s)); // clearScreen's new instance
    expect(recreated.partial()).toBe('');
    recreated.feed('post-clear line\n');
    expect(segs).toEqual([{ kind: 'line', markdown: 'post-clear line' }]);
  });

  it('FIX — a pre-clear OPEN fenced block no longer swallows post-clear lines', () => {
    // Same mechanism, block flavor: an open ``` before the clear left the old
    // instance in code mode, silently buffering every post-clear line.
    const stale: Segment[] = [];
    const survivor = createStreamSegmenter((s) => stale.push(s));
    survivor.feed('```js\nconst x = 1;\n');   // open fence in flight
    survivor.feed('post-clear prose\n');      // swallowed into the stale block
    expect(stale).toHaveLength(0);            // the pre-fix silent freeze

    const fresh: Segment[] = [];
    const recreated = createStreamSegmenter((s) => fresh.push(s));
    recreated.feed('post-clear prose\n');     // fresh instance → emits immediately
    expect(fresh).toEqual([{ kind: 'line', markdown: 'post-clear prose' }]);
  });
});

// ─── FIX-4: truncateQueuePreview — code-point-safe truncation ────────────────

describe('truncateQueuePreview — code-point-safe queue preview (360-009 FIX-4)', () => {
  it('leaves short lines untouched (no ellipsis at or under the cap)', () => {
    expect(truncateQueuePreview('abc')).toBe('abc');
    const exactly60 = 'x'.repeat(60);
    expect(truncateQueuePreview(exactly60)).toBe(exactly60);
  });

  it('truncates ASCII past the cap with a trailing ellipsis', () => {
    const long = 'x'.repeat(61);
    expect(truncateQueuePreview(long)).toBe('x'.repeat(60) + '…');
  });

  it('never bisects a surrogate pair (the pre-fix q.slice(0, 60) did)', () => {
    // Realistic queued-message shape: text + emoji. The single leading ASCII
    // char puts code-unit 60 in the MIDDLE of a pair (bisect needs an odd
    // unit offset — a pure emoji repeat happens to cut on a pair boundary).
    const mixed = 'x' + '🎉'.repeat(65); // 131 code units, 66 code points
    const out = truncateQueuePreview(mixed);
    const points = [...out];
    expect(points).toHaveLength(61); // 60 whole code points + '…'
    expect(points[0]).toBe('x');
    expect(points.slice(1, -1).every((p) => p === '🎉')).toBe(true);
    expect(points.at(-1)).toBe('…');
    // Contrast: the old code-unit slice ends mid-pair (a lone high surrogate).
    const oldBehavior = mixed.slice(0, 60);
    const lastUnit = oldBehavior.charCodeAt(oldBehavior.length - 1);
    expect(lastUnit >= 0xd800 && lastUnit <= 0xdbff).toBe(true);
  });

  it('honors a custom max', () => {
    expect(truncateQueuePreview('abcdef', 3)).toBe('abc…');
  });
});
