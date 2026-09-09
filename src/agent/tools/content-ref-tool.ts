// src/agent/tools/content-ref-tool.ts
// ═══ deckent_read_content_ref — digest-addressed read of session content ════
// 7110 (TERMINAL-CHECKPOINT-CONTINUITY-001). A checkpoint cites tool results
// and spilled outputs by sha256 digest. Before this tool the only way to reach
// those bytes was `deckent_read_file` on the raw content-store path — which is
// outside the readable project scope and fails with DECKENT_E005 (measured in
// the incident session). This tool reads a digest THROUGH the session's own
// content store: never a path, never a file the store did not write, bounded
// offset/limit in bytes, and every failure is a typed reason code.
//
// STRING POLICY: the `[deckent] …` / `[mcp-error] …` lines below are
// model-facing PROTOCOL markers (the rule tool-result-broker.ts documents),
// not user-facing text. The schema/description are provider tool_use metadata
// (English, like every other native tool definition).

import type { ContentRefReader } from '../session-tool-content.js';
import { DEFAULT_MAX_PREVIEW_BYTES, HARD_MAX_PREVIEW_BYTES } from '../tool-result-broker.js';
import type { ToolDefinition, ToolResult } from './types.js';

export const CONTENT_REF_TOOL_NAME = 'deckent_read_content_ref';
/** Default slice — the broker's own preview budget, so a slice never re-spills. */
export const CONTENT_REF_DEFAULT_LIMIT_BYTES = DEFAULT_MAX_PREVIEW_BYTES;
/** Ceiling on one slice — the broker's hard preview cap (a bigger slice would
 *  be truncated and spilled again on its way back to the model). */
export const CONTENT_REF_MAX_LIMIT_BYTES = HARD_MAX_PREVIEW_BYTES;

const SHA256_HEX_RE = /^[a-f0-9]{64}$/;

export const CONTENT_REF_TOOL_SCHEMA: Record<string, unknown> = Object.freeze({
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
      description: 'sha256 digest as named by a checkpoint trail, truncation marker or earlier meta line. Never a path.',
    },
    offset: { type: 'integer', minimum: 0, description: 'Start byte offset (default 0).' },
    limit: {
      type: 'integer', minimum: 1, maximum: CONTENT_REF_MAX_LIMIT_BYTES,
      description: `How many bytes to return from offset (default ${CONTENT_REF_DEFAULT_LIMIT_BYTES}, max ${CONTENT_REF_MAX_LIMIT_BYTES}).`,
    },
  },
  required: ['ref'],
  additionalProperties: false,
});

export const CONTENT_REF_TOOL_DESCRIPTION =
  'Read a byte range of a session content reference by sha256 digest (as named by a checkpoint trail or a truncated tool-result marker). Returns a "[deckent] read_content_ref: …" meta line (offset, bytes, totalBytes, hasMore, nextOffset) then the UTF-8 text. Digests only, never paths.';

export type ContentRefToolArgs = { ref: string; offset: number; limit: number };

/** Parse + validate args. `null` → typed protocol error (never a guessed read). */
export function resolveContentRefArgs(args: Record<string, unknown>): ContentRefToolArgs | { error: string } {
  const ref = args['ref'];
  if (typeof ref !== 'string' || !SHA256_HEX_RE.test(ref)) return { error: 'CONTENT_REF_DENIED' };
  const integer = (raw: unknown, fallback: number): number | null => {
    if (raw === undefined || raw === null) return fallback;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  };
  const offset = integer(args['offset'], 0);
  const limit = integer(args['limit'], CONTENT_REF_DEFAULT_LIMIT_BYTES);
  if (offset === null || offset < 0 || limit === null || limit < 1 || limit > CONTENT_REF_MAX_LIMIT_BYTES) {
    return { error: 'CONTENT_RANGE_INVALID' };
  }
  return { ref, offset, limit };
}

/**
 * Render a loaded slice: meta line + the slice decoded as UTF-8. The store
 * already aligns every slice to code-point boundaries (B4, `alignUtf8Slice`),
 * so `bytes` is what was actually returned, `nextOffset` is the byte after the
 * last complete character, and a snapped start is reported (`snappedFrom`).
 * Malformed/binary bytes decode to U+FFFD honestly — they are never dropped.
 */
export function renderContentRefRead(read: {
  sha256: string; offset: number; snappedFrom?: number; bytes: Uint8Array; totalBytes: number; nextOffset: number | null;
}): string {
  const text = Buffer.from(read.bytes).toString('utf8');
  const meta = `[deckent] read_content_ref: sha256=${read.sha256} offset=${read.offset}${read.snappedFrom !== undefined ? ` snappedFrom=${read.snappedFrom}` : ''} bytes=${read.bytes.byteLength} totalBytes=${read.totalBytes} hasMore=${read.nextOffset !== null}${read.nextOffset !== null ? ` nextOffset=${read.nextOffset}` : ''}`;
  return text.length === 0 ? meta : `${meta}\n${text}`;
}

/** Typed-code prefix a refusal carries on its `tool-result` event (the CLI
 *  bridge localizes `native.content-ref.<REASON>` EN/TR). */
export const CONTENT_REF_CODE_PREFIX = 'native.content-ref.';
export const CONTENT_REF_REASON_CODES = Object.freeze([
  'CONTENT_REF_DENIED', 'CONTENT_REF_UNKNOWN', 'CONTENT_REF_EXPIRED', 'CONTENT_DIGEST_MISMATCH',
  'CONTENT_RANGE_INVALID', 'CONTENT_READ_FAILED', 'CONTENT_READ_UNSUPPORTED',
] as const);

function refusal(reasonCode: string): ToolResult {
  return {
    ok: false,
    output: `[mcp-error] ${CONTENT_REF_TOOL_NAME}: ${reasonCode}`,
    meta: { reasonCode, code: `${CONTENT_REF_CODE_PREFIX}${reasonCode}` },
  };
}

/**
 * Build the tool definition over ONE session store. Read-only → `silent` tier;
 * `core` exposure so a fresh epoch can always reach its own trail; the approval
 * classifier reports a low-risk file-read scoped to the store (never a path).
 */
export function defineContentRefTool(store: ContentRefReader): ToolDefinition {
  return {
    name: CONTENT_REF_TOOL_NAME,
    description: CONTENT_REF_TOOL_DESCRIPTION,
    inputSchema: { ...CONTENT_REF_TOOL_SCHEMA },
    category: 'coding',
    tier: 'silent',
    source: 'builtin',
    exposure: 'core',
    // A digest read is a pure function of (digest, offset, limit) over immutable bytes.
    replayable: true,
    // `resource` is the loop-derived primary resource (empty for a digest
    // read) and MUST be echoed back — the loop refuses a classification whose
    // resource diverges from its own.
    approval: (args, resource) => {
      const ref = args['ref'];
      return typeof ref === 'string' && SHA256_HEX_RE.test(ref)
        ? { scope: 'file-read', risk: 'low', scopeId: CONTENT_REF_TOOL_NAME, resource }
        : null;
    },
    handler: async (args): Promise<ToolResult> => {
      const resolved = resolveContentRefArgs(args);
      if ('error' in resolved) return refusal(resolved.error);
      const read = await store.readContentRef({ sha256: resolved.ref, offset: resolved.offset, limit: resolved.limit });
      if (read.kind === 'hold') return refusal(read.reasonCode);
      return { ok: true, output: renderContentRefRead(read) };
    },
  };
}
