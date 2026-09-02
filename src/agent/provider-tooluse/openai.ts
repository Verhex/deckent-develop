// src/agent/provider-tooluse/openai.ts
// ═══ OpenAI-compatible adapter (SP-1 §3) ════════════════════════════════════
// POST {baseUrl}/chat/completions with stream:true + tools; parse the SSE into
// normalized ProviderEvents. Streamed tool-call argument fragments are
// accumulated by index and parsed on finish_reason:'tool_calls'. fetchImpl is
// injectable for hermetic tests. Used directly (OpenAI/OpenRouter/vLLM) and via
// the Ollama adapter (Ollama serves this same shape).

import { validateProviderRequest, type ProviderAdapter, type ProviderEvent, type ProviderMessage, type ProviderRequest } from './types.js';
import { parseSSE } from './sse.js';

export interface OpenAIAdapterOptions {
  baseUrl: string;
  apiKey?: string;
  name?: string;
  /** Operator-pinned generation ceiling for every request this adapter sends.
   *  NO default — absent means "this adapter has no ceiling authority", not
   *  "use a constant". Outranked by ProviderRequest.outputCeilingTokens. */
  maxTokens?: number;
  fetchImpl?: typeof fetch;
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

export function createOpenAIAdapter(opts: OpenAIAdapterOptions): ProviderAdapter {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  return {
    name: opts.name ?? 'openai',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      const v = validateProviderRequest(req);
      if (v) throw new Error(`invalid provider request: ${v}`);

      const body: Record<string, unknown> = {
        model: req.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: 'system', content: req.system }, ...req.messages.map(toOpenAIMessage)],
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
        body['tools'] = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      }

      let resp: Response;
      try {
        resp = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
          body: JSON.stringify(body),
          // TERMINAL-TOOLS-008 — the turn's abort signal (see types.ts).
          ...(req.signal ? { signal: req.signal } : {}),
        });
      } catch (cause) {
        // An abort is the caller's own decision, never a connect failure.
        if (cause instanceof Error && cause.name === 'AbortError') throw cause;
        // Cold-start / connection-refused class: keep the honest low-level cause
        // ('fetch failed', ECONNREFUSED, …) instead of an unhandled rejection.
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`openai-compatible connect failed — ${detail}`);
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
