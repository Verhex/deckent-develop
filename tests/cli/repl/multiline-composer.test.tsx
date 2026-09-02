// tests/cli/repl/multiline-composer.test.tsx
// ═══ TERMINAL-TOOLS-009 — multi-line composer (parity P0) ═══════════════════
//
// Claude Code, Codex CLI and Hermes all compose multi-line prompts in the
// terminal; Deckent's composer could only receive newlines through a paste.
// Contract (line-edit.ts, pure): Shift+Enter (kitty CSI-u), Alt/Option+Enter
// (ESC CR — what Claude Code's terminal-setup maps Shift+Enter to), Ctrl-J
// (linefeed) and a trailing `\` + Enter insert a newline; a plain Enter
// submits the whole buffer. Up/Down move between lines of a multi-line draft
// (grapheme-aware column) and fall back to history only at the first/last
// line; Home/End and Ctrl-A/E are line-local. Hermetic: pure reducer + one
// real Ink render.

import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Key } from 'node:readline';
import { editInput, EMPTY_INPUT, type InputState } from '../../../src/cli/repl/line-edit.js';
import { InputBar, inkToKey } from '../../../src/cli/repl/input-bar.js';
import { buildReplLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, ...extra } as Key);
const state = (buffer: string, cursor = buffer.length): InputState => ({ buffer, cursor });
const FAMILY = '👨‍👩‍👧';

describe('editInput — newline insertion vs submit', () => {
  it('Shift+Enter, Alt/Option+Enter and Ctrl-J (linefeed) insert a newline at the cursor', () => {
    expect(editInput(state('ab', 1), key('return', { shift: true })).state).toEqual({ buffer: 'a\nb', cursor: 2 });
    expect(editInput(state('ab', 2), key('return', { meta: true })).state).toEqual({ buffer: 'ab\n', cursor: 3 });
    const lf = editInput(state('ab', 2), key('enter'));
    expect(lf.state).toEqual({ buffer: 'ab\n', cursor: 3 });
    expect(lf.submit).toBeUndefined();
  });

  it('a trailing backslash + Enter continues the line (the backslash becomes the newline)', () => {
    const r = editInput(state('first\\'), key('return'));
    expect(r.submit).toBeUndefined();
    expect(r.state).toEqual({ buffer: 'first\n', cursor: 6 });
  });

  it('a plain Enter submits the whole multi-line buffer; a backslash NOT at the end does not continue', () => {
    const r = editInput(state('a\nb'), key('return'));
    expect(r.submit).toBe('a\nb');
    expect(r.state).toEqual(EMPTY_INPUT);
    expect(editInput(state('a\\b'), key('return')).submit).toBe('a\\b');
  });

  it('a newline-only draft is not submitted (whitespace-only stays a no-op submit)', () => {
    const r = editInput(state('\n\n'), key('return'));
    expect(r.submit).toBeUndefined();
  });
});

describe('editInput — vertical movement inside a multi-line draft', () => {
  it('Up/Down move between lines keeping the column; history only at the first/last line', () => {
    const s = state('ab\ncd', 4); // line 2, col 1
    const up = editInput(s, key('up'));
    expect(up.history).toBeUndefined();
    expect(up.state.cursor).toBe(1);
    const upAgain = editInput(up.state, key('up'));
    expect(upAgain.history).toBe(-1); // first line → history
    const down = editInput(state('ab\ncd', 1), key('down'));
    expect(down.state.cursor).toBe(4);
    expect(editInput(down.state, key('down')).history).toBe(1); // last line → history
  });

  it('column clamps to a shorter target line and is measured in graphemes (emoji-safe)', () => {
    const longThenShort = editInput(state('abcdef\nxy', 5), key('down'));
    expect(longThenShort.state.cursor).toBe('abcdef\nxy'.length); // end of "xy"
    const withEmoji = state(`a${FAMILY}b\ncd`, `a${FAMILY}b`.length); // end of line 1 = col 3 (graphemes)
    expect(editInput(withEmoji, key('down')).state.cursor).toBe(`a${FAMILY}b\ncd`.length);
    const back = editInput(state(`a${FAMILY}b\ncd`, `a${FAMILY}b\nc`.length), key('up')); // line 2 col 1
    expect(back.state.cursor).toBe(1); // before the family
  });

  it('Home/End and Ctrl-A/Ctrl-E are line-local', () => {
    const s = state('ab\ncd\nef', 4); // line 2 col 1
    expect(editInput(s, key('home')).state.cursor).toBe(3);
    expect(editInput(s, key('end')).state.cursor).toBe(5);
    expect(editInput(s, key('a', { ctrl: true })).state.cursor).toBe(3);
    expect(editInput(s, key('e', { ctrl: true })).state.cursor).toBe(5);
  });

  it('a single-line draft keeps the legacy behavior byte-identical (Up = history, Home = 0)', () => {
    expect(editInput(state('abc', 1), key('up')).history).toBe(-1);
    expect(editInput(state('abc', 1), key('home')).state.cursor).toBe(0);
  });
});

describe('inkToKey — modifiers on Enter reach the reducer', () => {
  it('maps shift/meta on return and a bare linefeed to the enter key', () => {
    const base = { return: true, shift: false, meta: false, ctrl: false } as Parameters<typeof inkToKey>[1];
    expect(inkToKey('', { ...base, shift: true })).toMatchObject({ name: 'return', shift: true });
    expect(inkToKey('', { ...base, meta: true })).toMatchObject({ name: 'return', meta: true });
    expect(inkToKey('\n', { ...base, return: false })).toMatchObject({ name: 'enter' });
  });
});

describe('InputBar — a multi-line draft renders on several lines and submits as one message', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
  const en = buildReplLabels((k) => getMessage(k, 'en'));
  const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('Alt+Enter and a trailing backslash add lines; Enter submits the joined text', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-multiline-'));
    roots.push(root);
    const onSubmit = vi.fn();
    const { stdin, lastFrame, unmount } = render(
      <InputBar
        active onSubmit={onSubmit} onInterrupt={() => {}}
        menuMoreAbove={en.menuMoreAbove} menuMoreBelow={en.menuMoreBelow} reverseSearchLabel={en.reverseSearch}
        historyProjectRoot={root} caretStyle="marker"
      />,
    );
    await tick();
    stdin.write('satır bir');
    await tick();
    stdin.write('\x1b\r'); // Alt/Option+Enter (ESC CR)
    await tick();
    stdin.write('satır iki\\');
    await tick();
    stdin.write('\r'); // backslash continuation
    await tick();
    stdin.write('üçüncü');
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('satır bir');
    expect(frame).toContain('satır iki');
    expect(frame).toContain('üçüncü|');
    expect(frame.split('\n').filter((l) => /satır bir|satır iki|üçüncü/.test(l))).toHaveLength(3);
    expect(onSubmit).not.toHaveBeenCalled();
    stdin.write('\r');
    await tick();
    expect(onSubmit).toHaveBeenCalledWith('satır bir\nsatır iki\nüçüncü');
    unmount();
  });
});
