// ═══ chat-pinned-tui — true bottom-pinned REPL TUI (Sprint 224 T-224-019 v2) ══
//
// Claude-code-style fixed input bar: the `› ` input line is PINNED to the last
// terminal row; provider output streams in a DECSTBM scroll region ABOVE it.
// readline cannot do this (it owns the cursor and reprompts wherever the cursor
// is, so the prompt descends through the screen). Here we own the cursor: a
// scroll region constrains output to rows 1..R-1, and the input line is drawn
// manually on row R, untouched by output scrolling.
//
// Architecture (Alperen's choice): scroll-region, NO native scrollback during
// the session — lines scrolled above the top margin are discarded by the
// terminal (DECSTBM trade-off). On exit the region is reset and the cursor
// restored. NON-TTY callers never use this (entry.ts keeps the pipe path).
//
// The pure pieces (input-line editing, key interpretation, history) are split
// out as testable reducers; the controller wires them to real ANSI emission.

import { emitKeypressEvents, type Key } from 'node:readline';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const DIM = `${ESC}[2m`;
const TEAL = `${ESC}[38;2;77;184;164m`; // kraken teal (matches splash)

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

/** ANSI builders for the pinned layout (pure → testable). */
export const tui = {
  /** Set the scroll region to rows 1..bottom (1-based, inclusive). */
  setScrollRegion: (bottom: number): string => `${ESC}[1;${bottom}r`,
  /** Reset the scroll region to the full screen. */
  resetScrollRegion: (): string => `${ESC}[r`,
  /** Move the cursor to (row,col), 1-based. */
  moveTo: (row: number, col: number): string => `${ESC}[${row};${col}H`,
  /** Clear the current line entirely. */
  clearLine: (): string => `${ESC}[2K`,
  hideCursor: (): string => `${ESC}[?25l`,
  showCursor: (): string => `${ESC}[?25h`,
  /**
   * Render the pinned input line for row R: clear it, draw the prompt + buffer,
   * and position the cursor at the edit point. `promptPlain` is the visible
   * prompt text (its display width is used for cursor math; pass it WITHOUT
   * color so the width is correct, color is added separately).
   */
  renderInput: (row: number, promptPlain: string, state: InputState): string => {
    const promptColored = `${TEAL}${promptPlain}${RESET}`;
    const cursorCol = promptPlain.length + state.cursor + 1;
    return (
      `${ESC}[${row};1H${ESC}[2K${promptColored}${state.buffer}` +
      `${ESC}[${row};${cursorCol}H`
    );
  },
};

/**
 * Localized labels injected by the caller (i18n-first — this mechanism module
 * is string-free; the REPL resolves these via getMessage). English defaults
 * keep the controller usable standalone without forcing a locale.
 */
export interface TuiLabels {
  /** Confirm-modal hint, e.g. '(y = allow · a = always · N = deny)'. */
  confirmHint: string;
  confirmGranted: string;
  confirmAlways: string;
  confirmDenied: string;
}

export const DEFAULT_TUI_LABELS: TuiLabels = Object.freeze({
  confirmHint: '(y = allow · a = always allow · N = deny)',
  confirmGranted: 'allowed',
  confirmAlways: 'always allowed',
  confirmDenied: 'denied',
});

/** Options for the live controller. */
export interface PinnedTuiOptions {
  out: NodeJS.WriteStream;
  input: NodeJS.ReadStream;
  /** Visible prompt (default '› '). */
  prompt?: string;
  /** Localized labels (default English). */
  labels?: TuiLabels;
}

/**
 * Live bottom-pinned TUI controller. Owns raw-mode stdin + the scroll region.
 *
 * Usage:
 *   const ctl = new PinnedTui({ out: process.stdout, input: process.stdin });
 *   ctl.start();
 *   for await (const line of ctl.lines()) { ... ctl.write(token) ... }
 *   ctl.stop();
 *
 * `write(text)` streams provider output into the scroll region above the input;
 * `lines()` yields submitted input lines. `setThinking()` shows a transient
 * status in the output region. Designed for a TTY only.
 */
export class PinnedTui {
  private readonly out: NodeJS.WriteStream;
  private readonly input: NodeJS.ReadStream;
  private readonly promptPlain: string;
  private readonly labels: TuiLabels;
  private state: InputState = EMPTY_INPUT;
  private readonly history = new InputHistory();
  private outCol = 1; // current column of the streaming output line (1-based)
  private started = false;
  private closed = false;
  private readonly queue: string[] = [];
  private wake: (() => void) | null = null;
  private onInt: (() => void) | null = null;
  /** When set, the next y/a/n keystroke resolves a pending confirm modal. */
  private pendingConfirm: ((answer: 'y' | 'a' | 'n') => void) | null = null;
  private readonly keyListener: (str: string | undefined, key: Key) => void;
  private readonly resizeListener: () => void;

  constructor(opts: PinnedTuiOptions) {
    this.out = opts.out;
    this.input = opts.input;
    this.promptPlain = opts.prompt ?? '› ';
    this.labels = opts.labels ?? DEFAULT_TUI_LABELS;
    this.keyListener = (_str, key) => this.handleKey(key);
    this.resizeListener = () => this.onResize();
  }

