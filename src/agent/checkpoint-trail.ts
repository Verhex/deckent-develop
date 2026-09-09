// src/agent/checkpoint-trail.ts
// ═══ Checkpoint tool trail — host-derived working state (7110) ══════════════
// MASTER 7110 TERMINAL-CHECKPOINT-CONTINUITY-001. Measured root cause (native
// terminal session chat-2026-09-09T12-21-46, local model, 131k window): after a
// checkpoint the next epoch opened on the raw intent + a payload whose
// `findings/decisions/nextActions` were empty and whose only evidence was a raw
// content-store PATH the model could not open (DECKENT_E005). The model
// restarted from zero, re-read the same ranges, hit the next checkpoint, and
// looped for 30 minutes without answering.
//
// This module owns the fix on the HOST side, with no model call anywhere:
//   • `ToolTrailRecorder` derives, from the loop's own event stream, the ordered
//     list of tool calls the turn already made (tool + canonical args digest +
//     bounded args excerpt + result digest/bytes/excerpt + ok truth) and keeps a
//     bounded in-memory copy of each rendered result for the replay guard;
//   • `renderToolTrail` turns that trail into the deterministic epoch-opening
//     block (labels injected — this module is string-free apart from protocol
//     markers; the English defaults below are the fallback the quality bar
//     allows for mechanism modules, the CLI injects `getMessage` EN/TR text);
//   • `hostStampCheckpoint` merges a MODEL-written checkpoint (summary fields
//     only) with the host trail: `createdAt` is always host-stamped and the
//     model can never shrink or replace the trail.
//
// Reference identities are sha256 digests readable through the session's
// content-ref tool — never raw paths.

import { createHash } from 'node:crypto';
import {
  parseScratchCheckpointPayload,
  SCRATCH_CHECKPOINT_SCHEMA_VERSION,
  type CheckpointCounters,
  type CheckpointToolTrailEntry,
  type ScratchCheckpointPayload,
} from './scratch-checkpoint.js';
import type { ContentWriter } from './tool-result-broker.js';
import { estimateTokens } from './context-budget.js';

// ─── Bounds ─────────────────────────────────────────────────────────────────

/** Chars of canonical args kept per trail entry. */
export const TRAIL_ARGS_EXCERPT_CHARS = 200;
/** Chars of the result's first line kept per trail entry. */
export const TRAIL_RESULT_EXCERPT_CHARS = 160;
/** Chars of the last visible assistant text carried across an epoch (payload). */
export const TRAIL_LAST_ASSISTANT_CHARS = 1_200;
/** Tighter per-entry bounds for the RENDERED opening (the payload keeps the wider ones). */
export const OPENING_ARGS_EXCERPT_CHARS = 120;
export const OPENING_RESULT_EXCERPT_CHARS = 80;
/** Opening budget when no context authority is known — a fixed, conservative
 *  ceiling on what we send, never an assumed window. */
export const TRAIL_OPENING_FALLBACK_TOKENS = 768;
/** Share of the opening budget the last-assistant block may take. */
const OPENING_LAST_ASSISTANT_SHARE = 0.25;
/** Hard floor/ceiling on the config-resolved entry bound (a misconfigured
 *  zero would silently disable the guard; an enormous value is unbounded memory). */
const TRAIL_ENTRIES_MIN = 1;
const TRAIL_ENTRIES_MAX = 4_096;

/** `sha256:<hex>` the broker's truncation marker names for the FULL bytes. */
const FULL_CONTENT_DIGEST_RE = /\[deckent\] tool-result truncated: .*?sha256:([a-f0-9]{64})/u;
/** Marker prefixes that mean "not ok" in a rendered envelope (mirrors the broker). */
const NOT_OK_MARKER_RE = /^\[deckent\] tool-result not ok:|^\[mcp-error\]|^\[deckent-denied\]|\[exit (?:-?\d+)\]\s*$/mu;

// ─── Canonical identity ─────────────────────────────────────────────────────

