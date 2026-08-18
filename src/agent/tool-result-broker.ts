// ═══ tool-result-broker — the ONE tool-result containment chokepoint ════════
//
// NT-01/04/05. Every tool result that reaches the agent loop passes through
// `containToolResult`. Without it a single `cat` of a large file (the real
// 470k-char trace that motivated this task) is pasted verbatim into the
// conversation, blowing the context window in one turn and — worse — a
// non-zero exit is silently reported to the model as success.
//
// Two invariants this module owns:
//
//   NT-01/04 (BUDGET)  A result larger than the preview cap NEVER reaches the
//     model whole. The full bytes go to the session content store (atomic
//     temp+rename, sha256-named); the model receives preview + digest +
//     contentRef + counts. Under the cap the text is passed through inline,
//     byte-identical — containment must never degrade a small result.
//
//   NT-05 (EXIT-CODE TRUTH)  `ok` is never fabricated. It is the AND of what
//     the caller observed (real exit code / signal / timeout) and what the
//     output's own protocol markers say. `resolveExitTruth` can only ever
//     DOWNGRADE ok — no code path upgrades a failure into a success.
//
// STRING POLICY: the `[deckent] …` / `[exit N]` / `[mcp-error] …` markers
// produced here are model-facing PROTOCOL strings, not a localization surface
// — the same rule chat-tool-exec.ts already documents for its `[mcp-error]` /
// `[deckent] truncated (…)` returns. User-facing text stays in messages.ts.

import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Budget constants ───────────────────────────────────────────────────────

/** Default preview budget handed to the model when a result overflows. */
export const DEFAULT_MAX_PREVIEW_BYTES = 16_384;
/** Ceiling on any caller-supplied preview budget. */
export const HARD_MAX_PREVIEW_BYTES = 65_536;
/** Ceiling on the RENDERED string — what actually reaches the loop. */
export const RENDER_HARD_CAP_BYTES = 65_536;
/** stderr rides its own bounded field; it never eats the stdout preview. */
export const STDERR_PREVIEW_BYTES = 4_096;
/** Coarse bytes→tokens heuristic (~4 bytes/token), enough for budget triage. */
const BYTES_PER_TOKEN = 4;
/** Summary is the first non-empty line, hard-capped. */
const SUMMARY_MAX_CHARS = 200;

// ─── Protocol markers (the contract; the detail after them is diagnostic) ────

/** Trailing `[exit N]` marker appended by defaultBashRun for a non-zero exit. */
const EXIT_MARKER_RE = /\[exit (-?\d+)\]\s*$/;
const MCP_ERROR_RE = /^\[mcp-error\]/m;
const DENIED_RE = /^\[deckent-denied\]/m;
const TIMEOUT_RE = /timed out after/;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Why a result is `ok:false`. `null` only when the result is ok. */
export type ToolResultFailureReason =
  | 'exit-code'
  | 'signal'
  | 'timeout'
  | 'spawn-error'
  | 'denied'
  | 'tool-error';

/** What a dispatcher observed for one tool invocation. */
export interface RawToolResult {
  /** Combined stdout / tool output. Never includes stderr (separate field). */
  output: string;
  /** What the CALLER believes. Marker truth may downgrade it, never upgrade it. */
  ok: boolean;
  exitCode?: number | null;
  signal?: string | null;
  stderr?: string;
  /** Typed reason when the caller already knows it (timeout, denial, …). */
  reason?: ToolResultFailureReason;
}

/** Receipt from a content-store write. */
export interface ContentWriteReceipt {
  readonly path: string;
  readonly sha256: string;
}

/**
 * Minimal write seam so the session scratch store (task 2) can be injected
 * without this module depending on it. `write` may throw — a store failure is
 * reported honestly in the envelope, never swallowed into a fake contentRef.
 */
export interface ContentWriter {
  write(bytes: Buffer): ContentWriteReceipt;
}

/** The canonical, budget-bounded shape every tool result reaches the loop as. */
export interface ToolResultEnvelope {
  /** First non-empty line, ≤200 chars. */
  summary: string;
  /** UTF-8-safe prefix of the output, ≤ the resolved preview cap. */
  boundedPreview: string;
  /** Path to the full bytes in the content store; null when nothing spilled. */
  contentRef: string | null;
  /** sha256 of the FULL output bytes (not the preview). */
  sha256: string;
  /** Byte length of the FULL output. */
  bytes: number;
  approxTokens: number;
  truncated: boolean;
  exitCode: number | null;
  ok: boolean;
  reason: ToolResultFailureReason | null;
  /** Bounded stderr — a separate channel, never merged into `boundedPreview`. */
  stderr: string | null;
  /** Set when the overflow bytes could NOT be persisted (honest degradation). */
  storeError: string | null;
}

