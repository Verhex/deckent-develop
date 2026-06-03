// ═══ line-edit — pure input-line editing + history for the Ink REPL ══════════
//
// Testable reducers (no I/O, no terminal): the Ink InputBar feeds parsed keys
// through editInput() and renders the resulting state with a visible caret, and
// uses InputHistory for ↑/↓ recall. Extracted from the retired chat-pinned-tui
// (scroll-region TUI) so the Ink path owns its line-editing core cleanly.

import type { Key } from 'node:readline';

/** Editable input-line state (pure). */
export interface InputState {
  buffer: string;
  /** Cursor index into `buffer` (0..buffer.length). */
  cursor: number;
}

export const EMPTY_INPUT: InputState = Object.freeze({ buffer: '', cursor: 0 });

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
    case 'backspace':
      if (cursor === 0) return { state };
      return { state: { buffer: buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor: cursor - 1 } };
    case 'delete':
      if (cursor >= buffer.length) return { state };
      return { state: { buffer: buffer.slice(0, cursor) + buffer.slice(cursor + 1), cursor } };
    case 'left':
      return { state: { buffer, cursor: Math.max(0, cursor - 1) } };
    case 'right':
      return { state: { buffer, cursor: Math.min(buffer.length, cursor + 1) } };
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
      // Drop control bytes (e.g. lone ESC, unknown CSI) — only insert printables.
      if (ch.charCodeAt(0) < 0x20 && ch !== '\t') return { state };
      const text = ch === '\t' ? '  ' : ch; // tab → two spaces (no completer here)
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
}
