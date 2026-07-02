// tests/cli/repl/term-compat-matrix.test.ts
// Sprint 359 Task 359-007 — TERM-COMPAT (Sıra-52): REPL compat test-matrix.
//
// `ink-testing-library` is NOT a project dependency (package.json has only
// `ink`; confirmed no `node_modules/ink-testing-library`). This is already a
// known constraint recorded twice elsewhere in this suite:
//   - tests/cli/repl-tool-multi-tag-repro.test.ts:19-24 (sprint 285)
//   - tests/cli/repl-surface-wire.test.tsx:9-20        (sprint 354)
// Both land on the same fallback: pull the PURE, EXPORTED logic out of the
// Ink components and test it directly instead of mounting Ink — exactly what
// this task's own wording asks for ("gerçek-PTY değil, seam'li"). This file
// follows that established pattern rather than adding a new devDependency
// (package.json is outside this task's write scope; worker rules also
// forbid running `npm install`).
//
// Seams exercised (all real exports, no source changes):
//   - editInput + InputHistory + EMPTY_INPUT (src/cli/repl/line-edit.ts)
//     → arrow keys, Home/End, Ctrl-A/E/U/C/D, Backspace/Delete, Tab, history
//       nav, and the "insert key.sequence at cursor" path a same-line
//       (no embedded \r/\n) OS paste flows through in the real
//       src/cli/repl/input-bar.tsx (its own early-return only fires when the
//       chunk contains \r or \n — see input-bar.tsx:133-146).
//   - buildLiveFooter + DEFAULT_LIVE_FOOTER_LABELS (src/cli/helpers/live-footer.ts)
//     → the `width` option is exactly what changes on a terminal resize
//       (process.stdout.columns re-measure), made deterministic via override.
//   - theme.strip (src/cli/helpers/theme.ts) → ANSI-safe length assertions,
//     independent of whether the test process is a TTY.
//
// NOT covered by a seam (nogo forbids touching app.tsx/input-bar.ts to
// expose one) — see docs/reference/terminal-compat.md for the honest
// tested-vs-manual-checklist breakdown and the real-PTY smoke commands:
//   - real bracketed multi-line paste → single-message merge
//   - paste + trailing-newline auto-submit
//   - inkToKey's Home/End escape-sequence detection (per-terminal bytes)
//   - process.stdin.setRawMode negotiation (real TTY only)
//   - Ink's own resize reconciliation (internal to the `ink` package)
//
// Hermetic: no disk I/O, no process.spawn, no Ink render, no real timers —
// pure in-memory state through exported pure functions only.

import { describe, it, expect } from 'vitest';
import type { Key } from 'node:readline';
import {
  editInput,
  EMPTY_INPUT,
  InputHistory,
  type InputState,
} from '../../../src/cli/repl/line-edit.js';
import {
  buildLiveFooter,
  DEFAULT_LIVE_FOOTER_LABELS,
  type LiveFooterState,
} from '../../../src/cli/helpers/live-footer.js';
import { theme } from '../../../src/cli/helpers/theme.js';

const state = (buffer: string, cursor: number): InputState => ({ buffer, cursor });

// ─── 1. Resize — buildLiveFooter width seam ─────────────────────────────────

describe('term-compat — Resize (buildLiveFooter width seam)', () => {
  it('narrow width truncates a long single-field line with a trailing ellipsis', () => {
    const footerState: LiveFooterState = {
      running: 'a very long task label that will not fit a narrow terminal width',
    };
    const [line] = buildLiveFooter(footerState, { width: 20 });
    const stripped = theme.strip(line ?? '');
    expect(stripped).toHaveLength(20);
    expect(stripped.startsWith(`${DEFAULT_LIVE_FOOTER_LABELS.running}: `)).toBe(true);
    expect(stripped.endsWith('…')).toBe(true);
  });

  it('wide width leaves a short line untouched (no truncation)', () => {
    const footerState: LiveFooterState = { running: 'short task' };
    const [line] = buildLiveFooter(footerState, { width: 200 });
    expect(theme.strip(line ?? '')).toBe(`${DEFAULT_LIVE_FOOTER_LABELS.running}: short task`);
  });

  it('width=1 edge case (resize to minimal size) truncates safely without throwing', () => {
    const footerState: LiveFooterState = { running: 'anything' };
    expect(() => buildLiveFooter(footerState, { width: 1 })).not.toThrow();
    const [line] = buildLiveFooter(footerState, { width: 1 });
    expect(theme.strip(line ?? '')).toBe('R');
  });

  it('a simulated live resize (width change across two renders) truncates every field independently', () => {
    const now = new Date('2026-07-02T14:05:00.000Z');
    const footerState: LiveFooterState = {
      running: 'sprint-359 task-007 executing long-running verification pass',
      startedAt: '2026-07-02T14:00:00.000Z',
      provider: { name: 'claude-sonnet-5-longnamevariant', healthy: true },
      auth: 'logged-in',
      next: 'sprint-359 task-008 queued and waiting for dependency resolution',
    };
    const wide = buildLiveFooter(footerState, { width: 200, now });
    const narrow = buildLiveFooter(footerState, { width: 8, now });

    expect(wide).toHaveLength(5);
    expect(narrow).toHaveLength(5);
    for (let i = 0; i < narrow.length; i++) {
      const strippedNarrow = theme.strip(narrow[i] ?? '');
      const strippedWide = theme.strip(wide[i] ?? '');
      expect(strippedNarrow.length).toBeLessThanOrEqual(8);
      // The resize genuinely changed the render — narrow isn't just a
      // no-op copy of wide truncated by coincidence.
      expect(strippedNarrow).not.toBe(strippedWide);
    }
  });

  it('idle (empty) state single line also respects width after a resize', () => {
    const wide = buildLiveFooter({}, { width: 80 });
    const narrow = buildLiveFooter({}, { width: 3 });
    expect(theme.strip(wide[0] ?? '')).toBe(DEFAULT_LIVE_FOOTER_LABELS.idle);
    expect(theme.strip(narrow[0] ?? '')).toBe('id…');
  });
});

