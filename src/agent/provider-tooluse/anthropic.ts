// src/agent/provider-tooluse/anthropic.ts
// ═══ Anthropic adapter (SP-1 §3) ════════════════════════════════════════════
// POST {baseUrl}/messages with stream:true + tools; map Anthropic SSE events
// (message_start / content_block_start|delta|stop / message_delta / message_stop)
// to normalized ProviderEvents. tool_use blocks accumulate input_json_delta
// fragments and are emitted (parsed) on content_block_stop. fetchImpl injectable.

import { validateProviderRequest, type ProviderAdapter, type ProviderEvent, type ProviderMessage, type ProviderRequest } from './types.js';
import { resolveWireOutputCeiling } from './openai.js';
import { parseSSE } from './sse.js';

export interface AnthropicAdapterOptions {
  apiKey: string;
  baseUrl?: string;        // default 'https://api.anthropic.com/v1'
  version?: string;        // anthropic-version header, default '2023-06-01'
  /** Operator-pinned generation ceiling. NO default — see the ceiling note on
   *  `send` below; absent means this adapter has no ceiling authority of its
   *  own, NOT that a constant is substituted. Outranked by the per-request
   *  `ProviderRequest.outputCeilingTokens`. */
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

function toAnthropicMessage(m: ProviderMessage): Record<string, unknown> {
  if (m.role === 'assistant' && m.toolCalls?.length) {
    const blocks: Array<Record<string, unknown>> = [];
    if (m.content) blocks.push({ type: 'text', text: m.content });
    for (const tc of m.toolCalls) blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
    return { role: 'assistant', content: blocks };
  }
  return { role: m.role, content: m.content };
}

/**
 * Anthropic requires every tool_result answering ONE assistant tool_use
 * turn to live in a SINGLE user message's content array — a parallel
 * round's sibling `role:'tool'` ProviderMessages must collapse into one
 * `{role:'user', content:[tool_result, ...]}` entry, not one user message
 * per result (the latter is a message-shape contract violation).
 */
function toAnthropicMessages(messages: readonly ProviderMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i]!;
    if (m.role === 'tool') {
      const blocks: Array<Record<string, unknown>> = [];
      while (i < messages.length && messages[i]!.role === 'tool') {
        const tm = messages[i]!;
        blocks.push({ type: 'tool_result', tool_use_id: tm.toolCallId ?? '', content: tm.content });
        i++;
      }
      out.push({ role: 'user', content: blocks });
      continue;
    }
    out.push(toAnthropicMessage(m));
    i++;
  }
  return out;
}

/**
 * Best-effort drain of a non-ok response body into text, for error-message
 * enrichment. Consumed the same way parseSSE consumes a body (async-iterable of
 * Uint8Array) rather than via resp.text() — some fetch-shaped mocks (and this
 * project's own test fakes) only implement the async-iterable body, not `.text()`.
 * A read failure must never mask the underlying HTTP-status error, so this
 * swallows and returns '' on any error.
 */
async function readBodyText(body: AsyncIterable<Uint8Array>): Promise<string> {
  try {
    const decoder = new TextDecoder();
    let text = '';
    for await (const chunk of body) text += decoder.decode(chunk, { stream: true });
    text += decoder.decode();
    return text;
  } catch {
    return '';
  }
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
        system: req.system,
        messages: toAnthropicMessages(req.messages),
      };
      // RCA §2 — the wire ceiling is the caller's computed safe ceiling, resolved
      // through the same ladder the OpenAI-compatible transport uses, so both
      // transports wire the same value for the same request. The former
      // `max_tokens: opts.maxTokens ?? 4096` capped every real request at the
      // protected-minimum reserve (production builds this adapter without
      // `maxTokens`), which is exactly the incident: a 93.5K-input turn that had
      // room for tens of thousands of output tokens was cut at 4,096.
      // Unresolved omits the field: this transport reports the missing ceiling
      // authority through the provider's own typed rejection rather than
      // silently truncating behind a constant.
      const ceiling = resolveWireOutputCeiling({
        requestCeilingTokens: req.outputCeilingTokens,
        configuredCeilingTokens: opts.maxTokens,
      });
      if (ceiling.state === 'resolved') body['max_tokens'] = ceiling.tokens;
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
      if (!resp.ok) {
        const bodyText = resp.body ? await readBodyText(resp.body as AsyncIterable<Uint8Array>) : '';
        throw new Error(`anthropic http ${resp.status}${bodyText ? `: ${bodyText}` : ''}`);
      }
      if (!resp.body) throw new Error(`anthropic http ${resp.status}`);

      let inputTokens = 0;
      let outputTokens = 0;
      // Anthropic reports the stop cause on message_delta ('max_tokens' = cut
      // at the token ceiling); normalized onto the final 'done' event.
      let stopReason: string | undefined;
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
            // Synthesized id is index-scoped so same-named parallel calls stay
            // distinct for the Phase B transcript round-trip (toolCallId keying).
            yield { type: 'tool-call', id: cur.id || `toolu-${cur.name}-${d.index}`, name: cur.name, args };
            toolAcc.delete(d.index);
          }
        } else if (ev.event === 'message_delta') {
          if (d.usage?.output_tokens) outputTokens = d.usage.output_tokens;
          if (d.delta?.stop_reason) stopReason = d.delta.stop_reason;
        } else if (ev.event === 'message_stop') {
          yield { type: 'usage', inputTokens, outputTokens };
          break;
        } else if (ev.event === 'error') {
          // Anthropic emits a mid-stream `error` frame (e.g. overloaded_error) on
          // a failed turn; throw so it joins the transport-failure error path
          // rather than silently completing as a successful turn.
          throw new Error(`anthropic stream error: ${d.error?.type ?? 'unknown'}`);
        }
      }
      yield {
        type: 'done',
        stopReason: stopReason === 'max_tokens' ? 'length' : stopReason === 'tool_use' ? 'tool_calls' : 'stop',
      };
    },
  };
}

interface AnthropicEvent {
  index?: number;
  message?: { usage?: { input_tokens?: number } };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}
