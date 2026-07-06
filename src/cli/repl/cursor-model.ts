// ═══ cursor-model — REPL cursor-position behavior model (F11-016 / ADR-D-010) ═══
// Task 373-006, ADR-D-010 KALAN-envanter (a)/(b).
//
// Pure, I/O-free, render-independent core: no terminal access, no Ink, no
// strings of its own — string-free by design (i18n-first): callers resolve any
// user-facing text from the returned discriminated result `kind`, this module
// never owns prose. Mirrors the existing pure-core pattern in this directory
// (input-queue.ts's EnqueueDecision shape) rather than inventing a new one.
//
// Why this exists: `line-edit.ts`'s current cursor arithmetic operates on raw
// UTF-16 code-unit offsets (`cursor - 1` / `cursor + 1`), so a single Left /
// Right / Backspace / Delete on an astral-plane character (a surrogate pair,
// e.g. an emoji) can bisect it, leaving an unpaired surrogate in the buffer
// (ADR-D-010 KALAN (a)). This model's `CursorState.cursor` indexes into a
// code-point array instead, so movement and edits are code-point-atomic by
// construction — the same `[...text]` split `truncateQueuePreview` already
// uses elsewhere in this directory (app.tsx), not a new trick.
//
// Scope note: this is a standalone model + harness, not a line-edit.ts rewrite
// or an input-bar.tsx wire — wiring a real caller onto this core is next-slice
// work (task text: "bağlama sonraki dilim, run.tsx/app.tsx CC-işi").
//
// Known, stated limitation (KALAN-honesty, not a silent gap): width and
// movement operate per Unicode CODE POINT, not per user-perceived GRAPHEME
// CLUSTER. A ZWJ compound emoji (e.g. a family emoji built from several code
// points joined by U+200D) is still multiple movable units here. That is a
// materially smaller gap than today's surrogate-pair bisection bug (it never
// produces an unpaired surrogate / corrupt rendering), but it is not full
// grapheme-cluster safety — a possible future slice (Intl.Segmenter) if a
// concrete drift report warrants it.
//
// The `codePointWidth` range table is an approximate, hand-maintained subset of
// the Unicode East-Asian-Width property plus common emoji blocks — enough for
// terminal caret-column math, not a claim of full Unicode-property conformance.
// No new dependency was added for it: `string-width`/`wcwidth`-family packages
// exist only as transitive `node_modules` of `ink`, not a declared
// package.json dependency, and ADR-D-005 requires a documented rationale + a
// `docs/reference/dependencies.md` entry before adding one — out of this
// task's write scope. The rest of this directory's pure-core family
// (input-queue.ts, stream-segmenter.ts) is deliberately dependency-free too.

/** Cursor-position state: `buffer` decomposed into Unicode code points, with `cursor` indexing into that array (0..codePoints.length), never a raw UTF-16 offset. */
export interface CursorState {
  readonly codePoints: readonly string[];
  readonly cursor: number;
}

function codePointsOf(text: string): string[] {
  return [...text];
}

/** Build a CursorState from a plain string. `cursor` (if given) is a code-point index, clamped to the valid range; defaults to end-of-buffer. */
export function fromBuffer(buffer: string, cursor?: number): CursorState {
  const codePoints = codePointsOf(buffer);
  const resolved = cursor === undefined ? codePoints.length : Math.max(0, Math.min(codePoints.length, cursor));
  return { codePoints, cursor: resolved };
}

/** Re-join a CursorState back into a plain string. */
export function toBuffer(state: CursorState): string {
  return state.codePoints.join('');
}

// ─── 1. Satır-içi hareket (in-line movement) ────────────────────────────────

export type MoveDirection = 'left' | 'right' | 'home' | 'end';

/** Outcome of one moveCursor() call — the cursor actually moved, or was already at the requested edge (no-op). */
export type CursorMoveResult =
  | { readonly kind: 'moved'; readonly state: CursorState }
  | { readonly kind: 'unchanged'; readonly state: CursorState };

function nextCursorFor(codePoints: readonly string[], cursor: number, direction: MoveDirection): number {
  switch (direction) {
    case 'left': return Math.max(0, cursor - 1);
    case 'right': return Math.min(codePoints.length, cursor + 1);
    case 'home': return 0;
    case 'end': return codePoints.length;
    default: {
      const exhaustive: never = direction;
      return exhaustive;
    }
  }
}

/** Move the cursor one code point (never a partial surrogate pair) in the given direction. */
export function moveCursor(state: CursorState, direction: MoveDirection): CursorMoveResult {
  const next = nextCursorFor(state.codePoints, state.cursor, direction);
  if (next === state.cursor) return { kind: 'unchanged', state };
  return { kind: 'moved', state: { codePoints: state.codePoints, cursor: next } };
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

/** Sum of each code point's terminal display width across `text`. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += codePointWidth(ch.codePointAt(0) ?? 0);
  }
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
 * Greedy column-fill wrap: a code point that would not fit the remaining
 * width of the current row starts a new row instead (a wide glyph is never
 * split across two rows). Returns the wrapped rows plus the display (row,
 * column) of `state.cursor`, independent of any actual terminal/renderer.
 */
export function layoutWrapped(state: CursorState, terminalWidth: number): WrapLayout {
  const width = Math.max(1, Math.floor(terminalWidth));
  const rows: string[] = [''];
  const boundaries: WrapPosition[] = [];
  let row = 0;
  let col = 0;
  let index = 0;

  for (const cp of state.codePoints) {
    const w = codePointWidth(cp.codePointAt(0) ?? 0);
    if (col > 0 && col + w > width) {
      row += 1;
      col = 0;
      rows[row] = '';
    }
    boundaries[index] = { row, column: col };
    rows[row] = (rows[row] ?? '') + cp;
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
  const { codePoints, cursor } = state;
  switch (operation) {
    case 'insert': {
      if (text === undefined || text.length === 0) return { kind: 'unchanged', state };
      const inserted = codePointsOf(text);
      if (inserted.length === 0) return { kind: 'unchanged', state };
      const nextCodePoints = [...codePoints.slice(0, cursor), ...inserted, ...codePoints.slice(cursor)];
      return { kind: 'edited', state: { codePoints: nextCodePoints, cursor: cursor + inserted.length } };
    }
    case 'backspace': {
      if (cursor === 0) return { kind: 'unchanged', state };
      const nextCodePoints = [...codePoints.slice(0, cursor - 1), ...codePoints.slice(cursor)];
      return { kind: 'edited', state: { codePoints: nextCodePoints, cursor: cursor - 1 } };
    }
    case 'delete': {
      if (cursor >= codePoints.length) return { kind: 'unchanged', state };
      const nextCodePoints = [...codePoints.slice(0, cursor), ...codePoints.slice(cursor + 1)];
      return { kind: 'edited', state: { codePoints: nextCodePoints, cursor } };
    }
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}
