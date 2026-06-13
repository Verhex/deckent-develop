// tests/agent/loop.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

// A scripted adapter: yields a canned ProviderEvent[] per call, in order.
function scriptedAdapter(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name: 'scripted',
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
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules] };
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
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
    registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

describe('runAgentTurn', () => {
  it('streams text then ends the turn when the model returns no tool calls', async () => {
    const { adapter } = scriptedAdapter([[{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 1, outputTokens: 2 }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'hello'));
    expect(evs).toEqual([
      { type: 'text-delta', text: 'hi' },
      { type: 'usage', inputTokens: 1, outputTokens: 2 },
      { type: 'turn-end' },
    ]);
  });

  it('runs a silent tool call (tool-proposed→executing→result), feeds it back, then ends', async () => {
    const { adapter, requests } = scriptedAdapter([
      [{ type: 'text-delta', text: 'ok' }, { type: 'tool-call', id: 'c1', name: 'echo', args: { v: 'X' } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), t, 'go'));
    expect(evs.map((e) => e.type)).toEqual(['text-delta', 'tool-proposed', 'tool-executing', 'tool-result', 'text-delta', 'turn-end']);
    expect(evs).toContainEqual({ type: 'tool-result', id: 'c1', tool: 'echo', ok: true, output: 'echoed:X' });
    // round-trip: the 2nd request carries the assistant toolCalls + the tool result.
    const second = requests[1]!;
    expect(second.messages.find((m) => m.role === 'assistant')?.toolCalls).toEqual([{ id: 'c1', name: 'echo', args: { v: 'X' } }]);
    expect(second.messages.find((m) => m.role === 'tool')).toEqual({ role: 'tool', content: 'echoed:X', toolCallId: 'c1' });
  });

  it('asks for permission on a confirm-tier tool and aborts the call on deny', async () => {
    const reg = new ToolRegistry();
    reg.register({ name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }) });
    const { adapter } = scriptedAdapter([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a.txt' } }, { type: 'done' }], [{ type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg, requestPermission: async () => ({ decision: 'deny' }) }), new Transcript(), 'go'));
    expect(evs).toContainEqual({ type: 'permission-request', id: 'w1', tool: 'writer', resource: 'a.txt', tier: 'confirm' });
    expect(evs).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: false, output: '[rejected by user]' });
    expect(evs.some((e) => e.type === 'tool-executing')).toBe(false);
  });

  it('emits an error + turn-end when the adapter throws', async () => {
    const adapter: ProviderAdapter = { name: 'boom', async *send() { throw new Error('http 500'); } };
    const evs = await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'go'));
    expect(evs).toEqual([{ type: 'error', message: 'http 500' }, { type: 'turn-end' }]);
  });

  it('stops with an error when the recursion cap is exceeded (tool never satisfies the model)', async () => {
    // every turn returns the same tool call → would loop forever without the cap.
    const loopForever: ProviderEvent[] = [{ type: 'tool-call', id: 'c', name: 'echo', args: {} }, { type: 'done' }];
    const adapter: ProviderAdapter = { name: 'spin', async *send() { for (const e of loopForever) yield e; } };
    const evs = await drain(runAgentTurn(baseDeps({ adapter, maxIterations: 3 }), new Transcript(), 'go'));
    expect(evs.filter((e) => e.type === 'tool-result').length).toBe(3);
    expect(evs[evs.length - 2]).toEqual({ type: 'error', message: 'recursion limit exceeded' });
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
  });
});
