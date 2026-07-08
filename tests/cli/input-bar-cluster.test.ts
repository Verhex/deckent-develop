// ═══ input-bar-cluster — born-527 regression suite ════════════════════════
//
// Three independent findings against src/cli/repl/input-bar.tsx, one file
// because they share the same seam-extraction fix pattern (pure, exported
// helpers — no Ink mount; see tests/cli/repl-input-bar-menu-submit.test.ts
// and tests/cli/repl/term-compat-matrix.test.ts for the established style):
//
// 1. Home/End: `inkToKey` is now exported so its key-detection (not just the
//    editInput reducer, already covered elsewhere) is directly testable.
//    Verified against Ink 7.0.5's REAL Key shape (`key.home`/`key.end` ARE
//    populated by node_modules/ink/build/hooks/use-input.js — confirmed by
//    reading the installed dependency's source), plus the raw-escape-sequence
//    fallback kept for defense in depth.
// 2. Multi-line/newline-only paste must never submit an empty line or push an
//    empty entry into history — `resolvePasteChunk` classifies the chunk
//    (`insert` / `submit` / `noop`) before input-bar.tsx does anything.
// 3. `debugKeylogPath` resolves cross-platform (Law #2) instead of a
//    hardcoded POSIX-only `/tmp/...` literal.

import { describe, it, expect, afterEach } from 'vitest';
import type { Key } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inkToKey,
  resolvePasteChunk,
  debugKeylogPath,
} from '../../src/cli/repl/input-bar.js';
import { editInput, type InputState } from '../../src/cli/repl/line-edit.js';

const state = (buffer: string, cursor: number): InputState => ({ buffer, cursor });

/** Minimal Ink Key fixture — only the fields inkToKey actually reads. */
function inkKey(overrides: Partial<Record<string, boolean>> = {}): Parameters<typeof inkToKey>[1] {
  const base = {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, home: false, end: false, return: false,
    escape: false, ctrl: false, shift: false, tab: false, backspace: false,
    delete: false, meta: false,
  };
  return { ...base, ...overrides } as Parameters<typeof inkToKey>[1];
}

// ─── 1. Home/End key detection (inkToKey) ──────────────────────────────────

describe('inkToKey — Home/End detection', () => {
  it('Ink-native key.home=true (the real Ink 7.0.5 shape) maps to {name:"home"}', () => {
    expect(inkToKey('', inkKey({ home: true }))).toEqual({ name: 'home' });
  });

  it('Ink-native key.end=true (the real Ink 7.0.5 shape) maps to {name:"end"}', () => {
    expect(inkToKey('', inkKey({ end: true }))).toEqual({ name: 'end' });
  });

  it('raw xterm escape sequences fall back to home/end when the boolean is unset', () => {
    for (const seq of ['\x1b[H', '\x1b[1~', '\x1bOH']) {
      expect(inkToKey(seq, inkKey())).toEqual({ name: 'home' });
    }
    for (const seq of ['\x1b[F', '\x1b[4~', '\x1bOF']) {
      expect(inkToKey(seq, inkKey())).toEqual({ name: 'end' });
    }
  });

  it('Home/End cursor hareketi çalışır: feeding the mapped key through editInput moves the cursor', () => {
    const withHome = editInput(state('hello world', 6), inkToKey('', inkKey({ home: true })));
    expect(withHome.state).toEqual(state('hello world', 0));

    const withEnd = editInput(state('hello world', 6), inkToKey('', inkKey({ end: true })));
    expect(withEnd.state).toEqual(state('hello world', 11));

    // Escape-sequence fallback path drives the same reducer outcome.
    const homeSeq = editInput(state('abc', 2), inkToKey('\x1b[1~', inkKey()));
    expect(homeSeq.state).toEqual(state('abc', 0));
    const endSeq = editInput(state('abc', 1), inkToKey('\x1b[4~', inkKey()));
    expect(endSeq.state).toEqual(state('abc', 3));
  });

  it('does not misfire on unrelated keys (arrows, return, backspace still take priority)', () => {
    expect(inkToKey('', inkKey({ leftArrow: true }))).toEqual({ name: 'left' });
    expect(inkToKey('', inkKey({ return: true }))).toEqual({ name: 'return' });
    expect(inkToKey('x', inkKey())).toEqual({ name: 'x', sequence: 'x' });
  });
});

// ─── 2. Paste-chunk classification (empty-history regression) ─────────────

describe('resolvePasteChunk — multi-line/newline paste classification', () => {
  it('an internal-newline paste (real multi-line paste) inserts as text, buffer unchanged otherwise', () => {
    const result = resolvePasteChunk('', 'line1\nline2');
    expect(result).toEqual({ kind: 'insert', text: 'line1\nline2' });
  });

  it('an internal-newline paste WITH a trailing newline still inserts (trailing strip does not remove the internal one)', () => {
    const result = resolvePasteChunk('', 'line1\nline2\n');
    expect(result).toEqual({ kind: 'insert', text: 'line1\nline2\n' });
  });

  it('CRLF is normalized to LF on insert', () => {
    const result = resolvePasteChunk('', 'a\r\nb');
    expect(result).toEqual({ kind: 'insert', text: 'a\nb' });
  });

  it('a single line + trailing newline submits the combined buffer+chunk', () => {
    const result = resolvePasteChunk('existing-', 'typed\r');
    expect(result).toEqual({ kind: 'submit', line: 'existing-typed' });
  });

  it('REGRESSION (born-527): a chunk that is PURELY newline/CR bytes with an empty buffer never submits or records — noop', () => {
    expect(resolvePasteChunk('', '\n')).toEqual({ kind: 'noop' });
    expect(resolvePasteChunk('', '\n\n\n')).toEqual({ kind: 'noop' });
    expect(resolvePasteChunk('', '\r\n')).toEqual({ kind: 'noop' });
  });

  it('a purely-newline chunk with a NON-empty existing buffer still submits that buffer (not swallowed)', () => {
    const result = resolvePasteChunk('already typed', '\n\n');
    expect(result).toEqual({ kind: 'submit', line: 'already typed' });
  });
});

// ─── 3. Debug keylog path — platform-aware (Law #2) ────────────────────────

describe('debugKeylogPath — cross-platform resolution', () => {
  const ENV_KEY = 'DECKENT_INK_DEBUG_LOG';
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('defaults to the OS temp dir, never a hardcoded POSIX /tmp literal', () => {
    delete process.env[ENV_KEY];
    expect(debugKeylogPath()).toBe(join(tmpdir(), 'ink-keys.log'));
  });

  it('honors an explicit DECKENT_INK_DEBUG_LOG override', () => {
    process.env[ENV_KEY] = '/custom/path/keys.log';
    expect(debugKeylogPath()).toBe('/custom/path/keys.log');
  });
});
