// ═══ cursor-model — REPL cursor-position behavior model (F11-016 / ADR-D-010) ═══
// Task 373-006, ADR-D-010 KALAN-envanter (a)/(b).
//
// Pure, I/O-free, render-independent core: no terminal access, no Ink, no
// strings of its own — string-free by design (i18n-first): callers resolve any
// user-facing text from the returned discriminated result `kind`, this module
// never owns prose. Mirrors the existing pure-core pattern in this directory
// (input-queue.ts's EnqueueDecision shape) rather than inventing a new one.
//
// Why this exists: `line-edit.ts`'s original cursor arithmetic operated on raw
// UTF-16 code-unit offsets (`cursor - 1` / `cursor + 1`), so a single Left /
// Right / Backspace / Delete on an astral-plane character (a surrogate pair,
// e.g. an emoji) could bisect it (ADR-D-010 KALAN (a)). Task 373-006 moved the
// unit to Unicode CODE POINTS; TERMINAL-TOOLS-005 (2026-09-02, real-binary
// evidence: a ZWJ family emoji took several ←/→ presses and the caret cell
// split it) moves it to user-perceived GRAPHEME CLUSTERS via Intl.Segmenter
// (Node ≥ 24 ships full ICU — no dependency). `CursorState.cursor` indexes
// into the grapheme array, so movement, edits, width and the caret cell are
// cluster-atomic by construction: a family emoji, a flag (two regional
// indicators), a keycap or an NFD combining sequence is ONE unit.
//
// Width: `codePointWidth` keeps the hand-maintained East-Asian-Width + emoji
// range table (an approximate subset — enough for caret-column math, not a
// claim of full Unicode conformance); `graphemeWidth` derives a cluster's
// cells from it (any wide code point or an emoji-presentation selector → 2,
// only zero-width marks → 0, else 1). No new dependency: `string-width`/
// `wcwidth` exist only as transitive node_modules of ink, and ADR-D-005
// requires a documented rationale before adding one. The rest of this
// directory's pure-core family (input-queue.ts, stream-segmenter.ts) is
// deliberately dependency-free too.

/** Cursor-position state: `buffer` decomposed into user-perceived grapheme clusters, with `cursor` indexing into that array (0..graphemes.length), never a raw UTF-16 offset. */
export interface CursorState {
  readonly graphemes: readonly string[];
  readonly cursor: number;
}

// One segmenter for the process: locale-independent ('und') grapheme rules.
const GRAPHEME_SEGMENTER = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Split `text` into user-perceived grapheme clusters (Intl.Segmenter). */
export function segmentGraphemes(text: string): string[] {
  if (text.length === 0) return [];
  const out: string[] = [];
  for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) out.push(segment);
  return out;
}

/**
 * Grapheme index for a UTF-16 offset into the joined buffer. An offset that
 * falls INSIDE a cluster (a legacy code-unit cursor) snaps to that cluster's
 * start; offsets past the end clamp to `graphemes.length`.
 */
export function graphemeIndexAtUtf16(graphemes: readonly string[], utf16Offset: number): number {
  let consumed = 0;
  for (let i = 0; i < graphemes.length; i++) {
    const next = consumed + (graphemes[i] as string).length;
    if (utf16Offset < next) return i; // at the start of, or inside, this cluster
    consumed = next;
  }
  return graphemes.length;
}

/** Build a CursorState from a plain string. `cursor` (if given) is a grapheme index, clamped to the valid range; defaults to end-of-buffer. */
export function fromBuffer(buffer: string, cursor?: number): CursorState {
  const graphemes = segmentGraphemes(buffer);
  const resolved = cursor === undefined ? graphemes.length : Math.max(0, Math.min(graphemes.length, cursor));
  return { graphemes, cursor: resolved };
}

/** Re-join a CursorState back into a plain string. */
export function toBuffer(state: CursorState): string {
  return state.graphemes.join('');
}

// ─── 1. Satır-içi hareket (in-line movement) ────────────────────────────────

export type MoveDirection = 'left' | 'right' | 'home' | 'end';

/** Outcome of one moveCursor() call — the cursor actually moved, or was already at the requested edge (no-op). */
export type CursorMoveResult =
  | { readonly kind: 'moved'; readonly state: CursorState }
  | { readonly kind: 'unchanged'; readonly state: CursorState };

function nextCursorFor(graphemes: readonly string[], cursor: number, direction: MoveDirection): number {
  switch (direction) {
    case 'left': return Math.max(0, cursor - 1);
    case 'right': return Math.min(graphemes.length, cursor + 1);
    case 'home': return 0;
    case 'end': return graphemes.length;
    default: {
      const exhaustive: never = direction;
      return exhaustive;
    }
  }
}

