// ─── RoutingEngineV3 — POSITIONAL axis scorer ────────────────────────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §2: positional fit =
// weighted domain overlap + surface overlap + deliverable coverage. Fully
// deterministic and vocabulary-driven; structural evidence never lies — this
// axis is what killed the 443 natural-experiment class (domains come from
// scope, prose has no channel in).

import type { AxisScore } from './decision-types.js';
import type { MatchSpace } from './capability-vector.js';
import type { RequirementVector } from './requirement-vector.js';
import { PROFICIENCY_SCORE } from './axis-content.js';

/** Wildcard-owner credit: an explicit domain owner must always outrank '*'. */
const WILDCARD_CREDIT = PROFICIENCY_SCORE.able;

export interface PositionalScoreOptions {
  /** Known vocabulary domain ids — unknown capability domains surface as issues. */
  knownDomainIds: ReadonlySet<string>;
}

export interface PositionalScoreResult extends AxisScore {
  /** Typed issues (unknown domain id in a capability) — surfaced, never silent-zero. */
  issues: string[];
}

/**
 * Positional fit for one candidate. Components (equal thirds, each 0-1):
 *  - domain overlap: Σ(requirement domain weight × candidate proficiency credit)
 *  - surface overlap: |shared| / |required| (no surfaces required → neutral 1)
 *  - deliverable coverage: covered-ratio mass (undeclared list → neutral 1)
 */
export function scorePositional(
  requirement: RequirementVector,
  candidate: MatchSpace,
  options: PositionalScoreOptions,
): PositionalScoreResult {
  const evidence: string[] = [];
  const issues: string[] = [];
  // Informative components only: a component with no evidence on either side
  // is EXCLUDED from the mean, never neutral-1-padded — "full credit for
  // nothing" fabricates similarity and crushes real domain ownership spreads
  // (caught by the i18n-owner-vs-generalist pin).
  const components: number[] = [];

  // ── Domain overlap ─────────────────────────────────────────────────────
  const capDomains = new Map<string, 'primary' | 'secondary' | 'able' | 'never'>();
  let wildcard: 'primary' | 'secondary' | 'able' | 'never' | null = null;
  for (const d of candidate.domains) {
    if (d.id === '*') {
      wildcard = d.proficiency;
      continue;
    }
    if (!options.knownDomainIds.has(d.id)) {
      issues.push(`capability declares unknown domain '${d.id}' (not in vocabulary)`);
    }
    capDomains.set(d.id, d.proficiency);
  }

  let domainScore = 0;
  let domainMass = 0;
  for (const req of requirement.positional.domains) {
    domainMass += req.weight;
    const prof = capDomains.get(req.id);
    if (prof && prof !== 'never') {
      const credit = PROFICIENCY_SCORE[prof];
      domainScore += req.weight * credit;
      evidence.push(`domain ${req.id} ${req.weight.toFixed(2)}×${prof}(${credit})`);
    } else if (!prof && wildcard && wildcard !== 'never') {
      // Explicit owner always outranks wildcard: wildcard credit is capped at
      // 'able' regardless of the declared wildcard proficiency.
      const credit = Math.min(WILDCARD_CREDIT, PROFICIENCY_SCORE[wildcard]);
      domainScore += req.weight * credit;
      evidence.push(`domain ${req.id} ${req.weight.toFixed(2)}×wildcard(${credit})`);
    } else if (prof === 'never') {
      evidence.push(`domain ${req.id}: never → 0`);
    }
  }
  if (domainMass > 0) {
    components.push(Math.min(1, domainScore / domainMass));
  }

  // ── Surface overlap (informative only when the requirement demands surfaces) ─
  const reqSurfaces = requirement.positional.surfaces;
  if (reqSurfaces.length > 0) {
    const capSurfaces = new Set(
      // MatchSpace intentionally omits surfaces for skills; agents carry them
      // via capabilities.positional.surfaces — callers fold them into domains
      // when needed. Surface credit therefore rides the domain map here.
      candidate.domains.map((d) => d.id),
    );
    const shared = reqSurfaces.filter((s) => capSurfaces.has(s)).length;
    components.push(shared / reqSurfaces.length);
    evidence.push(`surfaces ${shared}/${reqSurfaces.length}`);
  }

  // ── Deliverable coverage (informative only when the candidate declares a list) ─
  if (candidate.deliverables.length > 0) {
    const covered = new Set(candidate.deliverables);
    let coveredMass = 0;
    let totalMass = 0;
    for (const d of requirement.positional.deliverables) {
      totalMass += d.ratio;
      if (covered.has(d.type)) coveredMass += d.ratio;
    }
    const deliverableComponent = totalMass > 0 ? coveredMass / totalMass : 1;
    components.push(deliverableComponent);
    evidence.push(`deliverable coverage ${(deliverableComponent * 100).toFixed(0)}%`);
  }

  // No informative component at all → honest neutral (never fabricated credit).
  if (components.length === 0) {
    evidence.push('no positional evidence → neutral 0.5');
    return { score: 0.5, evidence, issues };
  }

  const score = components.reduce((a, b) => a + b, 0) / components.length;
  return { score, evidence, issues };
}
