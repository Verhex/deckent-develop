import { createHash } from 'node:crypto';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
// tests/agent/loop.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgentTurn, type LoopDeps, type PermissionResponse } from '../../src/agent/loop.js';
import { clearDetectionCache } from '../../src/orchestra/self-modifying-detector.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { createCostGuard } from '../../src/agent/guards/cost.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import { providerRequestWireUtf8Bytes } from '../../src/agent/context-budget.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import {
  bindNativePermissionIntent,
  createNativePermissionInvocation,
  digestNativePermissionArgs,
  nativePermissionBindingsEqual,
} from '../../src/agent/native-permission-binding.js';
import type { PermissionRequestEvent } from '../../src/agent/events.js';

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
function wireScaledMeasurement(adapter: ProviderAdapter): ProviderAdapter {
  return {
    ...adapter,
    requestMeasurement: {
      measure: async (request) => ({
        inputTokens: Math.ceil(providerRequestWireUtf8Bytes(request) / 4),
        quality: 'exact',
        provenance: 'test-wire-scaled',
      }),
    },
  };
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
  let invocation = 0;
  const issuePermission: LoopDeps['issuePermission'] = (input) => {
    const nativeInvocation = createNativePermissionInvocation({
      sessionId: 'loop-test-session', sessionInstanceId: 'loop-test-process', turnGeneration: 1,
      invocationId: `invocation-${++invocation}`, callId: input.callId, tool: input.tool,
      rawArgs: input.rawArgs, tier: input.tier, elevated: input.elevated, nested: input.nested,
    });
    return Object.freeze({
      type: 'permission-request', id: input.callId, tool: input.tool,
      resource: input.resource, tier: input.tier, approval: Object.freeze({ ...input.approval }),
      maskedArgs: Object.freeze({ ...input.rawArgs }),
      invocation: nativeInvocation,
    });
  };
  const valid = (request: PermissionRequestEvent, response: PermissionResponse, rawArgs: Record<string, unknown>): boolean => {
    if (response.decision === 'hold' || response.decision === 'deny') return false;
    return digestNativePermissionArgs(rawArgs) === request.invocation.invocationArgsDigest
      && nativePermissionBindingsEqual(
        response.binding,
        bindNativePermissionIntent(request.invocation, response.decision, request.resource),
      );
  };
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
    registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    issuePermission,
    requestPermission: async (request) => ({
      decision: 'once', binding: bindNativePermissionIntent(request.invocation, 'once', request.resource),
    }),
    validatePermission: valid,
    claimPermissionEffect: valid,
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
    reg.register({
      name: 'writer', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin',
      approval: (args) => typeof args['path'] === 'string'
        ? { scope: 'file-write', risk: 'high', scopeId: 'writer', resource: args['path'] }
        : null,
      handler: async () => ({ ok: true, output: 'wrote' }),
    });
    const { adapter } = scriptedAdapter([[{ type: 'tool-call', id: 'w1', name: 'writer', args: { path: 'a.txt' } }, { type: 'done' }], [{ type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({
      adapter,
      registry: reg,
      requestPermission: async (request) => ({
        decision: 'deny', binding: bindNativePermissionIntent(request.invocation, 'once', request.resource),
      }),
    }), new Transcript(), 'go'));
    expect(evs).toContainEqual(expect.objectContaining({ type: 'permission-request', id: 'w1', tool: 'writer', resource: 'a.txt', tier: 'confirm' }));
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
      reg.register({
        name: 'srcwriter', description: 'w', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
        approval: (args) => typeof args['path'] === 'string'
          ? { scope: 'file-write', risk: 'high', scopeId: 'srcwriter', resource: args['path'] }
          : null,
        handler: async () => ({ ok: true, output: 'wrote' }),
      });
      const { adapter } = scriptedAdapter([[{ type: 'tool-call', id: 's1', name: 'srcwriter', args: { path: 'src/core/x.ts' } }, { type: 'done' }], [{ type: 'done' }]]);
      const evs = await drain(runAgentTurn(baseDeps({
        adapter, registry: reg, ruleStore, cwd: root,
        requestPermission: async (request) => ({
          decision: 'once', binding: bindNativePermissionIntent(request.invocation, 'once', request.resource),
        }),
      }), new Transcript(), 'go'));
      // a silent-tier tool is elevated to a permission prompt because it writes deckent source...
      expect(evs).toContainEqual(expect.objectContaining({ type: 'permission-request', id: 's1', tool: 'srcwriter', resource: 'src/core/x.ts', tier: 'always' }));
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


describe('measured request and retained tool context', () => {
  const budget = resolveNativeAgentBudget({
    policy: {
      roles: {},
      native_agent: {
        outputReserveTokens: 1,
        contextSafetyReserveTokens: 1,
        maxToolResultShareOfContext: 0.008,
      },
    },
  });
  it('uses the selected adapter measurement before dropping old context', async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'ok' }, { type: 'done' }]]);
    const measuredRequests: ProviderRequest[] = [];
    const measured: ProviderAdapter = { ...adapter, name: 'exact-fit-test', requestMeasurement: {
      measure: async (request) => { measuredRequests.push(request); return { inputTokens: 100, provenance: 'test-exact' }; },
    } };
    const transcript = new Transcript();
    transcript.appendUser('old'.repeat(10000));
    transcript.appendAssistant('answer');
    const events = await drain(runAgentTurn(baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => 10000 }), transcript, 'next'));
    expect(events.some(event => event.type === 'error')).toBe(false);
    expect(requests[0]?.messages[0]?.content).toBe('old'.repeat(10000));
    expect(measuredRequests[0]?.system).toBe(requests[0]?.system);
    expect(measuredRequests[0]?.tools).toEqual(requests[0]?.tools);
  });

  it('requests a highwater checkpoint immediately after a measured tool round', async () => {
    const { adapter, requests } = scriptedAdapter([
      [{ type: 'tool-call', id: 'a', name: 'echo', args: { v: 'one' } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'finished' }, { type: 'done' }],
    ]);
    const measured: ProviderAdapter = { ...adapter, name: 'exact-highwater-test', requestMeasurement: {
      measure: async request => ({ inputTokens: request.messages.some(message => message.role === 'tool') ? 7600 : 100, provenance: 'test-exact' }),
    } };
    const transcript = new Transcript();
    const events: AgentEvent[] = [];
    for await (const event of runAgentTurn(baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => 10000 }), transcript, 'go')) {
      events.push(event);
      if (event.type === 'budget-checkpoint-request') {
        expect(requests).toHaveLength(1);
        expect(event).toMatchObject({
          reason: 'token-pressure',
          rounds: 1,
          pressure: {
            retainedTokens: 7602,
            capTokens: 7500,
            windowTokens: 10000,
            quality: 'exact',
            scope: 'full-request',
          },
        });
        transcript.replaceForContextEpoch([{ role: 'user', content: 'summary of tool result' }], 'next-epoch');
      }
    }
    expect(events.filter(event => event.type === 'budget-checkpoint-request')).toHaveLength(1);
    expect(events.some(event => event.type === 'error')).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it('bounds aggregate tool bytes and renews allocation after a context epoch', async () => {
    const calls = (suffix: string): ProviderEvent[] => [1, 2, 3].map(index => ({ type: 'tool-call', id: `${suffix}-${index}`, name: 'echo', args: { v: 'x'.repeat(12000) } } as const));
    const { adapter, requests } = scriptedAdapter([
      [...calls('one'), { type: 'done' }], [...calls('two'), { type: 'done' }],
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const measured = wireScaledMeasurement({ ...adapter, name: 'retained-budget-test' });
    const content = new Map<string, Buffer>();
    const transcript = new Transcript();
    let checkpoints = 0;
    const events: AgentEvent[] = [];
    for await (const event of runAgentTurn(baseDeps({
      adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => 100000,
      contentStore: { write(bytes) { const sha256 = createHash('sha256').update(bytes).digest('hex'); content.set(sha256, bytes); return { path: `content:${sha256}`, sha256 }; } },
    }), transcript, 'go')) {
      events.push(event);
      if (event.type === 'tool-result') expect(Buffer.byteLength(event.output, 'utf8')).toBeLessThanOrEqual(20_000);
      if (event.type === 'budget-checkpoint-request') {
        const total = transcript.toProviderMessages().filter(message => message.role === 'tool').reduce((sum, message) => sum + Buffer.byteLength(message.content), 0);
        expect(total).toBeLessThanOrEqual(80_000);
        checkpoints++;
        transcript.replaceForContextEpoch([{ role: 'user', content: 'retained objective and completed tools' }], `epoch-${checkpoints}`);
      }
    }
    expect(events.some(event => event.type === 'error')).toBe(false);
    const retainedShrunk = transcript.toProviderMessages().some(
      (message) => message.role === 'tool' && message.content.includes('[deckent] tool-result truncated'),
    );
    expect(checkpoints >= 1 || retainedShrunk).toBe(true);
    expect(requests).toHaveLength(3);
    const fullOutput = `echoed:${'x'.repeat(12000)}`;
    const stored = [...content.values()];
    if (stored.length > 0) expect(stored[0]?.toString()).toBe(fullOutput);
    else expect(events.some((event) => event.type === 'tool-result' && event.output.includes('x'.repeat(256)))).toBe(true);
  });
});


