// ═══ Context budget — transcript window fitting (SP-1 §13 follow-up) ════════
// Small local models (Ollama, 8k–32k ctx) silently truncate an over-budget
// prompt server-side: HTTP 200, `truncated=1`, ~0 tokens of generation room —
// the turn "completes" empty and the REPL looks dead (2026-07-07 incident,
// memory: project_native_repl_model_switch_noop_and_ctx_overflow). This module
// fits the transcript into an explicit token budget CLIENT-side, so the loop
// both keeps generation room and can tell the user compaction happened.
//
// Pure + injectable: no I/O, no provider knowledge — estimation is chars/4
// (the cross-tokenizer rule of thumb; deliberately conservative via ceil).

import { createHash } from 'node:crypto';
import type {
  ProviderAdmissionDecision,
  ProviderContextIdentity,
  ProviderMessage,
  ProviderRequest,
  ProviderRequestMeasurementCapability,
  RequestMeasurement,
} from './provider-tooluse/types.js';

const DEFAULT_MEASUREMENT_TIMEOUT_MS = 2_000;
const DEFAULT_MEASUREMENT_CACHE_SIZE = 256;
const measurementCache = new Map<string, RequestMeasurement>();

/** ~4 chars per token — the cross-model rule of thumb, rounded up. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function digestProviderRequest(req: ProviderRequest): string {
  return createHash('sha256').update(stableJson(req)).digest('hex');
}

/** A tokenizer-independent upper bound. Byte-token tokenizers cannot emit
 * more content tokens than UTF-8 bytes; the additive envelope covers message,
 * role and tool/chat-template framing without relying on chars/4. */
export function conservativeRequestTokenUpperBound(req: ProviderRequest): number {
  const wireBytes = Buffer.byteLength(stableJson(req), 'utf8');
  const framingTokens = 64 + (req.messages.length * 16) + (req.tools.length * 32);
  return wireBytes + framingTokens;
}

export async function measureProviderRequest(input: {
  request: ProviderRequest;
  identity: ProviderContextIdentity;
  capability?: ProviderRequestMeasurementCapability;
  timeoutMs?: number;
  cacheSize?: number;
}): Promise<RequestMeasurement> {
  const requestDigest = digestProviderRequest(input.request);
  const cacheKey = `${input.identity.provider}\0${input.identity.model}\0${input.identity.contextWindowTokens}\0${requestDigest}`;
  const cached = measurementCache.get(cacheKey);
  if (cached) return cached;

  let result: RequestMeasurement | null = null;
  if (input.capability) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_MEASUREMENT_TIMEOUT_MS);
    try {
      const exact = await input.capability.measure(input.request, controller.signal);
      if (exact && Number.isSafeInteger(exact.inputTokens) && exact.inputTokens >= 0) {
        result = {
          inputTokens: exact.inputTokens,
          quality: 'exact',
          provenance: exact.provenance,
          requestDigest,
          identity: input.identity,
        };
      }
    } catch {
      // A missing, timing-out or malformed exact counter degrades to the
      // independently safe upper bound; it never becomes an exact estimate.
    } finally {
      clearTimeout(timeout);
    }
  }
  result ??= {
    inputTokens: conservativeRequestTokenUpperBound(input.request),
    quality: 'conservative-upper-bound',
    provenance: 'utf8-wire-bytes-plus-framing',
    requestDigest,
    identity: input.identity,
  };

  measurementCache.set(cacheKey, result);
  const cacheSize = Math.max(1, input.cacheSize ?? DEFAULT_MEASUREMENT_CACHE_SIZE);
  while (measurementCache.size > cacheSize) {
    const oldest = measurementCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    measurementCache.delete(oldest);
  }
  return result;
}

