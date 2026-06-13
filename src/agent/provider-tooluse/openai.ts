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
  return { role: m.role, content: m.content };
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
        if (choice?.finish_reason === 'tool_calls') {
          for (const [, tc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
            let args: Record<string, unknown> = {};
            try { args = tc.args ? (JSON.parse(tc.args) as Record<string, unknown>) : {}; } catch { args = {}; }
            yield { type: 'tool-call', id: tc.id || `call-${tc.name}`, name: tc.name, args };
          }
          toolAcc.clear();
        }
        if (chunk.usage) yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
      }
      yield { type: 'done' };
    },
  };
}

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
