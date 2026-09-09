// src/agent/reasoning-control.ts
// ═══ Reasoning plan — the ONE place ceiling arithmetic meets the descriptor ═══
// (7108 TERMINAL-REASONING-CONTROL-001). Pure and string-free: takes the
// config-resolved reasoning policy, the model's reasoning-control descriptor and
// the request kind, and returns (a) the directive that rides the ProviderRequest
// and (b) the wire/admission ceiling that already INCLUDES the reasoning room.
// The loop uses the same ceiling for context admission and for the wire, so a
// transport never recomputes it and the two can never drift.

import type { ReasoningControlDescriptor } from '../core/model-registry-types.js';
import type { ResolvedNativeReasoningPolicy } from '../core/execution-budget-policy.js';
import type { ProviderAdapter, ReasoningDirective } from './provider-tooluse/types.js';
import { isReasoningToggleable } from '../core/reasoning-control.js';

export interface ReasoningPlanInput {
  /** Absent → legacy caller without a native budget: nothing is planned. */
  readonly policy?: ResolvedNativeReasoningPolicy | undefined;
  /** The transport's descriptor for the wire model; absent = no evidence. */
  readonly descriptor?: ReasoningControlDescriptor | undefined;
  /** Structured requests (checkpoint JSON, tool-argument repair) run with thinking OFF. */
  readonly structured: boolean;
  /** The protected visible-answer reserve (outputReserveTokens). */
  readonly visibleReserveTokens: number;
}

export interface ReasoningPlan {
  /** What the request carries; absent when no policy governs the caller. */
  readonly directive?: ReasoningDirective;
  /** Thinking was asked for on this request. */
  readonly thinkingRequested: boolean;
  /** The descriptor names a wire mechanism that can switch thinking off. */
  readonly toggleable: boolean;
  readonly visibleReserveTokens: number;
  /** Reasoning room added on top of the visible reserve (0 unless proven shared). */
  readonly reasoningBudgetTokens: number;
  /** visibleReserveTokens + reasoningBudgetTokens — the wire AND admission ceiling. */
  readonly outputCeilingTokens: number;
}

export function planReasoning(input: ReasoningPlanInput): ReasoningPlan {
  const visible = Math.max(0, input.visibleReserveTokens);
  const toggleable = isReasoningToggleable(input.descriptor);
  if (!input.policy) {
    return { thinkingRequested: false, toggleable, visibleReserveTokens: visible, reasoningBudgetTokens: 0, outputCeilingTokens: visible };
  }
  const thinkingOff = input.structured || input.policy.mode === 'off';
  if (thinkingOff) {
    return {
      directive: { mode: 'off' },
      thinkingRequested: false, toggleable,
      visibleReserveTokens: visible, reasoningBudgetTokens: 0, outputCeilingTokens: visible,
    };
  }
  // Reasoning room is added ONLY on proof of budget sharing — an `unknown`
  // descriptor never inflates the ceiling (no silent context consumption).
  const shared = input.descriptor?.sharesCompletionBudget === true;
  const reasoningBudgetTokens = shared ? input.policy.budgetTokens : 0;
  return {
    directive: { mode: 'on', budgetTokens: input.policy.budgetTokens },
    thinkingRequested: true, toggleable,
    visibleReserveTokens: visible, reasoningBudgetTokens,
    outputCeilingTokens: visible + reasoningBudgetTokens,
  };
}

export type ReasoningExhaustionRecovery =
  | { readonly kind: 'retry-reasoning-off' }
  | { readonly kind: 'retry-raised-ceiling'; readonly outputCeilingTokens: number }
  | { readonly kind: 'none' };

/**
 * Decide the ONE bounded retry after a response that ended at the ceiling with
 * hidden reasoning but no visible text.
 *  - `auto` + toggleable + thinking was on → retry with thinking OFF (same ceiling).
 *  - otherwise (forced `on`, not toggleable, or the backend ignored `off`) →
 *    retry with the ceiling raised to visible + exhaustedRetryBudgetTokens,
 *    but only when that is actually larger than what was just exhausted.
 *  - no policy → `none` (legacy continuation behavior stays byte-identical).
 */
export function planReasoningExhaustionRecovery(
  plan: ReasoningPlan,
  policy: ResolvedNativeReasoningPolicy | undefined,
): ReasoningExhaustionRecovery {
  if (!policy || !plan.directive) return { kind: 'none' };
  if (policy.mode === 'auto' && plan.thinkingRequested && plan.toggleable) return { kind: 'retry-reasoning-off' };
  const raised = plan.visibleReserveTokens + policy.exhaustedRetryBudgetTokens;
  return raised > plan.outputCeilingTokens
    ? { kind: 'retry-raised-ceiling', outputCeilingTokens: raised }
    : { kind: 'none' };
}

/** Resolve the transport's descriptor for `model`; any failure is "no evidence". */
export async function resolveAdapterReasoningControl(
  adapter: ProviderAdapter,
  model: string,
  signal?: AbortSignal,
): Promise<ReasoningControlDescriptor | undefined> {
  if (!adapter.reasoningControl) return undefined;
  try {
    return (await adapter.reasoningControl(model, signal)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 7108-b — when a raised-ceiling retry cannot be admitted (the raised ceiling
 * would break the preamble/transcript reserves), the only other lever is
 * switching thinking off — allowed solely under `auto` with a toggleable
 * descriptor and thinking actually requested; forced `on` and a backend that
 * already ignored `off` leave nothing but the typed hold.
 */
export function planReasoningRaiseFallback(
  plan: ReasoningPlan,
  policy: ResolvedNativeReasoningPolicy | undefined,
): 'retry-reasoning-off' | 'none' {
  return policy?.mode === 'auto' && plan.thinkingRequested && plan.toggleable ? 'retry-reasoning-off' : 'none';
}

/** Conservative chars→tokens projection for the live indicator (display only). */
export function approximateReasoningTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / 4));
}
