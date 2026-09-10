// src/agent/provider-tooluse/openai.ts
// ═══ OpenAI-compatible adapter (SP-1 §3) ════════════════════════════════════
// POST {baseUrl}/chat/completions with stream:true + tools; parse the SSE into
// normalized ProviderEvents. Streamed tool-call argument fragments are
// accumulated by index and parsed on finish_reason:'tool_calls'. fetchImpl is
// injectable for hermetic tests. Used directly (OpenAI/OpenRouter/vLLM) and via
// the Ollama adapter (Ollama serves this same shape).

import {
  validateProviderRequest,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderMessage,
  type ProviderReasoningControlCapability,
  type ProviderRequest,
  type ReasoningDirective,
} from './types.js';
import { parseSSE } from './sse.js';
import {
  classifyTransportFailure,
  isAbortError,
  isTransientTransportFailure,
  ProviderTransportError,
  sleepWithSignal,
} from './transport-errors.js';
import type { ReasoningControlDescriptor } from '../../core/model-registry-types.js';
import type { StructuredOutputControlDescriptor } from '../../core/structured-output-control.js';
import type { StructuredOutputDirective } from './types.js';

export interface OpenAIAdapterOptions {
  baseUrl: string;
  apiKey?: string;
  name?: string;
  /** Operator-pinned generation ceiling for every request this adapter sends.
   *  NO default — absent means "this adapter has no ceiling authority", not
   *  "use a constant". Outranked by ProviderRequest.outputCeilingTokens. */
  maxTokens?: number;
  /** 7108 — reasoning-control authority for the wire model (registry / owner
   *  config / live server evidence, resolved by the caller that owns those
   *  sources). Absent → no descriptor → a `reasoning` directive puts NOTHING on
   *  the wire (honest no-op), never a guessed field. */
  reasoningControl?: ProviderReasoningControlCapability;
  /** 7113-E — per-model structured-output evidence for this transport. */
  structuredOutputControl?: (model: string, signal?: AbortSignal) => StructuredOutputControlDescriptor | undefined | Promise<StructuredOutputControlDescriptor | undefined>;
  fetchImpl?: typeof fetch;
}

/**
 * 7108 — map the loop's {@link ReasoningDirective} onto the wire mechanism the
 * descriptor names. Pure: returns the body fields to merge, or nothing when the
 * descriptor has no known toggle (`none`/`unknown`). The completion ceiling is
 * NOT touched here — it already arrived inclusive of reasoning room as
 * `outputCeilingTokens` (single arithmetic authority: agent/reasoning-control.ts).
 */
export function mapReasoningDirectiveToWire(
  directive: ReasoningDirective | undefined,
  descriptor: ReasoningControlDescriptor | undefined,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  if (!directive || !descriptor) return {};
  const toggle = descriptor.toggle;
  if (toggle.kind === 'chat_template_kwargs.enable_thinking') {
    const prior = existing['chat_template_kwargs'];
    const kwargs = prior && typeof prior === 'object' && !Array.isArray(prior)
      ? { ...(prior as Record<string, unknown>) }
      : {};
    return { chat_template_kwargs: { ...kwargs, enable_thinking: directive.mode === 'on' } };
  }
  if (toggle.kind === 'reasoning_effort') {
    return { reasoning_effort: directive.mode === 'on' ? toggle.on : toggle.off };
  }
  return {};
}

/**
 * 7113-E — the structured-output directive on the wire. Written ONLY when the
 * descriptor names a mechanism that actually enforces it; an `none`/`unknown`
 * descriptor writes nothing, and the caller is expected to have held before
 * dispatch rather than sending an unenforced request. The shape is the
 * OpenAI-compatible `response_format.json_schema` dialect — a llama.cpp GBNF
 * grammar is a DIFFERENT mechanism and is deliberately not treated as an
 * equivalent here.
 */
export function mapStructuredOutputDirectiveToWire(
  directive: StructuredOutputDirective | undefined,
  descriptor: StructuredOutputControlDescriptor | undefined,
): Record<string, unknown> {
  if (!directive || !descriptor || descriptor.toggle.kind !== 'openai.response_format.json_schema') return {};
  return {
    response_format: {
      type: 'json_schema',
      json_schema: { name: directive.name, strict: true, schema: directive.schema },
    },
  };
}

