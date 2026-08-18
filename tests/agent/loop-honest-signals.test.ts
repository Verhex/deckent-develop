// tests/agent/loop-honest-signals.test.ts
// ═══ Honest degradation signals + live adapter/model switching (SP-1 §13) ═══
// Born from the 2026-07-07 incident (memory:
// project_native_repl_model_switch_noop_and_ctx_overflow): a full local-model
// context window produced silent empty turns, and /model switches never
// reached the engine. These tests pin the fixes at the loop level.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function scriptedAdapter(scripts: ProviderEvent[][], name = 'scripted'): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name,
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      requests.push(req);
      const script = scripts[turn++] ?? [{ type: 'done' }];
      for (const e of script) yield e;
    },
  };
  return { adapter, requests };
}
function memRuleStore(): RuleStore {
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules], activeDenies: () => [] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []; for await (const e of stream) out.push(e); return out;
}
function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
    registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

describe('runAgentTurn — honest degradation signals', () => {
  it('surfaces an empty provider response as an empty-response error, not a silent turn', async () => {
    const { adapter } = scriptedAdapter([[{ type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'hi'));
    // 7086/560-003: the empty turn is now ALSO classified as a typed
    // generation-recovery fact (TRANSPORT_EMPTY, action hold) before the
    // honest empty-response error.
    expect(evs).toEqual([
      {
        type: 'generation-recovery', classification: 'TRANSPORT_EMPTY',
        continuationIndex: 0, maxContinuations: expect.any(Number),
        hiddenReasoningObserved: false, action: 'hold',
      },
      { type: 'error', code: 'empty-response', message: expect.stringContaining('empty response') },
      { type: 'turn-end' },
    ]);
  });

  it('does NOT flag a normal text turn as empty', async () => {
    const { adapter } = scriptedAdapter([[{ type: 'text-delta', text: 'hello' }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'hi'));
    expect(evs.some((e) => e.type === 'error')).toBe(false);
  });

  it("recovers a 'length' stop via bounded continuation (typed OUTPUT_LIMIT, no passive truncated notice)", async () => {
    // 7086/560-003: a length stop no longer yields a passive 'truncated'
    // notice — the loop continues the SAME logical turn with a bounded
    // follow-up request and reports the fact as typed generation-recovery.
    const { adapter } = scriptedAdapter([
      [{ type: 'text-delta', text: 'partial…' }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: ' rest.' }, { type: 'done', stopReason: 'stop' }],
    ]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'hi'));
    expect(evs).toContainEqual(expect.objectContaining({
      type: 'generation-recovery', classification: 'OUTPUT_LIMIT', action: 'continue', continuationIndex: 1,
    }));
    expect(evs.some((e) => (e as { code?: string }).code === 'truncated')).toBe(false);
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
  });

  it("compacts an over-budget transcript and reports it via a 'context-compacted' notice", async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'ok' }, { type: 'done' }]]);
    const transcript = new Transcript();
    // Pre-fill history well beyond the tiny budget below.
    for (let i = 0; i < 6; i++) {
      transcript.appendUser(`q${i} ` + 'x'.repeat(400));
      transcript.appendAssistant(`a${i} ` + 'y'.repeat(400));
    }
    const evs = await drain(runAgentTurn(baseDeps({ adapter, getContextBudgetTokens: () => 300 }), transcript, 'final question'));
    const notice = evs.find((e) => e.type === 'notice');
    expect(notice).toMatchObject({ type: 'notice', code: 'context-compacted' });
    // The provider must have received a WINDOW, not the full transcript…
    expect(requests[0]!.messages.length).toBeLessThan(13);
    // …ending with the just-appended user input.
    expect(requests[0]!.messages[requests[0]!.messages.length - 1]).toMatchObject({ role: 'user', content: 'final question' });
    // The full transcript itself stays intact (compaction is per-request).
    expect(transcript.toProviderMessages().filter((m) => m.role === 'user').length).toBe(7);
  });

  it('does not compact (or notice) when no budget is configured', async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'ok' }, { type: 'done' }]]);
    const transcript = new Transcript();
    for (let i = 0; i < 6; i++) transcript.appendUser('x'.repeat(400));
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), transcript, 'q'));
    expect(evs.some((e) => e.type === 'notice')).toBe(false);
    expect(requests[0]!.messages.length).toBe(7);
  });
});

describe('runAgentTurn — live adapter/model switching (getAdapter/getModel)', () => {
  it('reads the adapter and model through the getters on every provider call', async () => {
    const a = scriptedAdapter([[{ type: 'text-delta', text: 'from-A' }, { type: 'done' }]], 'A');
    const b = scriptedAdapter([[{ type: 'text-delta', text: 'from-B' }, { type: 'done' }]], 'B');
    const live = { adapter: a.adapter, model: 'model-a' };
    const deps = baseDeps({ getAdapter: () => live.adapter, getModel: () => live.model });
    const transcript = new Transcript();

    await drain(runAgentTurn(deps, transcript, 'turn 1'));
    expect(a.requests).toHaveLength(1);
    expect(a.requests[0]!.model).toBe('model-a');

    // The runtime switch: swap the live refs — NO loop/session rebuild.
    live.adapter = b.adapter;
    live.model = 'model-b';

    await drain(runAgentTurn(deps, transcript, 'turn 2'));
    expect(b.requests).toHaveLength(1);
    expect(b.requests[0]!.model).toBe('model-b');
    // The transcript survived the switch: turn 2's request carries turn 1.
    expect(b.requests[0]!.messages.some((m) => m.role === 'user' && m.content === 'turn 1')).toBe(true);
  });

  it('falls back to the fixed adapter/model when no getters are supplied', async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'ok' }, { type: 'done' }]]);
    await drain(runAgentTurn(baseDeps({ adapter, model: 'fixed-model' }), new Transcript(), 'hi'));
    expect(requests[0]!.model).toBe('fixed-model');
  });
});
