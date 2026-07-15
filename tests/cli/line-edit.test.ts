import { describe, it, expect } from 'vitest';
import type { Key } from 'node:readline';
import { editInput, EMPTY_INPUT, InputHistory, type InputState } from '../../src/cli/repl/line-edit.js';

// Sprint 224 T-224-019 v2 — pure pieces of the bottom-pinned TUI.
// Hermetic: no real TTY, no ANSI side-effects — only the reducers/builders.

const key = (name: string, extra: Partial<Key> = {}): Key =>
  ({ name, sequence: extra.sequence, ctrl: extra.ctrl ?? false, meta: false, shift: false, ...extra }) as Key;
const ch = (c: string): Key => ({ name: c, sequence: c, ctrl: false, meta: false, shift: false }) as Key;

describe('editInput — line editing (T-224-019 v2)', () => {
  it('inserts printable chars at the cursor', () => {
    let s: InputState = EMPTY_INPUT;
    s = editInput(s, ch('a')).state;
    s = editInput(s, ch('b')).state;
    expect(s).toEqual({ buffer: 'ab', cursor: 2 });
  });

  it('inserts Turkish chars correctly', () => {
    const r = editInput({ buffer: 'i', cursor: 1 }, ch('ş'));
    expect(r.state).toEqual({ buffer: 'iş', cursor: 2 });
  });

  it('backspace removes char before cursor', () => {
    const r = editInput({ buffer: 'abc', cursor: 3 }, key('backspace'));
    expect(r.state).toEqual({ buffer: 'ab', cursor: 2 });
  });

  it('backspace at start is a no-op', () => {
    const r = editInput({ buffer: 'abc', cursor: 0 }, key('backspace'));
    expect(r.state).toEqual({ buffer: 'abc', cursor: 0 });
  });

  it('delete removes char at cursor', () => {
    const r = editInput({ buffer: 'abc', cursor: 1 }, key('delete'));
    expect(r.state).toEqual({ buffer: 'ac', cursor: 1 });
  });

  it('left/right move the cursor within bounds', () => {
    expect(editInput({ buffer: 'ab', cursor: 1 }, key('left')).state.cursor).toBe(0);
    expect(editInput({ buffer: 'ab', cursor: 0 }, key('left')).state.cursor).toBe(0);
    expect(editInput({ buffer: 'ab', cursor: 1 }, key('right')).state.cursor).toBe(2);
    expect(editInput({ buffer: 'ab', cursor: 2 }, key('right')).state.cursor).toBe(2);
  });

  it('Home/End and Ctrl-A/Ctrl-E jump to edges', () => {
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('home')).state.cursor).toBe(0);
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('end')).state.cursor).toBe(3);
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('a', { ctrl: true })).state.cursor).toBe(0);
    expect(editInput({ buffer: 'abc', cursor: 1 }, key('e', { ctrl: true })).state.cursor).toBe(3);
  });

  it('Enter submits a non-empty line and clears the buffer', () => {
    const r = editInput({ buffer: 'merhaba', cursor: 7 }, key('return'));
    expect(r.submit).toBe('merhaba');
    expect(r.state).toEqual(EMPTY_INPUT);
  });

  it('Enter on empty line does not submit', () => {
    const r = editInput(EMPTY_INPUT, key('return'));
    expect(r.submit).toBeUndefined();
  });

  it('Ctrl-C signals int and clears; Ctrl-D on empty signals eof', () => {
    expect(editInput({ buffer: 'x', cursor: 1 }, key('c', { ctrl: true })).signal).toBe('int');
    expect(editInput(EMPTY_INPUT, key('d', { ctrl: true })).signal).toBe('eof');
    expect(editInput({ buffer: 'x', cursor: 1 }, key('d', { ctrl: true })).signal).toBeUndefined();
  });

  it('Ctrl-U clears the line', () => {
    expect(editInput({ buffer: 'abc', cursor: 3 }, key('u', { ctrl: true })).state).toEqual(EMPTY_INPUT);
  });

  it('↑/↓ request history navigation', () => {
    expect(editInput(EMPTY_INPUT, key('up')).history).toBe(-1);
    expect(editInput(EMPTY_INPUT, key('down')).history).toBe(1);
  });

  it('multi-char paste sequence inserts as one block', () => {
    const r = editInput(EMPTY_INPUT, ch('hello world'));
    expect(r.state).toEqual({ buffer: 'hello world', cursor: 11 });
  });

  it('drops lone control bytes (e.g. bare ESC)', () => {
    const r = editInput(EMPTY_INPUT, { name: 'escape', sequence: '\x1b', ctrl: false } as Key);
    expect(r.state).toEqual(EMPTY_INPUT);
  });

  // REPL-575 K2 — escape-injection: control bytes EMBEDDED in a paste whose
  // first char is printable used to reach the buffer raw and get interpreted
  // by the terminal on render. The whole sequence must be sanitized.
  it('strips embedded ANSI/control bytes from a paste (escape-injection)', () => {
    const r = editInput(EMPTY_INPUT, ch('go run main.go\x1b[2J\x1b[31mFAKE'));
    expect(r.state.buffer).toBe('go run main.go[2J[31mFAKE');
    expect(r.state.buffer).not.toContain('\x1b');
    expect(r.state.cursor).toBe(r.state.buffer.length);
  });

  it('drops a printable-headed paste that normalizes to nothing (DEL + control tail)', () => {
    // \x7f (DEL) passes the head-guard (≥ 0x20) but normalizePasted strips it.
    const r = editInput(EMPTY_INPUT, { name: undefined, sequence: '\x7f\x1b', ctrl: false } as unknown as Key);
    expect(r.state).toEqual(EMPTY_INPUT);
  });

  it('still drops control-HEADED chunks whole (unmapped CSI stays out of the buffer)', () => {
    const r = editInput(EMPTY_INPUT, { name: undefined, sequence: '\x1b[1;5C', ctrl: false } as unknown as Key);
    expect(r.state).toEqual(EMPTY_INPUT);
  });

  it('keeps unicode + interior tab intact while sanitizing', () => {
    const r = editInput(EMPTY_INPUT, ch('naïve\t🚀\x1bZ'));
    expect(r.state.buffer).toBe('naïve\t🚀Z');
  });
});

