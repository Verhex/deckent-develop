// Composer paste collapse — localized display chip vs full wire payload on submit.

import {
  DEFAULT_TERMINAL_WORKLINE_COMPOSER,
  resolveTerminalWorklineComposer,
  type TerminalWorklineConfig,
} from '../../core/terminal-workline-contract.js';

export interface PasteComposerPolicy {
  readonly maxLinesInline: number;
  readonly maxCharsInline: number;
}

export const DEFAULT_PASTE_COMPOSER_POLICY: PasteComposerPolicy = {
  maxLinesInline: DEFAULT_TERMINAL_WORKLINE_COMPOSER.paste_max_lines_inline,
  maxCharsInline: DEFAULT_TERMINAL_WORKLINE_COMPOSER.paste_max_chars_inline,
};

export function pastePolicyFromTerminalWorkline(workline: TerminalWorklineConfig | undefined): PasteComposerPolicy {
  const resolved = resolveTerminalWorklineComposer(workline);
  return { maxLinesInline: resolved.paste_max_lines_inline, maxCharsInline: resolved.paste_max_chars_inline };
}

export interface PasteAttachment {
  readonly id: string;
  readonly fullText: string;
  readonly lineCount: number;
  readonly byteLength: number;
  /** Exact substring stored in the composer buffer (must match for wire expansion). */
  readonly chipText: string;
}

export interface PasteChipLabels {
  readonly chip: string;
}

let pasteIdSeq = 0;

export function nextPasteId(): string {
  pasteIdSeq += 1;
  return `paste-${pasteIdSeq}`;
}

/** True when the line is only spaces + box-drawing / table frame (Ink scrollback copies). */
function isTerminalFrameLine(trimmed: string): boolean {
  if (trimmed.length === 0) return false;
  for (const ch of trimmed) {
    if (/\s/.test(ch) || ch === '|') continue;
    const code = ch.codePointAt(0) ?? 0;
    // Unicode Box Drawing block (U+2500–U+257F) + fullwidth vertical bar.
    if (code >= 0x2500 && code <= 0x257f) continue;
    if (ch === '│') continue;
    return false;
  }
  return true;
}

/** Prior paste chips copied from scrollback (EN/TR templates). */
function isCopiedPasteChipLine(trimmed: string): boolean {
  return /^\[(?:Pasted text|Yapıştırılan metin) · \d+ (?:lines|satır) · [^\]]+\](?: \(#\d+\))?$/.test(trimmed);
}

/** Drop lines that are only TUI/table box-drawing (common when copying from terminal UI). */
export function stripTerminalCopyArtifactLines(text: string): string {
  const lines = text.split('\n');
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;
    if (isTerminalFrameLine(trimmed)) return false;
    if (isCopiedPasteChipLine(trimmed)) return false;
    // Markdown/terminal table rows copied from scrollback (multi-column │…│).
    if (/^[│|]/.test(trimmed) && (trimmed.match(/[│|]/g)?.length ?? 0) >= 2) return false;
    return true;
  });
  return kept.join('\n').replace(/^\n+|\n+$/g, '');
}

export function countPasteLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split('\n').length;
}

export function shouldCollapsePaste(text: string, policy: PasteComposerPolicy = DEFAULT_PASTE_COMPOSER_POLICY): boolean {
  if (text.length === 0) return false;
  return countPasteLines(text) > policy.maxLinesInline || text.length > policy.maxCharsInline;
}

/** Build localized chip text; `{lines}` and `{bytes}` are replaced. */
export function formatPasteChip(labels: PasteChipLabels, attachment: Pick<PasteAttachment, 'lineCount' | 'byteLength'>): string {
  return labels.chip
    .replace('{lines}', String(attachment.lineCount))
    .replace('{bytes}', String(attachment.byteLength));
}

export interface ComposerSubmitParts {
  /** Visible composer + transcript ingress line (may include chips). */
  readonly display: string;
  /** Full outbound prompt (chips expanded to original paste bodies). */
  readonly wire: string;
  /** Persistence / rawIntent: user-visible intent without expanded paste bodies. */
  readonly rawIntent: string;
}

/** Insert visible chip text so buffer indices match CaretText rendering. */
export function insertPasteChip(displayBuffer: string, cursor: number, chipText: string): { buffer: string; cursor: number } {
  const before = displayBuffer.slice(0, cursor);
  const after = displayBuffer.slice(cursor);
  const spacerBefore = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const spacerAfter = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const insert = `${spacerBefore}${chipText}${spacerAfter}`;
  const next = before + insert + after;
  return { buffer: next, cursor: before.length + insert.length };
}

export function uniquePasteChipText(
  labels: PasteChipLabels,
  attachment: Pick<PasteAttachment, 'lineCount' | 'byteLength'>,
  used: ReadonlySet<string>,
): string {
  let chip = formatPasteChip(labels, attachment);
  if (!used.has(chip)) return chip;
  let n = 2;
  while (used.has(`${chip} (#${n})`)) n += 1;
  return `${chip} (#${n})`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match localized paste chips; `{bytes}` slot tolerates in-chip edits (e.g. sada433 B). */
export function pasteChipRegex(chipTemplate: string): RegExp {
  const lineParts = chipTemplate.split('{lines}');
  const beforeLines = lineParts[0] ?? '';
  const afterLines = lineParts[1] ?? '';
  const byteParts = afterLines.split('{bytes}');
  const betweenBytes = byteParts[0] ?? '';
  const afterBytes = byteParts[1] ?? '';
  const body = `${escapeRegExp(beforeLines)}\\d+${escapeRegExp(betweenBytes)}[^\\]]+${escapeRegExp(afterBytes)}(?: \\(#\\d+\\))?`;
  return new RegExp(body, 'g');
}

export function snapCaretOutsidePasteChips(buffer: string, cursor: number, chipTemplate: string): number {
  const re = pasteChipRegex(chipTemplate);
  for (const match of buffer.matchAll(re)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (cursor > start && cursor < end) return end;
  }
  return cursor;
}

/** Restore canonical chip labels after partial in-chip edits (display only). */
export function reconcilePasteChipDisplay(
  buffer: string,
  attachments: ReadonlyMap<string, PasteAttachment>,
  chipTemplate: string,
): string {
  const atts = [...attachments.values()];
  let i = 0;
  return buffer.replace(pasteChipRegex(chipTemplate), (match) => {
    const att = atts[i++];
    return att?.chipText ?? match;
  });
}

export function expandComposerSubmit(
  display: string,
  attachments: ReadonlyMap<string, PasteAttachment>,
  labels: PasteChipLabels,
): ComposerSubmitParts {
  let wire = display;
  const byChipLen = [...attachments.values()].sort((a, b) => b.chipText.length - a.chipText.length);
  for (const attachment of byChipLen) {
    wire = wire.split(attachment.chipText).join(attachment.fullText);
  }
  const atts = [...attachments.values()];
  let idx = 0;
  wire = wire.replace(pasteChipRegex(labels.chip), () => {
    const att = atts[idx++];
    return att?.fullText ?? '';
  });
  return { display, wire, rawIntent: display.trim() };
}

export function createPasteAttachment(
  fullText: string,
  chipText: string,
  id: string = nextPasteId(),
): PasteAttachment {
  return {
    id,
    fullText,
    lineCount: countPasteLines(fullText),
    byteLength: fullText.length,
    chipText,
  };
}
