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
  INTERIM_FAILURE_STOP_INSTRUCTION,
  INTERIM_FINAL_INSTRUCTION,
  TOOL_BUDGET_EXHAUSTED_RESULT,
} from '../../src/agent/interim-deliverable.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { createNativeBudgetState } from '../../src/agent/guards/recursion.js';

const POLICY = {
  interimAnswerAfterToolCalls: DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerAfterToolCalls,
  interimAnswerAfterMs: DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerAfterMs,
  interimAnswerMinChars: DEFAULT_NATIVE_AGENT_BUDGET.interimAnswerMinChars,
  maxInterimRequestsPerTurn: DEFAULT_NATIVE_AGENT_BUDGET.maxInterimRequestsPerTurn,
  maxToolCallsPerTurn: DEFAULT_NATIVE_AGENT_BUDGET.maxToolCallsPerTurn,
  maxConsecutiveFailuresPerTarget: DEFAULT_NATIVE_AGENT_BUDGET.maxConsecutiveFailuresPerTarget,
};
/** One round's answer: substantive enough to count under the floor. */
const ANSWER = 'Known so far: rows 1-20 read. Remaining: rows 20-40. Next: summarise the risk column. '.repeat(3);

function fakeClock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('createInterimDeliverableTracker (pure, fake clock)', () => {
  it('defaults are the owner-stated bounds: 12 tool calls / 90 s / 200 chars', () => {
    expect(POLICY).toEqual({
      interimAnswerAfterToolCalls: 12, interimAnswerAfterMs: 90_000, interimAnswerMinChars: 200,
      maxInterimRequestsPerTurn: 3, maxToolCallsPerTurn: 40, maxConsecutiveFailuresPerTarget: 3,
    });
  });

  it('fires at exactly 12 tool calls, not at 11', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(11);
    expect(tracker.evaluate()).toBeUndefined();
    tracker.observeToolCalls(1);
    expect(tracker.evaluate()).toEqual({ kind: 'interim', trigger: 'tool-calls', toolCallsSinceDeliverable: 12, elapsedMsSinceDeliverable: 0 });
  });

  it('fires at 90 s of wall clock with few calls, not at 89.999 s', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(2);
    clock.advance(89_999);
    expect(tracker.evaluate()).toBeUndefined();
    clock.advance(1);
    expect(tracker.evaluate()).toEqual({ kind: 'interim', trigger: 'elapsed', toolCallsSinceDeliverable: 2, elapsedMsSinceDeliverable: 90_000 });
  });

  it('7114-b REVISE: a long reply that still calls a tool is narration EVEN while a request is pending', () => {
    // Astra repro 2026-09-10T00:27Z: 12 calls → markRequested → 300+ char text
    // with one tool call was accepted as a delivery, so the spiral could keep
    // "answering" forever. The boundary is structural, not pending+chars.
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(12);
    tracker.markRequested(tracker.evaluate()!);
    expect(tracker.settleRound({ text: 'x'.repeat(300), toolCalls: 1 })).toBe('narration');
    const snap = tracker.snapshot();
    expect(snap.delivered).toBe(0);
    expect(snap.pending).toBe(true);
    expect(snap.toolCallsSinceDeliverable).toBe(12);
    // The good flow: a tool-free answer settles it, and the counters restart.
    expect(tracker.settleRound({ text: ANSWER, toolCalls: 0 })).toBe('delivered');
    expect(tracker.snapshot()).toMatchObject({ delivered: 1, pending: false, toolCallsSinceDeliverable: 0 });
  });

  it('7114-b: only a real ANSWER is a deliverable — narration alongside tool calls never is', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(9);
    clock.advance(60_000);
    // Long narration that introduces the next batch: not an answer, however long.
    expect(tracker.settleRound({ text: ANSWER, toolCalls: 4 })).toBe('narration');
    expect(tracker.snapshot().delivered).toBe(0);
    // Short text with no calls: still below the floor.
    expect(tracker.settleRound({ text: 'x'.repeat(199), toolCalls: 0 })).toBe('narration');
    // A substantive answer that ends the round's work IS a delivery.
    expect(tracker.settleRound({ text: ANSWER, toolCalls: 0 })).toBe('delivered');
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
    tracker.markRequested(first!);
    expect(tracker.snapshot()).toMatchObject({ requested: 1, pending: true, lastTrigger: 'tool-calls' });
    // the continuation nudge is armed once per request…
    expect(tracker.consumeContinuation()).toBe(true);
    expect(tracker.consumeContinuation()).toBe(false);
    tracker.observeToolCalls(3); // the model ignored the request and kept calling tools
    expect(tracker.evaluate()).toBeUndefined(); // no spam: 3 < 12 since the request
    tracker.observeToolCalls(9);
    expect(tracker.evaluate()?.trigger).toBe('tool-calls'); // 12 since the request → ask again
    expect(tracker.evaluate()?.kind).toBe('interim');
    // …and a tool call after a request disarms it (the model continued by itself)
    tracker.markRequested({ kind: 'interim', trigger: 'tool-calls', toolCallsSinceDeliverable: 0, elapsedMsSinceDeliverable: 0 });
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
      // the answer to the host request: a tool-free interim answer (the ask
      // forbids a tool call in the SAME response), then the continue nudge
      // resumes the work.
      [{ type: 'text-delta', text: LONG }, { type: 'done' }],
      [{ type: 'text-delta', text: '' }, { type: 'tool-call', id: 'r4c0', name: 'echo', args: { v: 'after' } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'final answer with substance. '.repeat(10) }, { type: 'done' }],
    ]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), t, 'analyse'));

    const interim = evs.filter((e) => e.type === 'interim-deliverable');
    // required → tool-free answer (delivered) → one continue nudge → the model
    // resumes with a tool call → its closing answer (delivered again).
    expect(interim.map((e) => (e as { phase: string; demand?: string }).phase)).toEqual(['required', 'delivered', 'continued', 'delivered']);
    expect(interim[0]).toEqual({ type: 'interim-deliverable', phase: 'required', demand: 'interim', trigger: 'tool-calls', toolCalls: 12, elapsedMs: 0, toolCallsThisTurn: 12 });
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
    // Two real answers landed (the interim one and the closing one), one ask.
    expect(tracker.snapshot()).toMatchObject({ delivered: 2, requested: 1, pending: false });
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
    expect(interim[0]).toEqual({ type: 'interim-deliverable', phase: 'required', demand: 'interim', trigger: 'elapsed', toolCalls: 2, elapsedMs: 90_000, toolCallsThisTurn: 2 });
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

  it('7114-b: narration between batches no longer counts as delivery, so the bound is actually reached', async () => {
    // This is the measured owner defect (2026-09-09 21:39Z): the narration
    // contract's own preambles kept resetting the counters, so 28 calls over
    // 1092 s produced ZERO interim answers. Narration is now `narration`.
    const tracker = createInterimDeliverableTracker(POLICY, fakeClock().now);
    const narrated = (round: number): ProviderEvent[] => [{ type: 'text-delta', text: LONG }, ...calls(round, 6)];
    const s = scripted([narrated(1), narrated(2), narrated(3), [{ type: 'text-delta', text: 'final answer with substance. '.repeat(10) }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), new Transcript(), 'go'));
    const phases = evs.filter((e) => e.type === 'interim-deliverable').map((e) => (e as { phase: string }).phase);
    expect(phases).toContain('required');
    expect(tracker.snapshot().requested).toBeGreaterThanOrEqual(1);
    // The host turn rode a real request, not a counter that silently reset.
    expect(s.requests.some((r) => r.messages.some((m) => m.content === INTERIM_DELIVERABLE_INSTRUCTION))).toBe(true);
  });

  it('legacy callers without a tracker are byte-identical: no host turns, no events', async () => {
    const s = scripted([calls(1, 4), calls(2, 4), calls(3, 4), calls(4, 4), [{ type: 'text-delta', text: 'x' }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter }), new Transcript(), 'go'));
    expect(evs.some((e) => e.type === 'interim-deliverable')).toBe(false);
    expect(s.requests.every((r) => r.messages.every((m) => m.content !== INTERIM_DELIVERABLE_INSTRUCTION))).toBe(true);
  });
});

