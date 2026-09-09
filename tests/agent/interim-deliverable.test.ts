// tests/agent/interim-deliverable.test.ts
// 7114 TERMINAL-INTERACTION-FLOW-001 — host-enforced interim deliverable.
// Measured incident: ~40 silent tool calls / 665 s, zero visible text. The
// tracker + loop must inject the interim-answer host turn at the configured
// tool-call bound (12) and wall-clock bound (90 s, fake clock), never before,
// reset the counters once the model delivers, and nudge exactly one
// "continue" when the model answers with text only. Hermetic: no provider.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import {
  createInterimDeliverableTracker,
  INTERIM_CONTINUE_INSTRUCTION,
  INTERIM_DELIVERABLE_INSTRUCTION,
} from '../../src/agent/interim-deliverable.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../../src/core/execution-budget-policy.js';

const POLICY = {
  interimAnswerAfterToolCalls: DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerAfterToolCalls,
  interimAnswerAfterMs: DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerAfterMs,
  interimAnswerMinChars: DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerMinChars,
};

function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('createInterimDeliverableTracker (pure, fake clock)', () => {
  it('defaults are the owner-stated bounds: 12 tool calls / 90 s / 200 chars', () => {
    expect(POLICY).toEqual({ interimAnswerAfterToolCalls: 12, interimAnswerAfterMs: 90_000, interimAnswerMinChars: 200 });
  });

  it('fires at exactly 12 tool calls, not at 11', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(11);
    expect(tracker.evaluate()).toBeUndefined();
    tracker.observeToolCalls(1);
    expect(tracker.evaluate()).toEqual({ trigger: 'tool-calls', toolCallsSinceDeliverable: 12, elapsedMsSinceDeliverable: 0 });
  });

  it('fires at 90 s of wall clock with few calls, not at 89.999 s', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(2);
    clock.advance(89_999);
    expect(tracker.evaluate()).toBeUndefined();
    clock.advance(1);
    expect(tracker.evaluate()).toEqual({ trigger: 'elapsed', toolCallsSinceDeliverable: 2, elapsedMsSinceDeliverable: 90_000 });
  });

  it('a visible answer of >= minChars is a deliverable: counters reset, snapshot shows it', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(9);
    clock.advance(60_000);
    tracker.observeAssistantText('x'.repeat(199));
    expect(tracker.settleRound()).toBe(false); // below the floor → not a deliverable
    tracker.observeAssistantText('y');
    expect(tracker.settleRound()).toBe(true);
    const snap = tracker.snapshot();
    expect(snap.toolCallsSinceDeliverable).toBe(0);
    expect(snap.elapsedMsSinceDeliverable).toBe(0);
    expect(snap.delivered).toBe(1);
    expect(snap.requested).toBe(0);
    expect(snap.pending).toBe(false);
    tracker.observeToolCalls(11);
    expect(tracker.evaluate()).toBeUndefined(); // 11 since the deliverable, not 20
  });

  it('while a request is pending, the host re-asks only after a full window since the request', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(12);
    const first = tracker.evaluate();
    expect(first?.trigger).toBe('tool-calls');
    tracker.markRequested(first!.trigger);
    expect(tracker.snapshot()).toMatchObject({ requested: 1, pending: true, lastTrigger: 'tool-calls' });
    // the continuation nudge is armed once per request…
    expect(tracker.consumeContinuation()).toBe(true);
    expect(tracker.consumeContinuation()).toBe(false);
    tracker.observeToolCalls(3); // the model ignored the request and kept calling tools
    expect(tracker.evaluate()).toBeUndefined(); // no spam: 3 < 12 since the request
    tracker.observeToolCalls(9);
    expect(tracker.evaluate()?.trigger).toBe('tool-calls'); // 12 since the request → ask again
    // …and a tool call after a request disarms it (the model continued by itself)
    tracker.markRequested('tool-calls');
    tracker.observeToolCalls(1);
    expect(tracker.consumeContinuation()).toBe(false);
  });

  it('rejects a non-positive or non-integer policy loudly', () => {
    expect(() => createInterimDeliverableTracker({ ...POLICY, interimAnswerAfterMs: 0 }, () => 0)).toThrow(RangeError);
    expect(() => createInterimDeliverableTracker({ ...POLICY, interimAnswerMinChars: 1.5 }, () => 0)).toThrow(RangeError);
  });
});

// ─── transcript: the host instruction survives a context epoch ───────────────