/** Outcome of the normalized output-ceiling resolution (RCA §2). `unresolved`
 *  is a first-class state: a transport that has no ceiling authority wires no
 *  ceiling, it never falls back to a constant. */
export type WireOutputCeiling =
  | { state: 'resolved'; tokens: number; source: 'request' | 'configured' }
  | { state: 'unresolved'; reason: 'no-ceiling-authority' | 'invalid-ceiling-authority' };

/**
 * ═══ Normalized output-ceiling contract — shared by ALL transports ══════════
 * RCA §2: `outputReserveTokens` is the protected MINIMUM answer room, never the
 * wire ceiling. The safe ceiling is a function of measured input, effective
 * context, the safety reserve, the model-registry output limit, policy and the
 * remaining session budget; it is computed by the caller that owns those
 * authorities and reaches a transport as `ProviderRequest.outputCeilingTokens`.
 *
 * A transport's only job is to wire the ceiling it was given, or none at all:
 *   1. `requestCeilingTokens`    — the per-request computed safe ceiling.
 *   2. `configuredCeilingTokens` — the operator-pinned adapter option.
 *   3. neither                   — unresolved; the transport omits the ceiling.
 * An authority that is present but not a positive safe integer fails CLOSED
 * (unresolved) instead of silently degrading to the next tier.
 *
 * Both the OpenAI-compatible and the Anthropic transport resolve through THIS
 * function, so their ceiling behavior is identical by construction rather than
 * by two copies that can drift apart.
 */
export function resolveWireOutputCeiling(input: {
  requestCeilingTokens?: number;
  configuredCeilingTokens?: number;
}): WireOutputCeiling {
  const authorities = [
    { tokens: input.requestCeilingTokens, source: 'request' as const },
    { tokens: input.configuredCeilingTokens, source: 'configured' as const },
  ];
  for (const authority of authorities) {
    if (authority.tokens === undefined) continue;
    if (!Number.isSafeInteger(authority.tokens) || authority.tokens <= 0) {
      return { state: 'unresolved', reason: 'invalid-ceiling-authority' };
    }
    return { state: 'resolved', tokens: authority.tokens, source: authority.source };
  }
  return { state: 'unresolved', reason: 'no-ceiling-authority' };
}

function toOpenAIMessage(m: ProviderMessage): Record<string, unknown> {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
    };
  }
  return { role: m.role, content: m.content };
}

/**
 * 7109-b — the exact chat wire shape this adapter sends. Exported so the
 * llama.cpp measurement path (`/apply-template` + `/tokenize`) counts the
 * same bytes the completion request carries: wire parity by construction, not
 * by a second hand-written shape that drifts.
 */
export function toOpenAIChatMessages(req: Pick<ProviderRequest, 'system' | 'messages'>): Record<string, unknown>[] {
  return [{ role: 'system', content: req.system }, ...req.messages.map(toOpenAIMessage)];
}

export function toOpenAIChatTools(tools: ProviderRequest['tools']): Record<string, unknown>[] {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/**
 * Drain accumulated streamed tool-call fragments into normalized tool-call
 * events, then clear the accumulator. Emitting both on `finish_reason:'tool_calls'`
 * AND once more at stream end means tool calls survive OpenAI-compatible backends
 * that close the stream with `finish_reason:'stop'` (or omit it entirely) —
 * vLLM/Ollama/Azure/proxies do this, and the old code, which only emitted on the
 * `'tool_calls'` finish reason, silently dropped every accumulated call otherwise.
 * The in-loop path clears the accumulator, so the stream-end flush never double-emits.
 */
function drainToolCalls(acc: Map<number, { id: string; name: string; args: string }>): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  // Some OpenAI-compatible backends (buggy proxies, vLLM/Ollama edge cases) have
  // been observed to echo the SAME id for two distinct parallel tool calls in one
  // turn. A collision here would let the agent loop's tool_result correlation
  // (keyed by toolCallId) match the wrong call, so every id emitted by one drain
  // is deduped against this set before being yielded.
  const usedIds = new Set<string>();
  for (const [idx, tc] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
    let args: Record<string, unknown> = {};
    try { args = tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {}; } catch { args = {}; }
    // Synthesized id is index-scoped so same-named parallel calls stay distinct
    // for the Phase B transcript round-trip (toolCallId keying).
    let id = tc.id || `call-${tc.name}-${idx}`;
    let dupCount = 0;
    while (usedIds.has(id)) {
      dupCount += 1;
      id = `${tc.id || `call-${tc.name}-${idx}`}-dup${dupCount}`;
    }
    usedIds.add(id);
    events.push({ type: 'tool-call', id, name: tc.name, args });
  }
  acc.clear();
  return events;
}