// ─── 7114-b: honest bounds ───────────────────────────────────────────────────

describe('7114-b tracker bounds (pure, fake clock)', () => {
  it('300-char narration across many tool rounds never resets the counters', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    for (let round = 0; round < 6; round++) {
      tracker.observeToolCalls(2);
      clock.advance(10_000);
      expect(tracker.settleRound({ text: 'x'.repeat(300), toolCalls: 2 })).toBe('narration');
    }
    const snap = tracker.snapshot();
    expect(snap.delivered).toBe(0);
    // Nothing was reset: 12 calls and 60 s have accumulated since the turn began.
    expect(snap.toolCallsSinceDeliverable).toBe(12);
    expect(snap.elapsedMsSinceDeliverable).toBe(60_000);
    expect(tracker.evaluate()?.kind).toBe('interim');
  });

  it('a host-requested answer resets the counters; the wall clock restarts from it', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    tracker.observeToolCalls(12);
    tracker.markRequested(tracker.evaluate()!);
    clock.advance(30_000);
    // The ask forbids a tool call in the answering response: tool-free settles.
    expect(tracker.settleRound({ text: ANSWER, toolCalls: 0 })).toBe('delivered');
    const snap = tracker.snapshot();
    expect(snap).toMatchObject({ delivered: 1, pending: false, toolCallsSinceDeliverable: 0, elapsedMsSinceDeliverable: 0 });
    clock.advance(89_999);
    expect(tracker.evaluate()).toBeUndefined();
    clock.advance(1);
    expect(tracker.evaluate()?.trigger).toBe('elapsed');
  });

  it('the wall-clock bound is reported ONCE while a round is still in flight', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    expect(tracker.msUntilDue()).toBe(90_000);
    clock.advance(90_000);
    expect(tracker.msUntilDue()).toBe(0);
    expect(tracker.markOverdue()).toBe(true);
    expect(tracker.markOverdue()).toBe(false);
    expect(tracker.snapshot().overdue).toBe(true);
    // A real answer clears it; the next window starts fresh.
    tracker.settleRound({ text: ANSWER, toolCalls: 0 });
    expect(tracker.snapshot().overdue).toBe(false);
    expect(tracker.msUntilDue()).toBe(90_000);
  });

  it('nudging is finite: after the per-turn ceiling the host stops asking', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker({ ...POLICY, maxInterimRequestsPerTurn: 2 }, clock.now);
    for (let i = 0; i < 2; i++) {
      tracker.observeToolCalls(12);
      const demand = tracker.evaluate();
      expect(demand?.kind).toBe('interim');
      tracker.markRequested(demand!);
    }
    tracker.observeToolCalls(12);
    expect(tracker.evaluate()).toBeUndefined();
    expect(tracker.snapshot().requestsRemaining).toBe(0);
  });

  it('the per-turn tool ceiling demands ONE honest final answer and closes the tool budget', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker({ ...POLICY, maxToolCallsPerTurn: 14 }, clock.now);
    tracker.observeToolCalls(13);
    expect(tracker.isToolBudgetExhausted()).toBe(false);
    tracker.observeToolCalls(1);
    expect(tracker.isToolBudgetExhausted()).toBe(true);
    const demand = tracker.evaluate();
    expect(demand?.kind).toBe('final');
    tracker.markRequested(demand!);
    // Asked exactly once, and it never arms a "keep going" nudge.
    expect(tracker.consumeContinuation()).toBe(false);
    expect(tracker.evaluate()).toBeUndefined();
    expect(tracker.snapshot()).toMatchObject({ toolBudgetExhausted: true, toolCallsThisTurn: 14, toolCallsPerTurnLimit: 14 });
  });

  it('repeated failures against ONE exact target close that line; other work is never implicated', () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker(POLICY, clock.now);
    // Three failures spread across different targets: no stop (no false positive).
    tracker.observeToolOutcome({ tool: 'bash', target: 'a.md', ok: false });
    tracker.observeToolOutcome({ tool: 'bash', target: 'b.md', ok: false });
    tracker.observeToolOutcome({ tool: 'grep', target: 'a.md', ok: false });
    expect(tracker.evaluate()).toBeUndefined();
    // Three consecutive failures against the SAME target do stop it.
    tracker.observeToolOutcome({ tool: 'grep', target: 'big.md', ok: false });
    tracker.observeToolOutcome({ tool: 'grep', target: 'big.md', ok: false });
    tracker.observeToolOutcome({ tool: 'grep', target: 'big.md', ok: false });
    const demand = tracker.evaluate();
    expect(demand).toMatchObject({ kind: 'failure-stop', target: 'grep big.md', attempts: 3 });
    tracker.markRequested(demand!);
    expect(tracker.snapshot().stoppedTarget).toBe('grep big.md');
    // The same target is not asked about twice.
    tracker.observeToolOutcome({ tool: 'grep', target: 'big.md', ok: false });
    tracker.observeToolOutcome({ tool: 'grep', target: 'big.md', ok: false });
    tracker.observeToolOutcome({ tool: 'grep', target: 'big.md', ok: false });
    expect(tracker.evaluate()).toBeUndefined();
  });

  it('a success on the failing target clears its streak', () => {
    const tracker = createInterimDeliverableTracker(POLICY, fakeClock().now);
    tracker.observeToolOutcome({ tool: 'bash', target: 'x', ok: false });
    tracker.observeToolOutcome({ tool: 'bash', target: 'x', ok: false });
    tracker.observeToolOutcome({ tool: 'bash', target: 'x', ok: true });
    tracker.observeToolOutcome({ tool: 'bash', target: 'x', ok: false });
    expect(tracker.evaluate()).toBeUndefined();
  });
});

