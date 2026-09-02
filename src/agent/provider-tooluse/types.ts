// ═══ ProviderAdapter — one normalized backend interface (SP-1 §3, §5) ═══════
// OpenAI-compatible-first: Anthropic tool_use, OpenAI fn-calling, Ollama
// tool-calling, vLLM tool-parser all implement THIS shape. The loop never
// touches a provider's raw schema — only normalized ProviderEvents.

import type { NativeToolSchema } from '../tools/registry.js';

export interface ToolCallRef {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** present on role:'tool' — correlates the result to a prior tool-call id. */
  toolCallId?: string;
  /** present on role:'assistant' — the tool calls this turn made (native
   *  round-trip). content stays a string; this is a sibling, not a block-array. */
  toolCalls?: ToolCallRef[];
}

export interface ProviderRequest {
  /** Composed system prompt (identity.ts). */
  system: string;
  messages: ProviderMessage[];
  /** Registry native schemas (registry.toNativeSchemas()). */
  tools: NativeToolSchema[];
  /** Wire model id (API-pinned, e.g. 'claude-fable-5'). */
  model: string;
  /** NT-08 — hard ceiling on the tokens the backend may GENERATE for this
   *  request (OpenAI-compatible `max_tokens`). The loop sets it from the
   *  resolved native budget's outputReserveTokens, so the room reserved by the
   *  prompt-budget arithmetic is the same room the backend is allowed to use.
   *  Absent → the field is omitted on the wire and the backend keeps its own
   *  default (behavior unchanged for callers that never set it). */
  outputCeilingTokens?: number;
  /** TERMINAL-TOOLS-008 — the turn's abort signal. The session owns one
   *  AbortController per turn; HTTP adapters hand this to fetch so a cancel
   *  tears the stream down at once (even before the first token) instead of
   *  waiting for the next event boundary. Absent → no abort seam (legacy
   *  callers unchanged). */
  signal?: AbortSignal;
}

export interface ProviderContextIdentity {
  provider: string;
  model: string;
  contextWindowTokens: number;
  contextProvenance: 'server-reported' | 'model-registry' | 'configured-narrowing';
}

export type RequestMeasurementQuality = 'exact' | 'conservative-upper-bound';

export interface RequestMeasurement {
  inputTokens: number;
  quality: RequestMeasurementQuality;
  provenance: string;
  requestDigest: string;
  identity: ProviderContextIdentity;
}

/** Provider-specific token counting, when the transport can prove it. The
 * normalized request is complete: system, messages, tools and model are all
 * present before the capability is invoked. */
export interface ProviderRequestMeasurementCapability {
  measure(req: ProviderRequest, signal: AbortSignal): Promise<{
    inputTokens: number;
    provenance: string;
  } | null>;
}

export type ProviderAdmissionDecision =
  | { admitted: true; measurement: RequestMeasurement; availableTokens: number }
  | {
      admitted: false;
      code: 'INPUT_CONTEXT_OVERFLOW';
      measurement: RequestMeasurement;
      availableTokens: number;
    };

export interface ProviderTextDelta { type: 'text-delta'; text: string; }
export interface ProviderToolCall { type: 'tool-call'; id: string; name: string; args: Record<string, unknown>; }
export interface ProviderUsage { type: 'usage'; inputTokens: number; outputTokens: number; }
/** Normalized end-of-stream stop cause. 'length' = the backend cut generation at
 *  its token/context ceiling (OpenAI `finish_reason:'length'`, Anthropic
 *  `stop_reason:'max_tokens'`) — the loop surfaces this as an honest truncation
 *  signal instead of letting the turn complete silently. Adapters that cannot
 *  know the cause omit it; the loop then treats the stream as a plain stop. */
export type ProviderStopReason = 'stop' | 'length' | 'tool_calls';
export interface ProviderDone { type: 'done'; stopReason?: ProviderStopReason; }
/** Hidden-reasoning activity observed on the stream (e.g. OpenAI-compatible
 *  `delta.reasoning_content`). METADATA ONLY — the chain-of-thought text never
 *  crosses this boundary (privacy contract, 7086/RCA §3): the event carries
 *  the observed character count so the loop can classify a `length` stop with
 *  empty visible content as EMPTY_VISIBLE_AFTER_REASONING and drive bounded
 *  continuation, without ever being able to display the reasoning itself. */
export interface ProviderReasoningActivity { type: 'reasoning-activity'; chars: number; }
export type ProviderEvent = ProviderTextDelta | ProviderToolCall | ProviderUsage | ProviderDone | ProviderReasoningActivity;

/** Every LLM backend (Anthropic/OpenAI-compat/Ollama) implements this. */
export interface ProviderAdapter {
  readonly name: string;
  readonly requestMeasurement?: ProviderRequestMeasurementCapability;
  send(req: ProviderRequest): AsyncIterable<ProviderEvent>;
}

const ROLES: ReadonlySet<string> = new Set(['user', 'assistant', 'tool']);

/** Validate a ProviderRequest; returns the first violation or null (ADR-010). */
export function validateProviderRequest(req: unknown): string | null {
  if (!req || typeof req !== 'object') return 'request must be an object';
  const r = req as Partial<ProviderRequest>;
  if (typeof r.system !== 'string') return 'system must be a string';
  if (typeof r.model !== 'string' || r.model.length === 0) return 'model must be a non-empty string';
  if (!Array.isArray(r.messages)) return 'messages must be an array';
  for (const m of r.messages) {
    if (!m || typeof m !== 'object') return 'each message must be an object';
    if (!ROLES.has((m as ProviderMessage).role)) return `message role must be one of ${[...ROLES].join('|')}`;
    if (typeof (m as ProviderMessage).content !== 'string') return 'message content must be a string';
  }
  if (!Array.isArray(r.tools)) return 'tools must be an array';
  if (r.outputCeilingTokens !== undefined
    && (!Number.isSafeInteger(r.outputCeilingTokens) || r.outputCeilingTokens <= 0)) {
    return 'outputCeilingTokens must be a positive integer when present';
  }
  return null;
}
