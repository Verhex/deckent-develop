// tests/cli/repl-cursor-model.test.ts
// Unit tests for src/cli/repl/cursor-model.ts (Task 373-006 — CURSOR-HARNESS,
// ADR-D-010 KALAN-envanter (a)/(b)):
//   1. Satır-içi hareket (in-line movement) — left/right/home/end, edge clamps,
//      astral/surrogate-pair-atomic movement
//   2. Unicode-genişlik (CJK/emoji display width) — codePointWidth / displayWidth
//   3. Satır-taşması (line overflow/wrap) — layoutWrapped
//   4. Orta-satır düzenleme (mid-line editing) — applyCursorEdit
//
// Pure core, no I/O — no tmpdir/hermeticity concerns beyond the usual.

import { describe, it, expect } from 'vitest';
import {
  fromBuffer,
  toBuffer,
  moveCursor,
  codePointWidth,
  displayWidth,
  layoutWrapped,
  applyCursorEdit,
  type CursorState,
  type CursorMoveResult,
  type CursorEditResult,
} from '../../src/cli/repl/cursor-model.js';

const EMOJI = '🎉'; // U+1F389, surrogate pair, wide (2 cols)
const HAN = '中'; // U+4E2D, wide (2 cols), single UTF-16 unit
const COMBINING_ACUTE = '́'; // combining acute accent, zero-width
const ZWJ = '‍';

const moved = (cursor: number, state: CursorState): CursorMoveResult => ({ kind: 'moved', state: { ...state, cursor } });
const unchanged = (state: CursorState): CursorMoveResult => ({ kind: 'unchanged', state });

// ─── fromBuffer / toBuffer ───────────────────────────────────────────────────

describe('cursor-model — fromBuffer / toBuffer', () => {
  it('splits by code point, defaulting cursor to end-of-buffer', () => {
    const state = fromBuffer('ab' + EMOJI);
    expect(state.graphemes).toEqual(['a', 'b', EMOJI]);
    expect(state.cursor).toBe(3); // 3 code points, not 4 UTF-16 units
  });

  it('round-trips back to the original string', () => {
    const original = 'hello ' + HAN + EMOJI + ' world';
    expect(toBuffer(fromBuffer(original))).toBe(original);
  });

  it('clamps an out-of-range explicit cursor into [0, length]', () => {
    expect(fromBuffer('abc', -5).cursor).toBe(0);
    expect(fromBuffer('abc', 999).cursor).toBe(3);
    expect(fromBuffer('abc', 2).cursor).toBe(2);
  });

  it('never bisects a surrogate pair into the graphemes array', () => {
    const state = fromBuffer(EMOJI);
    expect(state.graphemes).toEqual([EMOJI]);
    expect(state.graphemes).toHaveLength(1); // not 2 lone surrogates
  });
});

// ─── 1. Satır-içi hareket (in-line movement) ────────────────────────────────

