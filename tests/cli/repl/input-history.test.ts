// tests/cli/repl/input-history.test.ts
// Unit tests for src/cli/repl/input-history.ts (Sıra-65 — F7-HARDEN):
//   1. loadHistory / appendHistory round-trip + load-time cap
//   2. secret redaction on append (AKIA fixture never lands in plaintext)
//   3. HistoryNavigator — plain + prefix-filtered up/down navigation
//   4. normalizePasted — CRLF/control-char cleanup
//   5. multi-session-safe concurrent append (no torn/interleaved lines)
//
// Hermetic: every test uses its own mkdtemp tmpdir project root, cleaned up
// in afterEach. No project-root or HOME files are read or written.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import {
  loadHistory,
  appendHistory,
  HistoryNavigator,
  normalizePasted,
  HISTORY_FILE,
  DEFAULT_HISTORY_CAP,
} from '../../../src/cli/repl/input-history.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckent-input-history-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ─── loadHistory / appendHistory round-trip ──────────────────────────────

describe('appendHistory / loadHistory round-trip', () => {
  it('returns [] when no history file exists yet', () => {
    expect(loadHistory(dir)).toEqual([]);
  });

  it('round-trips a single appended line', () => {
    appendHistory(dir, 'deckent status');
    expect(loadHistory(dir)).toEqual(['deckent status']);
  });

  it('preserves append order across multiple lines', () => {
    appendHistory(dir, 'first');
    appendHistory(dir, 'second');
    appendHistory(dir, 'third');
    expect(loadHistory(dir)).toEqual(['first', 'second', 'third']);
  });

  it('skips empty and whitespace-only lines (no-op)', () => {
    appendHistory(dir, 'real line');
    appendHistory(dir, '');
    appendHistory(dir, '   ');
    appendHistory(dir, '\n');
    expect(loadHistory(dir)).toEqual(['real line']);
  });

  it('flattens embedded newlines so each entry stays one line on disk', () => {
    appendHistory(dir, 'line one\nline two');
    const entries = loadHistory(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe('line one line two');
  });

  it('writes to .deckent/settings/repl-history under the project root', () => {
    appendHistory(dir, 'hello');
    const raw = readFileSync(join(dir, HISTORY_FILE), 'utf-8');
    expect(raw).toBe('hello\n');
  });
});

// ─── Cap enforcement (load-time) ──────────────────────────────────────────

describe('loadHistory cap enforcement', () => {
  it('returns at most `cap` entries, most-recent-kept, oldest-first order', () => {
    const cap = 5;
    for (let i = 0; i < 12; i++) appendHistory(dir, `cmd-${i}`);
    const entries = loadHistory(dir, cap);
    expect(entries).toHaveLength(cap);
    expect(entries).toEqual(['cmd-7', 'cmd-8', 'cmd-9', 'cmd-10', 'cmd-11']);
  });

  it('uses DEFAULT_HISTORY_CAP (1000) when no cap is passed', () => {
    for (let i = 0; i < 1005; i++) appendHistory(dir, `cmd-${i}`);
    const entries = loadHistory(dir);
    expect(entries).toHaveLength(DEFAULT_HISTORY_CAP);
    expect(entries[0]).toBe('cmd-5');
    expect(entries[entries.length - 1]).toBe('cmd-1004');
  });

  it('does not truncate the on-disk file — a larger cap later still sees all lines', () => {
    for (let i = 0; i < 10; i++) appendHistory(dir, `cmd-${i}`);
    loadHistory(dir, 3); // small-cap read must not mutate the file
    const full = loadHistory(dir, 100);
    expect(full).toHaveLength(10);
  });
});

// ─── Secret redaction on append ───────────────────────────────────────────

describe('appendHistory secret redaction', () => {
  it('redacts an AWS access key before it ever touches disk', () => {
    const secretLine = 'export AWS key AKIAIOSFODNN7EXAMPLE now';
    appendHistory(dir, secretLine);

    const raw = readFileSync(join(dir, HISTORY_FILE), 'utf-8');
    expect(raw).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(raw).toContain('[REDACTED]');

    const entries = loadHistory(dir);
    expect(entries[0]).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(entries[0]).toContain('[REDACTED]');
  });

  it('redacts a Bearer token in an otherwise normal command', () => {
    appendHistory(dir, 'curl -H "Authorization: Bearer sometoken123" https://x');
    const raw = readFileSync(join(dir, HISTORY_FILE), 'utf-8');
    expect(raw).not.toContain('sometoken123');
  });

  it('leaves ordinary commands with no secrets untouched', () => {
    appendHistory(dir, 'deckent status --follow');
    expect(loadHistory(dir)).toEqual(['deckent status --follow']);
  });
});

// ─── HistoryNavigator ──────────────────────────────────────────────────

describe('HistoryNavigator — plain up/down', () => {
  it('cycles from newest to oldest on repeated up, then back to live on down-through', () => {
    const nav = new HistoryNavigator(['alpha', 'beta', 'gamma']);
    expect(nav.navigate('up', 'draft')).toBe('gamma');
    expect(nav.navigate('up', 'draft')).toBe('beta');
    expect(nav.navigate('up', 'draft')).toBe('alpha');
    // Already at oldest — stays at oldest (idx clamps to 0).
    expect(nav.navigate('up', 'draft')).toBe('alpha');
  });

  it('down navigates back toward the live/draft line', () => {
    const nav = new HistoryNavigator(['alpha', 'beta', 'gamma']);
    nav.navigate('up', 'draft'); // gamma
    nav.navigate('up', 'draft'); // beta
    expect(nav.navigate('down', 'draft')).toBe('gamma');
    expect(nav.navigate('down', 'draft')).toBe('draft'); // back to live line
  });

  it('down is a no-op while already at the live line', () => {
    const nav = new HistoryNavigator(['alpha', 'beta']);
    expect(nav.navigate('down', 'draft')).toBe('draft');
  });

  it('up with an empty entries list returns the live line unchanged', () => {
    const nav = new HistoryNavigator([]);
    expect(nav.navigate('up', 'draft')).toBe('draft');
  });

  it('reset() returns navigation to the live line', () => {
    const nav = new HistoryNavigator(['alpha', 'beta']);
    nav.navigate('up', 'draft');
    nav.reset();
    expect(nav.navigate('down', 'draft')).toBe('draft');
  });
});

describe('HistoryNavigator — prefix-filtered', () => {
  it('only cycles through entries matching the prefix captured at navigation entry', () => {
    const nav = new HistoryNavigator(['deckent status', 'git log', 'deckent history', 'ls']);
    expect(nav.navigate('up', 'de', 'de')).toBe('deckent history');
    expect(nav.navigate('up', 'de', 'de')).toBe('deckent status');
    // Clamped at the oldest match — further up stays put.
    expect(nav.navigate('up', 'de', 'de')).toBe('deckent status');
  });

  it('returns the live line when no entries match the prefix', () => {
    const nav = new HistoryNavigator(['git log', 'ls']);
    expect(nav.navigate('up', 'zz', 'zz')).toBe('zz');
  });

  it('empty prefix matches every entry (equivalent to plain navigation)', () => {
    const nav = new HistoryNavigator(['alpha', 'beta']);
    expect(nav.navigate('up', 'draft', '')).toBe('beta');
  });
});

// ─── normalizePasted ──────────────────────────────────────────────────

describe('normalizePasted', () => {
  it('converts CRLF line endings to LF', () => {
    expect(normalizePasted('line one\r\nline two')).toBe('line one\nline two');
  });

  it('converts lone CR to LF', () => {
    expect(normalizePasted('line one\rline two')).toBe('line one\nline two');
  });

  it('strips C0 control characters other than newline and tab', () => {
    const withControls = "hello" + String.fromCharCode(0, 1, 7) + "world";
    expect(normalizePasted(withControls)).toBe('helloworld');
  });

  it('strips DEL (0x7f)', () => {
    expect(normalizePasted("abc" + String.fromCharCode(127) + "def")).toBe("abcdef");
  });

  it('preserves tabs and newlines', () => {
    expect(normalizePasted('a\tb\nc')).toBe('a\tb\nc');
  });

  it('leaves plain printable/unicode text unchanged', () => {
    const text = 'merhaba dünya — deckent çalışıyor';
    expect(normalizePasted(text)).toBe(text);
  });

  it('handles empty string', () => {
    expect(normalizePasted('')).toBe('');
  });
});

// ─── Multi-session-safe concurrent append ────────────────────────────────

describe('appendHistory — multi-session concurrent append', () => {
  it('two interleaved writers land all lines without corruption', () => {
    // Simulate two REPL sessions sharing the same project root, appending
    // in an interleaved sequence (as if two processes were racing).
    appendHistory(dir, 'session-a-1');
    appendHistory(dir, 'session-b-1');
    appendHistory(dir, 'session-a-2');
    appendHistory(dir, 'session-b-2');
    appendHistory(dir, 'session-a-3');

    const entries = loadHistory(dir);
    expect(entries).toEqual([
      'session-a-1',
      'session-b-1',
      'session-a-2',
      'session-b-2',
      'session-a-3',
    ]);
  });

  it('N concurrent async appenders (Promise.all) all land — none dropped, none merged', async () => {
    const total = 40;
    await Promise.all(
      Array.from({ length: total }, (_, i) => Promise.resolve().then(() => appendHistory(dir, `writer-${i}`))),
    );

    const entries = loadHistory(dir, total);
    expect(entries).toHaveLength(total);
    // Every writer's line landed exactly once, none interleaved/torn.
    const seen = new Set(entries);
    expect(seen.size).toBe(total);
    for (let i = 0; i < total; i++) {
      expect(seen.has(`writer-${i}`)).toBe(true);
    }
  });
});
