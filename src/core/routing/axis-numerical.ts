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

  const score = (cellComponent + tierComponent + liveComponent) / 3;
  return { score, evidence };
}