export function decideProviderAdmission(
  measurement: RequestMeasurement,
  outputReserveTokens: number,
  contextSafetyReserveTokens: number,
): ProviderAdmissionDecision {
  for (const [field, value] of Object.entries({ outputReserveTokens, contextSafetyReserveTokens })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative integer`);
  }
  const availableTokens = Math.max(
    0,
    measurement.identity.contextWindowTokens - outputReserveTokens - contextSafetyReserveTokens,
  );
  return measurement.inputTokens <= availableTokens
    ? { admitted: true, measurement, availableTokens }
    : { admitted: false, code: 'INPUT_CONTEXT_OVERFLOW', measurement, availableTokens };
}

/** Estimate one message: content + serialized tool calls + a small per-message
 *  envelope overhead (role/framing tokens the wire formats add). */
export function estimateMessageTokens(m: ProviderMessage): number {
  let chars = m.content.length;
  if (m.toolCalls?.length) {
    for (const tc of m.toolCalls) chars += tc.name.length + JSON.stringify(tc.args).length;
  }
  return Math.ceil(chars / 4) + 4;
}

export type EffectiveContextProvenance =
  | { source: 'configured'; tokens: number | null; counted: boolean }
  | { source: 'server-reported'; tokens: number | null; counted: boolean }
  | { source: 'model-advertised'; tokens: number | null; counted: boolean };

export interface EffectiveContextResult {
  effectiveContextSize: number;
  provenance: EffectiveContextProvenance[];
}

function positiveIntegerOrNull(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Derive the usable context ceiling exclusively from known, positive signals. */
export function deriveEffectiveContext(input: {
  configuredContextSize: number | null;
  serverReportedContext: number | null;
  modelAdvertisedContext: number | null;
}): EffectiveContextResult {
  const configured = positiveIntegerOrNull(input.configuredContextSize);
  const server = positiveIntegerOrNull(input.serverReportedContext);
  const advertised = positiveIntegerOrNull(input.modelAdvertisedContext);
  const known = [configured, server, advertised].filter((value): value is number => value !== null);
  if (known.length === 0) throw new RangeError('at least one context authority must be a positive integer');
  return {
    effectiveContextSize: Math.min(...known),
    provenance: [
      { source: 'configured', tokens: configured, counted: configured !== null },
      { source: 'server-reported', tokens: server, counted: server !== null },
      { source: 'model-advertised', tokens: advertised, counted: advertised !== null },
    ],
  };
}

export interface PromptBudgetBreakdown {
  contextTokens: number;
  systemPromptTokens: number;
  toolSchemaTokens: number;
  outputReserveTokens: number;
  contextSafetyReserveTokens: number;
  promptBudgetTokens: number;
}

/** Visible prompt-budget arithmetic used before transcript fitting. */
export function derivePromptBudget(input: {
  contextTokens: number;
  systemPrompt: string;
  toolSchemas: readonly unknown[];
  outputReserveTokens: number;
  contextSafetyReserveTokens: number;
}): PromptBudgetBreakdown {
  const nonNegative = (value: number, field: string): number => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative integer`);
    return value;
  };
  const contextTokens = nonNegative(input.contextTokens, 'contextTokens');
  const systemPromptTokens = estimateTokens(input.systemPrompt);
  const toolSchemaTokens = estimateTokens(JSON.stringify(input.toolSchemas));
  const outputReserveTokens = nonNegative(input.outputReserveTokens, 'outputReserveTokens');
  const contextSafetyReserveTokens = nonNegative(input.contextSafetyReserveTokens, 'contextSafetyReserveTokens');
  return {
    contextTokens,
    systemPromptTokens,
    toolSchemaTokens,
    outputReserveTokens,
    contextSafetyReserveTokens,
    promptBudgetTokens: Math.max(
      0,
      contextTokens - systemPromptTokens - toolSchemaTokens - outputReserveTokens - contextSafetyReserveTokens,
    ),
  };
}

export interface FitResult {
  /** The kept window (most-recent messages, pairing-safe). */
  messages: ProviderMessage[];
  /** How many leading messages were dropped (0 = untouched). */
  droppedCount: number;
  /** Estimated tokens of the kept window (messages only, excl. system/tools). */
  estimatedTokens: number;
}

/**
 * Fit `messages` into `budgetTokens` by dropping the OLDEST messages.
 *
 * Guarantees:
 * - The kept window never contains an orphan `tool` result — one whose
 *   assistant tool-call message was cut out of the window (provider hard
 *   error: a dangling tool_result with no matching tool_use). Per
 *   transcript.ts, every `appendAssistant(..., toolCalls)` is immediately
 *   followed by one `appendToolResult` per call with nothing interleaved, so
 *   the span from the LAST `user` message to the end of the transcript is
 *   always internally pairing-complete. That whole span is therefore kept
 *   as one atomic unit, even over budget, instead of letting a naive
 *   per-message cut land mid-pair (born-510).
 * - The kept window never opens on a `tool` result or an assistant message
 *   outside that mandatory tail span — the start is advanced to the next
 *   `user` message after a cut (older, already-resolved turns are dropped
 *   together rather than split).
 * - The final message is always kept, even if it alone exceeds the budget
 *   (an honest oversized turn beats sending the provider a malformed one).
 *   When no `user` message exists anywhere in the input (degenerate/test-only
 *   — never true for a real transcript, which always opens on `appendUser`),
 *   this guarantee widens to the WHOLE input: with no turn boundary to fall
 *   back on, the entire array is the only pairing-complete span available,
 *   so it is kept intact rather than risking a partial cut stranding a
 *   `tool` result without its owning `assistant` call.
 * - `budgetTokens <= 0` or a window already within budget → input returned
 *   unchanged (droppedCount 0).
 */
export function fitMessagesToBudget(messages: readonly ProviderMessage[], budgetTokens: number): FitResult {
  const total = messages.reduce((n, m) => n + estimateMessageTokens(m), 0);
  if (budgetTokens <= 0 || total <= budgetTokens || messages.length === 0) {
    return { messages: [...messages], droppedCount: 0, estimatedTokens: total };
  }

  // The current in-flight turn (last `user` message onward) is always
  // pairing-complete by construction — never split it. No `user` message at
  // all (degenerate/test-only input — a real transcript always opens on
  // `appendUser`) means the whole array IS that in-flight turn, so it is
  // the mandatory span in full rather than just its final message.
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') { lastUserIdx = i; break; }
  }
  const boundary = lastUserIdx >= 0 ? lastUserIdx : 0;

  // Walk backward accumulating the newest messages that fit. Everything at
  // or after `boundary` is force-included regardless of budget.
  let used = 0;
  let start = messages.length;
  while (start > 0) {
    const next = estimateMessageTokens(messages[start - 1]!);
    const mandatory = start > boundary;
    if (!mandatory && used + next > budgetTokens) break;
    used += next;
    start--;
  }

  // Pairing safety: never open the window before `boundary` on a tool result
  // or an assistant message — advance to the next user turn boundary. Never
  // advances into the mandatory tail itself (already pairing-complete).
  while (start < boundary && messages[start]!.role !== 'user') {
    used -= estimateMessageTokens(messages[start]!);
    start++;
  }

  const kept = messages.slice(start).map((m) => ({ ...m }));
  return { messages: kept, droppedCount: start, estimatedTokens: Math.max(used, 0) };
}