// ─── 2. Paste — editInput bulk-insert seam ─────────────────────────────────

describe('term-compat — Paste (editInput bulk-insert seam)', () => {
  it('a single-chunk paste (no embedded newline) inserts as one unit mid-buffer', () => {
    const pasted = 'XYZ-paste-chunk';
    const key = { name: pasted, sequence: pasted } as Key;
    const result = editInput(state('ab', 1), key);
    expect(result.state).toEqual({ buffer: `a${pasted}b`, cursor: 1 + pasted.length });
  });

  it('a paste at the very start of the buffer prepends and advances the cursor', () => {
    const pasted = 'PREFIX-';
    const key = { name: pasted, sequence: pasted } as Key;
    const result = editInput(state('end', 0), key);
    expect(result.state).toEqual({ buffer: `${pasted}end`, cursor: pasted.length });
  });

  it('a paste at the very end of the buffer appends, cursor lands at the new end', () => {
    const pasted = '-SUFFIX';
    const key = { name: pasted, sequence: pasted } as Key;
    const result = editInput(state('start', 5), key);
    const expectedBuffer = `start${pasted}`;
    expect(result.state).toEqual({ buffer: expectedBuffer, cursor: expectedBuffer.length });
  });

  it('a stray unmapped raw control byte at the sequence head is dropped whole, not partially inserted', () => {
    const before = state('keep', 2);
    const lone = editInput(before, { name: '\x1b', sequence: '\x1b' } as Key);
    expect(lone.state).toEqual(before);

    const garbled = editInput(before, { name: '\x01ABC', sequence: '\x01ABC' } as Key);
    // The whole chunk is discarded — NOT partially inserted as "ABC".
    expect(garbled.state).toEqual(before);
  });

  it('a literal tab embedded inside a multi-char paste is preserved as-is (normalization only applies to a lone standalone Tab keypress)', () => {
    const pasted = 'a\tb';
    const key = { name: pasted, sequence: pasted } as Key;
    const result = editInput(state('', 0), key);
    expect(result.state).toEqual({ buffer: 'a\tb', cursor: 3 });
  });
});

// ─── 3. Arrow / cursor / history — editInput + InputHistory seam ──────────

