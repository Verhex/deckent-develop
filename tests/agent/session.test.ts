// tests/agent/session.test.ts
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { createAgentSession, type AgentSessionDeps } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function scripted(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = []; let turn = 0;
  return { requests, adapter: { name: 's', async *send(req) { requests.push(req); for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } } };
}
function memRuleStore(): RuleStore { const r: { tool: string; pattern: string }[] = []; return { grant: (x) => r.push(x), revoke: () => {}, activeRules: () => [...r] }; }
function deps(over: Partial<AgentSessionDeps>): AgentSessionDeps {
  const reg = new ToolRegistry();
  reg.register({ name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }) });
  return { adapter: scripted([[{ type: 'done' }]]).adapter, registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(), cwd: tmpdir(), model: 'm', ...over };
}

describe('createAgentSession', () => {
  it('persists the transcript across turns (turn 2 request includes turn 1)', async () => {
    const { adapter, requests } = scripted([[{ type: 'text-delta', text: 'a' }, { type: 'done' }], [{ type: 'text-delta', text: 'b' }, { type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    for await (const _ of s.send('first')) { /* drain */ }
    for await (const _ of s.send('second')) { /* drain */ }
    expect(requests[1]!.messages.map((m) => m.content)).toContain('first');
    expect(requests[1]!.messages.map((m) => m.content)).toContain('second');
  });

  it('bridges respondPermission to the loop suspension', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }], [{ type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    const events: AgentEvent[] = [];
    const iter = (async () => { for await (const e of s.send('go')) { events.push(e); if (e.type === 'permission-request') s.respondPermission(e.id, { decision: 'session' }); } })();
    await iter;
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: true, output: 'wrote' });
  });

  it('setApprovalMode(full-auto) auto-allows a confirm-tier tool without a prompt', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }], [{ type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    s.setApprovalMode('full-auto');
    const events: AgentEvent[] = [];
    for await (const e of s.send('go')) events.push(e);
    expect(events.some((e) => e.type === 'permission-request')).toBe(false);
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: true, output: 'wrote' });
  });

  it('cancel() resolves a pending permission as deny and ends the turn', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    const events: AgentEvent[] = [];
    for await (const e of s.send('go')) { events.push(e); if (e.type === 'permission-request') s.cancel(); }
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: false, output: '[rejected by user]' });
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
  });

  it('cancel() also stops a later auto-tier tool in the same in-flight batch', async () => {
    // one turn proposes a confirm tool (w1) AND a silent tool (e1); cancelling on
    // w1's prompt must prevent e1 from executing, not just subsequent ask-tier tools.
    const reg = new ToolRegistry();
    reg.register({ name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin', handler: async () => ({ ok: true, output: 'wrote' }) });
    reg.register({ name: 'echo', description: 'e', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin', handler: async () => ({ ok: true, output: 'echoed' }) });
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'tool-call', id: 'e1', name: 'echo', args: {} }, { type: 'done' }]]);
    const s = createAgentSession(deps({ adapter, registry: reg }));
    const events: AgentEvent[] = [];
    for await (const e of s.send('go')) { events.push(e); if (e.type === 'permission-request') s.cancel(); }
    // e1 was proposed during streaming, but it must NOT have executed.
    expect(events.some((e) => e.type === 'tool-executing' && e.id === 'e1')).toBe(false);
    expect(events.some((e) => e.type === 'tool-result' && e.id === 'e1')).toBe(false);
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
  });

  it('bridges respondPermission when requestPermission parks FIRST (ordering B)', async () => {
    const { adapter } = scripted([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a' } }, { type: 'done' }], [{ type: 'done' }]]);
    const s = createAgentSession(deps({ adapter }));
    const events: AgentEvent[] = [];
    // Drain in the background: the loop emits permission-request, then PARKS at
    // `await requestPermission` (resolver registered in `pending`) before we answer.
    const drainP = (async () => { for await (const e of s.send('go')) events.push(e); })();
    await new Promise((res) => setImmediate(res));
    await new Promise((res) => setImmediate(res));
    const pr = events.find((e) => e.type === 'permission-request');
    expect(pr).toBeDefined();
    s.respondPermission((pr as Extract<AgentEvent, { type: 'permission-request' }>).id, { decision: 'session' });
    await drainP;
    expect(events).toContainEqual({ type: 'tool-result', id: 'w1', tool: 'writer', ok: true, output: 'wrote' });
  });
});
