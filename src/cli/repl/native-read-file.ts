// src/cli/repl/native-read-file.ts
// ═══ 7111 — deckent_read_file bounded views (outline / range / search) ═══════
//
// Why: the measured incident (2026-09-09) showed the model reaching for
// `deckent_bash` + sed/awk/grep to read a 1.25 MB Markdown file with 10 KB
// table lines, because the native read tool's line-range form was unwieldy for
// such lines and its result was cut by the tool-result broker's preview cap
// without saying what was cut or how to continue. Every renderer here is
// deterministic and budget-bounded BY CONSTRUCTION: the rendered string never
// exceeds `maxTotalBytes`, overlong lines are elided with an explicit marker
// that names the exact continuation arguments, and the leading meta line says
// what was returned, what was not, and where to resume. Nothing is silently
// truncated.
//
// STRING POLICY: the `[deckent] read_file: …` meta lines and the elision
// markers are model-facing PROTOCOL strings (same rule as tool-result-broker.ts
// and chat-tool-exec.ts). User-facing text stays in messages.ts.

import { DEFAULT_MAX_PREVIEW_BYTES, HARD_MAX_PREVIEW_BYTES, sliceUtf8 } from '../../agent/tool-result-broker.js';

export type ReadFileMode = 'content' | 'outline' | 'search';

export interface ReadFileBudget {
  /** Hard ceiling on the rendered result (bytes). Defaults to the broker preview cap. */
  readonly maxTotalBytes: number;
  /** Per-line byte ceiling before elision. Config-resolved from the total cap. */
  readonly maxBytesPerLine: number;
}

/** Default per-line share of the preview cap: 1/8 → 2048 B at the 16 KB default. */
const LINE_SHARE_DIVISOR = 8;
/** Smallest per-line budget that still carries the elision marker + content. */
const MIN_BYTES_PER_LINE = 96;
/** Bytes reserved for the meta line(s) so the body budget is exact. */
const META_RESERVE_BYTES = 384;
const DEFAULT_SEARCH_MAX_MATCHES = 50;
const HARD_SEARCH_MAX_MATCHES = 500;
const DEFAULT_SEARCH_CONTEXT = 0;
const HARD_SEARCH_CONTEXT = 10;
const LINE_NUMBER_WIDTH = 6;
const HEADING_TITLE_MAX_BYTES = 160;

/**
 * Resolve the read budget from the tool-result cap. `maxPreviewBytes` mirrors
 * the broker's own clamp; `maxBytesPerLine` is an explicit override (clamped
 * to [MIN_BYTES_PER_LINE, total]).
 */