describe('large tool batch context allocation', () => {
  it('shares the remaining allocation across all results and preserves every content reference', async () => {
    const batch: ProviderEvent[] = Array.from({ length: 8 }, (_, index) => ({
      type: 'tool-call', id: `large-${index}`, name: 'echo', args: { v: `${index}:` + 'raw-evidence-'.repeat(1000) },
    }));
    const { adapter, requests } = scriptedAdapter([
      [...batch, { type: 'done' }], [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const measured = wireScaledMeasurement({ ...adapter, name: 'shared-batch-budget' });
    const content = new Map<string, Buffer>();
    const budget = resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { outputReserveTokens: 1, contextSafetyReserveTokens: 1 } } });
    const events = await drain(runAgentTurn(baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => 100000,
      contentStore: { write(bytes) {
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const path = `content:${sha256}`;
        content.set(path, bytes);
        return { path, sha256 };
      } },
    }), new Transcript(), 'read every result'));
    expect(events.some(event => event.type === 'error')).toBe(false);
    const results = events.filter(event => event.type === 'tool-result');
    expect(results).toHaveLength(8);
    expect(results.reduce((sum, result) => sum + Buffer.byteLength(result.output), 0)).toBeLessThanOrEqual(80_000);
    for (const [index, result] of results.entries()) {
      expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(20_000);
      const ref = /full content at (.+)$/.exec(result.output)?.[1];
      expect(ref).toBeDefined();
      expect(content.get(ref!)?.toString()).toBe(`echoed:${index}:` + 'raw-evidence-'.repeat(1000));
    }
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.filter(message => message.role === 'tool')).toHaveLength(8);
  });
});


