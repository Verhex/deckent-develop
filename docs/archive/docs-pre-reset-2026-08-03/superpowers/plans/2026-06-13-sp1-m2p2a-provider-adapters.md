# SP-1 M2 Part 2 Phase A — Provider Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the three real LLM backends — an OpenAI-compatible adapter, an Anthropic adapter, and an Ollama adapter — that all conform to M2 Part 1's `ProviderAdapter` interface, turning a `ProviderRequest` into a stream of normalized `ProviderEvent`s via real HTTP + SSE parsing (mocked in unit tests, real in smoke).

**Architecture:** Greenfield `src/agent/provider-tooluse/`, building on M2 Part 1's `types.ts` (`ProviderAdapter`, `ProviderRequest`, `ProviderEvent`, `validateProviderRequest`) and M1's `NativeToolSchema`. A shared `sse.ts` parses Server-Sent-Event byte streams into `{event?, data}` records; the OpenAI and Anthropic adapters each map their provider's streaming chunks → normalized `ProviderEvent`s (`text-delta` / `tool-call` / `usage` / `done`), accumulating streamed tool-call argument fragments. The Ollama adapter delegates to the OpenAI adapter (Ollama serves an OpenAI-compatible `/v1/chat/completions`). Every adapter takes an injectable `fetchImpl` so unit tests run against canned SSE with zero network.

**Tech Stack:** TypeScript (ESM, Node16 — `.js` import suffix mandatory), vitest, Node global `fetch`/`TextDecoder`/`TextEncoder` (no new deps — ADR-010), hermetic tests (no network — injected `fetchImpl` returns canned streams).

**Spec:** `docs/superpowers/specs/2026-06-13-sp1-native-terminal-agent-core-design.md` (§3 transport, §5 module map, §13 M2 Part 2 notes — `ProviderMessage` is string-content, transcript-as-sequence).

**Depends on (already merged to main `35034d6f`):** `src/agent/provider-tooluse/types.ts` (M2 Part 1), `src/agent/tools/registry.ts` (`NativeToolSchema`, M1).