export function resolveReadFileBudget(input: { maxPreviewBytes?: number; maxBytesPerLine?: number } = {}): ReadFileBudget {
  const total = clampInt(input.maxPreviewBytes, DEFAULT_MAX_PREVIEW_BYTES, 1, HARD_MAX_PREVIEW_BYTES);
  const perLineDefault = Math.max(MIN_BYTES_PER_LINE, Math.floor(total / LINE_SHARE_DIVISOR));
  const perLine = clampInt(input.maxBytesPerLine, perLineDefault, MIN_BYTES_PER_LINE, total);
  return { maxTotalBytes: total, maxBytesPerLine: Math.min(perLine, total) };
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (raw === undefined || raw === null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Splits text into lines; a trailing newline terminates the last line (cat -n semantics). */
export function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ─── Request resolution ─────────────────────────────────────────────────────

export interface ReadFileViewRequest {
  readonly mode: ReadFileMode;
  readonly startLine: number;
  readonly endLine: number | null;
  readonly lineByteOffset: number;
  readonly maxBytesPerLine: number | undefined;
  readonly outlineOffset: number;
  readonly pattern: string | null;
  readonly literal: boolean;
  readonly ignoreCase: boolean;
  readonly context: number;
  readonly maxMatches: number;
}

const MODES: ReadonlySet<string> = new Set(['content', 'outline', 'search']);

/**
 * Parse the 7111 view arguments. Returns `null` when NONE of the view fields is
 * present, so the legacy {path, offset?, limit?} path stays byte-identical.
 * `startLine`/`endLine` are 1-based inclusive; a malformed value is ignored
 * (never guessed) exactly like the legacy resolver.
 */
export function resolveReadFileViewRequest(args: Record<string, unknown>): ReadFileViewRequest | null {
  const has = (key: string): boolean => args[key] !== undefined && args[key] !== null;
  const modeRaw = typeof args['mode'] === 'string' ? args['mode'] : undefined;
  const viewKeys = ['mode', 'startLine', 'endLine', 'lineByteOffset', 'maxBytesPerLine', 'outlineOffset', 'pattern', 'literal', 'ignoreCase', 'context', 'maxMatches'];
  if (!viewKeys.some(has)) return null;
  const positive = (raw: unknown, fallback: number): number => {
    const n = Number(raw);
    return raw !== undefined && raw !== null && Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  };
  const nonNegative = (raw: unknown, fallback: number): number => {
    const n = Number(raw);
    return raw !== undefined && raw !== null && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };
  const pattern = typeof args['pattern'] === 'string' && args['pattern'].length > 0 ? args['pattern'] : null;
  const mode: ReadFileMode = modeRaw !== undefined && MODES.has(modeRaw)
    ? (modeRaw as ReadFileMode)
    : pattern !== null ? 'search' : 'content';
  const endRaw = args['endLine'];
  const endLine = endRaw === undefined || endRaw === null ? null : positive(endRaw, Number.NaN);
  return {
    mode,
    startLine: positive(args['startLine'], 1),
    endLine: endLine !== null && Number.isNaN(endLine) ? null : endLine,
    lineByteOffset: nonNegative(args['lineByteOffset'], 0),
    maxBytesPerLine: has('maxBytesPerLine') ? positive(args['maxBytesPerLine'], Number.NaN) : undefined,
    outlineOffset: positive(args['outlineOffset'], 1),
    pattern,
    literal: args['literal'] === true,
    ignoreCase: args['ignoreCase'] === true,
    context: Math.min(HARD_SEARCH_CONTEXT, nonNegative(args['context'], DEFAULT_SEARCH_CONTEXT)),
    maxMatches: Math.min(HARD_SEARCH_MAX_MATCHES, positive(args['maxMatches'], DEFAULT_SEARCH_MAX_MATCHES)),
  };
}

// ─── Bounded line rendering ─────────────────────────────────────────────────

interface BoundedLine {
  readonly text: string;
  readonly elidedBytes: number;
}

/**
 * Render one line within `maxBytesPerLine`, starting at `byteOffset`. When
 * bytes remain past the window the line carries an explicit continuation
 * marker naming the exact arguments that fetch the rest. UTF-8 safe.
 */
export function boundLine(line: string, lineNumber: number, byteOffset: number, maxBytesPerLine: number): BoundedLine {
  const buf = Buffer.from(line, 'utf8');
  const total = buf.byteLength;
  if (byteOffset >= total && total > 0) {
    return { text: `[… line ${lineNumber} has ${total} bytes; lineByteOffset ${byteOffset} is past its end]`, elidedBytes: 0 };
  }
  const start = alignUtf8Start(buf, byteOffset);
  const window = buf.subarray(start);
  if (window.byteLength <= maxBytesPerLine) {
    const prefix = start > 0 ? `[… ${start} bytes before lineByteOffset] ` : '';
    return { text: `${prefix}${window.toString('utf8')}`, elidedBytes: 0 };
  }
  const markerFor = (elided: number, nextOffset: number): string =>
    `[… ${elided} bytes elided; re-read {startLine: ${lineNumber}, endLine: ${lineNumber}, lineByteOffset: ${nextOffset}}]`;
  const prefix = start > 0 ? `[… ${start} bytes before lineByteOffset] ` : '';
  // Reserve room for the marker inside the per-line budget so the whole line
  // (prefix + content + marker) honours `maxBytesPerLine` exactly.
  let contentBudget = maxBytesPerLine - Buffer.byteLength(prefix, 'utf8') - Buffer.byteLength(markerFor(total, total), 'utf8') - 1;
  if (contentBudget < 1) contentBudget = 1;
  const head = sliceUtf8(window, contentBudget);
  const consumed = Buffer.byteLength(head, 'utf8');
  const nextOffset = start + consumed;
  const elided = total - nextOffset;
  return { text: `${prefix}${head} ${markerFor(elided, nextOffset)}`, elidedBytes: elided };
}

function alignUtf8Start(buf: Buffer, offset: number): number {
  let start = Math.min(Math.max(0, offset), buf.byteLength);
  while (start > 0 && start < buf.byteLength && (buf[start]! & 0xc0) === 0x80) start--;
  return start;
}

export interface RangeView {
  readonly output: string;
  readonly totalLines: number;
  readonly returned: number;
  readonly hasMore: boolean;
  readonly nextStartLine: number | null;
  readonly elidedLines: number;
}

/**
 * Numbered, byte-bounded line range. Lines are emitted while the running
 * total stays under `maxTotalBytes - META_RESERVE_BYTES`; the first line that
 * does not fit ends the slice and becomes `nextStartLine`.
 */
export function renderRangeView(text: string, req: Pick<ReadFileViewRequest, 'startLine' | 'endLine' | 'lineByteOffset'>, budget: ReadFileBudget): RangeView {
  const lines = splitLines(text);
  const totalLines = lines.length;
  const start = Math.min(req.startLine - 1, totalLines);
  const requestedEnd = req.endLine === null ? totalLines : Math.min(req.endLine, totalLines);
  const bodyBudget = Math.max(0, budget.maxTotalBytes - META_RESERVE_BYTES);
  const body: string[] = [];
  let used = 0;
  let elidedLines = 0;
  let cursor = start;
  while (cursor < requestedEnd) {
    const bounded = boundLine(lines[cursor] as string, cursor + 1, req.lineByteOffset, budget.maxBytesPerLine);
    const row = `${String(cursor + 1).padStart(LINE_NUMBER_WIDTH, ' ')}\t${bounded.text}`;
    const rowBytes = Buffer.byteLength(row, 'utf8') + 1;
    if (used + rowBytes > bodyBudget && body.length > 0) break;
    if (used + rowBytes > bodyBudget) {
      // Even a single bounded line exceeds the body budget: shrink it to fit
      // rather than returning nothing (the marker keeps the continuation exact).
      const shrunk = boundLine(lines[cursor] as string, cursor + 1, req.lineByteOffset, Math.max(MIN_BYTES_PER_LINE, bodyBudget - LINE_NUMBER_WIDTH - 2));
      body.push(`${String(cursor + 1).padStart(LINE_NUMBER_WIDTH, ' ')}\t${shrunk.text}`);
      if (shrunk.elidedBytes > 0) elidedLines++;
      cursor++;
      break;
    }
    body.push(row);
    used += rowBytes;
    if (bounded.elidedBytes > 0) elidedLines++;
    cursor++;
  }
  const returned = body.length;
  const hasMore = cursor < requestedEnd;
  const nextStartLine = hasMore ? cursor + 1 : null;
  const range = returned === 0 ? 'empty' : `${start + 1}-${start + returned}`;
  const meta = `[deckent] read_file: mode=range totalLines=${totalLines} range=${range} returned=${returned} hasMore=${hasMore}`
    + `${nextStartLine !== null ? ` nextStartLine=${nextStartLine}` : ''}`
    + ` maxBytesPerLine=${budget.maxBytesPerLine} elidedLines=${elidedLines}`
    + `${returned === 0 ? ` requestedStartLine=${req.startLine}` : ''}`;
  return { output: [meta, ...body].join('\n'), totalLines, returned, hasMore, nextStartLine, elidedLines };
}

// ─── Outline ────────────────────────────────────────────────────────────────

export interface OutlineHeading {
  readonly line: number;
  readonly level: number;
  readonly title: string;
}

export interface OutlineStats {
  readonly bytes: number;
  readonly totalLines: number;
  readonly longestLine: { readonly line: number; readonly bytes: number } | null;
  readonly linesOverBudget: number;
}

/** Markdown ATX headings outside fenced code blocks (``` / ~~~). */
export function extractMarkdownHeadings(lines: readonly string[]): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] as string;
      if (fence === null) fence = marker[0] as string;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = /^\s{0,3}(#{1,6})[ \t]+(.*?)\s*#*\s*$/u.exec(line);
    if (!match) continue;
    headings.push({ line: i + 1, level: (match[1] as string).length, title: sliceUtf8(Buffer.from(match[2] as string, 'utf8'), HEADING_TITLE_MAX_BYTES) });
  }
  return headings;
}

