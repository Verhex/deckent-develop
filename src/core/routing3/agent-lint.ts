// ─── RoutingEngineV3 — AGENT LINT (reachability · gaps · overlap) ────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §4 custom-agent contract
// (the 66/100-criticism answer): author-time lens over the catalog —
//  · reachability: which agents can NEVER win, with the nearest-miss reason
//  · coverage gaps: workType×domain cells with ZERO capable agent
//    (the ownership invariant, before it bites at route time)
//  · overlap: capability-vector pairs so similar they need differentiation
// The sweep runs the REAL pipeline stages (eliminate + axis scorers + rank),
// never a reimplementation. Pure over inputs; no fs.

import type { AgentCandidate } from './stage-eliminate.js';
import { eliminate } from './stage-eliminate.js';
import { scoreContentDeterministic, PROFICIENCY_SCORE } from './axis-content.js';
import { scorePositional } from './axis-positional.js';
import { scoreNumerical } from './axis-numerical.js';
import { rank } from './stage-rank.js';
import { matchSpace } from './capability-vector.js';
import type { RequirementVector } from './requirement-vector.js';
import type { RoutingV3Config } from '../config-types.js';
import type { DomainDef, WorkType } from './types.js';
import { WORK_TYPE_IDS } from './vocabulary-builtin.js';
import { parseSubtype } from './vocabulary-builtin.js';

// ─── Report shape ────────────────────────────────────────────────────────────

export interface UnreachableAgent {
  agentId: string;
  /** Nearest-miss: the sweep cell where the agent came closest, and why it lost. */
  nearestMiss: { workType: WorkType; domain: string; gapToWinner: number; winner: string } | null;
  /** Present when the agent never even survives elimination anywhere. */
  alwaysEliminated: string | null;
}

export interface CoverageGap {
  workType: WorkType;
  domain: string;
  /** Why the nearest candidates failed (elimination reasons observed). */
  reasons: string[];
}

export interface OverlapPair {
  a: string;
  b: string;
  /** 0-1 capability-similarity (shared workType-proficiency × domain overlap). */
  similarity: number;
}

export interface LintReport {
  unreachable: UnreachableAgent[];
  gaps: CoverageGap[];
  overlaps: OverlapPair[];
  /** Sweep dimensions, for the report header. */
  sweep: { workTypes: number; domains: number; cells: number };
}

/** Overlap similarity at/over this level is reported ("differentiate or merge"). */
export const OVERLAP_THRESHOLD = 0.8;

// ─── Sweep requirement synthesis ─────────────────────────────────────────────

function syntheticRequirement(workType: WorkType, domain: DomainDef, needsWrite: boolean): RequirementVector {
  const deliverables: RequirementVector['positional']['deliverables'] =
    workType === 'document'
      ? [{ type: 'doc', ratio: 1 }]
      : workType === 'configure'
        ? [{ type: 'config', ratio: 1 }]
        : workType === 'migrate'
          ? [{ type: 'migration', ratio: 1 }]
          : needsWrite
            ? [{ type: 'code-src', ratio: 0.7 }, { type: 'code-test', ratio: 0.3 }]
            : [];
  return {
    content: {
      workType,
      subtype: null,
      summary: null,
      semanticTags: null,
      provenance: 'structural',
      calibratedConfidence: 0.7,
    },
    positional: {
      domains: [{ id: domain.id, weight: 1, evidence: 'lint-sweep' }],
      deliverables,
      surfaces: [],
      needsWrite,
      language: 'en',
    },
    numerical: {
      estimatedSize: 'small',
      fileCount: 2,
      moduleCount: 1,
      effortClass: 'normal',
      riskClass: 'low',
    },
  };
}

/** Review-lane work sweeps as read-only; construction sweeps as write. */
function sweepNeedsWrite(workType: WorkType): boolean {
  return !(workType === 'review' || workType === 'analyze');
}

// ─── Lint ────────────────────────────────────────────────────────────────────