export interface ContainToolResultOptions {
  /** Where overflow bytes land. See {@link createSessionContentStore}. */
  store: ContentWriter;
  /** Preview budget in bytes; clamped to [1, HARD_MAX_PREVIEW_BYTES]. */
  maxPreviewBytes?: number;
}

// ─── UTF-8-safe slicing ─────────────────────────────────────────────────────

/**
 * Byte-slice `buf` to at most `maxBytes` WITHOUT splitting a multi-byte UTF-8
 * character (a naive subarray+toString yields a U+FFFD replacement char and,
 * for a JSON tool_result, an invalid payload). If the byte at the cut position
 * is a continuation byte (10xxxxxx) the whole character straddling the
 * boundary is dropped.
 */
export function sliceUtf8(buf: Buffer, maxBytes: number): string {
  if (maxBytes <= 0) return '';
  if (buf.byteLength <= maxBytes) return buf.toString('utf8');
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString('utf8');
}

function clampPreviewBytes(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return DEFAULT_MAX_PREVIEW_BYTES;
  return Math.min(HARD_MAX_PREVIEW_BYTES, Math.max(1, Math.floor(requested)));
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, SUMMARY_MAX_CHARS);
  }
  return '';
}

// ─── NT-05 — exit-code truth ────────────────────────────────────────────────

/**
 * Resolve the honest (ok, exitCode, reason) triple for one raw result.
 *
 * Sources, in order, each of which may only DOWNGRADE `ok`:
 *   1. the caller's observation (real exit code / signal / typed reason),
 *   2. the output's own protocol markers — a trailing `[exit N]` (N≠0) from
 *      defaultBashRun, a `[mcp-error] …` line (timeout vs. generic tool error),
 *      a `[deckent-denied] …` line from the confirm gate.
 *
 * A caller that passes `ok:true` for output that ends `[exit 2]` gets
 * `ok:false` — that is the whole point of the chokepoint.
 */
export function resolveExitTruth(raw: RawToolResult): {
  ok: boolean;
  exitCode: number | null;
  reason: ToolResultFailureReason | null;
} {
  const output = typeof raw.output === 'string' ? raw.output : '';
  let ok = raw.ok === true;
  let exitCode = typeof raw.exitCode === 'number' ? raw.exitCode : null;
  let reason: ToolResultFailureReason | null = raw.reason ?? null;

  const fail = (why: ToolResultFailureReason): void => {
    ok = false;
    if (reason === null) reason = why;
  };

  if (typeof raw.signal === 'string' && raw.signal.length > 0) fail('signal');
  if (exitCode !== null && exitCode !== 0) fail('exit-code');

  const marker = EXIT_MARKER_RE.exec(output);
  if (marker !== null) {
    const marked = Number(marker[1]);
    if (Number.isFinite(marked) && marked !== 0) {
      fail('exit-code');
      if (exitCode === null) exitCode = marked;
    }
  }
  if (DENIED_RE.test(output)) fail('denied');
  else if (MCP_ERROR_RE.test(output)) fail(TIMEOUT_RE.test(output) ? 'timeout' : 'tool-error');

  return { ok, exitCode, reason: ok ? null : (reason ?? 'tool-error') };
}

// ─── The chokepoint ─────────────────────────────────────────────────────────

/**
 * Contain one raw tool result into the canonical bounded envelope.
 *
 * Over the preview cap → the FULL bytes are written to `opts.store`
 * (atomic, sha256-named) and the model gets preview + digest + contentRef +
 * counts. Under the cap → `contentRef` is null and the text is inline,
 * byte-identical to what the tool produced.
 */
export function containToolResult(raw: RawToolResult, opts: ContainToolResultOptions): ToolResultEnvelope {
  const output = typeof raw.output === 'string' ? raw.output : '';
  const cap = clampPreviewBytes(opts.maxPreviewBytes);
  const buf = Buffer.from(output, 'utf8');
  const bytes = buf.byteLength;
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const truncated = bytes > cap;
  const truth = resolveExitTruth(raw);

  let contentRef: string | null = null;
  let storeError: string | null = null;
  if (truncated) {
    try {
      const receipt = opts.store.write(buf);
      // The store computes its own digest; a mismatch means the persisted
      // bytes are NOT the bytes we summarised — report it, don't hand the
      // model a reference we cannot vouch for.
      if (receipt.sha256 !== sha256) storeError = 'content digest mismatch';
      else contentRef = receipt.path;
    } catch (err) {
      storeError = err instanceof Error ? err.message : String(err);
    }
  }

  const rawStderr = typeof raw.stderr === 'string' ? raw.stderr : '';

  return {
    summary: firstNonEmptyLine(output),
    boundedPreview: truncated ? sliceUtf8(buf, cap) : output,
    contentRef,
    sha256,
    bytes,
    approxTokens: Math.ceil(bytes / BYTES_PER_TOKEN),
    truncated,
    exitCode: truth.exitCode,
    ok: truth.ok,
    reason: truth.reason,
    stderr: rawStderr.length > 0 ? sliceUtf8(Buffer.from(rawStderr, 'utf8'), STDERR_PREVIEW_BYTES) : null,
    storeError,
  };
}

