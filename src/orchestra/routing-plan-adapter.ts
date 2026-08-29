// ─── ROUTING-V3 plan-time adapter (Slice-2 integration) ──────────────────────
// Hand-coded (Brain 2026-07-15). Bridges the sprint-planner to routeTaskV3.
// S3 cut-over (2026-07-15): the planner calls this unconditionally — it IS the
// production routing path; the V2 engine was removed. One LLM batch enriches every task's content axis
// (content-llm.ts); matching/verification stays deterministic; escalations
// and catalog gaps are RETURNED for the plan surface (decision-5: the Brain —
// and the plan preview in front of Alperen — decides; nothing silent).

import { AgentPoolManager } from '../core/agent-pool.js';
import { snapshotSkillCatalog, resolveSkillBody } from '../core/skill-pool.js';
import type { EffectiveSkill, SkillDispositionState } from '../core/skill-pool.js';
import { deriveCanonicalSkillProfile } from '../core/skill-profile-derivation.js';
import {
  deriveCanonicalSkillApplicability,
  evaluateSkillApplicability,
} from '../core/routing/skill-applicability.js';
import type { SkillApplicabilityDerivation } from '../core/routing/skill-applicability.js';
import { collectSkillTaskEvidence } from '../core/routing/skill-task-evidence.js';
import type { SkillDefinition, SkillProfileDerivation } from '../core/skill-types.js';
import { validateCapabilities } from '../core/routing/capability-vector.js';
import type { SkillProfile } from '../core/routing/capability-vector.js';
import { loadVocabulary } from '../core/routing/vocabulary.js';
import { loadPolicyPacks } from '../core/routing/policy-pack.js';
import { readCellsSnapshot } from '../core/routing/learning-cells.js';
import type { CellStat } from '../core/routing/axis-numerical.js';
import { producePositional, produceNumerical, produceContentStructural } from '../core/routing/requirement-vector.js';
import { produceContentBatchLLM } from '../core/routing/content-llm.js';
import type { CompleteFn } from '../core/routing/content-llm.js';
import { makeCompleteTieJudge } from '../core/routing/tie-judge.js';
import { routeTaskV3, SkillSelectionHoldError } from '../core/routing/route-task-v3.js';
import type { RouteCatalog } from '../core/routing/route-task-v3.js';
import { CatalogGapError } from '../core/routing/verifier.js';
import { appendDecision, hashConfig } from '../core/routing/journal.js';
import type { RoutingV3Config } from '../core/config-types.js';
import type { Task } from '../core/task-types.js';
import { debugLog } from '../core/utils.js';
import { createHash } from 'node:crypto';

export interface RouteTasksV3Options {
  /** Injected LLM completion (provider resolved by the planner). Absent = structural content. */
  complete?: CompleteFn;
  sprintId?: string;
  /** Journal writes on by default; tests can disable. */
  journal?: boolean;
  /** Fresh-eyes exclusion for FIX-path reroutes (threaded into routeTaskV3). */
  excludeAgentIds?: readonly string[];
  /** Pre-loaded pools (planner passes its in-memory pool so generated temp
   *  agents/skills — e.g. project-conventions — are V3-visible; absent = disk load). */
  pools?: {
    agents?: import('../core/agent-types.js').AgentPool;
    skills?: Map<string, SkillDefinition>;
  };
}

// ─── Skill routing eligibility — typed, never silent (row 9034) ──────────────
//
// Before this the adapter dropped every non-candidate skill with a bare
// `continue`: a disabled/retired/quarantined skill and a skill whose profile
// simply failed validation were indistinguishable from "considered and not
// picked", and `enabled` was never consulted at all. Selection now runs over the
// canonical S5 catalog projection (`snapshotSkillCatalog`) — or, for the
// planner's in-memory pool, over the same 561-001 derivation authority — and
// every exclusion produces a typed reason that reaches the plan surface.

export type SkillRoutingRejectionReason =
  | 'profile-missing'
  | 'disabled'
  | 'retired'
  | 'quarantined'
  | 'invalid-profile'
  | 'invalid-applicability'
  | 'package-unresolved'
  | 'required-evidence-missing'
  | 'forbidden-evidence-present'
  | 'partial-evidence'
  | 'platform-mismatch';

