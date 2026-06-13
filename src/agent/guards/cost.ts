// src/agent/guards/cost.ts
// ═══ Cost guard (SP-1 §8) ═══════════════════════════════════════════════════
// Per-session cumulative token→usd accumulator. The orchestrator's evaluateCostGate
// is sprint-estimate-shaped (wrong granularity for a chat turn), so this is a
// purpose-built session tracker that reuses only the shared vocabulary
// (COST_GATE_EXCEEDED). Advisory by default; a hard stop fires only when an
// explicit ceilingUsd is configured.

/** Shared with src/core/cost-gate.ts — same reason vocabulary across surfaces. */
export const COST_GATE_EXCEEDED = 'COST_GATE_EXCEEDED';

export interface CostGuardState {
  spentTokens: number;
  readonly usdPerMillionTokens: number;
  /** undefined → advisory only (never trips). */
  readonly ceilingUsd?: number;
}

export interface CostGuardOptions {
  usdPerMillionTokens: number;
  ceilingUsd?: number;
}

export function createCostGuard(opts: CostGuardOptions): CostGuardState {
  return { spentTokens: 0, usdPerMillionTokens: opts.usdPerMillionTokens, ceilingUsd: opts.ceilingUsd };
}

export function accrue(state: CostGuardState, usage: { inputTokens: number; outputTokens: number }): void {
  state.spentTokens += (usage.inputTokens || 0) + (usage.outputTokens || 0);
}

export interface CostCheck {
  exceeded: boolean;
  spentUsd: number;
  reason?: string;
}

export function costExceeded(state: CostGuardState): CostCheck {
  const spentUsd = (state.spentTokens / 1_000_000) * state.usdPerMillionTokens;
  if (state.ceilingUsd !== undefined && spentUsd > state.ceilingUsd) {
    return { exceeded: true, spentUsd, reason: COST_GATE_EXCEEDED };
  }
  return { exceeded: false, spentUsd };
}
