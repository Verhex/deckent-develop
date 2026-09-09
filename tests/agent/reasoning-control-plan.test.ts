// tests/agent/reasoning-control-plan.test.ts
// ═══ 7108 TERMINAL-REASONING-CONTROL-001 — the reasoning plan is the single
// ceiling-arithmetic authority: descriptor × policy × request kind → directive
// + inclusive output ceiling; exhaustion recovery is bounded and typed.
import { describe, expect, it } from 'vitest';
import {
  approximateReasoningTokens,
  planReasoning,
  planReasoningExhaustionRecovery,
  resolveAdapterReasoningControl,
} from '../../src/agent/reasoning-control.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../../src/core/execution-budget-policy.js';
import type { ReasoningControlDescriptor } from '../../src/core/model-registry-types.js';
import { UNKNOWN_REASONING_CONTROL } from '../../src/core/reasoning-control.js';

const POLICY = DEFAULT_NATIVE_AGENT_BUDGET.reasoning;
const VISIBLE = 4_096;

const TOGGLEABLE_SHARED: ReasoningControlDescriptor = {
  toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported',
};
const EFFORT_SHARED: ReasoningControlDescriptor = {
  toggle: { kind: 'reasoning_effort', on: 'medium', off: 'none' }, sharesCompletionBudget: true, provenance: 'configured',
};
const NONE_SHARED: ReasoningControlDescriptor = {
  toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'server-reported',
};

describe('planReasoning', () => {
  it('no policy (legacy caller): no directive, ceiling = visible reserve, byte-identical arithmetic', () => {
    const plan = planReasoning({ structured: false, visibleReserveTokens: VISIBLE, descriptor: TOGGLEABLE_SHARED });
    expect(plan.directive).toBeUndefined();
    expect(plan.outputCeilingTokens).toBe(VISIBLE);
    expect(plan.reasoningBudgetTokens).toBe(0);
  });

  it('auto + descriptor proves budget sharing: thinking on, reasoning budget added ON TOP of the visible reserve', () => {
    const plan = planReasoning({ policy: POLICY, descriptor: TOGGLEABLE_SHARED, structured: false, visibleReserveTokens: VISIBLE });
    expect(plan.directive).toEqual({ mode: 'on', budgetTokens: POLICY.budgetTokens });
    expect(plan.outputCeilingTokens).toBe(VISIBLE + POLICY.budgetTokens);
    expect(plan.reasoningBudgetTokens).toBe(POLICY.budgetTokens);
    expect(plan.toggleable).toBe(true);
    expect(plan.thinkingRequested).toBe(true);
  });

  it('auto + unknown descriptor: thinking directive still on, but the ceiling is NEVER inflated without evidence', () => {
    const plan = planReasoning({ policy: POLICY, descriptor: UNKNOWN_REASONING_CONTROL, structured: false, visibleReserveTokens: VISIBLE });
    expect(plan.directive?.mode).toBe('on');
    expect(plan.outputCeilingTokens).toBe(VISIBLE);
    expect(plan.toggleable).toBe(false);
  });

  it('structured request: thinking OFF regardless of mode, ceiling = visible reserve only', () => {
    for (const mode of ['auto', 'on', 'off'] as const) {
      const plan = planReasoning({ policy: { ...POLICY, mode }, descriptor: TOGGLEABLE_SHARED, structured: true, visibleReserveTokens: VISIBLE });
      expect(plan.directive).toEqual({ mode: 'off' });
      expect(plan.outputCeilingTokens).toBe(VISIBLE);
      expect(plan.thinkingRequested).toBe(false);
    }
  });

  it('mode off: directive off for ordinary turns too', () => {
    const plan = planReasoning({ policy: { ...POLICY, mode: 'off' }, descriptor: EFFORT_SHARED, structured: false, visibleReserveTokens: VISIBLE });
    expect(plan.directive).toEqual({ mode: 'off' });
    expect(plan.outputCeilingTokens).toBe(VISIBLE);
  });
});

