import { describe, it, expect } from 'vitest';
import type { Key } from 'node:readline';
import { editInput, EMPTY_INPUT, type InputState } from '../../src/cli/repl/line-edit.js';

// Task 380-012 — CURSOR-MODEL-WIRE (ADR-D-010 KALAN (a)).
// line-edit.ts's editInput() used raw UTF-16 code-unit arithmetic for
// Backspace/Delete/Left/Right, so a single step could bisect a surrogate
// pair (e.g. an emoji), leaving a dangling lone surrogate in the buffer.
// These tests prove the code-point-safe wiring via cursor-model.ts.
// Hermetic: no real TTY, no ANSI side-effects — only the reducers.

const key = (name: string, extra: Partial<Key> = {}): Key =>
  ({ name, sequence: extra.sequence, ctrl: extra.ctrl ?? false, meta: false, shift: false, ...extra }) as Key;
const ch = (c: string): Key => ({ name: c, sequence: c, ctrl: false, meta: false, shift: false }) as Key;

const ROCKET = '🚀'; // U+1F680, surrogate pair 🚀

/** True if `s` contains an unpaired (dangling) UTF-16 surrogate — i.e. mojibake. */
function hasDanglingSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const isHigh = code >= 0xd800 && code <= 0xdbff;
    const isLow = code >= 0xdc00 && code <= 0xdfff;
    if (isHigh) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++; // valid pair — skip the low surrogate we just verified
    } else if (isLow) {
      return true; // low surrogate with no preceding high surrogate
    }
  }
  return false;
}

describe('editInput — code-point-safe cursor stepping (Task 380-012, ADR-D-010 KALAN (a))', () => {
  it('typing a surrogate-pair emoji then a single Backspace leaves no mojibake', () => {
    let s: InputState = EMPTY_INPUT;
    s = editInput(s, ch(ROCKET)).state;
    expect(s).toEqual({ buffer: ROCKET, cursor: 2 }); // inserted as one whole unit
    const r = editInput(s, key('backspace'));
    expect(hasDanglingSurrogate(r.state.buffer)).toBe(false);
    expect(r.state).toEqual(EMPTY_INPUT);
  });

  it('a single Delete removes a whole emoji ahead of the cursor, no dangling surrogate', () => {
    const s: InputState = { buffer: ROCKET, cursor: 0 };
    const r = editInput(s, key('delete'));
    expect(hasDanglingSurrogate(r.state.buffer)).toBe(false);
    expect(r.state).toEqual(EMPTY_INPUT);
  });

  it('Left steps over a mid-buffer emoji as ONE atomic move, not into its middle', () => {
    const s: InputState = { buffer: 'a' + ROCKET + 'b', cursor: 3 }; // just after the emoji
    const r = editInput(s, key('left'));
    expect(r.state.cursor).toBe(1); // lands before the whole emoji, not mid-surrogate
    expect(r.state.buffer).toBe('a' + ROCKET + 'b'); // Left never mutates the buffer
  });

  it('Right steps over a mid-buffer emoji as ONE atomic move, not into its middle', () => {
    const s: InputState = { buffer: 'a' + ROCKET + 'b', cursor: 1 }; // just before the emoji
    const r = editInput(s, key('right'));
    expect(r.state.cursor).toBe(3); // lands after the whole emoji
  });

  it('Backspace inside a larger buffer removes only the whole emoji, preserving surrounding text', () => {
    const buffer = 'hi ' + ROCKET + '!';
    const s: InputState = { buffer, cursor: buffer.length - 1 }; // right after the emoji, before '!'
    const r = editInput(s, key('backspace'));
    expect(hasDanglingSurrogate(r.state.buffer)).toBe(false);
    expect(r.state).toEqual({ buffer: 'hi !', cursor: 3 });
  });

  it('Delete inside a larger buffer removes only the whole emoji, preserving surrounding text', () => {
    const buffer = 'hi ' + ROCKET + '!';
    const s: InputState = { buffer, cursor: 3 }; // right before the emoji
    const r = editInput(s, key('delete'));
    expect(hasDanglingSurrogate(r.state.buffer)).toBe(false);
    expect(r.state).toEqual({ buffer: 'hi !', cursor: 3 });
  });

  it('Backspace at buffer start next to an emoji is still a clean no-op', () => {
    const s: InputState = { buffer: ROCKET, cursor: 0 };
    const r = editInput(s, key('backspace'));
    expect(r.state).toEqual(s);
  });

  it('Left/Right stay code-point-safe across a run of consecutive emoji', () => {
    const buffer = ROCKET + ROCKET; // two surrogate pairs back to back
    let s: InputState = { buffer, cursor: 0 };
    s = editInput(s, key('right')).state;
    expect(s.cursor).toBe(2); // past the first whole emoji only
    s = editInput(s, key('right')).state;
    expect(s.cursor).toBe(4); // past both
    s = editInput(s, key('left')).state;
    expect(s.cursor).toBe(2); // back to between the two emoji, not mid-surrogate
  });

  it('plain-ASCII Backspace/Delete/Left/Right are unaffected (code-point index == UTF-16 offset)', () => {
    expect(editInput({ buffer: 'abc', cursor: 3 }, key('backspace')).state).toEqual({ buffer: 'ab', cursor: 2 });
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('delete')).state).toEqual({ buffer: 'ac', cursor: 1 });
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('left')).state.cursor).toBe(0);
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('right')).state.cursor).toBe(2);
  });
});
