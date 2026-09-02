// ═══ line-edit — pure input-line editing + history for the Ink REPL ══════════
//
// Testable reducers (no I/O, no terminal): the Ink InputBar feeds parsed keys
// through editInput() and renders the resulting state with a visible caret, and
// uses InputHistory for ↑/↓ recall. Extracted from the retired chat-pinned-tui
// (scroll-region TUI) so the Ink path owns its line-editing core cleanly.

import type { Key } from 'node:readline';
import { applyCursorEdit, moveCursor, toBuffer, segmentGraphemes, graphemeIndexAtUtf16, type CursorState } from './cursor-model.js';
import { normalizePasted } from './input-history.js';

/** Editable input-line state (pure). */
export interface InputState {
  buffer: string;
  /** Cursor index into `buffer` (0..buffer.length). */
  cursor: number;
}

export const EMPTY_INPUT: InputState = Object.freeze({ buffer: '', cursor: 0 });

// `InputState.cursor` is a raw UTF-16 offset (input-bar.tsx slices `buffer`
// with it directly), but stepping/editing by 1 UTF-16 unit can bisect a
// surrogate pair (ADR-D-010 KALAN (a)). These two helpers convert at the
// boundary so the arithmetic itself runs on cursor-model's grapheme-cluster
// `CursorState` (TERMINAL-TOOLS-005), without changing InputState's external
// UTF-16-offset contract. An offset that falls inside a cluster (a legacy
// state) snaps to the cluster start (graphemeIndexAtUtf16).
function toCursorState(buffer: string, utf16Cursor: number): CursorState {
  const graphemes = segmentGraphemes(buffer);
  return { graphemes, cursor: graphemeIndexAtUtf16(graphemes, utf16Cursor) };
}

function toUtf16Cursor(state: CursorState): number {
  return state.graphemes.slice(0, state.cursor).join('').length;
}

/** Result of feeding one key to the input editor. */
export interface EditResult {
  state: InputState;
  /** Set when Enter submitted a non-empty line. */
  submit?: string;
  /** Control signal: 'int' = Ctrl-C, 'eof' = Ctrl-D on empty line. */
  signal?: 'int' | 'eof';
  /** Navigate history: -1 = older (↑), +1 = newer (↓). */
  history?: -1 | 1;
}

/**
 * Pure input-line editor. Given the current state and a parsed key, return the
 * next state plus any submit/signal/history intent. Covers the line-editing the
 * REPL needs without readline: printable chars, Backspace, Delete, ←/→,
 * Home/End, Ctrl-A/E, Ctrl-U (clear), Ctrl-C, Ctrl-D, Enter, ↑/↓ (history).
 */
export function editInput(state: InputState, key: Key): EditResult {
  const { buffer, cursor } = state;
  const name = key.name;

  if (key.ctrl) {
    switch (name) {
      case 'c': return { state: EMPTY_INPUT, signal: 'int' };
      case 'd': return buffer.length === 0 ? { state, signal: 'eof' } : { state };
      case 'u': return { state: EMPTY_INPUT };
      case 'a': return { state: { buffer, cursor: 0 } };
      case 'e': return { state: { buffer, cursor: buffer.length } };
      default: return { state };
    }
  }

  switch (name) {
    case 'return':
    case 'enter': {
      const line = buffer;
      return { state: EMPTY_INPUT, submit: line.length > 0 ? line : undefined };
    }
    case 'backspace': {
      const edited = applyCursorEdit(toCursorState(buffer, cursor), 'backspace');
      if (edited.kind === 'unchanged') return { state };
      return { state: { buffer: toBuffer(edited.state), cursor: toUtf16Cursor(edited.state) } };
    }
    case 'delete': {
      const edited = applyCursorEdit(toCursorState(buffer, cursor), 'delete');
      if (edited.kind === 'unchanged') return { state };
      return { state: { buffer: toBuffer(edited.state), cursor: toUtf16Cursor(edited.state) } };
    }
    case 'left': {
      const moved = moveCursor(toCursorState(buffer, cursor), 'left');
      if (moved.kind === 'unchanged') return { state };
      return { state: { buffer, cursor: toUtf16Cursor(moved.state) } };
    }
    case 'right': {
      const moved = moveCursor(toCursorState(buffer, cursor), 'right');
      if (moved.kind === 'unchanged') return { state };
      return { state: { buffer, cursor: toUtf16Cursor(moved.state) } };
    }
    case 'home':
      return { state: { buffer, cursor: 0 } };
    case 'end':
      return { state: { buffer, cursor: buffer.length } };
    case 'up':
      return { state, history: -1 };
    case 'down':
      return { state, history: 1 };
    default: {
      // Printable sequence (incl. pasted text — comes as a multi-char `sequence`).
      const ch = key.sequence;
      if (ch === undefined || ch.length === 0) return { state };
      // Control byte at the HEAD = terminal key-sequence noise (lone ESC,
      // unmapped CSI like \x1b[1;5C) — drop the chunk WHOLE; sanitizing it
      // would splice its printable tail ("[1;5C") into the buffer.
      if (ch.charCodeAt(0) < 0x20 && ch !== '\t') return { state };
      // Printable-headed chunk = paste content — sanitize THROUGHOUT, not just
      // position 0 (REPL-575 K2): a paste like "go run main.go\x1b[2J…" used to
      // splice embedded ANSI bytes raw into the buffer and the terminal would
      // interpret them on render (escape-injection). normalizePasted keeps
      // \t/\n, folds CR/CRLF, strips C0+DEL.
      const cleaned = normalizePasted(ch);
      if (cleaned.length === 0) return { state };
      const text = cleaned === '\t' ? '  ' : cleaned; // tab → two spaces (no completer here)
      return { state: { buffer: buffer.slice(0, cursor) + text + buffer.slice(cursor), cursor: cursor + text.length } };
    }
  }
}

/** Bounded command history (most-recent-last). Pure navigation. */
export class InputHistory {
  private readonly items: string[] = [];
  private idx = -1; // -1 = not navigating (at the live line)
  private draft = '';

  constructor(private readonly max = 200) {}

  push(line: string): void {
    if (line.length === 0) return;
    if (this.items[this.items.length - 1] === line) { this.idx = -1; return; }
    this.items.push(line);
    if (this.items.length > this.max) this.items.shift();
    this.idx = -1;
  }

  /** Navigate; `dir` -1 = older, +1 = newer. `live` is the current unsent buffer. */
  navigate(dir: -1 | 1, live: string): string {
    if (this.items.length === 0) return live;
    if (this.idx === -1) {
      if (dir === 1) return live; // already at live line
      this.draft = live;
      this.idx = this.items.length - 1;
      return this.items[this.idx] ?? live;
    }
    this.idx += dir;
    if (this.idx >= this.items.length) { this.idx = -1; return this.draft; }
    if (this.idx < 0) { this.idx = 0; }
    return this.items[this.idx] ?? live;
  }

  /** Reverse search (Ctrl-R): entries containing `query` (case-insensitive),
   * most-recent first. Empty query → all entries (most-recent first). */
  search(query: string): string[] {
    const q = query.toLowerCase();
    const hits = q.length === 0 ? this.items.slice() : this.items.filter((e) => e.toLowerCase().includes(q));
    return hits.reverse();
  }
}