// ─── Model-facing rendering ─────────────────────────────────────────────────

/** True when the text already carries a marker that tells the model it failed. */
function failureIsVisible(text: string): boolean {
  return EXIT_MARKER_RE.test(text) || MCP_ERROR_RE.test(text) || DENIED_RE.test(text);
}

/**
 * Render the envelope into the bounded string the agent loop feeds back as
 * tool_result content. Guarantees:
 *   • ≤ RENDER_HARD_CAP_BYTES, always;
 *   • an untruncated, ok, stderr-free result renders BYTE-IDENTICAL to the raw
 *     output, so the existing `[mcp-error]` / `[deckent-denied]` prefix
 *     matching in native-tool-registry.ts / run.tsx keeps working unchanged;
 *   • a failure the preview does not already advertise gets an explicit
 *     not-ok line — the model is never told a failed command succeeded.
 */
export function renderToolResultEnvelope(env: ToolResultEnvelope): string {
  const tail: string[] = [];
  if (env.stderr !== null) tail.push(`[deckent-stderr] ${env.stderr}`);
  if (env.truncated) {
    const counts = `${env.bytes} bytes (~${env.approxTokens} tokens), sha256:${env.sha256}`;
    tail.push(
      env.contentRef !== null
        ? `[deckent] tool-result truncated: ${counts}; full content at ${env.contentRef}`
        : `[deckent] tool-result truncated: ${counts}; full content unavailable${env.storeError !== null ? ` (${env.storeError})` : ''}`,
    );
  }
  if (!env.ok && !failureIsVisible(env.boundedPreview)) {
    tail.push(
      `[deckent] tool-result not ok: ${env.reason ?? 'tool-error'}${env.exitCode !== null ? ` (exit ${env.exitCode})` : ''}`,
    );
  }
  if (tail.length === 0) return env.boundedPreview;

  const tailText = `\n${tail.join('\n')}`;
  const budget = RENDER_HARD_CAP_BYTES - Buffer.byteLength(tailText, 'utf8');
  const head = sliceUtf8(Buffer.from(env.boundedPreview, 'utf8'), Math.max(0, budget));
  return `${head}${tailText}`;
}

/** Contain + render in one call — the shape both dispatchers use. */
export function brokerToolResult(raw: RawToolResult, opts: ContainToolResultOptions): string {
  return renderToolResultEnvelope(containToolResult(raw, opts));
}

// ─── Standalone session content store ───────────────────────────────────────

/**
 * Session-scoped fallback content store: a lazily-created `mkdtemp` directory
 * under the OS temp dir (never the source tree, never a hardcoded `/tmp`),
 * 0700 on POSIX, files 0600, written temp+rename so a reader never observes a
 * partial file. Lazy on purpose — a session whose tool results all stay under
 * the preview cap never creates a directory at all.
 *
 * Mode bits are best-effort: Windows has no POSIX mode, so a chmod failure is
 * tolerated rather than turning a working session into a hard error.
 */
export function createSessionContentStore(opts: { prefix?: string } = {}): ContentWriter {
  const prefix = opts.prefix ?? 'deckent-tool-content-';
  let root: string | null = null;
  const ensureRoot = (): string => {
    if (root !== null) return root;
    const created = mkdtempSync(join(tmpdir(), prefix));
    if (process.platform !== 'win32') {
      try { chmodSync(created, 0o700); } catch { /* best-effort */ }
    }
    root = created;
    return created;
  };
  return {
    write(bytes: Buffer): ContentWriteReceipt {
      const dir = ensureRoot();
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const target = join(dir, `content-${sha256}.bin`);
      const temporary = join(dir, `.content-${sha256}.${process.pid}.tmp`);
      writeFileSync(temporary, bytes, { mode: 0o600 });
      renameSync(temporary, target);
      if (process.platform !== 'win32') {
        try { chmodSync(target, 0o600); } catch { /* best-effort */ }
      }
      return { path: target, sha256 };
    },
  };
}