export function lintCatalog(
  catalog: readonly AgentCandidate[],
  domains: readonly DomainDef[],
  config: RoutingV3Config,
): LintReport {
  const knownDomainIds = new Set(domains.map((d) => d.id));
  const winners = new Map<string, number>();
  const nearest = new Map<string, UnreachableAgent['nearestMiss']>();
  const eliminationReasons = new Map<string, Set<string>>();
  const gaps: CoverageGap[] = [];
  let cells = 0;

  for (const workType of WORK_TYPE_IDS) {
    for (const domain of domains) {
      cells += 1;
      const requirement = syntheticRequirement(workType, domain, sweepNeedsWrite(workType));
      const { survivors, eliminated } = eliminate(requirement, catalog);

      if (survivors.length === 0) {
        // A cell nobody can serve. Only report cells someone DECLARES interest
        // in (a domain no agent mentions is vocabulary breadth, not a gap).
        const declaredInterest = catalog.some((a) =>
          a.capabilities.positional.domains.some((d) => d.id === domain.id || d.id === '*') &&
          a.capabilities.content.workTypes.some(
            (w) => parseSubtype(w.type).parent === workType && w.proficiency !== 'never',
          ),
        );
        if (declaredInterest) {
          gaps.push({
            workType,
            domain: domain.id,
            reasons: [...new Set(eliminated.map((e) => e.reason))],
          });
        }
        continue;
      }

      const inputs = survivors.map((candidate) => ({
        agentId: candidate.agentId,
        axisScores: {
          content: scoreContentDeterministic(requirement, matchSpace(candidate.capabilities)),
          positional: (() => {
            const p = scorePositional(requirement, matchSpace(candidate.capabilities), { knownDomainIds });
            return { score: p.score, evidence: p.evidence };
          })(),
          numerical: scoreNumerical(requirement, candidate.agentId, candidate.capabilities, { cells: new Map() }),
        },
      }));
      const { ordered } = rank(inputs, config);
      const top = ordered[0];
      if (!top) continue;
      winners.set(top.agentId, (winners.get(top.agentId) ?? 0) + 1);

      for (const c of ordered.slice(1)) {
        const gap = top.finalScore - c.finalScore;
        const prev = nearest.get(c.agentId);
        if (!prev || gap < prev.gapToWinner) {
          nearest.set(c.agentId, { workType, domain: domain.id, gapToWinner: gap, winner: top.agentId });
        }
      }
      for (const e of eliminated) {
        const set = eliminationReasons.get(e.entityId) ?? new Set<string>();
        set.add(e.reason);
        eliminationReasons.set(e.entityId, set);
      }
    }
  }

  const unreachable: UnreachableAgent[] = catalog
    .filter((a) => !winners.has(a.agentId))
    .map((a) => ({
      agentId: a.agentId,
      nearestMiss: nearest.get(a.agentId) ?? null,
      alwaysEliminated: nearest.has(a.agentId)
        ? null
        : [...(eliminationReasons.get(a.agentId) ?? new Set(['never a candidate']))].join(', '),
    }));

  return {
    unreachable,
    gaps,
    overlaps: computeOverlaps(catalog),
    sweep: { workTypes: WORK_TYPE_IDS.length, domains: domains.length, cells },
  };
}

// ─── Overlap analysis ────────────────────────────────────────────────────────

function proficiencyValue(p: 'primary' | 'secondary' | 'able' | 'never'): number {
  return p === 'never' ? 0 : PROFICIENCY_SCORE[p];
}

/** Cosine-style similarity over the workType + domain proficiency vectors. */
export function capabilitySimilarity(a: AgentCandidate, b: AgentCandidate): number {
  const keys = new Set<string>();
  const vec = (agent: AgentCandidate): Map<string, number> => {
    const m = new Map<string, number>();
    for (const w of agent.capabilities.content.workTypes) {
      const key = `wt:${parseSubtype(w.type).parent}`;
      m.set(key, proficiencyValue(w.proficiency));
      keys.add(key);
    }
    for (const d of agent.capabilities.positional.domains) {
      const key = `dom:${d.id}`;
      m.set(key, proficiencyValue(d.proficiency));
      keys.add(key);
    }
    return m;
  };
  const va = vec(a);
  const vb = vec(b);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const key of keys) {
    const x = va.get(key) ?? 0;
    const y = vb.get(key) ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function computeOverlaps(catalog: readonly AgentCandidate[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < catalog.length; i++) {
    for (let j = i + 1; j < catalog.length; j++) {
      const similarity = capabilitySimilarity(catalog[i]!, catalog[j]!);
      if (similarity >= OVERLAP_THRESHOLD) {
        pairs.push({ a: catalog[i]!.agentId, b: catalog[j]!.agentId, similarity });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}