  private get rows(): number { return this.out.rows && this.out.rows > 2 ? this.out.rows : 24; }
  private get inputRow(): number { return this.rows; }
  private get outBottom(): number { return this.rows - 1; }

  /** Enter raw mode, install the scroll region, draw the input line. */
  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.input.isTTY) this.input.setRawMode(true);
    emitKeypressEvents(this.input);
    this.input.on('keypress', this.keyListener);
    this.out.on('resize', this.resizeListener);
    // Park output at the bottom of the scroll region; draw the pinned input.
    this.out.write(
      tui.setScrollRegion(this.outBottom) +
      tui.moveTo(this.outBottom, 1) +
      tui.renderInput(this.inputRow, this.promptPlain, this.state),
    );
    this.outCol = 1;
  }

  /** Reset the scroll region, restore the cursor, drop listeners. */
  stop(): void {
    if (!this.started || this.closed) return;
    this.closed = true;
    this.input.off('keypress', this.keyListener);
    this.out.off('resize', this.resizeListener);
    if (this.input.isTTY) this.input.setRawMode(false);
    this.out.write(
      tui.resetScrollRegion() +
      tui.moveTo(this.rows, 1) +
      tui.showCursor() + '\n',
    );
    if (this.wake) { const w = this.wake; this.wake = null; w(); }
  }

  /** Register a Ctrl-C handler (e.g. to interrupt a turn). */
  onInterrupt(fn: () => void): void { this.onInt = fn; }

  /**
   * Stream provider output into the scroll region above the input. Handles
   * embedded newlines (scrolls the region) and keeps the input line redrawn.
   */
  write(text: string): void {
    if (text.length === 0 || this.closed) return;
    let buf = tui.hideCursor() + tui.moveTo(this.outBottom, this.outCol);
    for (const ch of text) {
      if (ch === '\n') {
        buf += '\r\n';      // newline inside the scroll region → scroll up
        this.outCol = 1;
      } else {
        buf += ch;
        this.outCol += 1;
      }
    }
    // Redraw the pinned input line and return the cursor to it.
    buf += tui.renderInput(this.inputRow, this.promptPlain, this.state) + tui.showCursor();
    this.out.write(buf);
  }

  /** Write a full line (adds a trailing newline) into the output region. */
  writeLine(text: string): void { this.write(text + '\n'); }

  /** Async iterator of submitted input lines; ends when stdin closes / EOF. */
  async *lines(): AsyncGenerator<string> {
    while (true) {
      while (this.queue.length > 0) yield this.queue.shift() as string;
      if (this.closed) return;
      await new Promise<void>((r) => { this.wake = r; });
    }
  }

  /**
   * Single-key confirm modal (claude-code style): shows `summary` + a hint on
   * the input line and resolves on the next y / a / n keystroke. `y` = once,
   * `a` = always (caller persists), `n`/anything-else = deny.
   */
  confirm(summary: string): Promise<'y' | 'a' | 'n'> {
    this.writeLine(`${TEAL}${summary}${RESET}`);
    this.out.write(
      tui.moveTo(this.inputRow, 1) + tui.clearLine() +
      `${DIM}${this.labels.confirmHint}${RESET} `,
    );
    return new Promise((resolve) => {
      this.pendingConfirm = (answer) => { this.pendingConfirm = null; resolve(answer); };
    });
  }

  private handleKey(key: Key | undefined): void {
    if (!key || this.closed) return;
    if (this.pendingConfirm) {
      const a = key.name === 'y' ? 'y' : key.name === 'a' ? 'a' : 'n';
      const done = this.pendingConfirm;
      const label = a === 'n' ? this.labels.confirmDenied : a === 'a' ? this.labels.confirmAlways : this.labels.confirmGranted;
      this.writeLine(`${DIM}→ ${label}${RESET}`);
      this.redrawInput();
      done(a);
      return;
    }
    const res = editInput(this.state, key);
    if (res.signal === 'int') {
      this.state = EMPTY_INPUT;
      this.redrawInput();
      if (this.onInt) this.onInt(); else this.stop();
      return;
    }
    if (res.signal === 'eof') { this.stop(); return; }
    if (res.history) {
      const next = this.history.navigate(res.history, this.state.buffer);
      this.state = { buffer: next, cursor: next.length };
      this.redrawInput();
      return;
    }
    if (res.submit !== undefined) {
      this.history.push(res.submit);
      // Echo the submitted line into the scroll region as the user's turn.
      this.writeLine(`${DIM}›${RESET} ${res.submit}`);
      this.queue.push(res.submit);
      if (this.wake) { const w = this.wake; this.wake = null; w(); }
    }
    this.state = res.state;
    this.redrawInput();
  }

  private redrawInput(): void {
    this.out.write(tui.renderInput(this.inputRow, this.promptPlain, this.state));
  }

  private onResize(): void {
    if (this.closed) return;
    this.out.write(
      tui.setScrollRegion(this.outBottom) +
      tui.renderInput(this.inputRow, this.promptPlain, this.state),
    );
  }
}
