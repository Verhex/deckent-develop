// ─── RoutingEngineV3 — ORCHESTRATOR (deterministic end-to-end) ───────────────
// Slice-1 (hand-coded, Brain 2026-07-14). Detail-doc §3: vectorize → eliminate
// → [content-fit slot: injectable, Slice-2 AI; absent = deterministic scorer]
// → verify(+policy) → anti-temp → rank → decision (story + journal). Agent,
// skills and persona-slice ride ONE pipeline run (vectorial directive:
// agent-skill-persona together). Indecision / catalog-gap / policy-escalate
// produce a typed BrainEscalation (decision-5); NOTHING here silently falls
// back. S3 cut-over (2026-07-15): this IS the production routing engine —
// the planner calls it unconditionally; the V2 engine was removed.

import type { RoutingV3Config } from '../config-types.js';
import type { RequirementVector } from './requirement-vector.js';
import {
  producePositional,
  produceNumerical,
  produceContentStructural,
} from './requirement-vector.js';
import type { RequirementVocabularySource } from './requirement-vector.js';
import { eliminate } from './stage-eliminate.js';
import type { AgentCandidate } from './stage-eliminate.js';
import { scoreContentDeterministic, PROFICIENCY_SCORE } from './axis-content.js';
import { scorePositional } from './axis-positional.js';
import { scoreNumerical, hasWarmCells, NEUTRAL } from './axis-numerical.js';
import type { TieJudgeFn } from './tie-judge.js';
import { debugLog } from '../utils.js';
import type { CellStat } from './axis-numerical.js';
import { rank, TIE_EPSILON } from './stage-rank.js';
import { verify, enforceAntiTemp, CatalogGapError } from './verifier.js';
import type { VerifierViolation } from './verifier.js';
import type { PolicyPackRegistry } from './policy-pack.js';
import type { Task } from '../task-types.js';
import { buildStory } from './decision-story.js';
import type { StoryTrace } from './decision-story.js';
import { finalizeDecision } from './decision-types.js';
import type {
  AxisScores,
  BrainEscalation,
  RoutingDecisionV3,
  ScoredCandidate,
} from './decision-types.js';
import { matchSpace } from './capability-vector.js';
import type { SkillProfile } from './capability-vector.js';
import { parseSubtype } from './vocabulary-builtin.js';

// ─── Inputs ──────────────────────────────────────────────────────────────────

/**
 * The task surface the pipeline actually consumes — a structural subset of
 * the full Task record so single-task callers don't have to fabricate
 * scheduler fields. Producers read only title/description/scope(/effort).
 */
export type RoutableTask = Pick<Task, 'title' | 'description' | 'scope'> &
  Partial<Pick<Task, 'effort'>>;

export interface SkillCandidate {
  skillId: string;
  profile: SkillProfile;
}

export interface RouteCatalog {
  agents: readonly AgentCandidate[];
  skills: readonly SkillCandidate[];
  vocabulary: RequirementVocabularySource & { knownDomainIds: ReadonlySet<string> };
}

export interface RouteOptions {
  config: RoutingV3Config;
  policies?: PolicyPackRegistry;
  cells?: ReadonlyMap<string, CellStat>;
  /** Slice-2 AI content-fit slot. Absent = deterministic content scorer. */
  contentFit?: (requirement: RequirementVector, candidates: readonly AgentCandidate[]) =>
    Promise<ReadonlyMap<string, { score: number; evidence: string[] }>>;
  /** ADR-G-006 force-*: bypasses ranking, NEVER the verifier. */
  forceAgentId?: string;
  /** Fresh-eyes exclusion (FIX-path reroute): these agents are not candidates. */
  excludeAgentIds?: readonly string[];
  /** Max skills attached to the decision (V2 convention: 3). */
  maxSkills?: number;
  /** K3 (581): ε-tie yargıç-seam'i — yalnız governanceMode 'ai' + gerçek tie'da
   *  çağrılır; null/eksik/hatalı her durumda deterministik top-1 kalır. */
  tieJudge?: TieJudgeFn;
  /** Requirement override (planner may pre-produce vectors; else derived from task). */
  requirement?: RequirementVector;
}