/** Move the cursor one code point (never a partial surrogate pair) in the given direction. */
export function moveCursor(state: CursorState, direction: MoveDirection): CursorMoveResult {
  const next = nextCursorFor(state.graphemes, state.cursor, direction);
  if (next === state.cursor) return { kind: 'unchanged', state };
  return { kind: 'moved', state: { graphemes: state.graphemes, cursor: next } };
}

// ─── 2. Unicode-genişlik (CJK / emoji display width) ────────────────────────

type CodePointRange = readonly [number, number];

// Combining marks, zero-width joiners/spaces, and variation selectors occupy
// no terminal column of their own — they modify the glyph before them.
const ZERO_WIDTH_RANGES: readonly CodePointRange[] = [
  [0x0300, 0x036f], // Combining Diacritical Marks
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x0e31, 0x0e31],
  [0x0e34, 0x0e3a],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM/RLM
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f], // Variation Selectors (incl. VS16 emoji-presentation)
  [0xfe20, 0xfe2f],
  [0xe0100, 0xe01ef], // Variation Selectors Supplement
];

// CJK ideographs/syllabaries, fullwidth forms, and common emoji blocks render
// as two terminal columns wide.
const WIDE_RANGES: readonly CodePointRange[] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2329, 0x232a],
  [0x2e80, 0x303e], // CJK Radicals .. CJK Symbols/Punctuation
  [0x3041, 0x33ff], // Hiragana .. CJK Compatibility
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa000, 0xa4cf], // Yi Syllables / Radicals
  [0xac00, 0xd7a3], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xfe30, 0xfe4f], // CJK Compatibility Forms
  [0xff00, 0xff60], // Fullwidth Forms
  [0xffe0, 0xffe6],
  [0x16fe0, 0x16fe4],
  [0x17000, 0x18d08], // Tangut
  [0x1b000, 0x1b2fb], // Kana Supplement, Small Kana, Kana Extended-A
  [0x1f1e6, 0x1f1ff], // Regional Indicators (a pair forms one 2-cell flag cluster)
  [0x1f200, 0x1f2ff], // Enclosed Ideographic Supplement
  [0x1f300, 0x1f64f], // Misc Symbols & Pictographs, Emoticons
  [0x1f680, 0x1f6ff], // Transport & Map Symbols
  [0x1f900, 0x1f9ff], // Supplemental Symbols & Pictographs
  [0x1fa70, 0x1faff], // Symbols & Pictographs Extended-A
  [0x20000, 0x3fffd], // CJK Unified Ideographs Extension B and beyond
];

function inRange(codePoint: number, ranges: readonly CodePointRange[]): boolean {
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/** Terminal display width of one Unicode code point: 0 (combining/zero-width), 1 (narrow), or 2 (wide CJK/emoji). */
export function codePointWidth(codePoint: number): 0 | 1 | 2 {
  if (codePoint === 0) return 0;
  if (inRange(codePoint, ZERO_WIDTH_RANGES)) return 0;
  if (inRange(codePoint, WIDE_RANGES)) return 2;
  return 1;
}

const EMOJI_PRESENTATION_SELECTOR = 0xfe0f;

/**
 * Terminal display width of ONE grapheme cluster: 2 when any code point is
 * wide or the cluster carries the emoji-presentation selector (keycaps,
 * text-default symbols forced to emoji), 0 when it holds only zero-width
 * marks, else 1 (a base letter plus combining marks).
 */
export function graphemeWidth(cluster: string): 0 | 1 | 2 {
  let sawNarrow = false;
  for (const ch of cluster) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === EMOJI_PRESENTATION_SELECTOR) return 2;
    const w = codePointWidth(cp);
    if (w === 2) return 2;
    if (w === 1) sawNarrow = true;
  }
  return sawNarrow ? 1 : 0;
}

/** Sum of each grapheme cluster's terminal display width across `text`. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const cluster of segmentGraphemes(text)) width += graphemeWidth(cluster);
  return width;
}

// ─── 3. Satır-taşması (line overflow / wrap) ────────────────────────────────

/** A caret's visual position within a wrapped layout. */
export interface WrapPosition {
  readonly row: number;
  readonly column: number;
}

export interface WrapLayout {
  /** Visual rows after wrapping, oldest (top) first. */
  readonly rows: readonly string[];
  /** Where the CursorState's cursor renders within `rows`. */
  readonly cursorPosition: WrapPosition;
}