/** Typed OpenAI-compatible HTTP failure (LOCAL-LLM-MODEL-IDENTITY-001):
 *  carries the SAFE, bounded upstream error detail instead of swallowing the
 *  response body behind an opaque status line. Mechanism module — the fields
 *  are data; user-facing rendering happens at the CLI surface. */
export class OpenAICompatHttpError extends Error {
  constructor(
    readonly status: number,
    readonly model: string,
    readonly upstreamCode: string | null,
    readonly upstreamMessage: string | null,
  ) {
    const detail = [upstreamCode, upstreamMessage].filter(Boolean).join(': ');
    super(`openai-compatible http ${status}${detail ? ` — ${detail}` : ''}`);
    this.name = 'OpenAICompatHttpError';
  }
}

const UPSTREAM_DETAIL_CAP = 300;

/** Bounded, tolerant parse of the OpenAI-compatible error body
 *  ({error:{message,type,code}}); control characters stripped so a hostile or
 *  binary body can never corrupt the terminal. */
function parseUpstreamError(raw: string): { code: string | null; message: string | null } {
  const clean = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== ''
      ? value.replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim().slice(0, UPSTREAM_DETAIL_CAP)
      : null;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown; type?: unknown; code?: unknown } };
    const err = parsed?.error;
    if (err && typeof err === 'object') {
      return { code: clean(err.code) ?? clean(err.type), message: clean(err.message) };
    }
  } catch { /* non-JSON body — fall through to the raw excerpt */ }
  return { code: null, message: clean(raw) };
}

const TRANSPORT_LABEL = 'openai-compatible';