describe('cursor-model — in-line movement', () => {
  it('left/right move one code point at a time', () => {
    const s0 = fromBuffer('abc', 1);
    expect(moveCursor(s0, 'right')).toEqual(moved(2, s0));
    expect(moveCursor(s0, 'left')).toEqual(moved(0, s0));
  });

  it('home/end jump to the buffer edges', () => {
    const s = fromBuffer('abcdef', 3);
    expect(moveCursor(s, 'home')).toEqual(moved(0, s));
    expect(moveCursor(s, 'end')).toEqual(moved(6, s));
  });

  it('clamps left at position 0 as unchanged (no negative cursor)', () => {
    const s = fromBuffer('abc', 0);
    expect(moveCursor(s, 'left')).toEqual(unchanged(s));
  });

  it('clamps right at buffer end as unchanged (no overrun)', () => {
    const s = fromBuffer('abc', 3);
    expect(moveCursor(s, 'right')).toEqual(unchanged(s));
  });

  it('home/end are unchanged (not "moved") when already at that edge', () => {
    const atHome = fromBuffer('abc', 0);
    const atEnd = fromBuffer('abc', 3);
    expect(moveCursor(atHome, 'home')).toEqual(unchanged(atHome));
    expect(moveCursor(atEnd, 'end')).toEqual(unchanged(atEnd));
  });

  it('moves over an astral/surrogate-pair character as ONE atomic step (closes ADR-D-010 KALAN (a))', () => {
    // buffer: "a" + EMOJI(surrogate pair) + "b" — cursor starts right before the emoji
    const s = fromBuffer('a' + EMOJI + 'b', 1);
    const afterRight = moveCursor(s, 'right');
    expect(afterRight.kind).toBe('moved');
    expect(afterRight.state.cursor).toBe(2); // past the WHOLE emoji, not into its middle
    expect(afterRight.state.graphemes[1]).toBe(EMOJI); // never split into lone surrogates
    const backLeft = moveCursor(afterRight.state, 'left');
    expect(backLeft.state.cursor).toBe(1); // symmetric: one step removes the whole emoji again
  });

  it('a ZWJ-joined compound sequence is ONE grapheme: it moves as a single unit (TERMINAL-TOOLS-005 closed the former code-point gap)', () => {
    // "👨" + ZWJ + "👩" is 3 code points but one user-perceived glyph; the
    // model now segments by grapheme cluster (Intl.Segmenter), so ←/→ cross it
    // in one step and no edit can land inside it.
    const compound = '\u{1F468}' + ZWJ + '\u{1F469}';
    const s = fromBuffer(compound, 0);
    expect(s.graphemes).toHaveLength(1);
    const step1 = moveCursor(s, 'right');
    expect(step1.state.cursor).toBe(1); // past the whole glyph
    expect(moveCursor(step1.state, 'right').kind).toBe('unchanged');
  });
});

// ─── 2. Unicode-genişlik (CJK / emoji display width) ────────────────────────

describe('cursor-model — unicode display width', () => {
  it('ASCII characters are width 1', () => {
    expect(codePointWidth('a'.codePointAt(0)!)).toBe(1);
    expect(codePointWidth('7'.codePointAt(0)!)).toBe(1);
  });

  it('CJK ideographs are width 2', () => {
    expect(codePointWidth(HAN.codePointAt(0)!)).toBe(2);
  });

  it('common emoji (astral-plane pictographs) are width 2', () => {
    expect(codePointWidth(EMOJI.codePointAt(0)!)).toBe(2);
  });

  it('combining marks are width 0', () => {
    expect(codePointWidth(COMBINING_ACUTE.codePointAt(0)!)).toBe(0);
  });

  it('zero-width joiner is width 0', () => {
    expect(codePointWidth(ZWJ.codePointAt(0)!)).toBe(0);
  });

  it('displayWidth sums per-code-point widths across mixed text', () => {
    expect(displayWidth('ab')).toBe(2); // 1 + 1
    expect(displayWidth(HAN + HAN)).toBe(4); // 2 + 2
    expect(displayWidth('a' + HAN + EMOJI)).toBe(5); // 1 + 2 + 2
    expect(displayWidth('e' + COMBINING_ACUTE)).toBe(1); // base 1 + combining 0
  });

  it('displayWidth of an empty string is 0', () => {
    expect(displayWidth('')).toBe(0);
  });
});

// ─── 3. Satır-taşması (line overflow / wrap) ────────────────────────────────

describe('cursor-model — line overflow / wrap layout', () => {
  it('does not wrap when the buffer fits within terminalWidth', () => {
    const layout = layoutWrapped(fromBuffer('abc', 3), 10);
    expect(layout.rows).toEqual(['abc']);
    expect(layout.cursorPosition).toEqual({ row: 0, column: 3 });
  });

  it('wraps narrow characters exactly at the column boundary', () => {
    const layout = layoutWrapped(fromBuffer('abcdef', 0), 3);
    expect(layout.rows).toEqual(['abc', 'def']);
  });

  it('never splits a wide glyph across two rows — it wraps whole to the next row', () => {
    // width 3: "ab" (2 cols) then a wide CJK char (2 cols) would overflow to 4 —
    // it must move entirely to row 2, not render half on row 1.
    const layout = layoutWrapped(fromBuffer('ab' + HAN, 0), 3);
    expect(layout.rows).toEqual(['ab', HAN]);
  });

  it('reports the caret display position at an arbitrary mid-buffer cursor after a wrap', () => {
    const state = fromBuffer('abcdef', 4); // cursor sits between 'd' and 'e'
    const layout = layoutWrapped(state, 3); // rows: "abc" | "def"
    expect(layout.cursorPosition).toEqual({ row: 1, column: 1 }); // 2nd row, 1 col in
  });

  it('reports the caret at the very end of a wrapped buffer', () => {
    const state = fromBuffer('abcdef', 6);
    const layout = layoutWrapped(state, 3);
    expect(layout.cursorPosition).toEqual({ row: 1, column: 3 });
  });

  it('reports the caret at the very start (row 0, column 0)', () => {
    const state = fromBuffer('abcdef', 0);
    const layout = layoutWrapped(state, 3);
    expect(layout.cursorPosition).toEqual({ row: 0, column: 0 });
  });

  it('handles an empty buffer as a single empty row with the caret at (0,0)', () => {
    const layout = layoutWrapped(fromBuffer(''), 10);
    expect(layout.rows).toEqual(['']);
    expect(layout.cursorPosition).toEqual({ row: 0, column: 0 });
  });

  it('guards against a non-positive terminalWidth without looping forever', () => {
    const layout = layoutWrapped(fromBuffer('ab', 2), 0);
    expect(layout.rows.length).toBeGreaterThan(0);
    expect(Number.isFinite(layout.cursorPosition.row)).toBe(true);
  });
});

