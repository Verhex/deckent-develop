// ═══ input-history — persistent REPL input-history core (Sıra-65) ════════
//
// Pure çekirdek: `.deckent/settings/repl-history` (line-based, append-only)
// + a prefix-filtered up/down navigator + a bracketed-paste normalizer.
// Multi-session safety strategy is append-only + load-time cap ("load-merge"):
// the file is never truncated/rewritten in place — appendFileSync's default
// 'a' flag (O_APPEND) makes single-line writes atomic across concurrent
// processes, and loadHistory() bounds what callers see to the most recent
// `cap` entries. Truncating the file physically would require a read+rewrite
// that can race a concurrent appender (their write could land between the
// read and the atomic rename, and be lost) — deliberately not attempted here.
// Ink-wire (input-bar) consumes this module in a follow-up dilim.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SETTINGS_DIR } from '../../core/constants.js';
import { redactSensitive } from '../../core/redact-sensitive.js';

/** Project-root-relative path to the persistent history file. */
export const HISTORY_FILE = join(SETTINGS_DIR, 'repl-history');

/** Default cap on entries returned by loadHistory(). */
export const DEFAULT_HISTORY_CAP = 1000;

function historyPath(projectRoot: string): string {
  return join(projectRoot, HISTORY_FILE);
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Load history entries from disk, oldest-first, capped to the most recent
 * `cap` entries (load-time cap enforcement — see module header). Returns []
 * if the file does not exist or cannot be read/parsed.
 */
export function loadHistory(projectRoot: string, cap: number = DEFAULT_HISTORY_CAP): string[] {
  const path = historyPath(projectRoot);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    return lines.length > cap ? lines.slice(lines.length - cap) : lines;
  } catch {
    return [];
  }
}

/**
 * Append one line to the on-disk history, redacting secrets first.
 * Empty/whitespace-only lines are skipped (no-op). Embedded newlines are
 * flattened so each history entry stays exactly one line on disk. Fail-safe:
 * never throws — a history-write failure must not crash the REPL.
 */
export function appendHistory(projectRoot: string, line: string): void {
  const trimmed = line.replace(/[\r\n]+$/g, '');
  if (trimmed.trim().length === 0) return;
  const safe = redactSensitive(trimmed).replace(/[\r\n]+/g, ' ');
  const path = historyPath(projectRoot);
  try {
    ensureDir(path);
    appendFileSync(path, safe + '\n', 'utf-8');
  } catch {
    // Fail-safe — history is best-effort convenience, never fatal.
  }
}

/** Navigation direction: 'up' = older entry, 'down' = newer entry / back to live line. */
export type NavigateDirection = 'up' | 'down';

/**
 * Bounded, prefix-filtered history navigator (up/down recall).
 *
 * Mirrors the idx/draft state-machine of `InputHistory` in line-edit.ts but
 * adds prefix filtering (reverse-incremental-search style: the match set is
 * computed once, on the first `navigate('up', ...)` call after a reset, from
 * whatever `prefix` is passed at that moment — subsequent up/down calls in
 * the same navigation session keep cycling that same match set).
 */
export class HistoryNavigator {
  private idx = -1; // -1 = at the live/draft line (not navigating)
  private draft = '';
  private matches: string[] = [];

  constructor(private readonly entries: readonly string[]) {}

  /**
   * Navigate history. `live` is the current unsent buffer — captured as the
   * draft when navigation begins, and restored when navigating past the
   * newest match. `prefix` filters entries via startsWith; only consulted
   * when navigation is (re)entered (idx === -1 going to 'up').
   */
  navigate(dir: NavigateDirection, live: string, prefix = ''): string {
    if (this.idx === -1) {
      if (dir === 'down') return live; // already at the live line — no-op
      this.matches = prefix.length === 0
        ? [...this.entries]
        : this.entries.filter((e) => e.startsWith(prefix));
      if (this.matches.length === 0) return live;
      this.draft = live;
      this.idx = this.matches.length - 1;
      return this.matches[this.idx] ?? live;
    }

    this.idx += dir === 'up' ? -1 : 1;
    if (this.idx >= this.matches.length) {
      this.reset();
      return this.draft;
    }
    if (this.idx < 0) this.idx = 0;
    return this.matches[this.idx] ?? live;
  }

  /** Return to the live/draft line — call after a submit or on Escape. */
  reset(): void {
    this.idx = -1;
    this.matches = [];
  }
}

const NEWLINE_CODE = 0x0a;
const TAB_CODE = 0x09;
const DEL_CODE = 0x7f;
const CONTROL_RANGE_END = 0x20; // codepoints below this are C0 control chars

/**
 * Normalize bracketed-paste input: CRLF and lone CR become LF, and control
 * characters other than newline/tab are stripped. Printable text (including
 * multi-byte/unicode) passes through unchanged. Iterates by code point
 * (rather than a control-char regex range) to keep the source free of raw
 * control bytes.
 */
export function normalizePasted(text: string): string {
  if (!text) return text;
  const withLf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let result = '';
  for (const ch of withLf) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === NEWLINE_CODE || code === TAB_CODE) { result += ch; continue; }
    if (code < CONTROL_RANGE_END || code === DEL_CODE) continue;
    result += ch;
  }
  return result;
}
