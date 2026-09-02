// ─── APR-DUALSTREAM — çift-bölge kompozitörü (Sprint 354, Task 354-004) ────
//
// Combines two independently-produced line arrays — the run-status footer
// (buildLiveFooter output) and the approval-card region (approval-card.tsx
// output) — into ONE line-list that fits a `height`-row × `width`-col
// terminal region without the two ever overlapping. Pure — no Ink, no React,
// no file/network I/O, no Date/Math.random (fully deterministic).
//
// Allocation rule: the approval region gets first claim on whatever space
// remains AFTER one row is reserved for status (when status has any content
// at all) — so approval is "priority" for surplus space, but status can
// never be fully starved down to zero lines while it has something to say.
// When height is so small that even that reservation can't coexist with a
// non-empty approval region (height === 1 with both non-empty), the status
// floor wins: "asla tamamen kaybolmaz" (never fully lost) is the stronger,
// unconditional guarantee. Either region, if its content can't fit the rows
// allocated to it, is cropped with an overflow-marker line (i18n seam below)
// rather than silently dropping content with no indication.
//
// String-free-ish per CLAUDE.md i18n-first: the one piece of user-facing
// text this module can emit (the overflow marker) is injectable via
// `options.labels`. The default is the `…` overflow GLYPH (not prose) — the
// one label object in this directory that legitimately keeps a default.

export interface DualStreamInput {
  /** Run-status / footer lines (e.g. buildLiveFooter() output). */
  statusLines: string[];
  /** Approval-card region lines. Takes priority for space over status. */
  approvalLines: string[];
  /** Terminal column budget. Each returned line is truncated to fit. */
  width: number;
  /** Terminal row budget. The returned line-list never exceeds this length. */
  height: number;
}

export interface DualStreamLabels {
  /** Shown as the last visible line of a region when its content was cropped to fit `height`. */
  overflow: string;
}

export const DEFAULT_DUAL_STREAM_LABELS: DualStreamLabels = {
  overflow: '…',
};

export interface DualStreamOptions {
  /** String-free i18n seam — caller injects translated labels; see file header. */
  labels?: Partial<DualStreamLabels>;
}

function truncateToWidth(text: string, width: number): string {
  const safeWidth = Math.max(1, width);
  if (text.length <= safeWidth) return text;
  if (safeWidth === 1) return text.slice(0, 1);
  return `${text.slice(0, safeWidth - 1)}…`;
}

/**
 * Fit `lines` into `allocated` rows. When `lines` already fits, returns it
 * unchanged (padding is never added — callers decide how to treat a
 * shorter-than-allocated region). When it doesn't fit and 2+ rows are
 * available, the last row becomes the overflow marker so truncation is
 * never silent. At exactly 1 allocated row there is no room for BOTH real
 * content and a marker glyph — showing only the marker would mean the
 * region communicates nothing at all, which is worse than showing its
 * first real line with no marker. Real content always wins that trade-off.
 */
function allocateRegion(lines: string[], allocated: number, overflowLabel: string): string[] {
  if (allocated <= 0) return [];
  if (lines.length <= allocated) return lines;
  if (allocated === 1) return lines.slice(0, 1);
  return [...lines.slice(0, allocated - 1), overflowLabel];
}

/**
 * Compose the run-status footer and the approval-card region into a single,
 * non-overlapping, region-allocated line-list sized to `{width, height}`.
 */
export function composeDualStream(input: DualStreamInput, options: DualStreamOptions = {}): string[] {
  const labels: DualStreamLabels = { ...DEFAULT_DUAL_STREAM_LABELS, ...options.labels };
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(0, Math.floor(input.height));
  if (height === 0) return [];

  const statusLines = input.statusLines.map((line) => truncateToWidth(line, width));
  const approvalLines = input.approvalLines.map((line) => truncateToWidth(line, width));
  const overflowLabel = truncateToWidth(labels.overflow, width);

  const statusFloor = statusLines.length > 0 ? Math.min(1, height) : 0;
  const approvalRows = Math.min(approvalLines.length, Math.max(0, height - statusFloor));
  const approvalRegion = allocateRegion(approvalLines, approvalRows, overflowLabel);

  const remainingForStatus = height - approvalRegion.length;
  const statusRows = Math.min(statusLines.length, remainingForStatus);
  const statusRegion = allocateRegion(statusLines, statusRows, overflowLabel);

  return [...approvalRegion, ...statusRegion];
}