**Conventions:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (omitted below for brevity). Adapter `reason`/error strings are NOT yet user-surfaced (i18n applies at M3 view-wire) — keep them plain.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/agent/provider-tooluse/sse.ts` | `parseSSE(chunks)` — byte stream → `{event?, data}` SSE records |
| `src/agent/provider-tooluse/openai.ts` | `createOpenAIAdapter(opts)` → ProviderAdapter (OpenAI-compatible /v1/chat/completions) |
| `src/agent/provider-tooluse/anthropic.ts` | `createAnthropicAdapter(opts)` → ProviderAdapter (Anthropic /v1/messages) |
| `src/agent/provider-tooluse/ollama.ts` | `createOllamaAdapter(opts)` → ProviderAdapter (delegates to OpenAI adapter at the Ollama host) |
| `tests/agent/*.test.ts` | one hermetic test file per module (injected fetch, canned SSE) |

Task order: sse → openai → anthropic → ollama → wire-up gate.

---

## Task 1: SSE parser

**Files:**
- Create: `src/agent/provider-tooluse/sse.ts`
- Test: `tests/agent/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/sse.test.ts
import { describe, it, expect } from 'vitest';
import { parseSSE, type SSEEvent } from '../../src/agent/provider-tooluse/sse.js';

async function* bytes(...parts: string[]): AsyncIterable<Uint8Array> {
  const enc = new TextEncoder();
  for (const p of parts) yield enc.encode(p);
}
async function collect(stream: AsyncIterable<SSEEvent>): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

describe('parseSSE', () => {
  it('parses data-only events (OpenAI style), split arbitrarily across chunks', async () => {
    const evs = await collect(parseSSE(bytes('data: {"a":', '1}\n\n', 'data: [DONE]\n\n')));
    expect(evs).toEqual([{ event: undefined, data: '{"a":1}' }, { event: undefined, data: '[DONE]' }]);
  });
  it('parses event+data records (Anthropic style)', async () => {
    const evs = await collect(parseSSE(bytes('event: message_start\ndata: {"x":1}\n\n')));
    expect(evs).toEqual([{ event: 'message_start', data: '{"x":1}' }]);
  });
  it('handles CRLF line endings and ignores comment/other lines', async () => {
    const evs = await collect(parseSSE(bytes(': comment\r\nevent: ping\r\ndata: hi\r\n\r\n')));
    expect(evs).toEqual([{ event: 'ping', data: 'hi' }]);
  });
  it('yields a trailing event with no final blank line', async () => {
    const evs = await collect(parseSSE(bytes('data: tail')));
    expect(evs).toEqual([{ event: undefined, data: 'tail' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/sse.test.ts`
Expected: FAIL — cannot resolve `sse.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/provider-tooluse/sse.ts
// ═══ SSE parser — byte stream → {event?, data} records (SP-1 §5) ════════════
// Handles both OpenAI ('data:'-only) and Anthropic ('event:'+'data:') SSE.
// A record is flushed on a blank line; multiple 'data:' lines join with '\n'.
// No network — operates on any AsyncIterable<Uint8Array> (real body or canned).

export interface SSEEvent {
  event: string | undefined;
  data: string;
}

export async function* parseSSE(chunks: AsyncIterable<Uint8Array>): AsyncIterable<SSEEvent> {
  const decoder = new TextDecoder();
  let buf = '';
  let event: string | undefined;
  const dataLines: string[] = [];

  for await (const chunk of chunks) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line === '') {
        if (dataLines.length > 0) {
          yield { event, data: dataLines.join('\n') };
          dataLines.length = 0;
          event = undefined;
        }
        continue;
      }
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      // other lines (':' comments, 'id:', 'retry:') are ignored
    }
  }
  if (dataLines.length > 0) yield { event, data: dataLines.join('\n') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/sse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/provider-tooluse/sse.ts tests/agent/sse.test.ts
git commit -m "feat(agent): SSE parser for provider streams (SP-1 M2p2a T1)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: OpenAI-compatible adapter

**Files:**
- Create: `src/agent/provider-tooluse/openai.ts`
- Test: `tests/agent/openai-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/openai-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = {
  system: 'sys', model: 'gpt-4.1',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
};

// Build a fake fetch that returns a streaming body of the given SSE string.
function fakeFetch(sse: string, ok = true, status = 200): typeof fetch {
  return (async () => ({
    ok, status,
    body: (async function* () { yield new TextEncoder().encode(sse); })(),
  })) as unknown as typeof fetch;
}
async function drain(adapter: { send(r: ProviderRequest): AsyncIterable<ProviderEvent> }, r: ProviderRequest): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of adapter.send(r)) out.push(e);
  return out;
}

describe('createOpenAIAdapter', () => {
  it('streams text deltas then usage then done', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toEqual([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'usage', inputTokens: 5, outputTokens: 2 },
      { type: 'done' },
    ]);
  });
  it('accumulates a streamed tool-call across delta fragments', async () => {
    const sse =
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"pa"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"x\\"}"}}]}}]}\n\n' +
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n' +
      'data: [DONE]\n\n';
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'call_1', name: 'read_file', args: { path: 'x' } });
    expect(evs[evs.length - 1]).toEqual({ type: 'done' });
  });
  it('throws on a non-ok HTTP status', async () => {
    const a = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl: fakeFetch('', false, 500) });
    await expect(drain(a, req)).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/openai-adapter.test.ts`
Expected: FAIL — cannot resolve `openai.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/openai-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/provider-tooluse/openai.ts tests/agent/openai-adapter.test.ts
git commit -m "feat(agent): OpenAI-compatible streaming adapter (SP-1 M2p2a T2)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Anthropic adapter

**Files:**
- Create: `src/agent/provider-tooluse/anthropic.ts`
- Test: `tests/agent/anthropic-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/anthropic-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = {
  system: 'sys', model: 'claude-fable-5',
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ name: 'read_file', description: 'read', input_schema: { type: 'object' } }],
};
function fakeFetch(sse: string, ok = true, status = 200): typeof fetch {
  return (async () => ({ ok, status, body: (async function* () { yield new TextEncoder().encode(sse); })() })) as unknown as typeof fetch;
}
async function drain(a: { send(r: ProviderRequest): AsyncIterable<ProviderEvent> }, r: ProviderRequest): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = []; for await (const e of a.send(r)) out.push(e); return out;
}

describe('createAnthropicAdapter', () => {
  it('streams text deltas + usage + done', async () => {
    const sse =
      'event: message_start\ndata: {"message":{"usage":{"input_tokens":5}}}\n\n' +
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"text"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n' +
      'event: content_block_stop\ndata: {"index":0}\n\n' +
      'event: message_delta\ndata: {"usage":{"output_tokens":3}}\n\n' +
      'event: message_stop\ndata: {}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'text-delta', text: 'Hi' });
    expect(evs).toContainEqual({ type: 'usage', inputTokens: 5, outputTokens: 3 });
    expect(evs[evs.length - 1]).toEqual({ type: 'done' });
  });
  it('accumulates a tool_use block from input_json_delta fragments', async () => {
    const sse =
      'event: content_block_start\ndata: {"index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}\n\n' +
      'event: content_block_delta\ndata: {"index":0,"delta":{"type":"input_json_delta","partial_json":"\\"x\\"}"}}\n\n' +
      'event: content_block_stop\ndata: {"index":0}\n\n' +
      'event: message_stop\ndata: {}\n\n';
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch(sse) });
    const evs = await drain(a, req);
    expect(evs).toContainEqual({ type: 'tool-call', id: 'toolu_1', name: 'read_file', args: { path: 'x' } });
  });
  it('throws on non-ok status', async () => {
    const a = createAnthropicAdapter({ apiKey: 'sk-ant', fetchImpl: fakeFetch('', false, 429) });
    await expect(drain(a, req)).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/anthropic-adapter.test.ts`
Expected: FAIL — cannot resolve `anthropic.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/anthropic-adapter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/provider-tooluse/anthropic.ts tests/agent/anthropic-adapter.test.ts
git commit -m "feat(agent): Anthropic streaming adapter (SP-1 M2p2a T3)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Ollama adapter (delegates to OpenAI-compatible)

**Files:**
- Create: `src/agent/provider-tooluse/ollama.ts`
- Test: `tests/agent/ollama-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/ollama-adapter.test.ts
import { describe, it, expect } from 'vitest';
import { createOllamaAdapter } from '../../src/agent/provider-tooluse/ollama.js';
import type { ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const req: ProviderRequest = { system: 'sys', model: 'qwen3', messages: [{ role: 'user', content: 'hi' }], tools: [] };

describe('createOllamaAdapter', () => {
  it('has name "ollama" and streams via the OpenAI-compatible path at the ollama host', async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = url;
      return { ok: true, status: 200, body: (async function* () { yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hey"}}]}\n\ndata: [DONE]\n\n'); })() };
    }) as unknown as typeof fetch;

    const a = createOllamaAdapter({ host: 'http://127.0.0.1:11434', fetchImpl });
    expect(a.name).toBe('ollama');
    const out: ProviderEvent[] = [];
    for await (const e of a.send(req)) out.push(e);
    expect(calledUrl).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(out).toContainEqual({ type: 'text-delta', text: 'hey' });
    expect(out[out.length - 1]).toEqual({ type: 'done' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/agent/ollama-adapter.test.ts`
Expected: FAIL — cannot resolve `ollama.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/provider-tooluse/ollama.ts
// ═══ Ollama adapter (SP-1 §3) ═══════════════════════════════════════════════
// Ollama serves an OpenAI-compatible /v1/chat/completions, so this is a thin
// wrapper over createOpenAIAdapter pointed at {host}/v1, with name 'ollama'.
// No API key (local). Reuse keeps one streaming/tool-call code path.

import { createOpenAIAdapter } from './openai.js';
import type { ProviderAdapter } from './types.js';

export interface OllamaAdapterOptions {
  host: string;              // e.g. 'http://127.0.0.1:11434'
  fetchImpl?: typeof fetch;
}

export function createOllamaAdapter(opts: OllamaAdapterOptions): ProviderAdapter {
  return createOpenAIAdapter({
    baseUrl: `${opts.host}/v1`,
    name: 'ollama',
    fetchImpl: opts.fetchImpl,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/agent/ollama-adapter.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/agent/provider-tooluse/ollama.ts tests/agent/ollama-adapter.test.ts
git commit -m "feat(agent): Ollama adapter (delegates to OpenAI-compatible path) (SP-1 M2p2a T4)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Wire-up gate

**Files:** (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run lint`
Expected: PASS (tsc --noEmit clean; the new `provider-tooluse/` adapters compile).

- [ ] **Step 2: Run the agent suite (no regressions, new adapter tests green)**

Run: `npx vitest run tests/agent/`
Expected: PASS — the existing 60 tests (M1 + M2 Part 1) PLUS the new Phase A: `sse.test.ts` (4), `openai-adapter.test.ts` (3), `anthropic-adapter.test.ts` (3), `ollama-adapter.test.ts` (1) = 11 new → ~71 total, all green. Report the exact count.

- [ ] **Step 3: Confirm no cross-suite regression**

Run: `npx vitest run tests/agent/ tests/core/provider-command-spec.test.ts`
Expected: green. Phase A added only new `src/agent/provider-tooluse/` files — it modified no existing file, so the broader suite is unaffected.

- [ ] **Step 4: Commit the milestone marker**

```bash
git commit --allow-empty -m "chore(agent): SP-1 M2 Part 2 Phase A — 3 provider adapters complete"
```

---

## Self-Review

**Spec coverage (the adapter layer):**
- §3 native tool_use via real providers → openai (T2) + anthropic (T3) + ollama (T4) ✓
- §3 OpenAI-compatible-first (one code path; Ollama delegates; vLLM/OpenRouter use the same openai adapter) ✓
- §5 `provider-tooluse/{openai,anthropic,ollama}.ts` + the shared `sse.ts` ✓
- §13 `ProviderMessage` string-content honored: `toOpenAIMessage`/`toAnthropicMessage` map `role:'tool'` + `toolCallId` into each provider's tool-result shape (the transcript-as-sequence note) ✓
- The agent loop, session, and 3 guards are **M2 Part 2 Phase B** — they consume these adapters; not gaps here.

**Placeholder scan:** No TBD/TODO; every step has complete code + exact command + expected output. Adapter `reason`/error strings are intentionally plain (i18n deferred to M3 per the spec) — noted, not a placeholder.

**Type consistency:** all three adapters return `ProviderAdapter` and `send` yields `ProviderEvent` (M2 Part 1 types) · `parseSSE` returns `SSEEvent` (defined T1, consumed T2/T3) · `OpenAIAdapterOptions`/`AnthropicAdapterOptions`/`OllamaAdapterOptions` each defined once · ollama (T4) imports `createOpenAIAdapter` (T2) — no drift.

**Scope:** Phase A produces a standalone, fully-unit-tested adapter layer (~11 new tests, zero network — injected fetch) — builds and tests green on its own. Phase B (guards + transcript + loop + session + §13 legacy-store retirement) is the next plan, written after Phase A lands. A real-binary provider smoke (one live API call per backend) belongs to Phase B / M3 when a transport is wired end-to-end.

---

## Phase B preview (next plan, written after Phase A lands)

Not part of THIS plan — recorded so the sequence is clear:
- **Guards** (`src/agent/guards/{self-modifying,cost,recursion}.ts`): self-modifying reuses `src/orchestra/self-modifying-detector.ts` (`isSelfModifying`/`isSelfModifyingSprint`); cost reuses `src/core/cost-gate.ts`; recursion = depth/flag check.
- **Transcript builder** (`src/agent/transcript.ts`): assemble `ProviderMessage[]` as a sequence (assistant text, then per-tool-result `role:'tool'` keyed by `toolCallId`) — spec §13 note.
- **Agent loop** (`src/agent/loop.ts`): `composeSystemPrompt` + `registry.toNativeSchemas` + transcript → `ProviderRequest` → `adapter.send` → map `ProviderEvent`→`AgentEvent`; on `tool-call`: `resolveTier`→`decide`→guards→registry handler→feed result→continue.
- **Session** (`src/agent/session.ts`): `AgentSession` command interface (`send`/`respondPermission`/`cancel`/`setApprovalMode`) + `AgentEvent` stream.
- **§13 legacy-store retirement**: the change that wires M1's `permission-store.ts` must retire `src/cli/commands/chat-permissions.ts` (`createPermissionStore`) — callers in `src/cli/entry.ts` + `src/cli/repl/run.tsx` — so the `permissions.allow` dual-writer is removed.