export function createOpenAIAdapter(opts: OpenAIAdapterOptions): ProviderAdapter {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  return {
    name: opts.name ?? 'openai',
    ...(opts.reasoningControl ? { reasoningControl: opts.reasoningControl } : {}),
    ...(opts.structuredOutputControl ? { structuredOutputControl: opts.structuredOutputControl } : {}),
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      const v = validateProviderRequest(req);
      if (v) throw new Error(`invalid provider request: ${v}`);

      const body: Record<string, unknown> = {
        model: req.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: toOpenAIChatMessages(req),
      };
      // NT-08 / RCA §2 — the computed safe ceiling, made explicit on the wire.
      // Resolved through the shared ladder (request > configured > unresolved),
      // so this transport and the Anthropic one wire the same value for the same
      // request. Unresolved omits the field: no client-side constant, ever.
      const ceiling = resolveWireOutputCeiling({
        requestCeilingTokens: req.outputCeilingTokens,
        configuredCeilingTokens: opts.maxTokens,
      });
      if (ceiling.state === 'resolved') body['max_tokens'] = ceiling.tokens;
      if (req.tools.length > 0) {
        body['tools'] = toOpenAIChatTools(req.tools);
      }
      // 7108 — hidden-reasoning directive → wire toggle, per the descriptor
      // this adapter was handed. No descriptor / unknown toggle → no field.
      if (req.reasoning && opts.reasoningControl) {
        let descriptor: ReasoningControlDescriptor | undefined;
        // 7108-b — the turn's abort signal reaches the in-send descriptor lookup
        // (and its probe) exactly like the loop's first lookup: cancellation is
        // never delayed by a second /props round-trip.
        try { descriptor = (await opts.reasoningControl(req.model, req.signal)) ?? undefined; } catch { descriptor = undefined; }
        Object.assign(body, mapReasoningDirectiveToWire(req.reasoning, descriptor, body));
      }
      // 7113-E — schema enforcement, same discipline as the reasoning toggle:
      // the descriptor decides, and a directive this transport cannot enforce
      // is NEVER silently dropped — it throws, so the caller holds instead of
      // sending a request whose contract nobody enforces.
      if (req.structuredOutput) {
        let structured: StructuredOutputControlDescriptor | undefined;
        try { structured = (await opts.structuredOutputControl?.(req.model, req.signal)) ?? undefined; }
        catch { structured = undefined; }
        const fields = mapStructuredOutputDirectiveToWire(req.structuredOutput, structured);
        if (Object.keys(fields).length === 0) {
          throw new Error('structured output requested but this transport has no descriptor that enforces it');
        }
        Object.assign(body, fields);
      }

      // 7108 §3 — bounded retry (up to the caller's CONFIGURED count, 0..N) for
      // allowlisted TRANSIENT failures that happen before any response byte
      // arrived (reset/refused/timeout). Absent budget → exactly one attempt;
      // an abort anywhere in the cause chain or a permanent (TLS/DNS) code is
      // never retried (7108-b).
      const retryBudget = req.transportRetry?.attempts ?? 0;
      const backoffMs = req.transportRetry?.backoffMs ?? 0;
      let attempts = 0;
      let resp: Response;
      for (;;) {
        attempts++;
        try {
          resp = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
            body: JSON.stringify(body),
            // TERMINAL-TOOLS-008 — the turn's abort signal (see types.ts).
            ...(req.signal ? { signal: req.signal } : {}),
          });
          break;
        } catch (cause) {
          // An abort is the caller's own decision, never a connect failure.
          if (isAbortError(cause)) throw cause;
          // Cold-start / connection-refused / reset class: surface the undici
          // cause chain (code, errno, syscall) instead of the opaque
          // 'fetch failed' wrapper, and retry once when authorized.
          const failure = classifyTransportFailure(cause, 'connect');
          if (isTransientTransportFailure(failure, 'connect') && attempts <= retryBudget && !req.signal?.aborted) {
            await sleepWithSignal(backoffMs * attempts, req.signal);
            continue;
          }
          throw new ProviderTransportError(TRANSPORT_LABEL, 'connect', failure, attempts, retryBudget);
        }
      }
      if (!resp.ok || !resp.body) {
        let raw = '';
        try { raw = (await resp.text()).slice(0, 4096); } catch { /* body unreadable — status-only error below */ }
        const upstream = parseUpstreamError(raw);
        throw new OpenAICompatHttpError(resp.status, req.model, upstream.code, upstream.message);
      }

      const toolAcc = new Map<number, { id: string; name: string; args: string }>();
      // Last finish_reason seen — 'length' means the backend cut generation at
      // its token/context ceiling; normalized onto the final 'done' event.
      let finishReason: string | undefined;
      try {
        for await (const ev of parseSSE(resp.body as AsyncIterable<Uint8Array>)) {
          if (ev.data === '[DONE]') break;
          let chunk: OpenAIChunk;
          try { chunk = JSON.parse(ev.data) as OpenAIChunk; } catch { continue; }

          const choice = chunk.choices?.[0];
          const delta = choice?.delta;
          if (delta?.content) yield { type: 'text-delta', text: delta.content };
          // Hidden reasoning (e.g. Qwen `reasoning_content`): surfaced as
          // metadata-only activity — the text itself never leaves the adapter
          // (privacy contract, 7086/RCA §3).
          if (delta?.reasoning_content) yield { type: 'reasoning-activity', chars: delta.reasoning_content.length };
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const cur = toolAcc.get(idx) ?? { id: '', name: '', args: '' };
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.name = tc.function.name;
              if (tc.function?.arguments) cur.args += tc.function.arguments;
              toolAcc.set(idx, cur);
            }
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (choice?.finish_reason === 'tool_calls') {
            for (const e of drainToolCalls(toolAcc)) yield e;
          }
          if (chunk.usage) yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
        }
      } catch (cause) {
        // A failure AFTER the response started is never retried (the backend may
        // already have generated part of the answer); it is surfaced typed, with
        // the real socket cause, instead of an undici wrapper string.
        if (isAbortError(cause)) throw cause;
        throw new ProviderTransportError(TRANSPORT_LABEL, 'stream', classifyTransportFailure(cause, 'stream'), attempts, retryBudget);
      }
      // Stream ended (via [DONE] or close) without a `finish_reason:'tool_calls'`
      // chunk — flush any tool calls still accumulated so they are never dropped.
      for (const e of drainToolCalls(toolAcc)) yield e;
      yield {
        type: 'done',
        stopReason: finishReason === 'length' ? 'length' : finishReason === 'tool_calls' ? 'tool_calls' : 'stop',
      };
    },
  };
}

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
