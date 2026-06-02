import { describe, it, expect } from 'vitest';

import {
  ReplHistory,
  handleReplCommand,
  createSigintTracker,
  createMultiLineAccumulator,
} from '../../src/cli/commands/chat-repl-ux.js';

// ─── ReplHistory ─────────────────────────────────────────────────────

describe('ReplHistory — ring buffer', () => {
  it('starts empty with size 0', () => {
    const h = new ReplHistory();
    expect(h.size).toBe(0);
    expect(h.getAt(0)).toBeUndefined();
  });

  it('push stores entry and navigateUp returns it', () => {
    const h = new ReplHistory();
    h.push('hello');
    expect(h.size).toBe(1);
    expect(h.navigateUp()).toBe('hello');
  });

  it('navigateUp then navigateDown returns undefined (back at current line)', () => {
    const h = new ReplHistory();
    h.push('first');
    h.push('second');
    expect(h.navigateUp()).toBe('second');
    expect(h.navigateUp()).toBe('first');
    expect(h.navigateDown()).toBe('second');
    expect(h.navigateDown()).toBeUndefined();
  });

  it('respects capacity (ring buffer evicts oldest)', () => {
    const h = new ReplHistory(3);
    h.push('a');
    h.push('b');
    h.push('c');
    h.push('d');
    expect(h.size).toBe(3);
    expect(h.getAt(0)).toBe('d');
    expect(h.getAt(1)).toBe('c');
    expect(h.getAt(2)).toBe('b');
  });

  it('does not push empty or whitespace-only entries', () => {
    const h = new ReplHistory();
    h.push('');
    h.push('   ');
    h.push('\t');
    expect(h.size).toBe(0);
  });

  it('reset() brings navIndex back so navigateUp starts from latest', () => {
    const h = new ReplHistory();
    h.push('alpha');
    h.push('beta');
    h.navigateUp(); // beta
    h.navigateUp(); // alpha
    h.reset();
    expect(h.navigateUp()).toBe('beta'); // back to newest
  });
});

// ─── handleReplCommand ───────────────────────────────────────────────

describe('handleReplCommand — prompt slash commands', () => {
  it('/exit → action: exit', () => {
    expect(handleReplCommand('/exit')).toEqual({ action: 'exit' });
  });

  it('/quit → action: exit (alias)', () => {
    expect(handleReplCommand('/quit')).toEqual({ action: 'exit' });
  });

  it('/clear → action: clear', () => {
    expect(handleReplCommand('/clear')).toEqual({ action: 'clear' });
  });

  it('regular text → action: none', () => {
    expect(handleReplCommand('hello world')).toEqual({ action: 'none' });
  });

  it('/EXIT (uppercase) → action: exit (case-insensitive)', () => {
    expect(handleReplCommand('/EXIT')).toEqual({ action: 'exit' });
  });

  it('unknown slash command → action: none', () => {
    expect(handleReplCommand('/unknown')).toEqual({ action: 'none' });
  });
});

// ─── createSigintTracker (Ctrl-C graceful) ───────────────────────────

describe('createSigintTracker — SIGINT state machine', () => {
  it('first handle() returns cancel (message cancel, not exit)', () => {
    const tracker = createSigintTracker();
    expect(tracker.handle()).toBe('cancel');
  });

  it('second handle() returns exit (user pressed Ctrl-C twice)', () => {
    const tracker = createSigintTracker();
    tracker.handle(); // cancel
    expect(tracker.handle()).toBe('exit');
  });

  it('reset() after first handle allows cancel again', () => {
    const tracker = createSigintTracker();
    tracker.handle(); // cancel
    tracker.reset();
    expect(tracker.handle()).toBe('cancel'); // not exit
  });

  it('multiple resets do not affect handle sequence', () => {
    const tracker = createSigintTracker();
    tracker.reset();
    tracker.reset();
    expect(tracker.handle()).toBe('cancel');
    expect(tracker.handle()).toBe('exit');
  });
});

// ─── createMultiLineAccumulator ──────────────────────────────────────

describe('createMultiLineAccumulator — multi-line buffer', () => {
  it('single line without trailing backslash is complete', () => {
    const acc = createMultiLineAccumulator();
    const result = acc.append('hello world');
    expect(result.complete).toBe(true);
    expect(result.text).toBe('hello world');
  });

  it('line ending with backslash is not complete yet', () => {
    const acc = createMultiLineAccumulator();
    const result = acc.append('line one\\');
    expect(result.complete).toBe(false);
  });

  it('second line without backslash completes multi-line input', () => {
    const acc = createMultiLineAccumulator();
    acc.append('line one\\');
    const result = acc.append('line two');
    expect(result.complete).toBe(true);
    expect(result.text).toBe('line one\nline two');
  });

  it('reset() discards accumulated parts', () => {
    const acc = createMultiLineAccumulator();
    acc.append('partial\\');
    acc.reset();
    const result = acc.append('fresh start');
    expect(result.complete).toBe(true);
    expect(result.text).toBe('fresh start');
  });

  it('three-line continuation joins all parts with newline', () => {
    const acc = createMultiLineAccumulator();
    acc.append('a\\');
    acc.append('b\\');
    const result = acc.append('c');
    expect(result.complete).toBe(true);
    expect(result.text).toBe('a\nb\nc');
  });
});
