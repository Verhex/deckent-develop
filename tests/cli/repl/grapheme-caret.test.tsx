// tests/cli/repl/grapheme-caret.test.tsx
// ═══ TERMINAL-TOOLS-005 — grapheme-cluster caret and cursor model ═══════════
//
// Real-binary evidence (2026-09-02 PTY): with the caret ON an emoji the
// composer's inverse cell was `buffer.slice(cursor, cursor + 1)` — half of a
// surrogate pair — so the terminal drew garbage; and the cursor model moved
// per Unicode code point, so a ZWJ family emoji took several ←/→ presses and
// Backspace could split it. The model now moves, edits, measures and renders
// per user-perceived GRAPHEME CLUSTER (Intl.Segmenter, Node ≥ 24 full ICU).
// Hermetic: pure functions + one real Ink render (ink-testing-library).

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Key } from 'node:readline';
import {
  fromBuffer, toBuffer, moveCursor, applyCursorEdit, displayWidth, layoutWrapped,
  segmentGraphemes, graphemeIndexAtUtf16,
} from '../../../src/cli/repl/cursor-model.js';
import { editInput, type InputState } from '../../../src/cli/repl/line-edit.js';
import { InputBar } from '../../../src/cli/repl/input-bar.js';
import { buildReplLabels } from '../../../src/cli/repl/run.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const FAMILY = '👨‍👩‍👧'; // 5 code points, 1 grapheme
const FLAG = '🇹🇷';       // 2 regional indicators, 1 grapheme
const E_NFD = 'é';  // e + combining acute, 1 grapheme
const key = (name: string, extra: Partial<Key> = {}): Key => ({ name, ...extra } as Key);
const LONE_SURROGATE = /(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

describe('cursor-model — grapheme clusters are the movable/editable unit', () => {
  it('segments a buffer into user-perceived graphemes', () => {
    expect(segmentGraphemes(`a${FAMILY}${FLAG}${E_NFD}b`)).toEqual(['a', FAMILY, FLAG, E_NFD, 'b']);
    expect(fromBuffer(`${FAMILY}x`).graphemes).toHaveLength(2);
    expect(toBuffer(fromBuffer(`${FAMILY}x`))).toBe(`${FAMILY}x`);
  });

  it('← / → / Backspace / Delete never split a cluster', () => {
    const state = fromBuffer(`a${FAMILY}b`);
    const left = moveCursor(state, 'left');
    expect(left.state.cursor).toBe(2); // before "b"
    const left2 = moveCursor(left.state, 'left');
    expect(left2.state.cursor).toBe(1); // before the whole family
    const bs = applyCursorEdit(fromBuffer(`a${FAMILY}`), 'backspace');
    expect(bs.kind).toBe('edited');
    expect(toBuffer(bs.state)).toBe('a');
    const del = applyCursorEdit(fromBuffer(`${FAMILY}b`, 0), 'delete');
    expect(toBuffer(del.state)).toBe('b');
  });

  it('measures display width per cluster: ZWJ emoji 2, flag 2, combining sequence 1, CJK 2', () => {
    expect(displayWidth(FAMILY)).toBe(2);
    expect(displayWidth(FLAG)).toBe(2);
    expect(displayWidth(E_NFD)).toBe(1);
    expect(displayWidth('日本')).toBe(4);
    expect(displayWidth(`ab${FAMILY}`)).toBe(4);
  });

  it('layoutWrapped never splits a cluster across rows', () => {
    const layout = layoutWrapped(fromBuffer(`abc${FAMILY}`), 4);
    expect(layout.rows).toEqual(['abc', FAMILY]);
  });

  it('graphemeIndexAtUtf16 snaps an offset inside a cluster to the cluster start', () => {
    const g = segmentGraphemes(`a${FAMILY}b`);
    expect(graphemeIndexAtUtf16(g, 0)).toBe(0);
    expect(graphemeIndexAtUtf16(g, 1)).toBe(1);
    expect(graphemeIndexAtUtf16(g, 3)).toBe(1); // inside the family
    expect(graphemeIndexAtUtf16(g, 1 + FAMILY.length)).toBe(2);
    expect(graphemeIndexAtUtf16(g, 99)).toBe(3); // clamped to the end
  });
});

describe('line-edit — the UTF-16 InputState contract stays, movement is cluster-atomic', () => {
  const state = (buffer: string, cursor = buffer.length): InputState => ({ buffer, cursor });

  it('three ← from the end of "ab<family>cd" land before the family; typing inserts there', () => {
    let s = state(`ab${FAMILY}cd`);
    for (let i = 0; i < 3; i++) s = editInput(s, key('left')).state;
    expect(s.cursor).toBe(2);
    const typed = editInput(s, key('X', { sequence: 'X' })).state;
    expect(typed.buffer).toBe(`abX${FAMILY}cd`);
  });

  it('Backspace right after the family removes the whole cluster', () => {
    const s = editInput(state(`ab${FAMILY}`), key('backspace')).state;
    expect(s).toEqual({ buffer: 'ab', cursor: 2 });
  });

  it('a legacy cursor inside a cluster snaps to the cluster start on the next edit', () => {
    const inside = state(`ab${FAMILY}cd`, 3);
    const moved = editInput(inside, key('right')).state;
    expect(moved.cursor).toBe(2 + FAMILY.length);
  });
});

describe('InputBar — the caret cell is a whole grapheme', () => {
  const roots: string[] = [];
  afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
  const en = buildReplLabels((k) => getMessage(k, 'en'));
  const tick = (ms = 25): Promise<void> => new Promise((r) => setTimeout(r, ms));

  function mount(caretStyle: 'inverse' | 'marker') {
    const root = mkdtempSync(join(tmpdir(), 'deckent-grapheme-'));
    roots.push(root);
    return render(
      <InputBar
        active
        onSubmit={() => {}}
        onInterrupt={() => {}}
        menuMoreAbove={en.menuMoreAbove}
        menuMoreBelow={en.menuMoreBelow}
        reverseSearchLabel={en.reverseSearch}
        historyProjectRoot={root}
        caretStyle={caretStyle}
      />,
    );
  }

  it('with the caret ON an emoji the frame keeps the emoji intact (no lone surrogate)', async () => {
    const { stdin, lastFrame, unmount } = mount('inverse');
    await tick();
    stdin.write('ab😀cd');
    await tick();
    for (let i = 0; i < 3; i++) { stdin.write('\x1b[D'); await tick(); }
    const frame = lastFrame() ?? '';
    expect(frame).toContain('ab😀cd');
    expect(frame).not.toMatch(LONE_SURROGATE);
    unmount();
  });

  it('marker style places the marker before the whole ZWJ cluster after two ←', async () => {
    const { stdin, lastFrame, unmount } = mount('marker');
    await tick();
    stdin.write(`${FAMILY}x`);
    await tick();
    stdin.write('\x1b[D'); await tick();
    stdin.write('\x1b[D'); await tick();
    expect(lastFrame() ?? '').toContain(`› |${FAMILY}x`);
    unmount();
  });
});
