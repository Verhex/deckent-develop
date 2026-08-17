// tests/agent/loop.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { clearDetectionCache } from '../../src/orchestra/self-modifying-detector.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { createCostGuard } from '../../src/agent/guards/cost.js';
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
    // 548-T2: every promptless run now carries its auditable auto-decision event.
    expect(evs.map((e) => e.type)).toEqual(['text-delta', 'tool-proposed', 'permission-auto-decision', 'tool-executing', 'tool-result', 'text-delta', 'turn-end']);
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
    expect(evs[evs.length - 2]).toEqual({ type: 'error', code: 'native-budget.rounds-exhausted', message: 'recursion limit exceeded' });
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
  });

  it('never persists a grant for a self-modifying-elevated call (re-asks every time)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loop-deckent-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'deckent' }));
    clearDetectionCache();
    try {
      const grants: { tool: string; pattern: string }[] = [];
      const ruleStore: RuleStore = { grant: (r) => grants.push(r), revoke: () => {}, activeRules: () => [...grants], activeDenies: () => [] };
      const reg = new ToolRegistry();
      reg.register({ name: 'srcwriter', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }) });
      const { adapter } = scriptedAdapter([[{ type: 'tool-call', id: 's1', name: 'srcwriter', args: { path: 'src/core/x.ts' } }, { type: 'done' }], [{ type: 'done' }]]);
      const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg, ruleStore, cwd: root, requestPermission: async () => ({ decision: 'always' }) }), new Transcript(), 'go'));
      // a silent-tier tool is elevated to a permission prompt because it writes deckent source...
      expect(evs).toContainEqual({ type: 'permission-request', id: 's1', tool: 'srcwriter', resource: 'src/core/x.ts', tier: 'always' });
      // ...and the "always" grant is NOT persisted (each self-modifying write re-confirms).
      expect(grants).toEqual([]);
      expect(evs).toContainEqual({ type: 'tool-result', id: 's1', tool: 'srcwriter', ok: true, output: 'wrote' });
    } finally {
      rmSync(root, { recursive: true, force: true });
      clearDetectionCache();
    }
  });

  it('passes active deny rules to decide() so a matching deny blocks an otherwise-silent tool', async () => {
    const reg = new ToolRegistry();
    reg.register({ name: 'bash', description: 'b', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin', handler: async () => ({ ok: true, output: 'ran' }) });
    const ruleStore: RuleStore = { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [{ tool: 'bash', pattern: '**' }] };
    const { adapter } = scriptedAdapter([[{ type: 'tool-call', id: 'b1', name: 'bash', args: { command: 'rm -rf x' } }, { type: 'done' }], [{ type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, registry: reg, ruleStore }), new Transcript(), 'go'));
    expect(evs).toContainEqual({ type: 'tool-result', id: 'b1', tool: 'bash', ok: false, output: '[denied by policy]' });
    expect(evs.some((e) => e.type === 'tool-executing')).toBe(false);
  });

  it('aborts the turn with a COST_GATE_EXCEEDED error when the hard cost ceiling is crossed mid-turn', async () => {
    const costGuard = createCostGuard({ usdPerMillionTokens: 3, ceilingUsd: 0.0001 });
    const { adapter } = scriptedAdapter([[
      { type: 'text-delta', text: 'hi' },
      { type: 'usage', inputTokens: 999_999, outputTokens: 0 },
      { type: 'tool-call', id: 'c1', name: 'echo', args: {} },
      { type: 'done' },
    ]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, costGuard }), new Transcript(), 'go'));
    expect(evs).toContainEqual({ type: 'usage', inputTokens: 999_999, outputTokens: 0 });
    expect(evs.some((e) => e.type === 'error' && (e as Extract<AgentEvent, { type: 'error' }>).message.includes('COST_GATE_EXCEEDED'))).toBe(true);
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
    // the tool call that arrived after the ceiling-crossing usage is never executed
    expect(evs.some((e) => e.type === 'tool-executing')).toBe(false);
  });

  it('does not abort on usage when the cost guard is advisory-only (no ceiling configured)', async () => {
    const costGuard = createCostGuard({ usdPerMillionTokens: 3 });
    const { adapter } = scriptedAdapter([[{ type: 'text-delta', text: 'ok' }, { type: 'usage', inputTokens: 10_000_000, outputTokens: 0 }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter, costGuard }), new Transcript(), 'go'));
    expect(evs.some((e) => e.type === 'error')).toBe(false);
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
  });

  it('does not append an empty assistant turn when the stream yields no text and no tool calls', async () => {
    const { adapter, requests } = scriptedAdapter([
      [{ type: 'done' }],                                   // turn 1: empty (no text, no calls)
      [{ type: 'text-delta', text: 'next' }, { type: 'done' }],
    ]);
    const t = new Transcript();
    // Two sends on the same transcript: the 2nd request must NOT carry an empty assistant msg.
    await drain(runAgentTurn(baseDeps({ adapter }), t, 'first'));
    await drain(runAgentTurn(baseDeps({ adapter }), t, 'second'));
    const assistantMsgs = requests[1]!.messages.filter((m) => m.role === 'assistant');
    expect(assistantMsgs.every((m) => m.content !== '' || (m.toolCalls?.length ?? 0) > 0)).toBe(true);
  });
});
