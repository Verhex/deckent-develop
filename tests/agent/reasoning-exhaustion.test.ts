// tests/agent/reasoning-exhaustion.test.ts
// ═══ 7108 — loop-level reasoning control: inclusive ceiling arithmetic, live
// reasoning-activity events, the ONE bounded exhaustion retry (reasoning off or
// raised ceiling) and the typed end when the retry also fails. Hermetic.
import { describe, expect, it, vi } from 'vitest';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import type { AgentEvent } from '../../src/agent/events.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { Transcript } from '../../src/agent/transcript.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, type ResolvedNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import type { ReasoningControlDescriptor } from '../../src/core/model-registry-types.js';
import { UNKNOWN_REASONING_CONTROL } from '../../src/core/reasoning-control.js';

const TOGGLEABLE: ReasoningControlDescriptor = {
  toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported',
};
const NOT_TOGGLEABLE: ReasoningControlDescriptor = { toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'server-reported' };

const REASONING_ONLY_LENGTH: ProviderEvent[] = [
  { type: 'reasoning-activity', chars: 6_000 }, { type: 'reasoning-activity', chars: 10_384 },
  { type: 'usage', inputTokens: 1_000, outputTokens: 4_096 }, { type: 'done', stopReason: 'length' },
];
const VISIBLE_ANSWER: ProviderEvent[] = [
  { type: 'text-delta', text: 'Recovered answer' }, { type: 'usage', inputTokens: 1_010, outputTokens: 20 }, { type: 'done', stopReason: 'stop' },
];

function scripted(scripts: ProviderEvent[][], descriptor?: ReasoningControlDescriptor): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  const adapter: ProviderAdapter = {
    name: 'scripted',
    ...(descriptor ? { reasoningControl: async () => descriptor } : {}),
    async *send(req) {
      requests.push(req);
      for (const e of scripts[requests.length - 1] ?? [{ type: 'done' }]) yield e;
    },
  };
  return { adapter, requests };
}

function deps(adapter: ProviderAdapter, nativeBudget?: ResolvedNativeAgentBudget): LoopDeps {
  return {
    adapter, registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY,
    ruleStore: { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] },
    cwd: '/tmp', model: 'incident-model', getMode: () => 'suggest',
    ...(nativeBudget ? { nativeBudget } : {}),
    issuePermission: () => { throw new Error('unexpected permission prompt'); },
    requestPermission: async () => ({ decision: 'hold', reasonCode: 'unexpected' }),
    validatePermission: () => false, claimPermissionEffect: () => false,
  };
}

async function collect(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

const B = DEFAULT_NATIVE_AGENT_BUDGET;

describe('ceiling arithmetic + directive on the request', () => {
  it('descriptor proves budget sharing → outputCeilingTokens = visible reserve + reasoning budget, directive on', async () => {
    const { adapter, requests } = scripted([VISIBLE_ANSWER], TOGGLEABLE);
    await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));
    expect(requests[0]?.outputCeilingTokens).toBe(B.outputReserveTokens + B.reasoning.budgetTokens);
    expect(requests[0]?.reasoning).toEqual({ mode: 'on', budgetTokens: B.reasoning.budgetTokens });
  });

  it('unknown descriptor → ceiling stays the visible reserve (never inflated without evidence)', async () => {
    const { adapter, requests } = scripted([VISIBLE_ANSWER], UNKNOWN_REASONING_CONTROL);
    await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));
    expect(requests[0]?.outputCeilingTokens).toBe(B.outputReserveTokens);
  });

  it('mode off → directive off on ordinary turns', async () => {
    const { adapter, requests } = scripted([VISIBLE_ANSWER], TOGGLEABLE);
    await collect(runAgentTurn(deps(adapter, { ...B, reasoning: { ...B.reasoning, mode: 'off' } }), new Transcript(), 'go'));
    expect(requests[0]?.reasoning).toEqual({ mode: 'off' });
    expect(requests[0]?.outputCeilingTokens).toBe(B.outputReserveTokens);
  });

  it('legacy caller (no native budget): no directive, no ceiling, no transportRetry — byte-identical request', async () => {
    const { adapter, requests } = scripted([VISIBLE_ANSWER], TOGGLEABLE);
    await collect(runAgentTurn(deps(adapter), new Transcript(), 'go'));
    expect(requests[0]).not.toHaveProperty('reasoning');
    expect(requests[0]).not.toHaveProperty('outputCeilingTokens');
    expect(requests[0]).not.toHaveProperty('transportRetry');
  });
});

describe('live reasoning activity', () => {
  it('surfaces counts (never text) with a running cumulative total', async () => {
    const { adapter } = scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER], TOGGLEABLE);
    const events = await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));
    expect(events.filter((e) => e.type === 'reasoning-activity')).toEqual([
      { type: 'reasoning-activity', chars: 6_000, cumulativeChars: 6_000 },
      { type: 'reasoning-activity', chars: 10_384, cumulativeChars: 16_384 },
    ]);
  });
});