export interface RouteTasksV3SkillRejection {
  skillId: string;
  reason: SkillRoutingRejectionReason;
  /** Human-readable evidence behind the reason (diagnostic code + message). */
  detail: string;
  /** Which candidate source the row came from — catalog projection or in-memory pool. */
  source: 'catalog' | 'pool';
  /** Present for task-local applicability rejections; absent for catalog-global rows. */
  taskId?: string;
}

/** One skill as the eligibility rule sees it, independent of where it came from. */
interface SkillEligibilityCandidate {
  skillId: string;
  dispositionState: SkillDispositionState;
  masked: boolean;
  routing: SkillProfileDerivation;
  applicability?: SkillApplicabilityDerivation;
}

export type SkillEligibilityVerdict =
  | { admitted: true; skillId: string; profile: SkillProfile }
  | { admitted: false; skillId: string; reason: SkillRoutingRejectionReason; detail: string };

const DISPOSITION_REJECTION: Readonly<
  Record<Exclude<SkillDispositionState, 'active'>, SkillRoutingRejectionReason>
> = {
  disabled: 'disabled',
  quarantined: 'quarantined',
  retired: 'retired',
};

/**
 * The single V3 skill-candidacy rule. Disposition is checked before the profile
 * so a retired skill is reported as retired rather than as a profile problem,
 * and a masked row is refused fail-closed even if its disposition reads active.
 */
export function evaluateSkillRoutingEligibility(
  candidate: SkillEligibilityCandidate,
): SkillEligibilityVerdict {
  const { skillId } = candidate;
  if (candidate.dispositionState !== 'active') {
    return {
      admitted: false,
      skillId,
      reason: DISPOSITION_REJECTION[candidate.dispositionState],
      detail: `disposition=${candidate.dispositionState}`,
    };
  }
  if (candidate.masked) {
    return { admitted: false, skillId, reason: 'quarantined', detail: 'masked catalog row' };
  }
  if (candidate.routing.status !== 'routable') {
    const { reasonCode, message } = candidate.routing.diagnostic;
    return {
      admitted: false,
      skillId,
      // `insufficient-source-metadata` is the "there is no usable profile and
      // none can be derived" class; the other two mean a profile existed and
      // failed canonical V3 validation.
      reason: reasonCode === 'insufficient-source-metadata' ? 'profile-missing' : 'invalid-profile',
      detail: `${reasonCode}: ${message}`,
    };
  }
  if (candidate.applicability?.status === 'unroutable') {
    return {
      admitted: false,
      skillId,
      reason: 'invalid-applicability',
      detail: `${candidate.applicability.diagnostic.reasonCode}: ${candidate.applicability.diagnostic.message}`,
    };
  }
  return { admitted: true, skillId, profile: candidate.routing.profile };
}

export type SkillRoutingCandidateSource =
  | { source: 'catalog'; entries: readonly EffectiveSkill[] }
  | { source: 'pool'; definitions: Iterable<SkillDefinition> };

export interface SkillRoutingSelection {
  skills: Array<{
    skillId: string;
    profile: SkillProfile;
    applicability: Extract<SkillApplicabilityDerivation, { status: 'applicable-profile' }>;
    definition: SkillDefinition;
    provenance: EffectiveSkill['provenance']['kind'] | 'pool';
    entry?: EffectiveSkill;
  }>;
  rejections: RouteTasksV3SkillRejection[];
}

/**
 * Partition a skill source into V3 candidates and typed rejections. Every input
 * row lands in exactly one of the two arrays — that total is the anti-silent-skip
 * invariant the routing surface is judged on.
 */