describe('Transcript.appendHostUser × compactForContextEpoch', () => {
  it('keeps a trailing host instruction after the epoch rebuild, never a trailing USER-origin message', () => {
    const t = new Transcript();
    t.appendUser('objective', { turnId: 'turn-1', origin: 'user' });
    t.appendAssistant('', [{ id: 'c1', name: 'echo', args: {} }]);
    t.appendToolResult('c1', 'r1');
    t.appendHostUser(INTERIM_DELIVERABLE_INSTRUCTION);
    expect(t.toEntries().at(-1)).toMatchObject({ turnId: 'turn-1', origin: 'system', message: { role: 'user', content: INTERIM_DELIVERABLE_INSTRUCTION } });
    t.compactForContextEpoch('OBJ', 'CKPT', 'turn-1');
    const after = t.toProviderMessages();
    expect(after.at(-1)).toEqual({ role: 'user', content: INTERIM_DELIVERABLE_INSTRUCTION });
    expect(after.filter((m) => m.role === 'tool')).toHaveLength(1);
    // a trailing ordinary user message is NOT duplicated by the epoch (the objective carries it)
    const u = new Transcript();
    u.appendUser('objective', { turnId: 'turn-1', origin: 'user' });
    u.compactForContextEpoch('OBJ', 'CKPT', 'turn-1');
    expect(u.toProviderMessages().map((m) => m.content)).toEqual(['OBJ', 'CKPT']);
  });
});

// ─── loop integration ────────────────────────────────────────────────────────

function memRuleStore(): RuleStore {
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules], activeDenies: () => [] };
}
async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []; for await (const e of stream) out.push(e); return out;
}
function registry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register({
    name: 'echo', description: 'echo', inputSchema: { type: 'object' }, category: 'coding',
    tier: 'silent', source: 'builtin', handler: async (a) => ({ ok: true, output: `echoed:${a['v'] ?? ''}` }),
  });
  return reg;
}
function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  return {
    adapter: { name: 'noop', async *send() { yield { type: 'done' }; } },
    registry: registry(), policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    issuePermission: () => { throw new Error('unexpected permission prompt'); },
    requestPermission: async () => ({ decision: 'hold', reasonCode: 'unexpected' }),
    validatePermission: () => false,
    claimPermissionEffect: () => false,
    ...over,
  };
}
/** Scripted rounds; records every request so the host turns can be asserted. */
function scripted(rounds: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let i = 0;
  return {
    requests,
    adapter: { name: 'scripted', async *send(req) { requests.push(req); for (const e of rounds[i++] ?? [{ type: 'done' }]) yield e; } },
  };
}
const calls = (round: number, n: number): ProviderEvent[] => [
  ...Array.from({ length: n }, (_, k): ProviderEvent => ({ type: 'tool-call', id: `r${round}c${k}`, name: 'echo', args: { v: `${round}-${k}` } })),
  { type: 'done' },
];
const LONG = 'Known so far: the document has 40 rows. Remaining: rows 20-40. Next: read the remaining rows and summarise the risk column in one table. '.repeat(2);

