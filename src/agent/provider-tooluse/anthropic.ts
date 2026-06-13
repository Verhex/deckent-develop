// src/agent/provider-tooluse/anthropic.ts
// ═══ Anthropic adapter (SP-1 §3) ════════════════════════════════════════════
// POST {baseUrl}/messages with stream:true + tools; map Anthropic SSE events
// (message_start / content_block_start|delta|stop / message_delta / message_stop)
// to normalized ProviderEvents. tool_use blocks accumulate input_json_delta
// fragments and are emitted (parsed) on content_block_stop. fetchImpl injectable.

import { validateProviderRequest, type ProviderAdapter, type ProviderEvent, type ProviderMessage, type ProviderRequest } from './types.js';
import { parseSSE } from './sse.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  baseUrl?: string;        // default 'https://api.anthropic.com/v1'
  version?: string;        // anthropic-version header, default '2023-06-01'
  maxTokens?: number;      // default 4096
  fetchImpl?: typeof fetch;
}

function toAnthropicMessage(m: ProviderMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content }] };
  }
  return { role: m.role, content: m.content };
}

export function createAnthropicAdapter(opts: AnthropicAdapterOptions): ProviderAdapter {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? 'https://api.anthropic.com/v1';
  return {
    name: 'anthropic',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      const v = validateProviderRequest(req);
      if (v) throw new Error(`invalid provider request: ${v}`);

      const body: Record<string, unknown> = {
        model: req.model,
        stream: true,
        max_tokens: opts.maxTokens ?? 4096,
        system: req.system,
        messages: req.messages.map(toAnthropicMessage),
      };
      if (req.tools.length > 0) {
        body['tools'] = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
      }

      const resp = await fetchImpl(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': opts.version ?? '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok || !resp.body) throw new Error(`anthropic http ${resp.status}`);

      let inputTokens = 0;
      let outputTokens = 0;
      // per-index in-flight tool_use accumulator
      const toolAcc = new Map<number, { id: string; name: string; json: string }>();

      for await (const ev of parseSSE(resp.body as AsyncIterable<Uint8Array>)) {
        let d: AnthropicEvent;
        try { d = JSON.parse(ev.data) as AnthropicEvent; } catch { continue; }

        if (ev.event === 'message_start') {
          inputTokens = d.message?.usage?.input_tokens ?? 0;
        } else if (ev.event === 'content_block_start') {
          const cb = d.content_block;
          if (cb?.type === 'tool_use' && typeof d.index === 'number') {
            toolAcc.set(d.index, { id: cb.id ?? '', name: cb.name ?? '', json: '' });
          }
        } else if (ev.event === 'content_block_delta') {
          if (d.delta?.type === 'text_delta' && d.delta.text) {
            yield { type: 'text-delta', text: d.delta.text };
          } else if (d.delta?.type === 'input_json_delta' && typeof d.index === 'number') {
            const cur = toolAcc.get(d.index);
            if (cur) cur.json += d.delta.partial_json ?? '';
          }
        } else if (ev.event === 'content_block_stop') {
          if (typeof d.index === 'number' && toolAcc.has(d.index)) {
            const cur = toolAcc.get(d.index)!;
            let args: Record<string, unknown> = {};
            try { args = cur.json ? (JSON.parse(cur.json) as Record<string, unknown>) : {}; } catch { args = {}; }
            yield { type: 'tool-call', id: cur.id || `toolu-${cur.name}`, name: cur.name, args };
            toolAcc.delete(d.index);
          }
        } else if (ev.event === 'message_delta') {
          if (d.usage?.output_tokens) outputTokens = d.usage.output_tokens;
        } else if (ev.event === 'message_stop') {
          yield { type: 'usage', inputTokens, outputTokens };
          break;
        }
      }
      yield { type: 'done' };
    },
  };
}

interface AnthropicEvent {
  index?: number;
  message?: { usage?: { input_tokens?: number } };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
  usage?: { output_tokens?: number };
}
