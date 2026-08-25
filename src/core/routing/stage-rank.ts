// ─── RoutingEngineV3 — stage-4 weighted RANKING + calibrated confidence ──────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §3 stage-4 + brainstorm
// decision-5: finalScore = config-weighted axis sum; confidence is CALIBRATED
// (monotonic in both top-vs-runner-up gap and absolute top score); tie or
// sub-floor confidence yields a typed indecision → Brain escalation upstream.
// Deterministic total order — the tie-break chain is documented and explicit.

import type { RoutingV3Config } from '../config-types.js';
import type { AxisScores, ScoredCandidate } from './decision-types.js';

export type Indecision = 'tie' | 'low-confidence';

export interface RankInput {
  agentId: string;
  axisScores: AxisScores;
  explorationBonus?: number;
}

export interface RankResult {
  /** Deterministic total order, best first. */
  ordered: ScoredCandidate[];
  top: ScoredCandidate | null;
  /** Calibrated 0-1; 0 when there are no candidates. */
  confidence: number;
  indecision: Indecision | null;
}

/** Gap under this fraction of the floor-window counts as a tie (config-scalable). */
export const TIE_EPSILON = 0.02;

/**
 * Calibrated confidence: monotonic in BOTH the absolute top score and the
 * top-vs-runner-up gap.
 *   confidence = top × (0.6 + 0.4 × min(1, gap / 0.25))
 * — a dominant-but-mediocre winner stays mediocre-confident; a strong winner
 * with no separation is capped at 0.6×top; full separation (gap ≥ 0.25)
 * recovers the full top score. Single-candidate case: gap treated as full.
 */
export function calibrateConfidence(top: number, runnerUp: number | null): number {
  const gap = runnerUp === null ? 0.25 : Math.max(0, top - runnerUp);
  const separation = Math.min(1, gap / 0.25);
  return Math.min(1, top * (0.6 + 0.4 * separation));
}

/**
 * Stage-4: weighted sum + deterministic order + indecision detection.
 * Tie-break chain (documented, never silent): finalScore desc → content-axis
 * desc → positional-axis desc → agentId lexicographic (absolute last resort).
 */
export function rank(candidates: readonly RankInput[], config: RoutingV3Config): RankResult {
  const { weights } = config;

  const ordered: ScoredCandidate[] = candidates
    .map((c) => {
      const base =
        c.axisScores.content.score * weights.content +
        c.axisScores.positional.score * weights.positional +
        c.axisScores.numerical.score * weights.numerical;
      return {
        agentId: c.agentId,
        axisScores: c.axisScores,
        finalScore: base + (c.explorationBonus ?? 0) * (1 - base),
      };
    })
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.axisScores.content.score - a.axisScores.content.score ||
        b.axisScores.positional.score - a.axisScores.positional.score ||
        a.agentId.localeCompare(b.agentId),
    );

  const top = ordered[0] ?? null;
  if (!top) {
    return { ordered, top, confidence: 0, indecision: null };
  }

  const runnerUp = ordered[1] ?? null;
  const confidence = calibrateConfidence(top.finalScore, runnerUp?.finalScore ?? null);

  let indecision: Indecision | null = null;
  if (runnerUp && top.finalScore - runnerUp.finalScore < TIE_EPSILON) {
    indecision = 'tie';
  } else if (confidence < config.confidenceFloor) {
    indecision = 'low-confidence';
  }

  return { ordered, top, confidence, indecision };
}