describe('exhaustion recovery — ONE bounded retry of the SAME request', () => {
  it('auto + toggleable: notice + retry with reasoning off, same messages, same ceiling; the answer is recovered', async () => {
    const { adapter, requests } = scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER], TOGGLEABLE);
    const events = await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));

    expect(requests).toHaveLength(2);
    expect(requests[1]?.reasoning).toEqual({ mode: 'off' });
    expect(requests[1]?.messages).toEqual(requests[0]?.messages);
    expect(requests[1]?.outputCeilingTokens).toBe(requests[0]?.outputCeilingTokens);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', action: 'retry-reasoning-off', hiddenReasoningObserved: true,
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'notice', code: 'native.reasoning_exhausted_output_ceiling',
      vars: { action: 'retry-reasoning-off', reasoningTokens: '4096', ceiling: String(B.outputReserveTokens + B.reasoning.budgetTokens) },
    }));
    expect(events.filter((e) => e.type === 'text-delta')).toEqual([{ type: 'text-delta', text: 'Recovered answer' }]);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    // Privacy: no reasoning text anywhere in the event stream.
    expect(JSON.stringify(events)).not.toContain('reasoning_content');
  });

  it('not toggleable: retry with a raised, config-bounded ceiling (visible + exhaustedRetryBudgetTokens)', async () => {
    const { adapter, requests } = scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER], NOT_TOGGLEABLE);
    const events = await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.outputCeilingTokens).toBe(B.outputReserveTokens + B.reasoning.exhaustedRetryBudgetTokens);
    expect(requests[1]?.reasoning).toEqual(requests[0]?.reasoning);
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', action: 'retry-raised-ceiling' }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'notice', code: 'native.reasoning_exhausted_output_ceiling',
      vars: expect.objectContaining({ action: 'retry-raised-ceiling', ceiling: String(B.outputReserveTokens + B.reasoning.exhaustedRetryBudgetTokens) }),
    }));
  });

  it('forced on: thinking is never switched off — the ceiling is raised instead', async () => {
    const { adapter, requests } = scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER], TOGGLEABLE);
    await collect(runAgentTurn(deps(adapter, { ...B, reasoning: { ...B.reasoning, mode: 'on' } }), new Transcript(), 'go'));
    expect(requests[1]?.reasoning).toEqual({ mode: 'on', budgetTokens: B.reasoning.budgetTokens });
    expect(requests[1]?.outputCeilingTokens).toBe(B.outputReserveTokens + B.reasoning.exhaustedRetryBudgetTokens);
  });

  it('the retry also exhausts → typed error native.reasoning_exhausted, hold, turn-end — exactly two requests, never a third', async () => {
    const { adapter, requests } = scripted([REASONING_ONLY_LENGTH, REASONING_ONLY_LENGTH, VISIBLE_ANSWER], TOGGLEABLE);
    const events = await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));
    expect(requests).toHaveLength(2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', action: 'hold', classification: 'EMPTY_VISIBLE_AFTER_REASONING' }));
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      type: 'error', code: 'native.reasoning_exhausted', vars: { reasoningTokens: '4096', ceiling: String(B.outputReserveTokens + B.reasoning.budgetTokens) },
    });
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
    expect(events.some((e) => e.type === 'text-delta')).toBe(false);
  });

  it('a raised ceiling that no longer fits the context is refused typed instead of shipped', async () => {
    const { adapter, requests } = scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER], NOT_TOGGLEABLE);
    // Window just large enough for the first (visible-reserve) ceiling, not the raised one.
    const window = B.outputReserveTokens + B.reasoning.budgetTokens + B.contextSafetyReserveTokens + 2_000;
    const events = await collect(runAgentTurn(
      { ...deps(adapter, B), getContextBudgetTokens: () => window }, new Transcript(), 'go',
    ));
    expect(requests).toHaveLength(1);
    // 7108-b: an unadmissible raise is its own typed hold (never a stale-preamble request).
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'native.reasoning_exhausted.retry-unadmissible',
      vars: { ceiling: String(B.outputReserveTokens + B.reasoning.budgetTokens), raised: String(B.outputReserveTokens + B.reasoning.exhaustedRetryBudgetTokens) },
    });
  });

  it('legacy caller (no native budget) keeps the classic continuation path', async () => {
    const { adapter, requests } = scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER], TOGGLEABLE);
    const events = await collect(runAgentTurn(deps(adapter), new Transcript(), 'go'));
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', classification: 'EMPTY_VISIBLE_AFTER_REASONING', action: 'continue' }));
    expect(events.some((e) => e.type === 'notice' && e.code === 'native.reasoning_exhausted_output_ceiling')).toBe(false);
    expect(requests[1]?.messages.length).toBe((requests[0]?.messages.length ?? 0) + 1);
  });

  it('visible text that merely hit the ceiling is still the classic continuation, not a reasoning retry', async () => {
    const { adapter, requests } = scripted([
      [{ type: 'reasoning-activity', chars: 100 }, { type: 'text-delta', text: 'partial ' }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: 'partial rest' }, { type: 'done', stopReason: 'stop' }],
    ], TOGGLEABLE);
    const events = await collect(runAgentTurn(deps(adapter, B), new Transcript(), 'go'));
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', classification: 'OUTPUT_LIMIT', action: 'continue' }));
    expect(requests[1]?.reasoning).toEqual(requests[0]?.reasoning);
    expect(events.filter((e) => e.type === 'text-delta').map((e) => (e as { text: string }).text).join('')).toBe('partial rest');
  });

  it('descriptor resolution failure is no evidence: the turn still runs and recovers via the raised ceiling', async () => {
    const throwing: ProviderAdapter = { ...scripted([REASONING_ONLY_LENGTH, VISIBLE_ANSWER]).adapter, reasoningControl: vi.fn(() => { throw new Error('down'); }) };
    const events = await collect(runAgentTurn(deps(throwing, B), new Transcript(), 'go'));
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', action: 'retry-raised-ceiling' }));
    expect(events.some((e) => e.type === 'text-delta')).toBe(true);
  });
});
