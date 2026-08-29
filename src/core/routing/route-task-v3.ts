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
import { scoreNumerical, hasWarmCells, NEUTRAL, CELL_MIN_USES } from './axis-numerical.js';
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
import { matchSpace, type MatchSpace } from './capability-vector.js';
import type { SkillProfile } from './capability-vector.js';
import { parseSubtype } from './vocabulary-builtin.js';
import type { SkillApplicabilityVerdict } from './skill-applicability.js';
import type { SkillProvenanceKind } from '../skill-pool.js';
import { DeckentError } from '../errors.js';
import type {
  SkillSelectionCandidateTrace,
  SkillSelectionRejectionReason,
  SkillSelectionTrace,
} from './decision-types.js';

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
  /** Missing authority is fail-closed; optional only for source compatibility
   * with older journal fixtures, never admitted by the selector. */
  applicability?: SkillApplicabilityVerdict;
  profileDigest?: string;
  packageDigest?: string;
  applicabilityDigest?: string;
  provenance?: SkillProvenanceKind | 'pool';
  tokenCost?: number;
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
  /** Optional stricter safety ceiling. It never requests this cardinality. */
  maxSkills?: number;
  /** Content-addressed task/catalog authority plus operator skill directives. */
  skillContext?: {
    evidenceDigest: string;
    catalogDigest: string;
    forceSkillIds?: readonly string[];
    excludeSkillIds?: readonly string[];
  };
  /** K3 (581): ε-tie yargıç-seam'i — yalnız governanceMode 'ai' + gerçek tie'da
   *  çağrılır; null/eksik/hatalı her durumda deterministik top-1 kalır. */
  tieJudge?: TieJudgeFn;
  /** Requirement override (planner may pre-produce vectors; else derived from task). */
  requirement?: RequirementVector;
}

/** Skill fit at/over this level attaches the skill ('able'-grade fit). */
export const SKILL_FIT_FLOOR = PROFICIENCY_SCORE.able;

const UNBOUND_DIGEST = `sha256:${'0'.repeat(64)}`;

