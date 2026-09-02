// src/cli/repl/status-row.tsx
// ═══ TERMINAL-TOOLS-004 — width-aware REPL status row ═══════════════════════
//
// The bottom `deckent  <provider>[ · <model>]  <cwd>[ · Σ tok][ · »approval]
// [ · ↺ id]` row. Before: a flex <Box> of separate <Text> items — with a long
// cwd Ink squeezed the items (the two spaces between brand and provider
// vanished: "deckentollama") and wrapped the path onto an indented second
// line (real-binary evidence, 100×30 PTY, 2026-09-02). Terminal design rule:
// measure in display cells, truncate with access to the informative part,
// never wrap a status line.
//
// fitStatusRow is pure (tests/cli/repl/status-row.test.ts): it drops the
// optional segments in a fixed priority before starving the cwd, then
// tail-truncates the cwd with a leading `…` (the tail of a path is the
// informative part), and finally guards the whole row against the column
// budget. StatusRow renders the result as ONE inline text node (nested
// <Text> for role colors) with Ink's truncate wrap as a last-resort guard.
// String-free: the only words are the product name and caller data.

import { Text, type TextProps } from 'ink';
import type { ReactElement } from 'react';
import { displayWidth, segmentGraphemes } from './cursor-model.js';

const TEAL = '#4DB8A4';
const GOLD = '#C4A855';

export interface StatusRowInput {
  /** Product name — technical brand token, never localized. */
  brand: string;
  provider: string;
  model?: string | undefined;
  cwd: string;
  /** Session output tokens; omitted/0 → no segment. */
  sessionTok?: number | undefined;
  /** Agentic approval mode when it is NOT the default (caller decides). */
  approval?: string | undefined;
  /** Resumed session id when it differs from the boot session (caller decides). */
  resumedId?: string | undefined;
}

export type StatusRowRole = 'brand' | 'gap' | 'provider' | 'model' | 'cwd' | 'tokens' | 'approval' | 'resumed';
export type StatusRowOptional = 'resumed' | 'tokens' | 'approval' | 'model';

export interface StatusRowSegment {
  role: StatusRowRole;
  text: string;
}

export interface StatusRowLayout {
  segments: StatusRowSegment[];
  /** Optional segments removed to honor the budget, in drop order. */
  dropped: StatusRowOptional[];
  columns: number;
}

/** Drop order: least informative first. The cwd is never dropped. */
const DROP_ORDER: readonly StatusRowOptional[] = ['resumed', 'tokens', 'approval', 'model'];
/** Cells the cwd keeps before the layout starts dropping optional segments. */
const MIN_CWD_CELLS = 12;
const ELLIPSIS = '…';
const GAP = '  ';

function buildSegments(input: StatusRowInput, dropped: ReadonlySet<StatusRowOptional>): StatusRowSegment[] {
  const segments: StatusRowSegment[] = [
    { role: 'brand', text: input.brand },
    { role: 'gap', text: GAP },
    { role: 'provider', text: input.provider },
  ];
  if (input.model && !dropped.has('model')) segments.push({ role: 'model', text: ` · ${input.model}` });
  segments.push({ role: 'gap', text: GAP }, { role: 'cwd', text: input.cwd });
  if (input.sessionTok !== undefined && input.sessionTok > 0 && !dropped.has('tokens')) {
    segments.push({ role: 'tokens', text: `${GAP}· Σ ${input.sessionTok} tok` });
  }
  if (input.approval && !dropped.has('approval')) segments.push({ role: 'approval', text: `${GAP}· »${input.approval}` });
  if (input.resumedId && !dropped.has('resumed')) segments.push({ role: 'resumed', text: `${GAP}· ↺ ${input.resumedId}` });
  return segments;
}

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

const widthOf = (segments: readonly StatusRowSegment[], skip?: StatusRowRole): number =>
  segments.reduce((sum, s) => (s.role === skip ? sum : sum + displayWidth(s.text)), 0);

export function fitStatusRow(input: StatusRowInput, columns: number): StatusRowLayout {
  const budget = Math.max(1, Math.floor(columns));
  const dropped: StatusRowOptional[] = [];
  const droppedSet = new Set<StatusRowOptional>();
  let segments = buildSegments(input, droppedSet);
  const cwdCells = displayWidth(input.cwd);

  // 1. Drop optional segments until the cwd keeps its minimum (or nothing is left to drop).
  for (const candidate of DROP_ORDER) {
    const available = budget - widthOf(segments, 'cwd');
    if (available >= Math.min(cwdCells, MIN_CWD_CELLS)) break;
    if (!segments.some((s) => s.role === candidate)) continue;
    droppedSet.add(candidate);
    dropped.push(candidate);
    segments = buildSegments(input, droppedSet);
  }

  // 2. Tail-truncate the cwd into whatever is left.
  const available = budget - widthOf(segments, 'cwd');
  segments = segments.map((s) => (s.role === 'cwd' ? { ...s, text: truncateStart(s.text, available) } : s));

  // 3. Last-resort guard: the fixed segments alone may still exceed a tiny budget.
  let total = widthOf(segments);
  if (total > budget) {
    const kept: StatusRowSegment[] = [];
    let used = 0;
    for (const s of segments) {
      const w = displayWidth(s.text);
      if (used + w <= budget) { kept.push(s); used += w; continue; }
      const cut = truncateEnd(s.text, budget - used);
      if (cut.length > 0) kept.push({ ...s, text: cut });
      break;
    }
    segments = kept;
    total = widthOf(segments);
  }

  return { segments, dropped, columns: budget };
}

/** Plain (uncolored) row text — what a NO_COLOR terminal shows. */
export function statusRowText(layout: StatusRowLayout): string {
  return layout.segments.map((s) => s.text).join('');
}

function styleFor(role: StatusRowRole): Pick<TextProps, 'color' | 'dimColor'> {
  switch (role) {
    case 'provider': return { color: TEAL };
    case 'model': return { color: GOLD };
    case 'approval': return { color: GOLD };
    case 'brand': return { dimColor: true };
    case 'cwd': return { dimColor: true };
    case 'tokens': return { dimColor: true };
    case 'resumed': return { dimColor: true };
    case 'gap': return {};
  }
}

export interface StatusRowProps {
  input: StatusRowInput;
  /** Live terminal width in cells (useTerminalColumns). */
  columns: number;
}

/** ONE inline text node — nested <Text> only colors; it can never become a flex item that wraps. */
export function StatusRow({ input, columns }: StatusRowProps): ReactElement {
  const layout = fitStatusRow(input, columns);
  return (
    <Text wrap="truncate-end">
      {layout.segments.map((s, i) => (
        <Text key={`${s.role}-${i}`} {...styleFor(s.role)}>{s.text}</Text>
      ))}
    </Text>
  );
}
