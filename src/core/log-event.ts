// ═══ Structured JSONL Log-Event Contract ═════════════════════════════
// Worker Output Contract & Observability — Pillar 2 (spec §2.2), Phase 4.1.
//
// A worker subprocess emits a heterogeneous stream of events (turns, tool
// calls, text, usage, stderr) whose native shape differs per provider
// (Claude stream-json / SDK messages · Ollama · OpenAI-compatible · Gemini ·
// any local model). This module is the provider-agnostic seam:
//
//   normalizeStreamEvent(raw, provider) → { type, content }   (NEVER drops)
//   writeLogEvent(logPath, ev, seq)     → appends one JSONL line, stamps ts
//
// `task-<id>.log` is JSONL — one LogEvent per line — so the full execution
// trace is parseable, renderable, archivable and live-streamable. The final
// `usage` event is the single source of truth feeding Pillar-1 token capture.
//
// No Claude-CLI dependency: each provider's stream is normalized into the one
// common event shape below. An unrecognized event is NEVER dropped — it
// degrades to `{ type: 'text', content: raw }` so nothing is silently lost.

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getProviderCommandSpec } from './provider-command-spec.js';

// ─── Types ───────────────────────────────────────────────────────────

/** The closed set of log-event kinds (spec §2.2). */
export const LOG_EVENT_TYPES = [
  'turn',
  'tool_use',
  'tool_result',
  'text',
  'stderr',
  'usage',
  'lifecycle',
] as const;

/** One of the seven structured log-event kinds. */
export type LogEventType = (typeof LOG_EVENT_TYPES)[number];

/**
 * Provider-neutral usage semantics derived once at the host normalization
 * boundary. Budget and settlement consumers use this bounded metadata instead
 * of independently interpreting provider-specific discriminator fields.
 */
export interface UsageEventSemantics {
  /** Provider identity supplied to the normalizer. */
  provider: string;
  /** Original provider event discriminator, when the envelope declares one. */
  providerEventType?: string;
  /** Incremental call delta or cumulative attempt/session snapshot. */
  mode: 'incremental' | 'cumulative';
  /** True only for an envelope known to close the provider's usage stream. */
  terminal: boolean;
  /** Stable provider call/session identity when the envelope supplies one. */
  identity?: string;
  /** Whether this envelope proves one completed logical provider turn. */
  countsAsTurn: boolean;
  /** Provider-reported cumulative turn count, when available. */
  reportedTurns?: number;
}

/** A single structured log line (one per JSONL row). */
export interface LogEvent {
  /** ISO 8601 timestamp (UTC), stamped at write time. */
  ts: string;
  /** Monotonic per-task sequence, supplied by the caller. */
  seq: number;
  /** Event kind. */
  type: LogEventType;
  /** Type-specific payload (the raw provider chunk or a derived shape). */
  content: unknown;
  /** Canonical host-derived semantics, present only on normalized usage events. */
  usageSemantics?: UsageEventSemantics;
}

/**
 * A normalized event before it is written — `writeLogEvent` stamps `ts`/`seq`.
 * This is exactly what `normalizeStreamEvent` returns, so the two compose:
 *   `writeLogEvent(path, normalizeStreamEvent(raw, provider), seq++)`.
 */
export type StreamLogEvent = Omit<LogEvent, 'ts' | 'seq'>;

// ─── Writer ──────────────────────────────────────────────────────────

/**
 * Append a single structured event to a JSONL log file.
 *
 * - Stamps an ISO-8601 `ts` and the caller-supplied monotonic `seq`.
 * - Creates the parent directory if absent.
 * - Fail-safe: a logging I/O error must never crash the worker capture, so
 *   failures are swallowed (warned outside the test runner), mirroring
 *   `event-stream.ts:writeEvent`.
 *
 * @param logPath Absolute path to the `.log` file (JSONL).
 * @param ev      The event sans `ts`/`seq` (e.g. from `normalizeStreamEvent`).
 * @param seq     Monotonic sequence number owned by the caller.
 */