describe('runAgentTurn — 7114-b honest bounds', () => {
  it('the per-turn tool ceiling stops execution and forces the final answer', async () => {
    const tracker = createInterimDeliverableTracker({ ...POLICY, interimAnswerAfterToolCalls: 12, maxToolCallsPerTurn: 12 }, fakeClock().now);
    const s = scripted([
      calls(1, 12),
      // the model tries to keep calling tools after the ceiling
      calls(2, 2),
      [{ type: 'text-delta', text: ANSWER }, { type: 'done' }],
    ]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, interimDeliverable: tracker }), t, 'go'));
    const required = evs.filter((e) => e.type === 'interim-deliverable' && (e as { phase: string }).phase === 'required');
    expect(required.map((e) => (e as { demand?: string }).demand)).toEqual(['final']);
    // Every call proposed after the ceiling is refused with a typed result, and
    // each one is still paired in the transcript (the next request stays valid).
    const refused = evs.filter((e) => e.type === 'tool-result' && (e as { output: string }).output === TOOL_BUDGET_EXHAUSTED_RESULT);
    expect(refused).toHaveLength(2);
    expect(evs.filter((e) => e.type === 'tool-executing')).toHaveLength(12);
    expect(t.toProviderMessages().some((m) => m.content === INTERIM_FINAL_INSTRUCTION)).toBe(true);
    expect(evs.at(-1)).toEqual({ type: 'turn-end' });
  });

  it('three failures on one target close that line and the host asks for an honest answer', async () => {
    const tracker = createInterimDeliverableTracker({ ...POLICY, maxConsecutiveFailuresPerTarget: 3 }, fakeClock().now);
    const failing = registry();
    failing.register({
      name: 'flaky', description: 'flaky', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
      handler: async () => ({ ok: false, output: 'no match' }),
    });
    const attempt = (round: number): ProviderEvent[] => [
      { type: 'tool-call', id: `f${round}`, name: 'flaky', args: { path: 'same.md' } }, { type: 'done' },
    ];
    const s = scripted([attempt(1), attempt(2), attempt(3), [{ type: 'text-delta', text: ANSWER }, { type: 'done' }]]);
    const t = new Transcript();
    const evs = await drain(runAgentTurn(baseDeps({ adapter: s.adapter, registry: failing, interimDeliverable: tracker }), t, 'go'));
    const required = evs.filter((e) => e.type === 'interim-deliverable' && (e as { phase: string }).phase === 'required');
    expect(required).toHaveLength(1);
    expect(required[0]).toMatchObject({ demand: 'failure-stop', target: 'flaky same.md', attempts: 3 });
    expect(t.toProviderMessages().some((m) => m.content === INTERIM_FAILURE_STOP_INSTRUCTION)).toBe(true);
  });

  it('a slow in-flight round reports the answer as overdue while it is still streaming', async () => {
    const clock = fakeClock();
    const tracker = createInterimDeliverableTracker({ ...POLICY, interimAnswerAfterMs: 40 }, clock.now);
    // A real (non-fake) delay so the loop's deadline race actually fires; the
    // tracker's own clock is advanced with it.
    const slowAdapter: ProviderAdapter = {
      name: 'slow-stream',
      async *send() {
        await new Promise((r) => setTimeout(r, 120));
        clock.advance(120);
        yield { type: 'text-delta', text: ANSWER };
        yield { type: 'done' };
      },
    };
    const evs = await drain(runAgentTurn(baseDeps({ adapter: slowAdapter, interimDeliverable: tracker }), new Transcript(), 'go'));
    const overdue = evs.filter((e) => e.type === 'interim-deliverable' && (e as { phase: string }).phase === 'overdue');
    expect(overdue).toHaveLength(1);
    // The stream was NOT cut short: the answer still arrived intact.
    expect(evs.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text)).toEqual([ANSWER]);
  });
});