describe('retention shrink before publishing an incoming tool batch (7109-d)', () => {
  it('shrinks old retained results before owning new calls, then emits every paired result within budget', async () => {
    const incoming = ['incoming-one', 'incoming-two'];
    const batch: ProviderEvent[] = incoming.map(id => ({ type: 'tool-call', id, name: 'echo', args: { v: `${id}:` + 'evidence'.repeat(2000) } }));
    const { adapter, requests } = scriptedAdapter([
      [...batch, { type: 'done' }], [{ type: 'text-delta', text: 'complete' }, { type: 'done' }],
    ]);
    const measured = wireScaledMeasurement({ ...adapter, name: 'pre-batch-checkpoint' });
    const transcript = new Transcript();
    transcript.appendUser('prior objective');
    transcript.appendAssistant('prior inspection', [{ id: 'prior-result', name: 'echo', args: {} }]);
    transcript.appendToolResult('prior-result', 'old-evidence-'.repeat(5000));
    const budget = resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { outputReserveTokens: 1, contextSafetyReserveTokens: 1 } } });
    const stored = new Map<string, Buffer>();
    const events: AgentEvent[] = [];
    let priorShrunkBeforeExecute = false;
    for await (const event of runAgentTurn(baseDeps({ adapter: measured, nativeBudget: budget, getContextBudgetTokens: () => 100000,
      contentStore: { write(bytes) {
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const path = `content:${sha256}`;
        stored.set(path, bytes);
        return { path, sha256 };
      } },
    }), transcript, 'continue with the next inspection')) {
      events.push(event);
      if (event.type === 'tool-executing' && !priorShrunkBeforeExecute) {
        priorShrunkBeforeExecute = transcript.getToolResultContent('prior-result')?.includes('[deckent] tool-result truncated') ?? false;
        const duringShrink = transcript.toProviderMessages();
        expect(duringShrink.some(message => message.toolCallId === 'prior-result')).toBe(true);
        for (const id of incoming) {
          expect(duringShrink.some(message => message.role === 'tool' && message.toolCallId === id)).toBe(false);
        }
      }
    }
    expect(priorShrunkBeforeExecute).toBe(true);
    expect(events.filter(event => event.type === 'budget-checkpoint-request' && event.reason === 'token-pressure')).toHaveLength(0);
    expect(events.some(event => event.type === 'error')).toBe(false);
    const results = events.filter((event): event is Extract<AgentEvent, { type: 'tool-result' }> =>
      event.type === 'tool-result' && incoming.includes(event.id));
    expect(results.map(result => result.id)).toEqual(incoming);
    expect(results.reduce((sum, result) => sum + Buffer.byteLength(result.output), 0)).toBeLessThanOrEqual(80_000);
    for (const result of results) {
      expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(20_000);
      const expected = `echoed:${result.id}:` + 'evidence'.repeat(2000);
      const ref = /full content at (.+)$/.exec(result.output)?.[1];
      if (ref) expect(stored.get(ref)?.toString()).toBe(expected);
      else expect(result.output).toBe(expected);
    }
    expect(requests).toHaveLength(2);
    const continued = requests[1]!.messages;
    const latestAssistant = [...continued].reverse().find(message => message.role === 'assistant');
    expect(latestAssistant?.toolCalls?.map(call => call.id)).toEqual(incoming);
    expect(continued.filter(message => message.role === 'tool').map(message => message.toolCallId))
      .toEqual(['prior-result', ...incoming]);
  });
});