export function writeLogEvent(
  logPath: string,
  ev: StreamLogEvent,
  seq: number,
): void {
  try {
    const dir = dirname(logPath);
    if (dir && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const event: LogEvent = {
      ts: new Date().toISOString(),
      seq,
      type: ev.type,
      content: ev.content,
      ...(ev.usageSemantics ? { usageSemantics: ev.usageSemantics } : {}),
    };
    appendFileSync(logPath, JSON.stringify(event) + '\n', 'utf-8');
  } catch (err) {
    // Fail-safe: never lose the worker because a log line could not be written.
    if (!process.env.VITEST) {
      console.warn(
        `[log-event] writeLogEvent failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ─── Normalizer (provider-agnostic) ──────────────────────────────────

/**
 * Normalize one provider stream chunk into the common `{ type, content }`
 * event. Provider-agnostic across Claude (SDK-message + raw-streaming),
 * Ollama, OpenAI-compatible (DeepSeek/Qwen/vLLM), Gemini and any other
 * provider whose chunk carries a recognizable shape.
 *
 * **Never drops:** an unrecognized chunk degrades to `{ type:'text',
 * content: raw }`. The function therefore always returns a value (never null);
 * nothing in the worker stream is silently lost.
 *
 * @param raw      A provider stream chunk — an already-parsed object, or a raw
 *                 (possibly JSON) string line.
 * @param provider The provider id (e.g. `'claude'`, `'ollama'`, `'gemini'`).
 */
export function normalizeStreamEvent(
  raw: unknown,
  provider: string,
): StreamLogEvent {
  // A string chunk may be a JSON line or plain stdout/stderr text. Try to
  // parse; a non-JSON string is genuine text (never dropped).
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '' || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
      return { type: 'text', content: raw };
    }
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return { type: 'text', content: raw };
    }
  }

  if (!isRecord(obj)) {
    // null / number / boolean / array-without-handler → text (never dropped).
    return { type: 'text', content: raw };
  }

  const p = provider.toLowerCase();
  const detected =
    p.includes('claude') || p.includes('anthropic')
      ? normalizeClaude(obj)
      : p.includes('ollama')
        ? normalizeOllama(obj)
        : null;

  // Cross-provider generic detection (openai-compatible/gemini/codex/vllm and
  // any unknown provider whose chunk still carries a recognizable shape).
  const event = detected ?? normalizeGeneric(obj);

  // Never drop: an unrecognized object is preserved as text.
  const normalized = event ?? { type: 'text' as const, content: obj };
  return normalized.type === 'usage'
    ? {
        ...normalized,
        usageSemantics: deriveUsageEventSemantics(obj, provider),
      }
    : normalized;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && Number.isInteger(value)
    ? value
    : undefined;
}

/**
 * Translate provider envelopes once at the normalization boundary. Unknown
 * usage shapes remain non-terminal and identity-less so downstream budget
 * authority fails closed instead of guessing.
 */
function deriveUsageEventSemantics(
  o: Record<string, unknown>,
  provider: string,
): UsageEventSemantics {
  const normalizedProvider = provider.trim().toLowerCase() || 'unknown';
  const rawType = typeof o.providerEventType === 'string'
    ? o.providerEventType
    : typeof o.codexEventType === 'string'
      ? o.codexEventType
      : typeof o.type === 'string'
        ? o.type
        : undefined;
  const declaredUsageMode = getProviderCommandSpec(normalizedProvider)?.liveUsage;
  const terminal = rawType === 'result'
    || rawType === 'turn.completed'
    || rawType === 'response.completed'
    || o.done === true
    || declaredUsageMode === 'final-only';
  const identityCandidates = [
    o.request_id,
    o.requestId,
    o.turn_id,
    o.turnId,
    o.id,
    o.uuid,
    ...(terminal ? [o.session_id, o.created_at] : []),
  ];
  const identity = identityCandidates.find(
    value => typeof value === 'string' && value.length > 0,
  );
  const reportedTurns = readNonNegativeInteger(o.num_turns);
  return {
    provider: normalizedProvider,
    ...(rawType ? { providerEventType: rawType } : {}),
    mode: terminal ? 'cumulative' : 'incremental',
    terminal,
    ...(typeof identity === 'string' ? { identity } : {}),
    countsAsTurn: rawType === 'turn.completed'
      || (declaredUsageMode === 'final-only' && terminal),
    ...(reportedTurns !== undefined ? { reportedTurns } : {}),
  };
}

// ─── Provider-specific helpers ───────────────────────────────────────

/**
 * Claude — handles both the Claude-Code SDK message envelope
 * (`{type:'assistant'|'user'|'system'|'result', ...}`) and the raw Anthropic
 * streaming events (`content_block_start`, `message_delta`, …).
 */
function normalizeClaude(o: Record<string, unknown>): StreamLogEvent | null {
  const t = typeof o.type === 'string' ? o.type : undefined;

  // SDK message envelope.
  if (t === 'system') return { type: 'lifecycle', content: o };
  if (t === 'result') return { type: 'usage', content: o }; // carries the final usage
  if ((t === 'assistant' || t === 'user') && isRecord(o.message)) {
    const block = dominantBlockType((o.message as Record<string, unknown>).content);
    if (block === 'tool_use') return { type: 'tool_use', content: o };
    if (block === 'tool_result') return { type: 'tool_result', content: o };
    return { type: 'text', content: o };
  }

  // Raw Anthropic streaming events.
  if (t === 'message_start') return { type: 'turn', content: o };
  if (t === 'message_delta' || t === 'message_stop') {
    return hasUsageShape(o)
      ? { type: 'usage', content: o }
      : { type: 'lifecycle', content: o };
  }
  if (t === 'content_block_start') {
    const cbType = isRecord(o.content_block)
      ? (o.content_block as Record<string, unknown>).type
      : undefined;
    if (cbType === 'tool_use') return { type: 'tool_use', content: o };
    if (cbType === 'tool_result') return { type: 'tool_result', content: o };
    return { type: 'text', content: o };
  }
  if (t === 'content_block_delta') return { type: 'text', content: o };
  if (t === 'content_block_stop' || t === 'ping') return { type: 'lifecycle', content: o };

  // Direct content-block / event form, then any usage-bearing object.
  return directType(t, o) ?? (hasUsageShape(o) ? { type: 'usage', content: o } : null);
}

/**
 * Ollama — `/api/generate` (`{response, done}`) and `/api/chat`
 * (`{message:{content}, done}`); the final `done:true` chunk carries
 * `prompt_eval_count`/`eval_count` and is the usage event.
 */
function normalizeOllama(o: Record<string, unknown>): StreamLogEvent | null {
  if (o.done === true && (typeof o.eval_count === 'number' || typeof o.prompt_eval_count === 'number')) {
    return { type: 'usage', content: o };
  }
  if (typeof o.response === 'string') return { type: 'text', content: o };
  if (isRecord(o.message) && typeof (o.message as Record<string, unknown>).content === 'string') {
    return { type: 'text', content: o };
  }
  if (o.done === true) return { type: 'lifecycle', content: o }; // empty final marker
  return null;
}

/**
 * Generic cross-provider detection — OpenAI-compatible (`choices[].delta`),
 * Gemini (`candidates`), an explicit `type` field, or any usage-bearing
 * object. Used for openai-compatible/gemini/codex/vllm and unknown providers.
 */
function normalizeGeneric(o: Record<string, unknown>): StreamLogEvent | null {
  const t = typeof o.type === 'string' ? o.type : undefined;
  const direct = directType(t, o);
  if (direct) return direct;

  if (typeof o.stream === 'string' && o.stream.toLowerCase() === 'stderr') {
    return { type: 'stderr', content: o };
  }

  // OpenAI-compatible chat completion chunk.
  if (Array.isArray(o.choices)) {
    const choice = o.choices[0];
    if (isRecord(choice)) {
      const delta = (choice as Record<string, unknown>).delta ?? (choice as Record<string, unknown>).message;
      if (isRecord(delta)) {
        if (Array.isArray((delta as Record<string, unknown>).tool_calls)) {
          return { type: 'tool_use', content: o };
        }
        if (typeof (delta as Record<string, unknown>).content === 'string') {
          return { type: 'text', content: o };
        }
      }
    }
    return hasUsageShape(o) ? { type: 'usage', content: o } : { type: 'text', content: o };
  }

  // Gemini's terminal response may carry candidates and usageMetadata in the
  // same envelope. Preserve the whole payload and expose its measured usage.
  if (Array.isArray(o.candidates)) {
    return hasUsageShape(o) ? { type: 'usage', content: o } : { type: 'text', content: o };
  }

  // Bare text-bearing shapes leaking through a non-specific provider.
  if (typeof o.response === 'string') {
    return hasUsageShape(o) ? { type: 'usage', content: o } : { type: 'text', content: o };
  }
  if (isRecord(o.message) && typeof (o.message as Record<string, unknown>).content === 'string') {
    return { type: 'text', content: o };
  }

  // Usage-only object.
  if (hasUsageShape(o)) return { type: 'usage', content: o };

  return null;
}

// ─── Shared detectors ────────────────────────────────────────────────

/** Map an explicit `type` field that already names a content-block / event kind. */
function directType(t: string | undefined, o: Record<string, unknown>): StreamLogEvent | null {
  switch (t) {
    case 'tool_use':
      return { type: 'tool_use', content: o };
    case 'tool_result':
      return { type: 'tool_result', content: o };
    case 'text':
      return { type: 'text', content: o };
    case 'stderr':
      return { type: 'stderr', content: o };
    case 'usage':
      return { type: 'usage', content: o };
    case 'turn':
      return { type: 'turn', content: o };
    case 'lifecycle':
      return { type: 'lifecycle', content: o };
    default:
      return null;
  }
}

/**
 * The most significant content-block kind in a message's `content` array
 * (priority: tool_use > tool_result > text). Returns undefined when the
 * content is absent or carries none of these.
 */
function dominantBlockType(content: unknown): 'tool_use' | 'tool_result' | 'text' | undefined {
  if (!Array.isArray(content)) return undefined;
  let hasToolResult = false;
  let hasText = false;
  for (const block of content) {
    if (!isRecord(block)) continue;
    const bt = (block as Record<string, unknown>).type;
    if (bt === 'tool_use') return 'tool_use';
    if (bt === 'tool_result') hasToolResult = true;
    if (bt === 'text') hasText = true;
  }
  if (hasToolResult) return 'tool_result';
  if (hasText) return 'text';
  return undefined;
}

/**
 * True when an object carries any provider's usage telemetry:
 * Anthropic/OpenAI `usage{...}` · Gemini `usageMetadata{...}` ·
 * Ollama `prompt_eval_count`/`eval_count`.
 */
function hasUsageShape(o: Record<string, unknown>): boolean {
  if (isRecord(o.usage)) return true;
  if (isRecord(o.usageMetadata)) return true;
  if (typeof o.prompt_eval_count === 'number' || typeof o.eval_count === 'number') return true;
  return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