export function selectRoutableSkills(input: SkillRoutingCandidateSource): SkillRoutingSelection {
  const poolDefinitions = input.source === 'pool' ? [...input.definitions] : [];
  const definitionsById = new Map(poolDefinitions.map(definition => [definition.id, definition]));
  const catalogById = new Map(
    input.source === 'catalog' ? input.entries.map(entry => [entry.id, entry] as const) : [],
  );
  const candidates: SkillEligibilityCandidate[] =
    input.source === 'catalog'
      ? input.entries.map((entry) => ({
          skillId: entry.id,
          dispositionState: entry.disposition.state,
          masked: entry.masked,
          routing: entry.routing,
          applicability: entry.applicability,
        }))
      : poolDefinitions.map((definition) => ({
          skillId: definition.id,
          // An in-memory pool row has no disposition ledger behind it, so the
          // same rule `resolveSkillCatalog` applies to a manifest applies here.
          dispositionState: definition.enabled === false ? 'disabled' : 'active',
          masked: false,
          routing: deriveCanonicalSkillProfile(definition),
          applicability: deriveCanonicalSkillApplicability(definition),
        }));

  const selection: SkillRoutingSelection = { skills: [], rejections: [] };
  for (const candidate of candidates) {
    const verdict = evaluateSkillRoutingEligibility(candidate);
    if (verdict.admitted) {
      const definition = input.source === 'catalog'
        ? catalogById.get(verdict.skillId)?.definition
        : definitionsById.get(verdict.skillId);
      const entry = input.source === 'catalog'
        ? catalogById.get(verdict.skillId)
        : undefined;
      const applicability = candidate.applicability;
      if (!definition || applicability?.status !== 'applicable-profile') {
        selection.rejections.push({
          skillId: verdict.skillId,
          reason: 'invalid-applicability',
          detail: 'canonical applicability profile unavailable',
          source: input.source,
        });
        continue;
      }
      selection.skills.push({
        skillId: verdict.skillId,
        profile: verdict.profile,
        applicability,
        definition,
        provenance: entry?.provenance.kind ?? 'pool',
        ...(entry ? { entry } : {}),
      });
      continue;
    }
    selection.rejections.push({
      skillId: verdict.skillId,
      reason: verdict.reason,
      detail: verdict.detail,
      source: input.source,
    });
  }
  return selection;
}

