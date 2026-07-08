import { describe, it, expect, vi } from 'vitest';

import {
  CLEAR_SCREEN_ANSI,
  writeClearScreenAnsi,
  isTurnLive,
} from '../../src/cli/repl/app.js';
import { createStreamSegmenter, type Segment } from '../../src/cli/repl/stream-segmenter.js';

// Task 389-002 (born-530) — REPL-CLEAR-ANSI. Two bugs in one: `/clear`
// (and Ctrl-L, same clearScreen routine — F11-016-STAB) only reset the
// JS-side Ink `turns` state; it never wrote a real terminal ANSI-clear, and
// nothing stopped a still-streaming turn's straggler tokens from landing on
// the just-cleared screen. Fixed by (1) writeClearScreenAnsi — a real
// `\x1b[2J\x1b[3J\x1b[H` write, TTY-guarded — and (2) isTurnLive — the
// epoch-compare predicate clearScreen/output/the tool sink use to drop a
// stale (pre-clear) turn's remaining output instead of drawing it.
//
// No Ink mount: ink-testing-library is not a project dependency (confirmed
// sprints 285/354/359, see tests/cli/repl/f11-016-stab.test.tsx) — these are
// the pure, JSX-free decision seams app.tsx wires clearScreen/output/the
// tool sink through.

describe('writeClearScreenAnsi — real terminal clear (389-002)', () => {
  it('writes the full clear-screen + scrollback + home sequence on a TTY stream', () => {
    const write = vi.fn();
    writeClearScreenAnsi({ isTTY: true, write });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(CLEAR_SCREEN_ANSI);
  });

  it('the sequence erases the visible screen (2J), the scrollback (3J), and homes the cursor (H)', () => {
    expect(CLEAR_SCREEN_ANSI).toBe('\x1b[2J\x1b[3J\x1b[H');
  });

  it('never writes raw escape codes to a non-TTY stream (piped/redirected stdout)', () => {
    const write = vi.fn();
    writeClearScreenAnsi({ isTTY: false, write });
    expect(write).not.toHaveBeenCalled();
  });

  it('treats a missing isTTY (undefined) the same as non-TTY — no write', () => {
    const write = vi.fn();
    writeClearScreenAnsi({ write });
    expect(write).not.toHaveBeenCalled();
  });
});

describe('isTurnLive — in-flight-stream cancel on /clear (389-002)', () => {
  it('a turn stamped at the current clear-epoch is live (normal turn, no /clear in flight)', () => {
    // "normal-tur bozulmaz": a plain turn with no intervening clear renders.
    expect(isTurnLive(0, 0)).toBe(true);
    expect(isTurnLive(3, 3)).toBe(true);
  });

  it('a turn stamped BEFORE a clear-bump goes stale — its stream is cancelled', () => {
    let clearEpoch = 0;
    const turnEpoch = clearEpoch; // turn starts, stamps epoch 0
    expect(isTurnLive(turnEpoch, clearEpoch)).toBe(true); // streaming normally

    clearEpoch += 1; // user hits /clear mid-stream
    expect(isTurnLive(turnEpoch, clearEpoch)).toBe(false); // straggler output dropped
  });

  it('a turn started AFTER the clear renders normally under the new epoch', () => {
    let clearEpoch = 0;
    clearEpoch += 1; // a /clear already happened
    const nextTurnEpoch = clearEpoch; // the next turn stamps the NEW epoch at start
    expect(isTurnLive(nextTurnEpoch, clearEpoch)).toBe(true);
  });

  it('a second /clear during the same still-stale turn does not resurrect it', () => {
    let clearEpoch = 0;
    const turnEpoch = clearEpoch;
    clearEpoch += 1;
    clearEpoch += 1; // a rapid second /clear (e.g. Ctrl-L right after /clear)
    expect(isTurnLive(turnEpoch, clearEpoch)).toBe(false);
  });
});

describe('clearScreen segmenter recreation stays intact (regression guard, 360-009 FIX-3)', () => {
  it('a fresh segmenter after clear renders post-clear tokens with no pre-clear residue', () => {
    // The epoch guard stops STALE output from reaching the segmenter at all;
    // this confirms the underlying segmenter-recreation behavior clearScreen
    // already relied on (F11-016-STAB) is unchanged by this task's addition.
    const segs: Segment[] = [];
    const recreated = createStreamSegmenter((s) => segs.push(s));
    expect(recreated.partial()).toBe('');
    recreated.feed('post-clear line\n');
    expect(segs).toEqual([{ kind: 'line', markdown: 'post-clear line' }]);
  });
});