export function computeOutlineStats(text: string, lines: readonly string[], maxBytesPerLine: number): OutlineStats {
  let longest: { line: number; bytes: number } | null = null;
  let over = 0;
  for (let i = 0; i < lines.length; i++) {
    const bytes = Buffer.byteLength(lines[i] as string, 'utf8');
    if (longest === null || bytes > longest.bytes) longest = { line: i + 1, bytes };
    if (bytes > maxBytesPerLine) over++;
  }
  return { bytes: Buffer.byteLength(text, 'utf8'), totalLines: lines.length, longestLine: longest, linesOverBudget: over };
}

export interface OutlineView {
  readonly output: string;
  readonly headings: number;
  readonly shown: number;
  readonly hasMore: boolean;
  readonly nextOutlineOffset: number | null;
  readonly stats: OutlineStats;
}

export function renderOutlineView(text: string, req: Pick<ReadFileViewRequest, 'outlineOffset'>, budget: ReadFileBudget): OutlineView {
  const lines = splitLines(text);
  const stats = computeOutlineStats(text, lines, budget.maxBytesPerLine);
  const headings = extractMarkdownHeadings(lines);
  const bodyBudget = Math.max(0, budget.maxTotalBytes - META_RESERVE_BYTES);
  const start = Math.min(Math.max(0, req.outlineOffset - 1), headings.length);
  const body: string[] = [];
  let used = 0;
  let cursor = start;
  while (cursor < headings.length) {
    const h = headings[cursor] as OutlineHeading;
    const row = `${String(h.line).padStart(LINE_NUMBER_WIDTH, ' ')}\t${'#'.repeat(h.level)} ${h.title}`;
    const rowBytes = Buffer.byteLength(row, 'utf8') + 1;
    if (used + rowBytes > bodyBudget) break;
    body.push(row);
    used += rowBytes;
    cursor++;
  }
  const shown = body.length;
  const hasMore = cursor < headings.length;
  const nextOutlineOffset = hasMore ? cursor + 1 : null;
  const longest = stats.longestLine === null ? 'none' : `L${stats.longestLine.line}:${stats.longestLine.bytes}B`;
  const meta = `[deckent] read_file: mode=outline bytes=${stats.bytes} totalLines=${stats.totalLines} longestLine=${longest}`
    + ` linesOver=${stats.linesOverBudget}(>${budget.maxBytesPerLine}B) headings=${headings.length}`
    + ` shown=${shown === 0 ? 'none' : `${start + 1}-${start + shown}`} hasMore=${hasMore}`
    + `${nextOutlineOffset !== null ? ` nextOutlineOffset=${nextOutlineOffset}` : ''}`
    + (headings.length === 0 ? ' note=no-markdown-headings; use {startLine,endLine} or {pattern}' : '');
  return { output: [meta, ...body].join('\n'), headings: headings.length, shown, hasMore, nextOutlineOffset, stats };
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface SearchView {
  readonly output: string;
  readonly totalLines: number;
  readonly matches: number;
  readonly shown: number;
  readonly hasMore: boolean;
  readonly nextStartLine: number | null;
  readonly invalidPattern: boolean;
}

export function compileSearchPattern(pattern: string, literal: boolean, ignoreCase: boolean): RegExp | null {
  const source = literal ? pattern.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') : pattern;
  try {
    return new RegExp(source, ignoreCase ? 'iu' : 'u');
  } catch {
    return null;
  }
}

/**
 * grep -n style search with bounded context. Matches are scanned from
 * `startLine`; output stops at `maxMatches` or the byte budget, whichever comes
 * first, and `nextStartLine` resumes exactly after the last SHOWN match.
 */
export function renderSearchView(text: string, req: Pick<ReadFileViewRequest, 'pattern' | 'literal' | 'ignoreCase' | 'context' | 'maxMatches' | 'startLine' | 'lineByteOffset'>, budget: ReadFileBudget): SearchView {
  const lines = splitLines(text);
  const totalLines = lines.length;
  const patternText = req.pattern ?? '';
  const re = patternText.length === 0 ? null : compileSearchPattern(patternText, req.literal, req.ignoreCase);
  if (re === null) {
    return {
      output: `[deckent] read_file: mode=search pattern=${JSON.stringify(patternText)} error=invalid-pattern totalLines=${totalLines} matches=0 shown=0 hasMore=false`,
      totalLines, matches: 0, shown: 0, hasMore: false, nextStartLine: null, invalidPattern: true,
    };
  }
  const bodyBudget = Math.max(0, budget.maxTotalBytes - META_RESERVE_BYTES);
  const body: string[] = [];
  let used = 0;
  let matches = 0;
  let shown = 0;
  let hasMore = false;
  let nextStartLine: number | null = null;
  let lastEmitted = 0;
  const emit = (row: string): boolean => {
    const rowBytes = Buffer.byteLength(row, 'utf8') + 1;
    if (used + rowBytes > bodyBudget) return false;
    body.push(row);
    used += rowBytes;
    return true;
  };
  for (let i = Math.max(0, req.startLine - 1); i < totalLines; i++) {
    const line = lines[i] as string;
    if (!re.test(line)) continue;
    matches++;
    if (shown >= req.maxMatches) { hasMore = true; nextStartLine = i + 1; break; }
    const from = Math.max(i - req.context, lastEmitted);
    const to = Math.min(totalLines - 1, i + req.context);
    const block: string[] = [];
    if (body.length > 0 && from > lastEmitted) block.push('--');
    for (let j = from; j <= to; j++) {
      const bounded = boundLine(lines[j] as string, j + 1, req.lineByteOffset, budget.maxBytesPerLine);
      block.push(`${String(j + 1).padStart(LINE_NUMBER_WIDTH, ' ')}${j === i ? ':' : '-'}\t${bounded.text}`);
    }
    const blockText = block.join('\n');
    if (!emit(blockText)) { hasMore = true; nextStartLine = i + 1; break; }
    shown++;
    lastEmitted = to + 1;
  }
  const meta = `[deckent] read_file: mode=search pattern=${JSON.stringify(patternText)}${req.literal ? ' literal=true' : ''}${req.ignoreCase ? ' ignoreCase=true' : ''}`
    + ` totalLines=${totalLines} matches=${hasMore ? `${matches}+` : matches} shown=${shown} context=${req.context} hasMore=${hasMore}`
    + `${nextStartLine !== null ? ` nextStartLine=${nextStartLine}` : ''} maxBytesPerLine=${budget.maxBytesPerLine}`;
  return { output: [meta, ...body].join('\n'), totalLines, matches, shown, hasMore, nextStartLine, invalidPattern: false };
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

/** Render the requested view; the result is ≤ `budget.maxTotalBytes` by construction. */
export function renderReadFileView(text: string, req: ReadFileViewRequest, budget: ReadFileBudget): string {
  const effective: ReadFileBudget = req.maxBytesPerLine !== undefined && Number.isFinite(req.maxBytesPerLine)
    ? resolveReadFileBudget({ maxPreviewBytes: budget.maxTotalBytes, maxBytesPerLine: req.maxBytesPerLine })
    : budget;
  switch (req.mode) {
    case 'outline':
      return renderOutlineView(text, req, effective).output;
    case 'search':
      return renderSearchView(text, req, effective).output;
    default:
      return renderRangeView(text, req, effective).output;
  }
}