/** Skill fit at/over this level attaches the skill ('able'-grade fit). */
export const SKILL_FIT_FLOOR = PROFICIENCY_SCORE.able;

/**
 * Persona-slice bridge: guidance markers in current PROMPT.md files still use
 * V2-intent keys. Slice-3 renames markers to work-types and deletes this
 * table — until then it is the single documented alias point.
 */
export const WORK_TYPE_TO_SLICE_ALIAS: Readonly<Record<string, string>> = {
  build: 'implementation',
  fix: 'bugfix',
  refactor: 'refactor',
  document: 'documentation',
  review: 'review',
  configure: 'config',
  migrate: 'migration',
  analyze: 'architecture',
};

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Route one task through the V3 pipeline. Deterministic when no contentFit is
 * injected (governance mode / Slice-1). Throws CatalogGapError on ownership
 * gaps; all other indecision is RETURNED as `escalation` on the decision.
 */
export async function routeTaskV3(
  task: RoutableTask,
  catalog: RouteCatalog,
  options: RouteOptions,
): Promise<Readonly<RoutingDecisionV3>> {
  const { config } = options;

  // 1 · Vectorize (Slice-0 producers; content = structural in deterministic mode).
  const requirement: RequirementVector = options.requirement ?? buildRequirement(task, catalog, config);
  const provenance: 'deterministic' | 'ai' = options.contentFit ? 'ai' : 'deterministic';
  const workType = parseSubtype(requirement.content.workType).parent;

  // 2 · Eliminate (fresh-eyes exclusions drop out first, story-visible).
  const excluded = new Set(options.excludeAgentIds ?? []);
  const candidatePool = excluded.size > 0
    ? catalog.agents.filter((a) => !excluded.has(a.agentId))
    : catalog.agents;
  const { survivors, eliminated } = eliminate(requirement, candidatePool);
  for (const id of excluded) {
    eliminated.push({ entityId: id, kind: 'agent', reason: 'policy-denied', detail: 'fresh-eyes exclusion (FIX reroute)' });
  }

  // 3 · Content fit (injected AI in Slice-2, deterministic scorer otherwise).
  const contentScores = new Map<string, { score: number; evidence: string[] }>();
  if (options.contentFit && survivors.length > 0) {
    const aiScores = await options.contentFit(requirement, survivors);
    for (const s of survivors) {
      const ai = aiScores.get(s.agentId);
      contentScores.set(s.agentId, ai ?? withNeutralEvidence('content-fit returned no score'));
    }
  } else {
    for (const s of survivors) {
      contentScores.set(s.agentId, scoreContentDeterministic(requirement, matchSpace(s.capabilities)));
    }
  }

  // 4 · Verify (+policy) — LLM output cannot bypass; force never skips this.
  const policies = options.policies;
  const verified: AgentCandidate[] = [];
  const verifierDrops: Array<{ agentId: string; violations: readonly VerifierViolation[] }> = [];
  let policyEscalate = false;
  let policyMinConfidence: number | null = null;
  let forceWarning = false;

  for (const candidate of survivors) {
    const verdict = verify(requirement, candidate, {
      policies,
      forced: options.forceAgentId === candidate.agentId,
    });
    policyEscalate ||= verdict.policyEscalate;
    if (verdict.policyMinConfidence !== null) {
      policyMinConfidence = Math.max(policyMinConfidence ?? 0, verdict.policyMinConfidence);
    }
    if (verdict.pass) {
      verified.push(candidate);
    } else if (options.forceAgentId === candidate.agentId) {
      forceWarning = verdict.forceWarning;
      verified.push(candidate); // force keeps the candidate but the warning escalates below
      verifierDrops.push({ agentId: candidate.agentId, violations: verdict.violations });
    } else {
      verifierDrops.push({ agentId: candidate.agentId, violations: verdict.violations });
    }
  }

  // 5 · Ownership invariant — typed gap, never a fallback.
  assertOwnershipOrThrow(requirement, verified, eliminated.map((e) => `${e.entityId}:${e.reason}`), verifierDrops);

  // 6 · Score remaining axes + rank.
  const cells = options.cells ?? new Map<string, CellStat>();
  // K1 (581-kalibrasyon): decision-level signal gate — see NumericalActiveComponents.
  // `live` is structurally absent at this call site until S2 wires
  // providerHealth/latencyScore; when it does, this gate must read those inputs.
  const signalGate = config.signalGatedNumerical !== false
    ? {
        cells: verified.some((c) => hasWarmCells(requirement, c.agentId, cells)),
        live: false,
      }
    : undefined;
  // K1 replay-ölçüm dersi (65-karar, ilk varyant REDDEDİLDİ): ölü bileşenleri
  // yalnız eksen-ORTALAMASINDAN düşürmek tier-bileşeninin sesini 3×'e çıkarıp
  // "yüksek-effort → premium-ajan" baskınlığı üretti (25 sahte-flip). Onaylı
  // tasarım AĞIRLIK-renormalizasyonu: numerical'ın ağırlığı sinyal-kesriyle
  // (aktif-bileşen/3) küçülür, serbest kalan ağırlık content/positional'a
  // MEVCUT ORANLARIYLA dağılır — tier'ın mutlak sesi legacy ile birebir kalır,
  // ayrıştıran eksenler güçlenir. signalGate kapalıyken weights aynen geçer.
  let effectiveConfig = config;
  if (signalGate) {
    const activeParts = 1 + (signalGate.cells ? 1 : 0) + (signalGate.live ? 1 : 0); // tier hep aktif
    const signalFraction = activeParts / 3;
    if (signalFraction < 1) {
      const { weights } = config;
      const released = weights.numerical * (1 - signalFraction);
      const denom = weights.content + weights.positional;
      effectiveConfig = {
        ...config,
        weights: {
          content: weights.content + released * (weights.content / denom),
          positional: weights.positional + released * (weights.positional / denom),
          numerical: weights.numerical * signalFraction,
        },
      };
    }
  }
  const rankInputs = verified.map((candidate) => {
    const positional = scorePositional(requirement, matchSpace(candidate.capabilities), {
      knownDomainIds: catalog.vocabulary.knownDomainIds,
    });
    const numerical = scoreNumerical(requirement, candidate.agentId, candidate.capabilities, { cells }, signalGate);
    const content = contentScores.get(candidate.agentId) ?? withNeutralEvidence('missing content score');
    const axisScores: AxisScores = {
      content: { score: content.score, evidence: content.evidence },
      positional: { score: positional.score, evidence: [...positional.evidence, ...positional.issues] },
      numerical,
    };
    return { agentId: candidate.agentId, axisScores };
  });

  const ranking = rank(rankInputs, effectiveConfig);
  const sourceOf = (agentId: string): AgentCandidate['source'] | undefined =>
    catalog.agents.find((a) => a.agentId === agentId)?.source;
  let ordered: ScoredCandidate[] = enforceAntiTemp(ranking.ordered, sourceOf, TIE_EPSILON);

  // Force: pin the forced agent to the top of the verified order.
  if (options.forceAgentId) {
    const forcedIdx = ordered.findIndex((c) => c.agentId === options.forceAgentId);
    if (forcedIdx > 0) {
      const [forced] = ordered.splice(forcedIdx, 1);
      ordered.unshift(forced!);
    }
  }

  const top = ordered[0]!;
  const confidence = ranking.confidence;
  const effectiveFloor = Math.max(config.confidenceFloor, policyMinConfidence ?? 0);

  // 7 · Escalation decision (decision-5: tie/indecision/policy/force-warning → Brain).
  let escalation: BrainEscalation | null = null;
  if (policyEscalate) {
    escalation = buildEscalation('policy-escalate', ordered, { policyMinConfidence });
  } else if (forceWarning) {
    escalation = buildEscalation('conflict', ordered, { forceAgentId: options.forceAgentId ?? null, forceWarning: true });
  } else if (!options.forceAgentId && ranking.indecision === 'tie') {
    escalation = buildEscalation('tie', ordered, { epsilon: TIE_EPSILON });
  } else if (!options.forceAgentId && (ranking.indecision === 'low-confidence' || confidence < effectiveFloor)) {
    escalation = buildEscalation('low-confidence', ordered, { confidence, floor: effectiveFloor });
  }

  // 7b · K3 TIE-JUDGE (581-kalibrasyon hibriti, Alperen-onaylı): YALNIZ gerçek
  // ε-tie'da, governanceMode 'ai' + yargıç-seam varken, tie-kümesi LLM'e
  // seçtirilir. Kazanan öne alınır ve provenance 'ai' olur; tie-eskalasyonu
  // journal'da KALIR (tie gerçeği silinmez — çözüm provenance'tan okunur).
  // Her hata-modu FAIL-OPEN: deterministik top-1 aynen kalır. Low-confidence'a
  // asla karışmaz (K2 kararı: kalan belirsizlik content-doygunluk dilimine).
  let judgedTop = top;
  let judgedProvenance = provenance;
  if (
    escalation?.reason === 'tie' &&
    config.governanceMode === 'ai' &&
    options.tieJudge &&
    !options.forceAgentId
  ) {
    const tieSet = ordered.filter((c) => top.finalScore - c.finalScore < TIE_EPSILON);
    if (tieSet.length >= 2) {
      try {
        const caps = new Map(catalog.agents.map((a) => [a.agentId, a.capabilities]));
        const verdict = await options.tieJudge(requirement, tieSet, caps);
        const pick = verdict && tieSet.find((c) => c.agentId === verdict.agentId);
        if (pick && pick.agentId !== top.agentId) {
          ordered = [pick, ...ordered.filter((c) => c.agentId !== pick.agentId)];
          judgedTop = pick;
          judgedProvenance = 'ai';
        } else if (pick) {
          judgedProvenance = 'ai'; // yargıç deterministik top-1'i onayladı
        }
      } catch (e) {
        debugLog('routeTaskV3:tieJudge', e); // fail-open
      }
    }
  }

  // 8 · Skills + persona-slice in the same run.
  const skillIds = selectSkills(requirement, catalog, options.maxSkills ?? 3);
  const personaSlices = selectPersonaSlices(workType, judgedTop.agentId, catalog);

  // 9 · Story + final decision.
  const winnerCapability = catalog.agents.find((a) => a.agentId === judgedTop.agentId)!.capabilities;
  const story = buildStory(storyTrace(task, requirement, catalog, eliminated, verifierDrops, ordered, confidence, ranking.indecision, escalation, judgedProvenance));

  return finalizeDecision({
    agentId: judgedTop.agentId,
    skillIds,
    personaSlices,
    modelPreference: winnerCapability.numerical.preferredModel ?? null,
    effortClass: requirement.numerical.effortClass,
    axisScores: judgedTop.axisScores,
    finalScore: judgedTop.finalScore,
    confidence,
    provenance: judgedProvenance,
    story,
    ranked: ordered,
    escalation,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRequirement(
  task: RoutableTask,
  catalog: RouteCatalog,
  config: RoutingV3Config,
): RequirementVector {
  const full = task as Task;
  const positional = producePositional(full, catalog.vocabulary);
  const numerical = produceNumerical(full, catalog.vocabulary);
  const content = produceContentStructural(full, positional, config.structuralConfidence);
  return { content, positional, numerical };
}

function withNeutralEvidence(reason: string): { score: number; evidence: string[] } {
  return { score: NEUTRAL, evidence: [reason] };
}

function assertOwnershipOrThrow(
  requirement: RequirementVector,
  verified: readonly AgentCandidate[],
  eliminatedSummary: readonly string[],
  verifierDrops: ReadonlyArray<{ agentId: string; violations: readonly VerifierViolation[] }>,
): void {
  if (verified.length > 0) return;
  const summary = [
    ...eliminatedSummary,
    ...verifierDrops.map((d) => `${d.agentId}:${d.violations.map((v) => v.code).join('+')}`),
  ];
  throw new CatalogGapError(
    parseSubtype(requirement.content.workType).parent,
    requirement.positional.domains.map((d) => d.id),
    summary,
  );
}

function buildEscalation(
  reason: BrainEscalation['reason'],
  ordered: readonly ScoredCandidate[],
  evidence: Record<string, unknown>,
): BrainEscalation {
  return {
    reason,
    candidates: ordered.slice(0, 3).map((c) => ({
      agentId: c.agentId,
      finalScore: c.finalScore,
      axisScores: c.axisScores,
    })),
    evidence,
  };
}

/** Skills ride the same axes (content + positional; numerical N/A for knowledge). */
function selectSkills(
  requirement: RequirementVector,
  catalog: RouteCatalog,
  maxSkills: number,
): string[] {
  const scored = catalog.skills
    .map((skill) => {
      const space = matchSpace(skill.profile);
      const content = scoreContentDeterministic(requirement, space);
      const positional = scorePositional(requirement, space, {
        knownDomainIds: catalog.vocabulary.knownDomainIds,
      });
      return { skillId: skill.skillId, fit: (content.score + positional.score) / 2 };
    })
    .filter((s) => s.fit >= SKILL_FIT_FLOOR)
    .sort((a, b) => b.fit - a.fit || a.skillId.localeCompare(b.skillId));
  // Honest-empty (sprint-441 contract): nothing above the floor → NO skills.
  return scored.slice(0, maxSkills).map((s) => s.skillId);
}

function selectPersonaSlices(
  workType: string,
  agentId: string,
  catalog: RouteCatalog,
): string[] {
  const agent = catalog.agents.find((a) => a.agentId === agentId);
  const declared = agent?.capabilities.content.personaSlices ?? [];
  if (declared.length === 0) return [];
  const alias = WORK_TYPE_TO_SLICE_ALIAS[workType];
  const picks: string[] = [];
  if (declared.includes(workType)) picks.push(workType);
  else if (alias && declared.includes(alias)) picks.push(alias);
  if (declared.includes('default') && !picks.includes('default')) picks.push('default');
  return picks.length > 0 ? picks : [declared[0]!];
}

function storyTrace(
  task: RoutableTask,
  requirement: RequirementVector,
  catalog: RouteCatalog,
  eliminated: StoryTrace['eliminated'],
  verifierDrops: StoryTrace['verifierDrops'],
  ordered: readonly ScoredCandidate[],
  confidence: number,
  indecision: StoryTrace['indecision'],
  escalation: BrainEscalation | null,
  provenance: 'deterministic' | 'ai',
): StoryTrace {
  const top = ordered[0] ?? null;
  const runnerUp = ordered[1] ?? null;
  return {
    taskLabel: task.title,
    workType: parseSubtype(requirement.content.workType).parent,
    domains: requirement.positional.domains.map((d) => d.id),
    candidateCount: catalog.agents.length,
    eliminated,
    verifierDrops,
    winner: top ? { agentId: top.agentId, finalScore: top.finalScore, axisScores: top.axisScores } : null,
    runnerUp: runnerUp ? { agentId: runnerUp.agentId, finalScore: runnerUp.finalScore } : null,
    confidence,
    indecision,
    escalation,
    provenance,
  };
}
