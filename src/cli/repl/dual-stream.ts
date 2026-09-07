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
// String-free per AGENTS.md i18n-first: the caller owns the overflow glyph,
// resolved from the effective terminal capability. The mechanism has no
// hidden Unicode/English fallback.

import { displayWidth, segmentGraphemes } from './cursor-model.js';
import { requireInjectedLabel } from '../helpers/injected-label.js';

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

export interface DualStreamOptions {
  /** String-free i18n seam — caller injects translated labels; see file header. */
  labels?: Partial<DualStreamLabels>;
}

const ANSI_SEQUENCE = /(\x1b\[[0-?]*[ -/]*[@-~]|\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\))/gu;

function visibleWidth(text: string): number {
  return displayWidth(text.replace(ANSI_SEQUENCE, ''));
}

function closeOpenOsc8(text: string): string {
  const osc8 = /\x1b\]8;[^;]*;([^\x07\x1b]*)(\x07|\x1b\\)/gu;
  let open = false;
  let terminator = '\x07';
  for (const match of text.matchAll(osc8)) {
    open = (match[1] ?? '').length > 0;
    terminator = match[2] ?? '\x07';
  }
  return open ? `\x1b]8;;${terminator}` : '';
}

function clipVisible(text: string, width: number): string {
  if (width <= 0) return '';
  let used = 0;
  let out = '';
  let cursor = 0;
  for (const match of text.matchAll(ANSI_SEQUENCE)) {
    const index = match.index;
    for (const cluster of segmentGraphemes(text.slice(cursor, index))) {
      const cells = displayWidth(cluster);
      if (used + cells > width) return out;
      out += cluster;
      used += cells;
    }
    out += match[0];
    cursor = index + match[0].length;
  }
  for (const cluster of segmentGraphemes(text.slice(cursor))) {
    const cells = displayWidth(cluster);
    if (used + cells > width) break;
    out += cluster;
    used += cells;
  }
  return out;
}

function truncateToWidth(text: string, width: number, overflowValue: string | undefined): string {
  if (visibleWidth(text) <= width) return text;
  const overflow = requireInjectedLabel('dualStream.overflow', overflowValue);
  const marker = clipVisible(overflow, width);
  const contentBudget = Math.max(0, width - visibleWidth(marker));
  const content = clipVisible(text, contentBudget);
  const osc8Close = closeOpenOsc8(content);
  const reset = content.includes('\x1b[') ? '\x1b[0m' : '';
  return `${content}${osc8Close}${marker}${reset}`;
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
function allocateRegion(lines: string[], allocated: number, overflowValue: string | undefined, width: number): string[] {
  if (allocated <= 0) return [];
  if (lines.length <= allocated) return lines;
  if (allocated === 1) return lines.slice(0, 1);
  return [
    ...lines.slice(0, allocated - 1),
    truncateToWidth(requireInjectedLabel('dualStream.overflow', overflowValue), width, overflowValue),
  ];
}

/**
 * Compose the run-status footer and the approval-card region into a single,
 * non-overlapping, region-allocated line-list sized to `{width, height}`.
 */
export function composeDualStream(input: DualStreamInput, options: DualStreamOptions = {}): string[] {
  const width = Number.isFinite(input.width) ? Math.max(1, Math.floor(input.width)) : 1;
  const height = Number.isFinite(input.height) ? Math.max(0, Math.floor(input.height)) : 0;
  if (height === 0) return [];

  const overflowValue = options.labels?.overflow;
  const statusLines = input.statusLines.map((line) => truncateToWidth(line, width, overflowValue));
  const approvalLines = input.approvalLines.map((line) => truncateToWidth(line, width, overflowValue));

  const statusFloor = statusLines.length > 0 ? Math.min(1, height) : 0;
  const approvalRows = Math.min(approvalLines.length, Math.max(0, height - statusFloor));
  const approvalRegion = allocateRegion(approvalLines, approvalRows, overflowValue, width);

  const remainingForStatus = height - approvalRegion.length;
  const statusRows = Math.min(statusLines.length, remainingForStatus);
  const statusRegion = allocateRegion(statusLines, statusRows, overflowValue, width);

  return [...approvalRegion, ...statusRegion];
}