// ─── 4. Orta-satır düzenleme (mid-line editing) ─────────────────────────────

describe('cursor-model — mid-line editing', () => {
  it('inserts text at an arbitrary mid-buffer cursor, advancing the cursor past the inserted text', () => {
    const s = fromBuffer('ac', 1); // cursor between 'a' and 'c'
    const result: CursorEditResult = applyCursorEdit(s, 'insert', 'b');
    expect(result.kind).toBe('edited');
    expect(toBuffer(result.state)).toBe('abc');
    expect(result.state.cursor).toBe(2);
  });

  it('inserts multi-code-point text (incl. a surrogate pair) as one atomic block', () => {
    const s = fromBuffer('a' + 'c', 1);
    const result = applyCursorEdit(s, 'insert', EMOJI);
    expect(toBuffer(result.state)).toBe('a' + EMOJI + 'c');
    expect(result.state.graphemes).toEqual(['a', EMOJI, 'c']);
    expect(result.state.cursor).toBe(2); // one step past the emoji, not two
  });

  it('insert with empty/undefined text is a no-op', () => {
    const s = fromBuffer('abc', 1);
    expect(applyCursorEdit(s, 'insert', '')).toEqual({ kind: 'unchanged', state: s });
    expect(applyCursorEdit(s, 'insert', undefined)).toEqual({ kind: 'unchanged', state: s });
  });

  it('backspace removes the whole code point before the cursor, never a lone surrogate', () => {
    const s = fromBuffer('a' + EMOJI + 'b', 2); // cursor right after the emoji
    const result = applyCursorEdit(s, 'backspace');
    expect(result.kind).toBe('edited');
    expect(toBuffer(result.state)).toBe('ab');
    expect(result.state.cursor).toBe(1);
  });

  it('backspace at position 0 is a no-op', () => {
    const s = fromBuffer('abc', 0);
    expect(applyCursorEdit(s, 'backspace')).toEqual({ kind: 'unchanged', state: s });
  });

  it('delete removes the whole code point at the cursor without moving it', () => {
    const s = fromBuffer('a' + EMOJI + 'b', 1); // cursor right before the emoji
    const result = applyCursorEdit(s, 'delete');
    expect(result.kind).toBe('edited');
    expect(toBuffer(result.state)).toBe('ab');
    expect(result.state.cursor).toBe(1);
  });

  it('delete at end-of-buffer is a no-op', () => {
    const s = fromBuffer('abc', 3);
    expect(applyCursorEdit(s, 'delete')).toEqual({ kind: 'unchanged', state: s });
  });

  it('a mid-buffer edit sequence (insert, then backspace) composes correctly', () => {
    const s0 = fromBuffer('ac', 1);
    const s1 = applyCursorEdit(s0, 'insert', 'bb');
    expect(toBuffer(s1.state)).toBe('abbc');
    expect(s1.state.cursor).toBe(3);
    const s2 = applyCursorEdit(s1.state, 'backspace');
    expect(toBuffer(s2.state)).toBe('abc');
    expect(s2.state.cursor).toBe(2);
  });
});