function digestJson(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function packageDigest(skill: SkillRoutingSelection['skills'][number]):
  | { ok: true; digest: string }
  | { ok: false; detail: string } {
  if (!skill.entry) {
    // Planner-generated in-memory packages have not entered the catalog yet;
    // bind the complete definition (including applicability/profile) instead
    // of inventing a filesystem identity they do not possess.
    return { ok: true, digest: digestJson({ source: 'pool', definition: skill.definition }) };
  }
  const body = resolveSkillBody(skill.entry);
  if (!body.ok) return { ok: false, detail: `${body.reasonCode}: ${body.detail}` };
  return {
    ok: true,
    digest: digestJson({
      skillId: body.skillId,
      entrypoint: { path: body.entrypoint.declaredPath, digest: body.entrypoint.digest },
      referencedFiles: body.referencedFiles
        .map(file => ({ path: file.declaredPath, digest: file.digest }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    }),
  };
}

export interface RouteTasksV3Escalation {
  taskId: string;
  reason: string;
  detail: string;
  candidates: Array<{ agentId: string; finalScore: number }>;
}

export interface RouteTasksV3Result {
  /** Tasks that received an assignment (assignedAgent/skills/routingMeta mutated in place). */
  routed: string[];
  /** Escalations the plan surface MUST show (tie/low-confidence/policy/gap). */
  escalations: RouteTasksV3Escalation[];
  /** Content-axis fallbacks (LLM gap → structural), for the plan report. */
  contentFallbacks: Array<{ taskId: string; reason: string }>;
  /** Skills excluded from V3 candidacy, each with a typed reason (never silent). */
  skillRejections: RouteTasksV3SkillRejection[];
  /** Number of decision-journal appends that failed during this routing call. */
  journalFailures: number;
}

/**
 * Route every task through V3 at plan time. Mutates each task's
 * assignedAgent/assignedSkills/routingMeta exactly like the V2 loop does —
 * a CatalogGapError leaves the task UNASSIGNED and surfaces as an escalation
 * (the plan gate blocks on unassigned tasks; honest, never a fallback agent).
 */
export async function routeTasksV3ForPlan(
  tasks: Task[],
  projectRoot: string,
  config: RoutingV3Config,
  options: RouteTasksV3Options = {},
): Promise<RouteTasksV3Result> {
  const result: RouteTasksV3Result = {
    routed: [], escalations: [], contentFallbacks: [], skillRejections: [],
    journalFailures: 0,
  };

  // ── Catalog ────────────────────────────────────────────────────────────
  const pool = options.pools?.agents ?? new AgentPoolManager(projectRoot).loadAgents();
  const agents: RouteCatalog['agents'][number][] = [];
  for (const agent of pool.values()) {
    const caps = (agent as unknown as Record<string, unknown>)['capabilities'];
    const validation = caps ? validateCapabilities(caps) : null;
    if (!validation?.ok) continue; // capability-less agents are not V3 candidates (lint reports them)
    agents.push({
      agentId: agent.id,
      capabilities: validation.value,
      source: agent.source === 'learned' ? 'learned' : agent.source === 'user' ? 'user' : 'builtin',
    });
  }

  // Skills: the canonical S5 projection on disk, or the planner's in-memory pool
  // (generated temp skills never exist on disk at plan time). Both go through the
  // one eligibility rule; nothing is dropped without a typed reason.
  const skillSnapshot = options.pools?.skills
    ? null
    : snapshotSkillCatalog(projectRoot, { excludeSidecarStats: true });
  const selection = options.pools?.skills
    ? selectRoutableSkills({ source: 'pool', definitions: options.pools.skills.values() })
    : selectRoutableSkills({ source: 'catalog', entries: skillSnapshot!.entries });
  result.skillRejections = selection.rejections;
  for (const rejection of selection.rejections) {
    debugLog(
      'routing-plan-adapter:skill-rejected',
      `${rejection.skillId} (${rejection.source}): ${rejection.reason} — ${rejection.detail}`,
    );
  }

  const resolvedSkills = selection.skills.flatMap(skill => {
    const packageResolution = packageDigest(skill);
    if (!packageResolution.ok) {
      result.skillRejections.push({
        skillId: skill.skillId,
        reason: 'package-unresolved',
        detail: packageResolution.detail,
        source: skill.entry ? 'catalog' : 'pool',
      });
      return [];
    }
    return [{
      ...skill,
      profileDigest: digestJson(skill.profile),
      packageDigest: packageResolution.digest,
      tokenCost: skill.definition.promptInjection.maxTokens,
    }];
  });
  const skillCatalogDigest = digestJson({
    snapshotDigest: skillSnapshot?.digest ?? null,
    candidates: resolvedSkills.map(skill => ({
      skillId: skill.skillId,
      profileDigest: skill.profileDigest,
      applicabilityDigest: skill.applicability.digest,
      packageDigest: skill.packageDigest,
      provenance: skill.provenance,
      tokenCost: skill.tokenCost,
    })).sort((a, b) => a.skillId.localeCompare(b.skillId)),
  });

  const vocabulary = await loadVocabulary(projectRoot);
  const catalog: RouteCatalog = {
    agents,
    // Skill applicability is task-local and is attached in the route loop.
    skills: [],
    vocabulary: {
      domains: vocabulary.domains,
      knownDomainIds: new Set(vocabulary.domains.map((d) => d.id)),
    },
  };

  const policies = loadPolicyPacks(projectRoot);
  const cellsSnapshot = readCellsSnapshot(projectRoot);
  const cells = new Map<string, CellStat>(
    Object.entries(cellsSnapshot.cells).map(([k, c]) => [
      k,
      { uses: c.uses, successes: c.successes, qualitySum: c.qualitySum },
    ]),
  );

  // ── Content axis: ONE LLM batch for the whole plan (or structural) ─────
  const positionals = tasks.map((task) => ({
    task,
    positional: producePositional(task, catalog.vocabulary),
  }));

  const contents = new Map<string, ReturnType<typeof producePositional> extends never ? never : import('../core/routing/requirement-vector.js').RequirementContent>();
  if (options.complete) {
    const batch = await produceContentBatchLLM(positionals, options.complete, config.structuralConfidence);
    for (const [taskId, content] of batch.contents) contents.set(taskId, content);
    result.contentFallbacks = batch.fallbacks;
  }

  // ── Route each task ─────────────────────────────────────────────────────
  const configHash = hashConfig(config);
  for (const { task, positional } of positionals) {
    const numerical = produceNumerical(task, catalog.vocabulary);
    const content = contents.get(task.id)
      ?? produceContentStructural(task, positional, config.structuralConfidence);
    const requirement = { content, positional, numerical };
    const evidence = collectSkillTaskEvidence(projectRoot, {
      ...task,
      routingMeta: { ...task.routingMeta, workType: content.workType },
    });
    const taskSkills: RouteCatalog['skills'][number][] = resolvedSkills.map(skill => {
      const applicability = evaluateSkillApplicability(skill.applicability.profile, evidence);
      if (!applicability.admitted) {
        result.skillRejections.push({
          taskId: task.id,
          skillId: skill.skillId,
          reason: applicability.reason,
          detail: applicability.detail,
          source: skill.entry ? 'catalog' : 'pool',
        });
      }
      return {
        skillId: skill.skillId,
        profile: skill.profile,
        applicability,
        profileDigest: skill.profileDigest,
        packageDigest: skill.packageDigest,
        applicabilityDigest: skill.applicability.digest,
        provenance: skill.provenance,
        tokenCost: skill.tokenCost,
      };
    });
    const taskCatalog: RouteCatalog = { ...catalog, skills: taskSkills };

    try {
      const decision = await routeTaskV3(task, taskCatalog, {
        config,
        policies,
        cells,
        requirement,
        ...(task.forceAgent ? { forceAgentId: task.forceAgent } : {}),
        ...(options.excludeAgentIds ? { excludeAgentIds: options.excludeAgentIds } : {}),
        skillContext: {
          evidenceDigest: evidence.digest,
          catalogDigest: skillCatalogDigest,
          ...(task.forceSkills ? { forceSkillIds: task.forceSkills } : {}),
          ...(task.excludeSkills ? { excludeSkillIds: task.excludeSkills } : {}),
        },
        // K3 (581): ε-tie yargıcı — content-LLM'in aynı complete-seam'i üzerinden;
        // seam yoksa (deterministik/test ortamı) engine fail-open top-1 kalır.
        ...(options.complete ? { tieJudge: makeCompleteTieJudge(options.complete) } : {}),
      });

      task.assignedAgent = decision.agentId;
      // Force/exclude directives were already resolved inside the hard-gated
      // composition receipt. A post-decision union would bypass applicability.
      task.assignedSkills = [...decision.skillIds];
      const storyWorkType = decision.story.steps[0]?.detail['workType'];
      const dominantDomain = positional.domains.reduce<
        (typeof positional.domains)[number] | undefined
      >(
        (strongest, domain) =>
          strongest === undefined || domain.weight > strongest.weight ? domain : strongest,
        undefined,
      )?.id;
      task.routingMeta = {
        routingVersion: 'v3',
        workType: requirement?.content.workType
          ?? (typeof storyWorkType === 'string' ? storyWorkType : 'build'),
        confidence: decision.confidence,
        provenance: decision.provenance,
        personaSlices: decision.personaSlices,
        storySummary: decision.story.summary,
        skillEvidenceDigest: evidence.digest,
        skillCatalogDigest,
        skillDecisionDigest: digestJson(decision),
        ...(dominantDomain ? { dominantDomain } : {}),
        ...(decision.escalation ? { escalation: decision.escalation.reason } : {}),
      };
      result.routed.push(task.id);

      if (decision.escalation) {
        result.escalations.push({
          taskId: task.id,
          reason: decision.escalation.reason,
          detail: decision.story.summary,
          candidates: decision.escalation.candidates.map((c) => ({
            agentId: c.agentId,
            finalScore: c.finalScore,
          })),
        });
      }

      if (options.journal !== false) {
        try {
          appendDecision(projectRoot, {
            schemaVersion: 2,
            taskId: task.id,
            sprintId: options.sprintId ?? null,
            recordedAt: new Date().toISOString(),
            requirement,
            configHash,
            catalog: Object.fromEntries(agents.map((a) => [a.agentId, a.capabilities])),
            skillCatalog: taskSkills.map(skill => ({
              skillId: skill.skillId,
              profile: skill.profile,
              applicability: skill.applicability,
              profileDigest: skill.profileDigest,
              packageDigest: skill.packageDigest,
              applicabilityDigest: skill.applicabilityDigest,
              provenance: skill.provenance,
              tokenCost: skill.tokenCost,
            })),
            skillCatalogDigest,
            skillEvidence: { ...evidence },
            skillEvidenceDigest: evidence.digest,
            decision,
          });
        } catch (err) {
          result.journalFailures += 1;
          debugLog('routing-plan-adapter:journal', err);
        }
      }
    } catch (err) {
      if (err instanceof SkillSelectionHoldError) {
        result.escalations.push({
          taskId: task.id,
          reason: 'skill-selection-hold',
          detail: err.message,
          candidates: [],
        });
        continue;
      }
      if (err instanceof CatalogGapError) {
        // Honest gap: task stays UNASSIGNED; the plan gate blocks with this
        // escalation in front of the Brain/Alperen (decision-5).
        result.escalations.push({
          taskId: task.id,
          reason: 'catalog-gap',
          detail: err.message,
          candidates: [],
        });
        continue;
      }
      throw err;
    }
  }

  return result;
}

// ─── Single-task V3 routing (S3 cut-over: the V2 single-task paths) ──────────

export interface RouteSingleTaskV3Result {
  agentId: string;
  skillIds: string[];
  confidence: number;
  workType: string;
  escalation: string | null;
  storySummary: string;
}

/**
 * 587-001 FORCE-PRESERVING-MERGE — the single V3 assignment rule.
 *
 * Both V3 write sites (`routeTasksV3ForPlan` above and task-mode-runner's
 * direct `routeSingleTaskV3` call) used to do a WHOLESALE overwrite —
 * `task.assignedSkills = <v3 ids>` — which silently erased an operator's
 * `- Skills:` directive whenever the router did not happen to pick the same
 * ids. Every V3 write goes through this merge instead:
 *
 *   final = forceSkills ++ (v3 decision \ excludeSkills)   — deduped, force first
 *
 * `excludeSkills` prunes ONLY router-derived ids: an explicit force beats an
 * explicit exclude for the same id, because a directive force is the strongest
 * operator signal on the record. That is the same precedence as
 * `applySkillDirectiveAuthority` (task-builder.ts), which stays the downstream
 * render-time authority — this merge is idempotent under it.
 */
export function mergeForcePreservingSkillIds(
  task: Pick<Task, 'forceSkills' | 'excludeSkills'>,
  routedSkillIds: readonly string[],
): string[] {
  const forced = task.forceSkills ?? [];
  const forcedSet = new Set(forced);
  const excluded = new Set((task.excludeSkills ?? []).filter((id) => !forcedSet.has(id)));

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of forced) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of routedSkillIds) {
    if (seen.has(id) || excluded.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/**
 * Route ONE task through V3 (structural content — single-task paths never pay
 * an LLM call). Used by `deckent run`, task-mode-runner and mid-sprint
 * re-routing after the V2 engine's removal. CatalogGapError propagates (the
 * caller surfaces it; there is no fallback chain).
 */
export async function routeSingleTaskV3(
  task: Task,
  projectRoot: string,
): Promise<RouteSingleTaskV3Result> {
  // force-* rides task.forceAgent (routeTasksV3ForPlan threads it into the
  // pipeline's verifier-checked force path).
  const result = await routeTasksV3ForPlan(
    [task],
    projectRoot,
    (await import('../core/routing/config.js')).resolveRoutingV3Config(null, {}),
  );
  const meta = task.routingMeta;
  if (!task.assignedAgent) {
    // routeTasksV3ForPlan leaves gap tasks unassigned and reports the
    // escalation; single-task callers need the typed error directly.
    const esc = result.escalations[0];
    const { CatalogGapError: GapErr } = await import('../core/routing/verifier.js');
    throw new GapErr(meta?.workType ?? 'build', [], [esc?.detail ?? 'no capable agent']);
  }
  return {
    agentId: task.assignedAgent,
    skillIds: task.assignedSkills ?? [],
    confidence: typeof meta?.confidence === 'number' ? meta.confidence : 0,
    workType: meta?.workType ?? 'build',
    escalation: meta?.escalation ?? null,
    storySummary: meta?.storySummary ?? '',
  };
}