export class SkillSelectionHoldError extends DeckentError {
  readonly skillIds: readonly string[];
  constructor(skillIds: readonly string[], detail: string) {
    super(
      'ROUTING3_SKILL_SELECTION_HOLD',
      `Skill selection HOLD for [${skillIds.join(',')}]: ${detail}`,
      'Forced skills must pass the same hard applicability, package, platform, tenant, and policy gates as automatic candidates.',
    );
    this.name = 'SkillSelectionHoldError';
    this.skillIds = [...skillIds];
  }
}

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
    if (config.explorationBonus === 0) {
      return { agentId: candidate.agentId, axisScores };
    }
    let totalUses = 0;
    for (const [key, cell] of cells) {
      if (key.endsWith(`|${candidate.agentId}`)) {
        totalUses += cell.uses;
      }
    }
    const explorationBonus =
      config.explorationBonus * Math.max(0, 1 - totalUses / CELL_MIN_USES);
    return { agentId: candidate.agentId, axisScores, explorationBonus };
  });

  const ranking = rank(rankInputs, effectiveConfig);
  const bonusDecisive =
    config.explorationBonus > 0 &&
    rank(
      rankInputs.map(({ agentId, axisScores }) => ({ agentId, axisScores })),
      effectiveConfig,
    ).top?.agentId !== ranking.top?.agentId;
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
  // KN1 (GR-2026-08-08-DOGFOOD-KN1-01): a tie over a ZERO-signal requirement —
  // no domains, no surfaces, no deliverables (the cold-start smoke's
  // "Escalated to Brain (tie) … over []") — gives the judge nothing to
  // discriminate on: its pick is noise at real provider cost (~60-90s + money
  // PER TASK, even in structured planning). Skip the judge and keep the
  // deterministic top-1; the tie escalation stays in the journal (the K3
  // "tie gerçeği silinmez" contract) and informed ties are byte-identical.
  // "Signal" here means information that can PARTITION the tie-set: domains and
  // surfaces genuinely differ across agents, while a SINGLE deliverable entry
  // merely restates the workType (a build task delivers code — a tautology
  // shared by every tied build agent; measured on the smoke's exact task shape:
  // domains [], surfaces [], deliverables [code-src@1.0], six agents @1.000).
  // Two or more deliverable types are a real mix the judge could weigh.
  const hasPositionalSignal =
    requirement.positional.domains.length > 0
    || requirement.positional.surfaces.length > 0
    || requirement.positional.deliverables.length > 1;
  if (escalation?.reason === 'tie' && !hasPositionalSignal && options.tieJudge) {
    debugLog(
      'routeTaskV3:tieJudge',
      `zero-signal tie (${ordered.length} candidates, no domains/surfaces/deliverables) — deterministic top-1 kept, AI judge skipped (KN1)`,
    );
  } else if (
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
  const skillSelection = selectSkills(requirement, catalog, options);
  const skillIds = skillSelection.selectedSkillIds;
  const personaSlices = selectPersonaSlices(workType, judgedTop.agentId, catalog);

  // 9 · Story + final decision.
  const winnerCapability = catalog.agents.find((a) => a.agentId === judgedTop.agentId)!.capabilities;
  const story = buildStory(
    storyTrace(
      task,
      requirement,
      catalog,
      eliminated,
      verifierDrops,
      ordered,
      confidence,
      ranking.indecision,
      escalation,
      judgedProvenance,
      rankInputs
        .filter((candidate) => (candidate.explorationBonus ?? 0) > 0)
        .map(({ agentId, explorationBonus }) => ({
          agentId,
          explorationBonus: explorationBonus!,
        })),
      bonusDecisive,
    ),
  );

  return finalizeDecision({
    agentId: judgedTop.agentId,
    skillIds,
    skillSelection,
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
/**
 * 7094-F1c (owner-approved 2026-08-19): a skill's DOMAIN overlap with the
 * requirement — Σ(requirement weight × declared proficiency credit). The
 * generic workType axis cannot discriminate skills: profile derivation gives
 * nearly every priority≥5 skill a leading `primary` workType
 * (skill-profile-derivation.ts deriveWorkTypes), so on sprint-565 all 11
 * prompts carried the SAME alphabetically-first three skills (byte-identical
 * 14,207B block, measured) — pure tie-break noise, zero task relevance. An
 * explicit `*` domain declaration still counts (it is an owner-authored
 * "applies everywhere", not derivation inflation).
 */
function skillDomainOverlap(requirement: RequirementVector, space: MatchSpace): number {
  let overlap = 0;
  for (const rd of requirement.positional.domains) {
    const declared = space.domains.find((d) => d.id === rd.id)
      ?? space.domains.find((d) => d.id === '*');
    if (declared && declared.proficiency !== 'never') {
      // A requirement domain only exists here because path evidence matched
      // (producePositional skips domains with no evidence). Its weight is the
      // matched share of filesWrite — which is 0 for a directories-only scope
      // (totalWrites=0), NOT "no intersection". Treat evidence-with-zero-weight
      // as presence (weight 1) so directories-only tasks keep skill selection;
      // weighted tasks are unchanged (7094-R landing find, brain-skill pin).
      overlap += (rd.weight > 0 ? rd.weight : 1) * PROFICIENCY_SCORE[declared.proficiency];
    }
  }
  return overlap;
}

function candidateDomains(skill: SkillCandidate): Set<string> {
  return new Set(skill.profile.domains
    .filter(domain => domain.proficiency !== 'never')
    .map(domain => domain.id));
}

function domainSimilarity(left: SkillCandidate, right: SkillCandidate): number {
  const a = candidateDomains(left);
  const b = candidateDomains(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / new Set([...a, ...b]).size;
}

function uncoveredRequirementWeight(
  requirement: RequirementVector,
  skill: SkillCandidate,
  covered: ReadonlySet<string>,
): number {
  const domains = candidateDomains(skill);
  const wildcard = domains.has('*');
  return requirement.positional.domains.reduce((sum, domain) =>
    covered.has(domain.id) || (!wildcard && !domains.has(domain.id))
      ? sum
      : sum + (domain.weight > 0 ? domain.weight : 1), 0);
}

function hasTaskStructuralApplicability(skill: SkillCandidate): boolean {
  if (!skill.applicability?.admitted) return false;
  return skill.applicability.matchedEvidence.some(value =>
    value.startsWith('task:language:')
    || value.startsWith('task:runtime:')
    || value.startsWith('task:framework:')
    || value.startsWith('task:file:'));
}

function selectSkills(
  requirement: RequirementVector,
  catalog: RouteCatalog,
  options: RouteOptions,
): SkillSelectionTrace {
  const policy = options.config.skillComposition;
  const hardMaxSkills = Math.min(options.maxSkills ?? policy.hardMaxSkills, policy.hardMaxSkills);
  const forcedIds = [...new Set(options.skillContext?.forceSkillIds ?? [])];
  const forcedSet = new Set(forcedIds);
  const excluded = new Set((options.skillContext?.excludeSkillIds ?? []).filter(id => !forcedSet.has(id)));
  const byId = new Map(catalog.skills.map(skill => [skill.skillId, skill]));
  const scored = catalog.skills.map((skill) => {
      const space = matchSpace(skill.profile);
      const content = scoreContentDeterministic(requirement, space);
      const positional = scorePositional(requirement, space, {
        knownDomainIds: catalog.vocabulary.knownDomainIds,
      });
      const fit = (content.score + positional.score) / 2;
      const overlap = skillDomainOverlap(requirement, space);
      return {
        skill,
        skillId: skill.skillId,
        fit,
        overlap,
        baseUtility: fit * (0.7 + 0.3 * Math.min(1, overlap)),
        tokenCost: Math.max(0, Math.floor(skill.tokenCost ?? skill.profile.tokenCost ?? 1500)),
      };
    }).sort((a, b) => a.skillId.localeCompare(b.skillId));

  const traces = new Map<string, SkillSelectionCandidateTrace>();
  const eligible = new Map<string, typeof scored[number]>();
  for (const candidate of scored) {
    const applicability = candidate.skill.applicability;
    let rejectionReason: SkillSelectionRejectionReason | null = null;
    if (!applicability) rejectionReason = 'applicability-evidence-missing';
    else if (!applicability.admitted) rejectionReason = applicability.reason;
    else if (excluded.has(candidate.skillId)) rejectionReason = 'excluded';
    else if (!forcedSet.has(candidate.skillId) && candidate.fit < SKILL_FIT_FLOOR) rejectionReason = 'semantic-fit';
    else if (
      !forcedSet.has(candidate.skillId)
      && candidate.overlap <= 0
      && !hasTaskStructuralApplicability(candidate.skill)
    ) rejectionReason = 'no-domain-overlap';
    if (rejectionReason === null) eligible.set(candidate.skillId, candidate);
    traces.set(candidate.skillId, {
      skillId: candidate.skillId,
      profileDigest: candidate.skill.profileDigest ?? UNBOUND_DIGEST,
      packageDigest: candidate.skill.packageDigest ?? UNBOUND_DIGEST,
      applicabilityDigest: candidate.skill.applicabilityDigest
        ?? candidate.skill.applicability?.profileDigest
        ?? UNBOUND_DIGEST,
      provenance: candidate.skill.provenance ?? 'pool',
      matchedEvidence: candidate.skill.applicability?.matchedEvidence
        ? [...candidate.skill.applicability.matchedEvidence]
        : [],
      fit: candidate.fit,
      overlap: candidate.overlap,
      baseUtility: candidate.baseUtility,
      marginalUtility: null,
      tokenCost: candidate.tokenCost,
      selected: false,
      forced: forcedSet.has(candidate.skillId),
      rejectionReason,
    });
  }

  const missingForced = forcedIds.filter(id => !byId.has(id));
  const rejectedForced = forcedIds.filter(id => !eligible.has(id));
  if (missingForced.length > 0 || rejectedForced.length > 0) {
    const held = [...new Set([...missingForced, ...rejectedForced])];
    throw new SkillSelectionHoldError(
      held,
      held.map(id => `${id}:${traces.get(id)?.rejectionReason ?? 'catalog-missing'}`).join(','),
    );
  }
  if (forcedIds.length > hardMaxSkills) {
    throw new SkillSelectionHoldError(forcedIds, `forced cardinality exceeds hardMaxSkills=${hardMaxSkills}`);
  }

  const selected: string[] = [];
  const covered = new Set<string>();
  let totalTokenCost = 0;
  const select = (candidate: typeof scored[number], marginalUtility: number): void => {
    selected.push(candidate.skillId);
    totalTokenCost += candidate.tokenCost;
    for (const domain of candidateDomains(candidate.skill)) {
      if (domain !== '*') covered.add(domain);
    }
    const trace = traces.get(candidate.skillId)!;
    traces.set(candidate.skillId, {
      ...trace, selected: true, marginalUtility, rejectionReason: null,
    });
    eligible.delete(candidate.skillId);
  };

  for (const id of forcedIds) {
    const candidate = eligible.get(id)!;
    if (totalTokenCost + candidate.tokenCost > policy.promptTokenBudget) {
      throw new SkillSelectionHoldError(forcedIds, `forced prompt tokens exceed budget=${policy.promptTokenBudget}`);
    }
    select(candidate, candidate.baseUtility);
  }

  while (eligible.size > 0 && selected.length < hardMaxSkills) {
    const ranked = [...eligible.values()].map(candidate => {
      const uncovered = uncoveredRequirementWeight(requirement, candidate.skill, covered);
      const redundancy = selected.reduce((max, id) =>
        Math.max(max, domainSimilarity(candidate.skill, byId.get(id)!)), 0);
      const marginalUtility = candidate.baseUtility
        + policy.uncoveredCoverageBonus * uncovered
        - policy.redundancyPenalty * redundancy;
      return { candidate, marginalUtility };
    }).sort((a, b) =>
      b.marginalUtility - a.marginalUtility
      || b.candidate.baseUtility - a.candidate.baseUtility
      || a.candidate.skillId.localeCompare(b.candidate.skillId));
    const best = ranked[0]!;
    if (best.marginalUtility < policy.marginalUtilityFloor) {
      for (const { candidate, marginalUtility } of ranked) {
        const trace = traces.get(candidate.skillId)!;
        traces.set(candidate.skillId, {
          ...trace, marginalUtility, rejectionReason: 'marginal-utility',
        });
      }
      break;
    }
    if (totalTokenCost + best.candidate.tokenCost > policy.promptTokenBudget) {
      const trace = traces.get(best.candidate.skillId)!;
      traces.set(best.candidate.skillId, {
        ...trace, marginalUtility: best.marginalUtility, rejectionReason: 'prompt-token-budget',
      });
      eligible.delete(best.candidate.skillId);
      continue;
    }
    select(best.candidate, best.marginalUtility);
  }

  if (selected.length >= hardMaxSkills) {
    for (const candidate of eligible.values()) {
      const trace = traces.get(candidate.skillId)!;
      if (trace.rejectionReason === null) {
        traces.set(candidate.skillId, { ...trace, rejectionReason: 'hard-max-skills' });
      }
    }
  }

  return {
    evidenceDigest: options.skillContext?.evidenceDigest ?? UNBOUND_DIGEST,
    catalogDigest: options.skillContext?.catalogDigest ?? UNBOUND_DIGEST,
    selectedSkillIds: selected,
    candidates: [...traces.values()].sort((a, b) => a.skillId.localeCompare(b.skillId)),
    composition: {
      promptTokenBudget: policy.promptTokenBudget,
      hardMaxSkills,
      marginalUtilityFloor: policy.marginalUtilityFloor,
      redundancyPenalty: policy.redundancyPenalty,
      uncoveredCoverageBonus: policy.uncoveredCoverageBonus,
      totalTokenCost,
    },
  };
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
  explorationBonuses: NonNullable<StoryTrace['explorationBonuses']>,
  bonusDecisive: boolean,
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
    ...(explorationBonuses.length > 0 ? { explorationBonuses } : {}),
    ...(bonusDecisive ? { bonusDecisive: true } : {}),
  };
}
