// ─── ROUTING-V3 plan-time adapter (Slice-2 integration) ──────────────────────
// Hand-coded (Brain 2026-07-15). Bridges the sprint-planner to routeTaskV3.
// S3 cut-over (2026-07-15): the planner calls this unconditionally — it IS the
// production routing path; the V2 engine was removed. One LLM batch enriches every task's content axis
// (content-llm.ts); matching/verification stays deterministic; escalations
// and catalog gaps are RETURNED for the plan surface (decision-5: the Brain —
// and the plan preview in front of Alperen — decides; nothing silent).

import { AgentPoolManager } from '../core/agent-pool.js';
import { snapshotSkillCatalog } from '../core/skill-pool.js';
import type { EffectiveSkill, SkillDispositionState } from '../core/skill-pool.js';
import { deriveCanonicalSkillProfile } from '../core/skill-profile-derivation.js';
import type { SkillDefinition, SkillProfileDerivation } from '../core/skill-types.js';
import { validateCapabilities } from '../core/routing/capability-vector.js';
import type { SkillProfile } from '../core/routing/capability-vector.js';
import { loadVocabulary } from '../core/routing/vocabulary.js';
import { loadPolicyPacks } from '../core/routing/policy-pack.js';
import { readCellsSnapshot } from '../core/routing/learning-cells.js';
import type { CellStat } from '../core/routing/axis-numerical.js';
import { producePositional, produceNumerical } from '../core/routing/requirement-vector.js';
import { produceContentBatchLLM } from '../core/routing/content-llm.js';
import type { CompleteFn } from '../core/routing/content-llm.js';
import { makeCompleteTieJudge } from '../core/routing/tie-judge.js';
import { routeTaskV3 } from '../core/routing/route-task-v3.js';
import type { RouteCatalog } from '../core/routing/route-task-v3.js';
import { CatalogGapError } from '../core/routing/verifier.js';
import { appendDecision, hashConfig } from '../core/routing/journal.js';
import type { RoutingV3Config } from '../core/config-types.js';
import type { Task } from '../core/task-types.js';
import { debugLog } from '../core/utils.js';

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
  | 'invalid-profile';

export interface RouteTasksV3SkillRejection {
  skillId: string;
  reason: SkillRoutingRejectionReason;
  /** Human-readable evidence behind the reason (diagnostic code + message). */
  detail: string;
  /** Which candidate source the row came from — catalog projection or in-memory pool. */
  source: 'catalog' | 'pool';
}

/** One skill as the eligibility rule sees it, independent of where it came from. */
interface SkillEligibilityCandidate {
  skillId: string;
  dispositionState: SkillDispositionState;
  masked: boolean;
  routing: SkillProfileDerivation;
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
  return { admitted: true, skillId, profile: candidate.routing.profile };
}

export type SkillRoutingCandidateSource =
  | { source: 'catalog'; entries: readonly EffectiveSkill[] }
  | { source: 'pool'; definitions: Iterable<SkillDefinition> };

export interface SkillRoutingSelection {
  skills: Array<{ skillId: string; profile: SkillProfile }>;
  rejections: RouteTasksV3SkillRejection[];
}

/**
 * Partition a skill source into V3 candidates and typed rejections. Every input
 * row lands in exactly one of the two arrays — that total is the anti-silent-skip
 * invariant the routing surface is judged on.
 */
export function selectRoutableSkills(input: SkillRoutingCandidateSource): SkillRoutingSelection {
  const candidates: SkillEligibilityCandidate[] =
    input.source === 'catalog'
      ? input.entries.map((entry) => ({
          skillId: entry.id,
          dispositionState: entry.disposition.state,
          masked: entry.masked,
          routing: entry.routing,
        }))
      : [...input.definitions].map((definition) => ({
          skillId: definition.id,
          // An in-memory pool row has no disposition ledger behind it, so the
          // same rule `resolveSkillCatalog` applies to a manifest applies here.
          dispositionState: definition.enabled === false ? 'disabled' : 'active',
          masked: false,
          routing: deriveCanonicalSkillProfile(definition),
        }));

  const selection: SkillRoutingSelection = { skills: [], rejections: [] };
  for (const candidate of candidates) {
    const verdict = evaluateSkillRoutingEligibility(candidate);
    if (verdict.admitted) {
      selection.skills.push({ skillId: verdict.skillId, profile: verdict.profile });
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
  const selection = options.pools?.skills
    ? selectRoutableSkills({ source: 'pool', definitions: options.pools.skills.values() })
    : selectRoutableSkills({ source: 'catalog', entries: snapshotSkillCatalog(projectRoot).entries });
  const skills: RouteCatalog['skills'][number][] = selection.skills;
  result.skillRejections = selection.rejections;
  for (const rejection of selection.rejections) {
    debugLog(
      'routing-plan-adapter:skill-rejected',
      `${rejection.skillId} (${rejection.source}): ${rejection.reason} — ${rejection.detail}`,
    );
  }

  const vocabulary = await loadVocabulary(projectRoot);
  const catalog: RouteCatalog = {
    agents,
    skills,
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
    const content = contents.get(task.id);
    const requirement = content ? { content, positional, numerical } : undefined;

    try {
      const decision = await routeTaskV3(task, catalog, {
        config,
        policies,
        cells,
        ...(requirement ? { requirement } : {}),
        ...(task.forceAgent ? { forceAgentId: task.forceAgent } : {}),
        ...(options.excludeAgentIds ? { excludeAgentIds: options.excludeAgentIds } : {}),
        // K3 (581): ε-tie yargıcı — content-LLM'in aynı complete-seam'i üzerinden;
        // seam yoksa (deterministik/test ortamı) engine fail-open top-1 kalır.
        ...(options.complete ? { tieJudge: makeCompleteTieJudge(options.complete) } : {}),
      });

      task.assignedAgent = decision.agentId;
      task.assignedSkills = [...decision.skillIds];
      const storyWorkType = decision.story.steps[0]?.detail['workType'];
      task.routingMeta = {
        routingVersion: 'v3',
        workType: requirement?.content.workType
          ?? (typeof storyWorkType === 'string' ? storyWorkType : 'build'),
        confidence: decision.confidence,
        provenance: decision.provenance,
        personaSlices: decision.personaSlices,
        storySummary: decision.story.summary,
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
            schemaVersion: 1,
            taskId: task.id,
            sprintId: options.sprintId ?? null,
            recordedAt: new Date().toISOString(),
            requirement: requirement ?? {
              content: {
                workType: 'build',
                subtype: null,
                summary: null,
                semanticTags: null,
                provenance: 'structural',
                calibratedConfidence: config.structuralConfidence,
              },
              positional,
              numerical,
            },
            configHash,
            catalog: Object.fromEntries(agents.map((a) => [a.agentId, a.capabilities])),
            decision,
          });
        } catch (err) {
          debugLog('routing-plan-adapter:journal', err);
        }
      }
    } catch (err) {
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
    { journal: false },
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