describe('term-compat — Arrow / cursor movement (editInput seam)', () => {
  it('left/right move the cursor within bounds and clamp at both edges', () => {
    expect(editInput(state('hello', 2), { name: 'left' } as Key).state).toEqual(state('hello', 1));
    expect(editInput(state('hello', 2), { name: 'right' } as Key).state).toEqual(state('hello', 3));
    // Clamp at the start.
    expect(editInput(state('ab', 0), { name: 'left' } as Key).state).toEqual(state('ab', 0));
    // Clamp at the end.
    expect(editInput(state('ab', 2), { name: 'right' } as Key).state).toEqual(state('ab', 2));
  });

  it('Home/End jump to the start/end of the buffer', () => {
    expect(editInput(state('hello', 3), { name: 'home' } as Key).state).toEqual(state('hello', 0));
    expect(editInput(state('hello', 3), { name: 'end' } as Key).state).toEqual(state('hello', 5));
  });

  it('Backspace/Delete edit around the cursor and no-op safely at buffer boundaries', () => {
    expect(editInput(state('hello', 3), { name: 'backspace' } as Key).state).toEqual(state('helo', 2));
    expect(editInput(state('hello', 0), { name: 'backspace' } as Key).state).toEqual(state('hello', 0));
    expect(editInput(state('hello', 2), { name: 'delete' } as Key).state).toEqual(state('helo', 2));
    expect(editInput(state('hello', 5), { name: 'delete' } as Key).state).toEqual(state('hello', 5));
  });

  it('up/down keys surface a history-navigation signal without mutating the buffer', () => {
    const base = state('draft', 2);
    const up = editInput(base, { name: 'up' } as Key);
    const down = editInput(base, { name: 'down' } as Key);
    expect(up).toEqual({ state: base, history: -1 });
    expect(down).toEqual({ state: base, history: 1 });
  });

  it('InputHistory older/newer navigation preserves the in-progress draft (↑↑↑ then ↓↓↓ returns to it)', () => {
    const history = new InputHistory();
    history.push('cmd1');
    history.push('cmd2');
    const live = 'draft-wip';

    expect(history.navigate(-1, live)).toBe('cmd2'); // ↑ newest first
    expect(history.navigate(-1, live)).toBe('cmd1'); // ↑ older
    expect(history.navigate(-1, live)).toBe('cmd1'); // ↑ clamps at oldest, no wrap
    expect(history.navigate(1, live)).toBe('cmd2');  // ↓ newer
    expect(history.navigate(1, live)).toBe(live);    // ↓ back to the preserved draft
  });

  it('consecutive duplicate submits are deduped, non-consecutive duplicates are kept (most-recent-first)', () => {
    const history = new InputHistory();
    history.push('one');
    history.push('one'); // consecutive dup — suppressed
    expect(history.search('')).toEqual(['one']);

    history.push('two');
    history.push('three');
    expect(history.search('')).toEqual(['three', 'two', 'one']);
  });

  it('bounded history (max=200) evicts the oldest entry once the cap is exceeded', () => {
    const history = new InputHistory();
    for (let i = 0; i <= 200; i++) history.push(`cmd-${i}`); // 201 pushes
    const all = history.search('');
    expect(all).toHaveLength(200);
    expect(all[0]).toBe('cmd-200'); // most recent first
    expect(all[all.length - 1]).toBe('cmd-1'); // cmd-0 evicted
  });
});

// ─── 4. Raw-mode control bindings — editInput ctrl seam ───────────────────

describe('term-compat — Raw-mode control bindings (editInput ctrl seam)', () => {
  it('Ctrl-C clears the buffer and signals an interrupt, regardless of content/cursor', () => {
    const result = editInput(state('anything typed', 5), { name: 'c', ctrl: true } as Key);
    expect(result.state).toEqual(EMPTY_INPUT);
    expect(result.signal).toBe('int');
  });

  it('Ctrl-D signals eof only on an empty buffer; on a non-empty buffer it is a no-op', () => {
    const onEmpty = editInput(EMPTY_INPUT, { name: 'd', ctrl: true } as Key);
    expect(onEmpty.signal).toBe('eof');
    expect(onEmpty.state).toEqual(EMPTY_INPUT);

    const nonEmpty = state('x', 1);
    const onNonEmpty = editInput(nonEmpty, { name: 'd', ctrl: true } as Key);
    expect(onNonEmpty.signal).toBeUndefined();
    expect(onNonEmpty.state).toEqual(nonEmpty);
  });

  it('Ctrl-U clears the whole line regardless of cursor position', () => {
    const result = editInput(state('hello world', 5), { name: 'u', ctrl: true } as Key);
    expect(result.state).toEqual(EMPTY_INPUT);
  });

  it('Ctrl-A/Ctrl-E (raw-mode emacs-style jump) are equivalent to Home/End', () => {
    const base = state('hello', 2);
    const ctrlA = editInput(base, { name: 'a', ctrl: true } as Key);
    const home = editInput(base, { name: 'home' } as Key);
    expect(ctrlA.state).toEqual(home.state);

    const ctrlE = editInput(base, { name: 'e', ctrl: true } as Key);
    const end = editInput(base, { name: 'end' } as Key);
    expect(ctrlE.state).toEqual(end.state);
  });

  it('a lone standalone Tab keypress (raw byte 0x09) inserts two spaces', () => {
    const key = { name: '\t', sequence: '\t' } as Key;
    const result = editInput(state('ab', 1), key);
    expect(result.state).toEqual({ buffer: 'a  b', cursor: 3 });
  });

  it('an unmapped Ctrl-combo (e.g. Ctrl-K, unbound in this app) passes through safely — no throw, no mutation', () => {
    const before = state('safe', 2);
    const result = editInput(before, { name: 'k', ctrl: true } as Key);
    expect(result.state).toEqual(before);
    expect(result.signal).toBeUndefined();
    expect(result.submit).toBeUndefined();
  });
});
