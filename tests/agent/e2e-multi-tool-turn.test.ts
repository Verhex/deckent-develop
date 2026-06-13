// tests/agent/e2e-multi-tool-turn.test.ts
// SP-285 scenario, native: a single model turn proposes TWO tool calls; the
// loop runs both in order, feeds both results back, and the model concludes.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { createAgentSession } from '../../src/agent/session.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';

function memRuleStore(): RuleStore { const r: { tool: string; pattern: string }[] = []; return { grant: (x) => r.push(x), revoke: () => {}, activeRules: () => [...r] }; }

describe('e2e: native multi-tool turn', () => {
  it('runs two tool calls from one turn in order, then concludes', async () => {
    const requests: ProviderRequest[] = [];
    let turn = 0;
    const scripts: ProviderEvent[][] = [
      [
        { type: 'text-delta', text: 'Reading both files.' },
        { type: 'tool-call', id: 'a', name: 'read_file', args: { path: 'x.txt' } },
        { type: 'tool-call', id: 'b', name: 'read_file', args: { path: 'y.txt' } },
        { type: 'done' },
      ],
      [{ type: 'text-delta', text: 'Both read.' }, { type: 'usage', inputTokens: 10, outputTokens: 4 }, { type: 'done' }],
    ];
    const adapter: ProviderAdapter = { name: 'e2e', async *send(req) { requests.push(req); for (const e of scripts[turn++]!) yield e; } };

    const reg = new ToolRegistry();
    reg.register({ name: 'read_file', description: 'read', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin', handler: async (a) => ({ ok: true, output: `BODY:${a['path']}` }) });

    const s = createAgentSession({ adapter, registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(), cwd: tmpdir(), model: 'm' });
    const events: AgentEvent[] = [];
    for await (const e of s.send('read x and y')) events.push(e);

    // both tool calls surfaced + executed, in order
    expect(events.filter((e) => e.type === 'tool-proposed').map((e) => (e as Extract<AgentEvent, { type: 'tool-proposed' }>).id)).toEqual(['a', 'b']);
    expect(events.filter((e) => e.type === 'tool-result').map((e) => (e as Extract<AgentEvent, { type: 'tool-result' }>).output)).toEqual(['BODY:x.txt', 'BODY:y.txt']);
    // the 2nd request carries BOTH tool results, keyed
    const toolMsgs = requests[1]!.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toEqual([
      { role: 'tool', content: 'BODY:x.txt', toolCallId: 'a' },
      { role: 'tool', content: 'BODY:y.txt', toolCallId: 'b' },
    ]);
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
  });
});
