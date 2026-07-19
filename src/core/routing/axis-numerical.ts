// ─── RoutingEngineV3 — NUMERICAL axis scorer ─────────────────────────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §2 + ADR-G-006
// tomorrow-clause: outcome-cell success + size↔capacity + cost-tier alignment,
// with typed OPTIONAL latency/provider-health inputs (S2+ wires live values;
// absent = neutral, never fabricated). Cold-start rule: a missing cell is
// NEUTRAL (0.5) — new agents are never penalized for having no history
// (spec §8 blast-radius anti-cold-start note).

import type { AxisScore } from './decision-types.js';
import type { CapabilityVector } from './capability-vector.js';
import type { RequirementVector } from './requirement-vector.js';
import { parseSubtype } from './vocabulary-builtin.js';

/** Neutral value for any absent signal — documented, single place. */
export const NEUTRAL = 0.5;

/** Minimum uses before a cell's success-rate is trusted over neutrality. */
export const CELL_MIN_USES = 3;

/** One outcome cell as read from the learning-cells snapshot. */
export interface CellStat {
  uses: number;
  successes: number;
  qualitySum: number;
}

export interface NumericalInputs {
  /** Snapshot lookup: `${workType}|${domain}|${agentId}` → cell (frozen). */
  cells: ReadonlyMap<string, CellStat>;
  /** Optional live signals (S2+): 0-1, higher is better. Absent → neutral. */
  providerHealth?: number;
  latencyScore?: number;
}

/**
 * K1 — 581-kalibrasyon (2026-07-19, 65-karar analizi): decision-level component
 * availability. A component with NO real signal for ANY candidate in the
 * decision is DROPPED from the numerical mean instead of flattening every
 * candidate toward NEUTRAL — dead-neutral cells+live diluted the one live
 * component (costTier) to a spread of 0.051 (vs content 0.368) and drove the
 * 71% low-confidence rate. Decision-level on purpose: the SAME component set
 * applies to every candidate, so comparability is preserved. `cells`/`live`
 * true = the component carries signal somewhere in this decision and stays.
 */
export interface NumericalActiveComponents {
  cells: boolean;
  live: boolean;
}

/** True when this agent has a warm (≥{@link CELL_MIN_USES}) cell total over the
 *  requirement's domains — the caller ORs this across candidates to decide
 *  whether the cells component carries any signal for the decision. */
export function hasWarmCells(
  requirement: RequirementVector,
  agentId: string,
  cells: ReadonlyMap<string, CellStat>,
): boolean {
  const workType = parseSubtype(requirement.content.workType).parent;
  let uses = 0;
  for (const d of requirement.positional.domains) {
    uses += cells.get(`${workType}|${d.id}|${agentId}`)?.uses ?? 0;
  }
  return uses >= CELL_MIN_USES;
}

/** Cost-tier alignment: effort/risk class → preferred tier neighborhood. */
const TIER_ORDER = ['economy', 'standard', 'premium', 'premium_plus'] as const;

function tierIndex(tier: string): number {
  const idx = TIER_ORDER.indexOf(tier as (typeof TIER_ORDER)[number]);
  return idx === -1 ? 1 : idx; // unknown tier reads as 'standard'
}

function desiredTierIndex(requirement: RequirementVector): number {
  const { effortClass, riskClass, estimatedSize } = requirement.numerical;
  if (effortClass === 'high' || riskClass === 'high' || estimatedSize === 'epic') return 2;
  if (effortClass === 'low' && (estimatedSize === 'trivial' || estimatedSize === 'small')) return 0;
  return 1;
}

/**
 * Numerical fit for one agent. Components (equal thirds, each 0-1):
 *  - outcome cells: use-weighted success over the requirement's domains
 *  - cost-tier alignment: distance between desired and declared tier
 *  - live signals: mean of provided providerHealth/latencyScore (absent → neutral)
 */
export function scoreNumerical(
  requirement: RequirementVector,
  agentId: string,
  capability: CapabilityVector,
  inputs: NumericalInputs,
  // K1: absent → legacy behavior (all three components, neutral-filled) —
  // existing callers/tests stay bit-identical unless the caller opts in.
  active?: NumericalActiveComponents,
): AxisScore {
  const evidence: string[] = [];
  const workType = parseSubtype(requirement.content.workType).parent;

  // ── Outcome cells ──────────────────────────────────────────────────────
  let uses = 0;
  let successes = 0;
  for (const d of requirement.positional.domains) {
    const cell = inputs.cells.get(`${workType}|${d.id}|${agentId}`);
    if (cell) {
      uses += cell.uses;
      successes += cell.successes;
    }
  }
  let cellComponent = NEUTRAL;
  if (uses >= CELL_MIN_USES) {
    cellComponent = successes / uses;
    evidence.push(`cells ${workType}×[domains] ${successes}/${uses}`);
  } else {
    evidence.push(`cells: <${CELL_MIN_USES} uses → neutral (cold-start safe)`);
  }

  // ── Cost-tier alignment ────────────────────────────────────────────────
  const desired = desiredTierIndex(requirement);
  const declared = tierIndex(capability.numerical.costTier);
  const distance = Math.abs(desired - declared);
  const tierComponent = Math.max(0, 1 - distance / (TIER_ORDER.length - 1));
  evidence.push(`costTier ${capability.numerical.costTier} vs desired ${TIER_ORDER[desired]} → ${tierComponent.toFixed(2)}`);

  // ── Live signals (optional; absent = neutral, never fabricated) ────────
  const live: number[] = [];
  if (typeof inputs.providerHealth === 'number') live.push(inputs.providerHealth);
  if (typeof inputs.latencyScore === 'number') live.push(inputs.latencyScore);
  const liveComponent = live.length > 0 ? live.reduce((a, b) => a + b, 0) / live.length : NEUTRAL;
  evidence.push(live.length > 0 ? `live signals ${liveComponent.toFixed(2)}` : 'live signals absent → neutral');

  // ── Compose (K1: signal-gated mean; legacy mean when `active` absent) ──
  const parts: number[] = [tierComponent]; // tier always carries signal
  if (!active || active.cells) parts.push(cellComponent);
  else evidence.push('cells: no warm cell for ANY candidate → component dropped (signal-gated K1)');
  if (!active || active.live) parts.push(liveComponent);
  else evidence.push('live: absent for the decision → component dropped (signal-gated K1)');

  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  return { score, evidence };
}
