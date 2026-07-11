// ═══ input-bar-527 — born-527 task-409-001 verification suite ═════════════
//
// task-409-001 re-checked born-527 against today's disk state before writing
// anything. Two of its three findings were already fixed + tested in
// sprint-388 (commit 4d9d72bd8, "Kapsanan born: ... 527 ..."):
//   1. Home/End detection (inkToKey) — see the exhaustive matrix in
//      tests/cli/input-bar-cluster.test.ts ("inkToKey — Home/End detection").
//   3. debugKeylogPath cross-platform resolution — see the same file
//      ("debugKeylogPath — cross-platform resolution").
// This file does not re-duplicate that matrix; it locks in a smoke assertion
// for each so a future edit to input-bar.tsx that regresses either one fails
// THIS scope-required file too, without re-litigating every case already
// owned by input-bar-cluster.test.ts.
//
// Finding 2 (empty-history-push guard) was only PARTIALLY fixed upstream:
// resolvePasteChunk guarded a chunk that reduces to a literally-empty line
// (`line.length === 0`) but not one that reduces to WHITESPACE-ONLY (e.g. a
// paste of "   \n" into an empty buffer) — `line.length` is 3, so it still
// returned `submit`, which pushes the whitespace-only line into the
// in-session Ctrl-R history (InputHistory.push only guards `length === 0`,
// not whitespace) via input-bar.tsx's paste-submit branch. The task's own
// goCriteria explicitly names "boş/whitespace-only history-push yok". This
// is the genuine RED→GREEN case this task closes: `line.length > 0` →
// `line.trim().length > 0` in resolvePasteChunk, mirroring appendHistory's
// existing `trimmed.trim().length === 0` skip (input-history.ts) so both the
// in-session and persisted history sinks agree on what counts as "empty".

import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editInput, type InputState } from '../../src/cli/repl/line-edit.js';
import {
  inkToKey,
  resolvePasteChunk,
  debugKeylogPath,
} from '../../src/cli/repl/input-bar.js';

const state = (buffer: string, cursor: number): InputState => ({ buffer, cursor });

function inkKey(overrides: Partial<Record<string, boolean>> = {}): Parameters<typeof inkToKey>[1] {
  const base = {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, home: false, end: false, return: false,
    escape: false, ctrl: false, shift: false, tab: false, backspace: false,
    delete: false, meta: false,
  };
  return { ...base, ...overrides } as Parameters<typeof inkToKey>[1];
}

// ─── Item 2 — the genuine gap this task closes: whitespace-only paste ─────

describe('resolvePasteChunk — whitespace-only paste must not reach history (task-409-001)', () => {
  it('a chunk that reduces to pure spaces on an empty buffer is noop, not submit', () => {
    expect(resolvePasteChunk('', '   \n')).toEqual({ kind: 'noop' });
  });

  it('a chunk that reduces to a tab-only line on an empty buffer is noop', () => {
    expect(resolvePasteChunk('', '\t\t\r')).toEqual({ kind: 'noop' });
  });

  it('an existing whitespace-only buffer plus a purely-newline chunk stays noop (combined line is still blank)', () => {
    expect(resolvePasteChunk('  ', '\n')).toEqual({ kind: 'noop' });
  });

  it('does not regress the happy path: a real (non-whitespace) line still submits, untrimmed', () => {
    // Interior/leading content whitespace must survive — only an ALL-whitespace
    // result is suppressed; this is not a general trim-on-submit.
    expect(resolvePasteChunk('', '  hello  \n')).toEqual({ kind: 'submit', line: '  hello  ' });
  });

  it('a purely-newline chunk on a non-blank existing buffer still submits that buffer (not swallowed)', () => {
    expect(resolvePasteChunk('already typed', '\n\n')).toEqual({ kind: 'submit', line: 'already typed' });
  });
});

// ─── Items 1 & 3 — smoke lock on the sprint-388 fix (exhaustive coverage in
//     tests/cli/input-bar-cluster.test.ts; not re-duplicated here) ─────────

describe('inkToKey — Home/End smoke lock (full matrix: input-bar-cluster.test.ts)', () => {
  it('Ink-native key.home/key.end map to the readline home/end names and move the cursor', () => {
    expect(inkToKey('', inkKey({ home: true }))).toEqual({ name: 'home' });
    expect(inkToKey('', inkKey({ end: true }))).toEqual({ name: 'end' });

    const withHome = editInput(state('hello world', 6), inkToKey('', inkKey({ home: true })));
    expect(withHome.state).toEqual(state('hello world', 0));
    const withEnd = editInput(state('hello world', 6), inkToKey('', inkKey({ end: true })));
    expect(withEnd.state).toEqual(state('hello world', 11));
  });
});

describe('debugKeylogPath — cross-platform smoke lock (full matrix: input-bar-cluster.test.ts)', () => {
  const ENV_KEY = 'DECKENT_INK_DEBUG_LOG';
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('resolves via os.tmpdir(), never a hardcoded POSIX /tmp literal', () => {
    delete process.env[ENV_KEY];
    expect(debugKeylogPath()).toBe(join(tmpdir(), 'ink-keys.log'));
  });
});
