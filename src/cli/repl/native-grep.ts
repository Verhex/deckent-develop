// src/cli/repl/native-grep.ts
// ═══ 7111-c — bounded project grep (deckent_grep) ═══════════════════════════
// Pure-Node, cross-platform. Never reports "no matches" when scannable content
// was skipped silently. Long lines get the same explicit elision markers as
// deckent_read_file (boundLine). Protocol strings are model-facing.

import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { boundLine, splitLines } from './native-read-file.js';

export const DEFAULT_GREP_MAX_HITS = 200;
export const DEFAULT_GREP_MAX_BYTES_PER_LINE = 2048;
/** Full line scan up to this size; larger files are reported as skipped (too-large). */
export const DEFAULT_GREP_MAX_FILE_BYTES = 16 * 1024 * 1024;
/** Max skipped-file diagnostic lines in one grep result. */
export const DEFAULT_GREP_MAX_SKIP_NOTES = 32;
const BINARY_NULL_PROBE_BYTES = 8192;

export type GrepSkipKind = 'binary' | 'too-large' | 'read-error';

export interface GrepSkippedFile {
  readonly rel: string;
  readonly kind: GrepSkipKind;
  readonly detail: string;
}

export interface GrepHit {
  readonly rel: string;
  readonly line: number;
  readonly text: string;
}

export interface GrepFileScanResult {
  readonly hits: GrepHit[];
  readonly skipped: GrepSkippedFile | null;
  readonly hitCapReached: boolean;
}

/** Normalize CRLF/legacy CR so line numbers match cross-platform editors. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function splitGrepLines(text: string): string[] {
  return splitLines(normalizeNewlines(text));
}

export function isProbablyBinary(buf: Buffer): boolean {
  const probe = buf.subarray(0, Math.min(buf.length, BINARY_NULL_PROBE_BYTES));
  return probe.includes(0);
}

type BoundedReadResult =
  | { ok: true; text: string }
  | { ok: false; kind: GrepSkipKind; detail: string };

/** Single-descriptor bounded read: size checked on fd, allocation capped at limit+1. */
export function readBoundedTextFile(fileAbs: string, maxFileBytes: number): BoundedReadResult {
  let fd: number | undefined;
  try {
    fd = openSync(fileAbs, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(fd);
    if (!before.isFile()) {
      return { ok: false, kind: 'read-error', detail: 'not a file' };
    }
    if (before.size > maxFileBytes) {
      return {
        ok: false,
        kind: 'too-large',
        detail: `${before.size} bytes > limit ${maxFileBytes}`,
      };
    }
    const buf = Buffer.alloc(maxFileBytes + 1);
    let bytesRead = 0;
    while (bytesRead < buf.length) {
      const count = readSync(fd, buf, bytesRead, buf.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const after = fstatSync(fd);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      return { ok: false, kind: 'read-error', detail: 'file changed during read' };
    }
    if (bytesRead > maxFileBytes) {
      return {
        ok: false,
        kind: 'too-large',
        detail: `${bytesRead}+ bytes > limit ${maxFileBytes}`,
      };
    }
    if (bytesRead < before.size) {
      return { ok: false, kind: 'read-error', detail: 'short read' };
    }
    const probe = buf.subarray(0, Math.min(bytesRead, BINARY_NULL_PROBE_BYTES));
    if (isProbablyBinary(probe)) {
      return { ok: false, kind: 'binary', detail: 'contains NUL byte' };
    }
    return { ok: true, text: buf.subarray(0, bytesRead).toString('utf8') };
  } catch {
    return { ok: false, kind: 'read-error', detail: 'read failed' };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function scanFileForGrep(input: {
  fileAbs: string;
  rel: string;
  re: RegExp;
  maxBytesPerLine: number;
  maxFileBytes: number;
  maxHitsRemaining?: number;
}): GrepFileScanResult {
  const read = readBoundedTextFile(input.fileAbs, input.maxFileBytes);
  if (!read.ok) {
    return {
      hits: [],
      skipped: { rel: input.rel, kind: read.kind, detail: read.detail },
      hitCapReached: false,
    };
  }
  const budget = input.maxHitsRemaining ?? Number.POSITIVE_INFINITY;
  const hits: GrepHit[] = [];
  let hitCapReached = false;
  const lines = splitGrepLines(read.text);
  for (let i = 0; i < lines.length; i++) {
    if (hits.length >= budget) {
      hitCapReached = true;
      break;
    }
    const line = lines[i] as string;
    if (!input.re.test(line)) continue;
    const bounded = boundLine(line, i + 1, 0, input.maxBytesPerLine);
    hits.push({ rel: input.rel, line: i + 1, text: bounded.text });
    if (hits.length >= budget) {
      hitCapReached = true;
      break;
    }
  }
  return { hits, skipped: null, hitCapReached };
}

export function formatGrepHit(hit: GrepHit): string {
  return `${hit.rel}:${hit.line}:${hit.text}`;
}

export function formatGrepOutput(input: {
  hits: readonly GrepHit[];
  skipped: readonly GrepSkippedFile[];
  filesScanned: number;
  capped: boolean;
  maxSkipNotes?: number;
}): string {
  const maxSkipNotes = input.maxSkipNotes ?? DEFAULT_GREP_MAX_SKIP_NOTES;
  const parts: string[] = [];
  if (input.hits.length > 0) {
    parts.push(input.hits.map(formatGrepHit).join('\n'));
  }
  const notes: string[] = [];
  if (input.capped) notes.push('truncated (200 hits cap)');
  const shown = input.skipped.slice(0, maxSkipNotes);
  const hidden = input.skipped.length - shown.length;
  for (const s of shown) {
    notes.push(`skipped ${s.rel} (${s.kind}: ${s.detail})`);
  }
  if (hidden > 0) {
    notes.push(`${hidden} additional skipped file(s) elided`);
  }
  if (input.hits.length === 0) {
    if (input.skipped.length > 0) {
      parts.push(
        `[deckent] grep: no matches in ${input.filesScanned} scanned file(s); ${input.skipped.length} file(s) not fully scanned`,
      );
    } else {
      parts.push('[deckent] no matches');
    }
    if (notes.length > 0) {
      parts.push(`[deckent] grep: ${notes.join('; ')}`);
    }
  } else if (notes.length > 0) {
    parts.push(`[deckent] grep: ${notes.join('; ')}`);
  } else if (input.capped) {
    parts.push('[deckent] truncated (200 hits cap)');
  }
  return parts.join('\n');
}