describe('planReasoningExhaustionRecovery', () => {
  const on = (descriptor: ReasoningControlDescriptor, mode: 'auto' | 'on' | 'off' = 'auto') =>
    planReasoning({ policy: { ...POLICY, mode }, descriptor, structured: false, visibleReserveTokens: VISIBLE });

  it('no policy → none (legacy continuation path stays untouched)', () => {
    expect(planReasoningExhaustionRecovery(planReasoning({ structured: false, visibleReserveTokens: VISIBLE }), undefined)).toEqual({ kind: 'none' });
  });

  it('auto + toggleable (enable_thinking or reasoning_effort) → retry with reasoning off', () => {
    expect(planReasoningExhaustionRecovery(on(TOGGLEABLE_SHARED), POLICY)).toEqual({ kind: 'retry-reasoning-off' });
    expect(planReasoningExhaustionRecovery(on(EFFORT_SHARED), POLICY)).toEqual({ kind: 'retry-reasoning-off' });
  });

  it('auto + not toggleable → retry with the ceiling raised to visible + exhaustedRetryBudgetTokens', () => {
    expect(planReasoningExhaustionRecovery(on(NONE_SHARED), POLICY))
      .toEqual({ kind: 'retry-raised-ceiling', outputCeilingTokens: VISIBLE + POLICY.exhaustedRetryBudgetTokens });
    expect(planReasoningExhaustionRecovery(on(UNKNOWN_REASONING_CONTROL), POLICY))
      .toEqual({ kind: 'retry-raised-ceiling', outputCeilingTokens: VISIBLE + POLICY.exhaustedRetryBudgetTokens });
  });

  it('forced on → never switches thinking off; raises the ceiling instead', () => {
    const policy = { ...POLICY, mode: 'on' as const };
    expect(planReasoningExhaustionRecovery(on(TOGGLEABLE_SHARED, 'on'), policy))
      .toEqual({ kind: 'retry-raised-ceiling', outputCeilingTokens: VISIBLE + policy.exhaustedRetryBudgetTokens });
  });

  it('backend ignored an explicit off (mode off, reasoning still observed) → raise the ceiling', () => {
    const policy = { ...POLICY, mode: 'off' as const };
    expect(planReasoningExhaustionRecovery(on(TOGGLEABLE_SHARED, 'off'), policy))
      .toEqual({ kind: 'retry-raised-ceiling', outputCeilingTokens: VISIBLE + policy.exhaustedRetryBudgetTokens });
  });

  it('a raise that would not exceed the exhausted ceiling is refused as none (no pointless retry)', () => {
    const policy = { ...POLICY, mode: 'on' as const, budgetTokens: 16_384, exhaustedRetryBudgetTokens: 16_384 };
    const plan = planReasoning({ policy, descriptor: TOGGLEABLE_SHARED, structured: false, visibleReserveTokens: VISIBLE });
    expect(plan.outputCeilingTokens).toBe(VISIBLE + 16_384);
    expect(planReasoningExhaustionRecovery(plan, policy)).toEqual({ kind: 'none' });
  });
});

describe('resolveAdapterReasoningControl / approximateReasoningTokens', () => {
  it('reads the adapter capability (sync or async) and treats any failure as no evidence', async () => {
    const empty = { name: 'x', async *send() { yield { type: 'done' as const }; } };
    expect(await resolveAdapterReasoningControl(empty, 'm')).toBeUndefined();
    expect(await resolveAdapterReasoningControl({ ...empty, reasoningControl: () => TOGGLEABLE_SHARED }, 'm')).toBe(TOGGLEABLE_SHARED);
    expect(await resolveAdapterReasoningControl({ ...empty, reasoningControl: async () => EFFORT_SHARED }, 'm')).toBe(EFFORT_SHARED);
    expect(await resolveAdapterReasoningControl({ ...empty, reasoningControl: () => { throw new Error('probe down'); } }, 'm')).toBeUndefined();
  });

  it('projects chars to a conservative token count for display only', () => {
    expect(approximateReasoningTokens(0)).toBe(0);
    expect(approximateReasoningTokens(1)).toBe(1);
    expect(approximateReasoningTokens(8_000)).toBe(2_000);
  });
});
