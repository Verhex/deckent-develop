// ─── RoutingEngineV3 — CONTENT axis, deterministic scorer ────────────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Governance-mode scorer AND the
// Slice-2 AI-stage cross-check baseline. Detail-doc §2/§3: content fit =
// work-type proficiency match; in deterministic mode PROSE CONTRIBUTES
// NOTHING (word-inference bans hold by construction — expertise/personaSlices
// are only consulted when an LLM produced semantic fields, which is Slice-2).

import type { RequirementVector } from './requirement-vector.js';
import type { AxisScore } from './decision-types.js';
import type { MatchSpace } from './capability-vector.js';
import { parseSubtype } from './vocabulary-builtin.js';

/**
 * The ONE proficiency→score table (spec detail §2b): scattered literals are
 * forbidden — ranking, lint and tests all read this export.
 */
export const PROFICIENCY_SCORE: Readonly<Record<'primary' | 'secondary' | 'able', number>> = {
  primary: 1.0,
  secondary: 0.7,
  able: 0.4,
};

/**
 * Deterministic content fit for one candidate (agent or skill via matchSpace).
 * 'never' entries never reach here for agents (stage-1 eliminates), but are
 * scored 0 defensively (skills are not eliminated, only ranked).
 */
export function scoreContentDeterministic(
  requirement: RequirementVector,
  candidate: MatchSpace,
): AxisScore {
  const reqParent = parseSubtype(requirement.content.workType).parent;
  const evidence: string[] = [];

  const entry = candidate.workTypes.find((w) => parseSubtype(w.type).parent === reqParent);
  if (!entry) {
    evidence.push(`workType ${reqParent}: undeclared → 0`);
    return { score: 0, evidence };
  }
  if (entry.proficiency === 'never') {
    evidence.push(`workType ${reqParent}: never → 0`);
    return { score: 0, evidence };
  }

  const score = PROFICIENCY_SCORE[entry.proficiency];
  evidence.push(`workType ${reqParent} → ${entry.proficiency} (${score})`);

  // Structural provenance carries null semantic fields — by contract nothing
  // else may contribute (no prose matching in deterministic mode). The LLM
  // path (Slice-2) replaces this scorer wholesale, it does not extend it.
  if (requirement.content.provenance === 'structural') {
    evidence.push('provenance structural: prose channels inert');
  }

  return { score, evidence };
}