/**
 * Greedy column-fill wrap: a grapheme cluster that would not fit the remaining
 * width of the current row starts a new row instead (a wide glyph or a
 * multi-code-point cluster is never split across two rows). Returns the wrapped rows plus the display (row,
 * column) of `state.cursor`, independent of any actual terminal/renderer.
 */
export function layoutWrapped(state: CursorState, terminalWidth: number): WrapLayout {
  const width = Math.max(1, Math.floor(terminalWidth));
  const rows: string[] = [''];
  const boundaries: WrapPosition[] = [];
  let row = 0;
  let col = 0;
  let index = 0;

  for (const cluster of state.graphemes) {
    const w = graphemeWidth(cluster);
    if (col > 0 && col + w > width) {
      row += 1;
      col = 0;
      rows[row] = '';
    }
    boundaries[index] = { row, column: col };
    rows[row] = (rows[row] ?? '') + cluster;
    col += w;
    index += 1;
  }
  boundaries[index] = { row, column: col }; // end-of-buffer caret position

  return {
    rows,
    cursorPosition: boundaries[state.cursor] ?? { row, column: col },
  };
}

// ─── 4. Orta-satır düzenleme (mid-line editing) ─────────────────────────────

export type EditOperation = 'insert' | 'backspace' | 'delete';

/** Outcome of one applyCursorEdit() call — the buffer actually changed, or the operation was a no-op (e.g. backspace at position 0). */
export type CursorEditResult =
  | { readonly kind: 'edited'; readonly state: CursorState }
  | { readonly kind: 'unchanged'; readonly state: CursorState };

/**
 * Apply one edit at the CURRENT cursor position (which may be anywhere in the
 * buffer, not only at an end) and return the resulting code-point-safe state.
 * `text` is required for 'insert' and ignored otherwise.
 */
export function applyCursorEdit(state: CursorState, operation: EditOperation, text?: string): CursorEditResult {
  const { graphemes, cursor } = state;
  switch (operation) {
    case 'insert': {
      if (text === undefined || text.length === 0) return { kind: 'unchanged', state };
      // Re-segment around the seam: an inserted combining mark or ZWJ joins
      // the cluster before it, so the joined buffer is the source of truth.
      const before = graphemes.slice(0, cursor).join('');
      const after = graphemes.slice(cursor).join('');
      const nextGraphemes = segmentGraphemes(before + text + after);
      const nextCursor = graphemeIndexAtUtf16(nextGraphemes, before.length + text.length);
      return { kind: 'edited', state: { graphemes: nextGraphemes, cursor: nextCursor } };
    }
    case 'backspace': {
      if (cursor === 0) return { kind: 'unchanged', state };
      const nextGraphemes = [...graphemes.slice(0, cursor - 1), ...graphemes.slice(cursor)];
      return { kind: 'edited', state: { graphemes: nextGraphemes, cursor: cursor - 1 } };
    }
    case 'delete': {
      if (cursor >= graphemes.length) return { kind: 'unchanged', state };
      const nextGraphemes = [...graphemes.slice(0, cursor), ...graphemes.slice(cursor + 1)];
      return { kind: 'edited', state: { graphemes: nextGraphemes, cursor } };
    }
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

// ─── Cell-budget truncation (CLI-INTERACTIVE-001: moved here from the Ink
// status row so the picker core and the plain CLI stay Ink-free) ──────────

const ELLIPSIS = '…';

/** Keep the TAIL of `text` within `cells` display cells, prefixed with `…`. */
export function truncateStart(text: string, cells: number): string {
  if (cells <= 0) return '';
  if (displayWidth(text) <= cells) return text;
  if (cells === 1) return ELLIPSIS;
  const clusters = segmentGraphemes(text);
  let width = 0;
  let start = clusters.length;
  while (start > 0) {
    const w = displayWidth(clusters[start - 1] as string);
    if (width + w > cells - 1) break;
    width += w;
    start -= 1;
  }
  return ELLIPSIS + clusters.slice(start).join('');
}

/** Keep the HEAD of `text` within `cells` display cells, suffixed with `…`. */
export function truncateEnd(text: string, cells: number): string {
  if (cells <= 0) return '';
  if (displayWidth(text) <= cells) return text;
  if (cells === 1) return ELLIPSIS;
  let width = 0;
  let out = '';
  for (const cluster of segmentGraphemes(text)) {
    const w = displayWidth(cluster);
    if (width + w > cells - 1) break;
    width += w;
    out += cluster;
  }
  return out + ELLIPSIS;
}
