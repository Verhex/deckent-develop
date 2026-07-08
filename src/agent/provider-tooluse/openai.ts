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
  fetchImpl?: typeof fetch;
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
      if (req.tools.length > 0) {
        body['tools'] = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
      }

      const resp = await fetchImpl(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!resp.ok || !resp.body) throw new Error(`openai-compatible http ${resp.status}`);

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
  choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