describe('runAgentTurn — host-enforced interim deliverable', () => {
  it('after 12 silent tool calls (3 rounds × 4) the loop injects the interim host turn, the model answers live, counters reset', async () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    const s = scripted([
      calls(1, 4), calls(2, 4), calls(3, 4),
      // the answer to the host request: interim text + continues with a tool call
      [{ type: 'text-delta', text: LONG }, { type: 'tool-call', id: 'r4c0', name: 'echo', args: { v: 'after' } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'final' }, { type: 'done' }],
    ]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), t, 'analyse'));

    const interim = evs.filter((e) => e.type === 'interim-deliverable');
    expect(interim).toEqual([
      { type: 'interim-deliverable', phase: 'required', trigger: 'tool-calls', toolCalls: 12, elapsedMs: 0 },
      { type: 'interim-deliverable', phase: 'delivered', toolCalls: 0, elapsedMs: 0 },
    ]);
    // the request is a user-role host turn carried by the very next request
    const fourth = s.requests[3]!;
    expect(fourth.messages.at(-1)).toEqual({ role: 'user', content: INTERIM_DELIVERABLE_INSTRUCTION });
    // the interim text streamed as ordinary text-delta BEFORE the tool ran
    const order = evs.map((e) => e.type);
    const requiredAt = evs.findIndex((e) => e.type === 'interim-deliverable' && e.phase === 'required');
    const textAt = order.indexOf('text-delta');
    const afterToolExec = order.findIndex((type, idx) => type === 'tool-executing' && idx > textAt);
    expect(textAt).toBeGreaterThan(requiredAt);
    expect(afterToolExec).toBeGreaterThan(textAt);
    // the turn ended normally with the final answer; no orphan tool_use
    expect(evs.at(-1)).toEqual({ type: 'turn-end' });
    const messages = t.toProviderMessages();
    const hostTurns = messages.filter((m) => m.role === 'user' && m.content === INTERIM_DELIVERABLE_INSTRUCTION);
    expect(hostTurns).toHaveLength(1);
    expect(t.toEntries().find((e) => e.message.content === INTERIM_DELIVERABLE_INSTRUCTION)?.origin).toBe('system');
    expect(tracker.snapshot()).toMatchObject({ delivered: 1, requested: 1, pending: false });
  });

  it('does NOT fire at 11 tool calls', async () => {
    const tracker = createInterimDeliverableTracker(POLICY, fakeClock().now);
    const s = scripted([calls(1, 4), calls(2, 4), calls(3, 3), [{ type: 'text-delta', text: 'done' }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), new Transcript(), 'go'));
    expect(evs.some((e) => e.type === 'interim-deliverable')).toBe(false);
    expect(s.requests.every((r) => r.messages.every((m) => m.content !== INTERIM_DELIVERABLE_INSTRUCTION))).toBe(true);
  });

  it('fires on the 90 s wall-clock bound with only two tool calls (fake clock), not at 89 s', async () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    const slow = registry();
    slow.register({
      name: 'slow', description: 'slow', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
      handler: async () => { clock.advance(45_000); return { ok: true, output: 'slow-ok' }; },
    });
    const s = scripted([
      [{ type: 'tool-call', id: 's1', name: 'slow', args: {} }, { type: 'done' }],          // 45 s → no
      [{ type: 'tool-call', id: 's2', name: 'slow', args: {} }, { type: 'done' }],          // 90 s → required
      [{ type: 'text-delta', text: LONG }, { type: 'done' }],                              // text-only answer → continue nudge
      [{ type: 'text-delta', text: 'nothing remains' }, { type: 'done' }],
    ]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, registry: slow, interimDeliverable: tracker }), t, 'go'));
    const interim = evs.filter((e) => e.type === 'interim-deliverable');
    expect(interim[0]).toEqual({ type: 'interim-deliverable', phase: 'required', trigger: 'elapsed', toolCalls: 2, elapsedMs: 90_000 });
    expect(interim.map((e) => (e as { phase: string }).phase)).toEqual(['required', 'delivered', 'continued']);
    // the text-only deliverable did not end the turn: one continue host turn, then the model closed
    expect(s.requests).toHaveLength(4);
    expect(s.requests[3]!.messages.at(-1)).toEqual({ role: 'user', content: INTERIM_CONTINUE_INSTRUCTION });
    expect(evs.filter((e) => e.type === 'turn-end')).toHaveLength(1);
    expect(evs.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text)).toEqual([LONG, 'nothing remains']);
  });

  it('a second text-only answer after the continue nudge ends the turn (bounded, no loop)', async () => {
    const tracker = createInterimDeliverableTracker({ ...POLICY, interimAnswerAfterToolCalls: 1 }, fakeClock().now);
    const s = scripted([
      calls(1, 1),
      [{ type: 'text-delta', text: LONG }, { type: 'done' }],
      [{ type: 'text-delta', text: LONG }, { type: 'done' }],
      [{ type: 'text-delta', text: 'never requested' }, { type: 'done' }],
    ]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), new Transcript(), 'go'));
    expect(s.requests).toHaveLength(3);
    expect(evs.filter((e) => e.type === 'interim-deliverable').map((e) => (e as { phase: string }).phase)).toEqual(['required', 'delivered', 'continued', 'delivered']);
  });

  it('a model that narrates on its own (>= minChars between batches) never triggers the host turn', async () => {
    const tracker = createInterimDeliverableTracker(POLICY, fakeClock().now);
    const narrated = (round: number): ProviderEvent[] => [{ type: 'text-delta', text: LONG }, ...calls(round, 6)];
    const s = scripted([narrated(1), narrated(2), narrated(3), [{ type: 'text-delta', text: 'final' }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), new Transcript(), 'go'));
    expect(evs.filter((e) => e.type === 'interim-deliverable').every((e) => (e as { phase: string }).phase === 'delivered')).toBe(true);
    expect(tracker.snapshot()).toMatchObject({ requested: 0, delivered: 3 });
  });

  it('legacy callers without a tracker are byte-identical: no host turns, no events', async () => {
    const s = scripted([calls(1, 4), calls(2, 4), calls(3, 4), calls(4, 4), [{ type: 'text-delta', text: 'x' }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter }), new Transcript(), 'go'));
    expect(evs.some((e) => e.type === 'interim-deliverable')).toBe(false);
    expect(s.requests.every((r) => r.messages.every((m) => m.content !== INTERIM_DELIVERABLE_INSTRUCTION))).toBe(true);
  });
});