describe('InputHistory — navigation (T-224-019 v2)', () => {
  it('↑ walks older entries, ↓ returns toward the live draft', () => {
    const h = new InputHistory();
    h.push('first'); h.push('second');
    expect(h.navigate(-1, 'live')).toBe('second'); // most recent first
    expect(h.navigate(-1, 'live')).toBe('first');
    expect(h.navigate(-1, 'live')).toBe('first');  // clamp at oldest
    expect(h.navigate(1, 'live')).toBe('second');
    expect(h.navigate(1, 'live')).toBe('live');    // back to draft
  });

  it('preserves the live draft when starting to navigate up', () => {
    const h = new InputHistory();
    h.push('old');
    expect(h.navigate(-1, 'typing...')).toBe('old');
    expect(h.navigate(1, 'typing...')).toBe('typing...'); // restored draft
  });

  it('empty history → navigation returns the live line', () => {
    const h = new InputHistory();
    expect(h.navigate(-1, 'x')).toBe('x');
  });

  it('does not store consecutive duplicates', () => {
    const h = new InputHistory();
    h.push('same'); h.push('same');
    expect(h.navigate(-1, 'l')).toBe('same');
    expect(h.navigate(-1, 'l')).toBe('same'); // only one entry
  });
});

describe('InputHistory.search — Ctrl-R reverse search', () => {
  it('returns matching entries most-recent-first', () => {
    const h = new InputHistory();
    h.push('deploy prod'); h.push('git status'); h.push('deploy staging');
    expect(h.search('deploy')).toEqual(['deploy staging', 'deploy prod']);
  });
  it('is case-insensitive', () => {
    const h = new InputHistory(); h.push('Build All');
    expect(h.search('build')).toEqual(['Build All']);
  });
  it('empty query → all entries most-recent-first', () => {
    const h = new InputHistory(); h.push('a'); h.push('b');
    expect(h.search('')).toEqual(['b', 'a']);
  });
  it('no match → empty', () => {
    const h = new InputHistory(); h.push('x');
    expect(h.search('zzz')).toEqual([]);
  });
});
