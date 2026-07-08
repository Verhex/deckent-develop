// tests/agent/loop-cancel.test.ts
// 387-020 — AGENT-LOOP-CANCEL: cancel() must interrupt an in-flight turn and must
// never leave an orphan tool_use (a proposed tool call with no matching tool_result),
// since that pairing break makes the NEXT provider call reject.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function memRuleStore(): RuleStore {
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules], activeDenies: () => [] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []; for await (const e of stream) out.push(e); return out;
}
function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  const reg = new ToolRegistry();
  reg.register({
    name: 'echo', description: 'echo', inputSchema: { type: 'object' }, category: 'coding',
    tier: 'silent', source: 'builtin', handler: async (a) => ({ ok: true, output: `echoed:${a['v'] ?? ''}` }),
  });
  return {
    adapter: { name: 'noop', async *send() { yield { type: 'done' }; } },
    registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

/** Asserts the transcript never has an assistant message whose toolCalls outnumber
 *  the tool-result messages that reference those same ids — i.e. no orphan tool_use. */
function expectNoOrphanToolUse(messages: ReturnType<Transcript['toProviderMessages']>): void {
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.toolCalls || m.toolCalls.length === 0) continue;
    const resultIds = new Set(messages.filter((x) => x.role === 'tool').map((x) => x.toolCallId));
    for (const tc of m.toolCalls) expect(resultIds.has(tc.id)).toBe(true);
  }
}

describe('runAgentTurn — cancel() interrupt + orphan tool_use', () => {
  it('interrupts an in-flight stream: a tool-call event arriving after cancel() is never proposed or committed', async () => {
    let cancelled = false;
    const adapter: ProviderAdapter = {
      name: 'mid-stream-cancel',
      async *send(_req: ProviderRequest): AsyncIterable<ProviderEvent> {
        yield { type: 'text-delta', text: 'partial' };
        cancelled = true; // simulate the user hitting cancel while this turn streams
        yield { type: 'tool-call', id: 'late1', name: 'echo', args: { v: 'late' } };
        yield { type: 'done' };
      },
    };
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter, isCancelled: () => cancelled }), t, 'go'));

    expect(evs).toEqual([{ type: 'text-delta', text: 'partial' }, { type: 'turn-end' }]);
    expect(evs.some((e) => e.type === 'tool-proposed')).toBe(false);
    expect(evs.some((e) => e.type === 'tool-executing')).toBe(false);

    // The interrupted turn never committed an assistant message — nothing to orphan.
    const messages = t.toProviderMessages();
    expect(messages.some((m) => m.role === 'assistant')).toBe(false);
    expectNoOrphanToolUse(messages);
  });

  it('the next turn after a mid-stream cancel is clean (no leftover state breaks the following provider call)', async () => {
    let cancelled = false;
    const cancelledAdapter: ProviderAdapter = {
      name: 'mid-stream-cancel',
      async *send(): AsyncIterable<ProviderEvent> {
        yield { type: 'text-delta', text: 'partial' };
        cancelled = true;
        yield { type: 'tool-call', id: 'late1', name: 'echo', args: { v: 'late' } };
        yield { type: 'done' };
      },
    };
    const t = new Transcript();
    await drain(runAgentTurn(baseDeps({ adapter: cancelledAdapter, isCancelled: () => cancelled }), t, 'first'));

    // A fresh, non-cancelled turn on the SAME transcript must succeed cleanly.
    cancelled = false;
    const requests: ProviderRequest[] = [];
    const cleanAdapter: ProviderAdapter = {
      name: 'clean',
      async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
        requests.push(req);
        yield { type: 'text-delta', text: 'ok' };
        yield { type: 'done' };
      },
    };
    const evs = await drain(runAgentTurn(baseDeps({ adapter: cleanAdapter, isCancelled: () => cancelled }), t, 'second'));
    expect(evs).toEqual([{ type: 'text-delta', text: 'ok' }, { type: 'turn-end' }]);
    expectNoOrphanToolUse(requests[0]!.messages);
  });

  it('mid-batch cancel: an unexecuted trailing tool call gets a synthetic cancelled result, preserving tool_use/tool_result pairing', async () => {
    let cancelled = false;
    const reg = new ToolRegistry();
    reg.register({
      name: 'echo', description: 'echo', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
      handler: async (a) => {
        cancelled = true; // simulate the user cancelling while this (first) tool call runs
        return { ok: true, output: `echoed:${a['v'] ?? ''}` };
      },
    });
    const adapter: ProviderAdapter = {
      name: 'two-calls',
      async *send(): AsyncIterable<ProviderEvent> {
        yield { type: 'tool-call', id: 'c1', name: 'echo', args: { v: 'first' } };
        yield { type: 'tool-call', id: 'c2', name: 'echo', args: { v: 'second' } };
        yield { type: 'done' };
      },
    };
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg, isCancelled: () => cancelled }), t, 'go'));

    // c1 executes normally; c2 is cut short — never proposed to tool-executing and
    // (matching existing session.test.ts semantics for an unexecuted trailing call)
    // never surfaces its own tool-result view event either. It still gets paired
    // in the transcript below so the next provider call stays valid.
    expect(evs).toContainEqual({ type: 'tool-executing', id: 'c1', tool: 'echo' });
    expect(evs).toContainEqual({ type: 'tool-result', id: 'c1', tool: 'echo', ok: true, output: 'echoed:first' });
    expect(evs.some((e) => e.type === 'tool-executing' && e.id === 'c2')).toBe(false);
    expect(evs.some((e) => e.type === 'tool-result' && e.id === 'c2')).toBe(false);
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });

    // Pairing preserved: the assistant's 2 proposed tool_use ids both have a tool_result.
    const messages = t.toProviderMessages();
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.toolCalls?.map((c) => c.id)).toEqual(['c1', 'c2']);
    const toolMsgIds = messages.filter((m) => m.role === 'tool').map((m) => m.toolCallId);
    expect(toolMsgIds).toEqual(['c1', 'c2']);
    expectNoOrphanToolUse(messages);
  });

  it('a clean (non-cancelled) multi-tool-call turn is unaffected — regression guard for existing behavior', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'echo', description: 'echo', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
      handler: async (a) => ({ ok: true, output: `echoed:${a['v'] ?? ''}` }),
    });
    let turn = 0;
    const adapter: ProviderAdapter = {
      name: 'two-calls-clean',
      async *send(): AsyncIterable<ProviderEvent> {
        if (turn++ === 0) {
          yield { type: 'tool-call', id: 'c1', name: 'echo', args: { v: 'first' } };
          yield { type: 'tool-call', id: 'c2', name: 'echo', args: { v: 'second' } };
          yield { type: 'done' };
        } else {
          yield { type: 'text-delta', text: 'done' };
          yield { type: 'done' };
        }
      },
    };
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg, isCancelled: () => false }), t, 'go'));
    expect(evs).toContainEqual({ type: 'tool-result', id: 'c1', tool: 'echo', ok: true, output: 'echoed:first' });
    expect(evs).toContainEqual({ type: 'tool-result', id: 'c2', tool: 'echo', ok: true, output: 'echoed:second' });
    expectNoOrphanToolUse(t.toProviderMessages());
  });
});