// ─── 7114-b REVISE: a non-cooperative stream cannot hold the turn open ───────

describe('runAgentTurn — bounded termination of a stream that never finishes', () => {
  it('ends the turn on the wall budget, keeps the partial text, and claims nothing', async () => {
    // The adapter ignores its abort signal, never yields a terminal event and
    // its own return() also hangs — the worst honest case. Before 7114-b the
    // between-rounds budget check could never run and the turn hung forever.
    const neverFinishes: ProviderAdapter = {
      name: 'non-cooperative',
      send() {
        return {
          [Symbol.asyncIterator]() {
            let sent = false;
            return {
              async next() {
                if (!sent) { sent = true; return { done: false, value: { type: 'text-delta', text: 'partial answer so far' } }; }
                return new Promise<never>(() => { /* never resolves, ignores abort */ });
              },
              return() { return new Promise<never>(() => { /* hangs too */ }); },
            };
          },
        } as AsyncIterable<ProviderEvent>;
      },
    };
    const budget = { ...resolveNativeAgentBudget({}), maxWallTimeMs: 250 };
    const state = createNativeBudgetState();
    const t = new Transcript();
    const started = Date.now();
    const evs = await drain(runAgentTurn(baseDeps({
      adapter: neverFinishes, nativeBudget: budget, nativeBudgetState: state,
      interimDeliverable: createInterimDeliverableTracker(POLICY, () => Date.now()),
    }), t, 'go'));
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5_000);
    // What the user already saw is retained, exactly like an interrupt.
    expect(evs.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text)).toEqual(['partial answer so far']);
    expect(t.toProviderMessages().some((m) => m.role === 'assistant' && m.content === 'partial answer so far')).toBe(true);
    // The reason is typed and the turn is closed; nothing claims completion.
    expect(evs.some((e) => e.type === 'error' && (e as { code?: string }).code === 'native-budget.walltime-exhausted')).toBe(true);
    expect(evs.at(-1)).toEqual({ type: 'turn-end' });
  });
});
