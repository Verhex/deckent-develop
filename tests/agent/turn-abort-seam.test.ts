// tests/agent/turn-abort-seam.test.ts
// ═══ TERMINAL-TOOLS-008 — real active-turn abort (agent layer) ══════════════
//
// Before: session.cancel() only flipped a cooperative flag the loop checks
// BETWEEN provider events — an in-flight HTTP stream kept running (a turn
// waiting for its first token could not be stopped at all), and the REPL
// never called cancel() anyway. Now every turn owns an AbortController:
// ProviderRequest carries its `signal`, the HTTP adapters hand it to fetch,
// and cancel() aborts it. An aborted stream ends the turn honestly with
// `turn-end` — never as an 'error' event. Hermetic: mock adapters/fetch.

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { createAgentSession, type AgentSessionDeps, type AgentSessionEvent } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { validateProviderRequest, type ProviderAdapter, type ProviderEvent, type ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import { createAnthropicAdapter } from '../../src/agent/provider-tooluse/anthropic.js';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';

function memRuleStore(): RuleStore {
  const r: { tool: string; pattern: string }[] = [];
  return { grant: (x) => r.push(x), revoke: () => {}, activeRules: () => [...r], activeDenies: () => [] };
}
function deps(over: Partial<AgentSessionDeps>): AgentSessionDeps {
  return {
    adapter: { name: 'noop', async *send() { yield { type: 'done' }; } },
    registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', ...over,
  };
}
const request = (signal?: AbortSignal): ProviderRequest => ({
  system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [], model: 'm', ...(signal ? { signal } : {}),
});

/** A fetch double that streams one SSE chunk, then blocks until the request signal aborts. */
function blockingFetch(bodyChunk: string): { fetchImpl: typeof fetch; seen: { signal: AbortSignal | undefined } } {
  const seen: { signal: AbortSignal | undefined } = { signal: undefined };
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    seen.signal = init?.signal ?? undefined;
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bodyChunk));
        signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

describe('ProviderRequest.signal reaches the HTTP adapters', () => {
  it('validateProviderRequest accepts a request that carries an AbortSignal', () => {
    expect(validateProviderRequest(request(new AbortController().signal))).toBeNull();
  });

  it('anthropic adapter passes req.signal to fetch as init.signal and ends when it aborts', async () => {
    const ac = new AbortController();
    const chunk = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}\n\n';
    const { fetchImpl, seen } = blockingFetch(chunk);
    const adapter = createAnthropicAdapter({ apiKey: 'k', fetchImpl });
    const events: ProviderEvent[] = [];
    const run = (async () => {
      try { for await (const ev of adapter.send(request(ac.signal))) { events.push(ev); if (events.length === 1) ac.abort(); } }
      catch (err) { return err; }
      return null;
    })();
    const outcome = await run;
    expect(seen.signal).toBe(ac.signal);
    expect(events[0]).toEqual({ type: 'text-delta', text: 'hi' });
    // either a clean end or an AbortError — never a hang
    if (outcome !== null) expect((outcome as Error).name).toBe('AbortError');
  });

  it('openai-compatible adapter passes req.signal to fetch as init.signal', async () => {
    const ac = new AbortController();
    const chunk = 'data: {"choices":[{"index":0,"delta":{"content":"hi"}}]}\n\n';
    const { fetchImpl, seen } = blockingFetch(chunk);
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const events: ProviderEvent[] = [];
    await (async () => {
      try { for await (const ev of adapter.send(request(ac.signal))) { events.push(ev); if (events.length === 1) ac.abort(); } }
      catch { /* AbortError acceptable */ }
    })();
    expect(seen.signal).toBe(ac.signal);
    expect(events[0]).toEqual({ type: 'text-delta', text: 'hi' });
  });
});

describe('AgentSession.cancel() aborts the in-flight provider stream', () => {
  it('cancel() aborts req.signal; the turn ends with turn-end and no error event; the next turn is clean', async () => {
    const signals: AbortSignal[] = [];
    let release: (() => void) | undefined;
    const adapter: ProviderAdapter = {
      name: 'blocking',
      async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
        signals.push(req.signal as AbortSignal);
        yield { type: 'text-delta', text: 'partial' };
        // block until the signal aborts (a real HTTP stream waiting for the next token)
        await new Promise<void>((resolve) => {
          if (req.signal?.aborted) { resolve(); return; }
          req.signal?.addEventListener('abort', () => resolve());
          release = resolve;
        });
        if (req.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
        yield { type: 'done' };
      },
    };
    const s = createAgentSession(deps({ adapter }));
    const events: AgentSessionEvent[] = [];
    const consumer = (async () => { for await (const ev of s.send('go')) events.push(ev); })();
    // wait for the first delta, then cancel while the adapter blocks
    while (events.length === 0) await new Promise((r) => setTimeout(r, 5));
    s.cancel();
    await consumer;
    expect(signals[0]?.aborted).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['text-delta', 'turn-end']);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    release?.();

    const clean: ProviderAdapter = { name: 'clean', async *send(req) { signals.push(req.signal as AbortSignal); yield { type: 'text-delta', text: 'ok' }; yield { type: 'done' }; } };
    const s2 = createAgentSession(deps({ adapter: clean }));
    const next: AgentSessionEvent[] = [];
    for await (const ev of s2.send('again')) next.push(ev);
    expect(next.map((e) => e.type)).toEqual(['text-delta', 'turn-end']);
    expect(signals[1]?.aborted).toBe(false); // a fresh controller per turn
  });

  it('every send() hands the adapter a fresh, un-aborted signal even after a cancelled turn on the same session', async () => {
    const signals: AbortSignal[] = [];
    const adapter: ProviderAdapter = {
      name: 'sig', async *send(req) { signals.push(req.signal as AbortSignal); yield { type: 'text-delta', text: 'x' }; yield { type: 'done' }; },
    };
    const s = createAgentSession(deps({ adapter }));
    for await (const _ of s.send('one')) { /* drain */ }
    s.cancel(); // late cancel after the turn — must not poison the next turn
    for await (const _ of s.send('two')) { /* drain */ }
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1]?.aborted).toBe(false);
  });
});