/**
 * Recursive sorted-key JSON. NOT `JSON.stringify(value, sortedTopLevelKeys)`:
 * a replacer ARRAY filters every nesting level to those key names, so nested
 * args silently collapse and two different calls digest identically.
 */
export function canonicalToolArgs(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return value === undefined ? 'null' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalToolArgs).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalToolArgs(record[key])}`).join(',')}}`;
}

/** sha256 over `tool + U+0000 + canonicalJson(args)` — the byte-identical-call
 *  identity (the separator is written as the `'\\u0000'` escape so the source
 *  stays a text file; NUL can never occur inside a tool name). */
export function toolCallDigest(tool: string, args: Record<string, unknown>): string {
  return createHash('sha256').update(tool, 'utf8').update('\u0000').update(canonicalToolArgs(args), 'utf8').digest('hex');
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function boundChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}…[${text.length} chars]`;
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

/** Clamp the config-resolved bound into a sane, non-zero range. */
export function resolveTrailEntryBound(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isSafeInteger(requested)) return TRAIL_ENTRIES_MIN;
  return Math.min(TRAIL_ENTRIES_MAX, Math.max(TRAIL_ENTRIES_MIN, requested));
}

// ─── Recorder ───────────────────────────────────────────────────────────────

/** One trail entry plus the in-memory rendered output the replay guard serves. */
export interface ToolTrailRecord extends CheckpointToolTrailEntry {
  /** The rendered result envelope exactly as the model saw it (bounded by the
   *  broker's render cap). `null` once evicted or when the result was never
   *  completed — a replay is then impossible, never approximated. */
  output: string | null;
}

interface PendingCall {
  readonly tool: string;
  readonly argsDigest: string;
  readonly argsExcerpt: string;
}

/**
 * Derives the tool trail of one turn from `tool-proposed` / `tool-result`
 * events. Bounded: at most `maxEntries` completed records are retained (oldest
 * evicted first); a proposal that never completes is dropped at `reset()`.
 * Every completed result is ALSO persisted to the content store (when one is
 * supplied) so the payload can cite it by digest — a persistence failure keeps
 * the record with `resultRef: null`, never a fabricated reference.
 */
export class ToolTrailRecorder {
  private readonly pending = new Map<string, PendingCall>();
  private records: ToolTrailRecord[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number, private readonly store?: ContentWriter) {
    this.maxEntries = resolveTrailEntryBound(maxEntries);
  }

  /** New user turn: the trail is per turn, so everything goes. */
  reset(): void {
    this.pending.clear();
    this.records = [];
  }

  propose(id: string, tool: string, args: Record<string, unknown>): void {
    const canonical = canonicalToolArgs(args);
    this.pending.set(id, {
      tool,
      argsDigest: toolCallDigest(tool, args),
      argsExcerpt: boundChars(canonical, TRAIL_ARGS_EXCERPT_CHARS),
    });
  }

  complete(id: string, ok: boolean, output: string): ToolTrailRecord | undefined {
    const call = this.pending.get(id);
    if (!call) return undefined;
    this.pending.delete(id);
    const bytes = Buffer.from(output, 'utf8');
    let resultRef: string | null = null;
    if (this.store) {
      try {
        const receipt = this.store.write(bytes);
        const expected = createHash('sha256').update(bytes).digest('hex');
        if (receipt.sha256 === expected) resultRef = receipt.sha256;
      } catch { /* honest null — the record survives, the reference does not */ }
    }
    const fullContentRef = FULL_CONTENT_DIGEST_RE.exec(output)?.[1] ?? null;
    const record: ToolTrailRecord = {
      tool: call.tool,
      argsDigest: call.argsDigest,
      argsExcerpt: call.argsExcerpt,
      resultRef,
      resultBytes: bytes.byteLength,
      resultExcerpt: boundChars(firstNonEmptyLine(output), TRAIL_RESULT_EXCERPT_CHARS),
      // The loop's truth is authority; a marker can only downgrade it.
      ok: ok && !NOT_OK_MARKER_RE.test(output),
      fullContentRef,
      output,
    };
    this.records.push(record);
    while (this.records.length > this.maxEntries) this.records.shift();
    return record;
  }

  /** Drop a proposal that must not become a record (a served replay). */
  discard(id: string): void {
    this.pending.delete(id);
  }

  /** A side-effecting call ran: history stays, but no earlier result may be
   *  served again — a read after a write is genuinely new work. */
  invalidateReplay(): void {
    for (const record of this.records) record.output = null;
  }

  /**
   * Persist the FULL trail (payload view) to the content store and return its
   * digest — the reference the epoch opening cites for entries it had to omit.
   * `null` when there is no store or the write could not be verified.
   */
  persistTrail(): string | null {
    if (!this.store || this.records.length === 0) return null;
    try {
      const bytes = Buffer.from(JSON.stringify(this.entries()), 'utf8');
      const receipt = this.store.write(bytes);
      return receipt.sha256 === createHash('sha256').update(bytes).digest('hex') ? receipt.sha256 : null;
    } catch { return null; }
  }

  /** Payload view — never the in-memory outputs. */
  entries(): CheckpointToolTrailEntry[] {
    return this.records.map(({ output: _output, ...entry }) => ({ ...entry }));
  }

  /** Latest completed record for a byte-identical call, if still retained. */
  find(argsDigest: string): ToolTrailRecord | undefined {
    for (let index = this.records.length - 1; index >= 0; index--) {
      const record = this.records[index]!;
      if (record.argsDigest === argsDigest) return record;
    }
    return undefined;
  }

  get size(): number { return this.records.length; }
}

// ─── Rendering (labels injected) ────────────────────────────────────────────

export interface CheckpointTrailLabels {
  /** Heading of the trail block. */
  heading: string;
  /** How to read the bytes; `{tool}` is substituted with the content-ref tool name. */
  readHint: string;
  statusOk: string;
  statusFailed: string;
  /** Heading of the last visible assistant text block. */
  lastAssistantHeading: string;
  /** Note appended to a result served by the replay guard instead of executed. */
  replayNote: string;
  /** Honest omission line: `{count}` earlier entries, `{digest}` of the full
   *  trail, `{tool}` the content-ref tool. */
  omitted: string;
}

/** Mechanism-module fallback (quality bar: English default, caller injects i18n). */
export const DEFAULT_CHECKPOINT_TRAIL_LABELS: Readonly<CheckpointTrailLabels> = Object.freeze({
  heading: 'Tool calls already executed this turn — identical calls are served from this trail, not re-run:',
  readHint: 'Bytes are addressed by sha256 digest only: read them with {tool} (ref = digest, offset/limit in bytes). Do not read them by path.',
  statusOk: 'ok',
  statusFailed: 'failed',
  lastAssistantHeading: 'Last visible assistant text before the checkpoint:',
  replayNote: 'served from checkpoint trail — this exact call already ran this turn; use the result above or call something different',
  omitted: '{count} earlier entries omitted; the full trail is sha256:{digest}, readable with {tool}.',
});

/** Window-derived token budget for the rendered opening: `share` of the
 *  window, capped at half the transcript reserve; fixed fallback without a window. */
export function resolveTrailOpeningBudget(input: {
  windowTokens: number | undefined;
  trailShare: number;
  transcriptReserveShare: number;
}): number {
  if (input.windowTokens === undefined || !(input.windowTokens > 0)) return TRAIL_OPENING_FALLBACK_TOKENS;
  const share = Math.min(input.trailShare, input.transcriptReserveShare / 2);
  return Math.max(64, Math.floor(input.windowTokens * share));
}

export interface RenderToolTrailOptions {
  /** Token ceiling for the whole rendered block (trail + last assistant). */
  budgetTokens: number;
  /** Digest of the full persisted trail, cited when entries are omitted. */
  trailRef: string | null;
}

/** One rendered opening line. At most ONE digest per line: the full-content
 *  ref when the result spilled (that is where the bytes are), else the result
 *  ref only when the excerpt did not already capture the whole result. */
function renderTrailLine(index: number, entry: CheckpointToolTrailEntry, labels: CheckpointTrailLabels): string {
  const status = entry.ok ? labels.statusOk : labels.statusFailed;
  const excerpt = boundChars(entry.resultExcerpt, OPENING_RESULT_EXCERPT_CHARS);
  const ref = entry.fullContentRef
    ? ` · full sha256:${entry.fullContentRef}`
    : entry.resultRef && entry.resultBytes > excerpt.length ? ` · result sha256:${entry.resultRef}` : '';
  return `${index}. ${entry.tool} ${boundChars(entry.argsExcerpt, OPENING_ARGS_EXCERPT_CHARS)} → ${status} · ${entry.resultBytes} bytes${ref}${excerpt.length > 0 ? ` · ${excerpt}` : ''}`;
}

/**
 * Deterministic, WINDOW-BOUNDED epoch-opening block (7110 B3). The full trail
 * lives on disk / in the content store; this renders the NEWEST entries that
 * fit `budgetTokens` (each as one bounded line, oldest-first in the output),
 * then an honest omission line naming how many earlier entries were dropped
 * and the digest of the full trail. Empty trail and no assistant text → empty
 * string (byte-identical pre-7110 objective for a turn without tool calls).
 */
export function renderToolTrail(
  entries: readonly CheckpointToolTrailEntry[],
  lastAssistantText: string,
  labels: CheckpointTrailLabels,
  contentRefTool: string,
  options: RenderToolTrailOptions,
): string {
  const parts: string[] = [];
  const budget = Math.max(1, Math.floor(options.budgetTokens));
  let assistantBlock = '';
  if (lastAssistantText.length > 0) {
    const assistantChars = Math.max(80, Math.floor(budget * OPENING_LAST_ASSISTANT_SHARE) * 4);
    assistantBlock = `[checkpoint-last-assistant] ${labels.lastAssistantHeading}\n${boundChars(lastAssistantText, assistantChars)}`;
  }
  if (entries.length > 0) {
    const heading = `[checkpoint-trail] ${labels.heading}`;
    const hint = labels.readHint.replace('{tool}', contentRefTool);
    const digest = options.trailRef ?? 'unavailable';
    const omissionFor = (count: number): string => count > 0
      ? `\n${labels.omitted.replace('{count}', String(count)).replace('{digest}', digest).replace('{tool}', contentRefTool)}`
      : '';
    const trailBudget = budget - estimateTokens(assistantBlock);
    // Newest first: the model must know what it JUST inspected; the oldest
    // entries are the ones cheapest to hand over to the on-disk trail.
    const kept: string[] = [];
    let used = estimateTokens(`${heading}\n${hint}${omissionFor(entries.length)}`);
    for (let index = entries.length - 1; index >= 0; index--) {
      const line = renderTrailLine(index + 1, entries[index]!, labels);
      const cost = estimateTokens(`${line}\n`);
      if (used + cost > trailBudget) break;
      used += cost;
      kept.unshift(line);
    }
    const omitted = entries.length - kept.length;
    parts.push(`${heading}${kept.length > 0 ? `\n${kept.join('\n')}` : ''}${omissionFor(omitted)}\n${hint}`);
  }
  if (assistantBlock.length > 0) parts.push(assistantBlock);
  return parts.length === 0 ? '' : `\n\n${parts.join('\n\n')}`;
}

/**
 * The checkpoint text that enters the TRANSCRIPT at compaction: the summary
 * projection only. `toolTrail` / `lastAssistantText` never ride the transcript
 * as JSON (measured: 64 entries = 87,930 B on a 32k window → a pressure
 * checkpoint loop) — the opening block carries their bounded rendering and
 * `toolTrailRef` points at the full trail.
 */
export function checkpointCompactionText(payload: ScratchCheckpointPayload): string {
  const { toolTrail, lastAssistantText, ...summary } = payload;
  return JSON.stringify({
    ...summary,
    ...(toolTrail !== undefined ? { toolTrailEntries: toolTrail.length } : {}),
    ...(lastAssistantText !== undefined ? { lastAssistantChars: lastAssistantText.length } : {}),
  });
}

/** Bound the last visible assistant text the way the payload carries it. */
export function boundLastAssistantText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= TRAIL_LAST_ASSISTANT_CHARS) return trimmed;
  return `${trimmed.slice(0, TRAIL_LAST_ASSISTANT_CHARS)}…[bounded: ${trimmed.length} chars, sha256:${sha256Hex(trimmed).slice(0, 16)}]`;
}

// ─── Host stamping of a MODEL-written checkpoint ────────────────────────────

export interface HostCheckpointState {
  /** Objective the host would open the epoch on (used when the model omits one). */
  objective: string;
  toolTrail: CheckpointToolTrailEntry[];
  /** Digest of the persisted full trail (content store), null when unavailable. */
  toolTrailRef: string | null;
  lastAssistantText: string;
  /** Host clock — the ONLY source of `createdAt`. */
  createdAt: string;
  /** Host counters win over model-authored ones on the same key. */
  counters: CheckpointCounters;
}

const SUMMARY_ARRAY_FIELDS = [
  'findings', 'evidenceRefs', 'decisions', 'unresolved', 'nextActions', 'inspectedAreas', 'toolResultDigests',
] as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Merge a model-authored checkpoint candidate with the host state into a valid
 * v2 payload, or `undefined` when the candidate's SUMMARY shape is malformed
 * (the caller then reports `CHECKPOINT_PAYLOAD_INVALID` and takes the
 * deterministic path). Strict on the shape the instruction asked for — a
 * missing array is a malformed reply, not an empty finding — and:
 *   • `createdAt` is host-stamped — the candidate's value is discarded;
 *   • `schemaVersion` is host-owned — whatever the model wrote is ignored;
 *   • `toolTrail`/`lastAssistantText` come from the host — the model can neither
 *     shrink nor replace them (a candidate carrying its own is ignored);
 *   • a blank objective falls back to the host objective;
 *   • counters: validated model counters, overlaid by the host's.
 */
export function hostStampCheckpoint(candidate: unknown, host: HostCheckpointState): ScratchCheckpointPayload | undefined {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
  const raw = candidate as Record<string, unknown>;
  const summary: Record<string, string[]> = {};
  for (const field of SUMMARY_ARRAY_FIELDS) {
    const value = raw[field];
    if (!isStringArray(value)) return undefined;
    summary[field] = [...value];
  }
  if (typeof raw.objective !== 'string') return undefined;
  const objective = raw.objective.trim().length > 0 ? raw.objective : host.objective;
  if (!raw.cumulativeCounters || typeof raw.cumulativeCounters !== 'object' || Array.isArray(raw.cumulativeCounters)) return undefined;
  const counters: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.cumulativeCounters as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    counters[key] = value;
  }
  Object.assign(counters, host.counters);
  const stamped: ScratchCheckpointPayload = {
    schemaVersion: SCRATCH_CHECKPOINT_SCHEMA_VERSION,
    objective,
    findings: summary.findings!,
    evidenceRefs: summary.evidenceRefs!,
    decisions: summary.decisions!,
    unresolved: summary.unresolved!,
    nextActions: summary.nextActions!,
    inspectedAreas: summary.inspectedAreas!,
    toolResultDigests: summary.toolResultDigests!,
    cumulativeCounters: counters,
    createdAt: host.createdAt,
    toolTrail: host.toolTrail.map((entry) => ({ ...entry })),
    lastAssistantText: host.lastAssistantText,
    toolTrailRef: host.toolTrailRef,
  };
  return parseScratchCheckpointPayload(stamped);
}
