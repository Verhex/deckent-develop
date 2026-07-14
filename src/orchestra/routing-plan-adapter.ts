// ─── ROUTING-V3 plan-time adapter (Slice-2 integration) ──────────────────────
// Hand-coded (Brain 2026-07-15). Bridges the sprint-planner to routeTaskV3
// behind `routing_v3.enabled` (default FALSE — V2 stays production until the
// Slice-3 cut-over). One LLM batch enriches every task's content axis
// (content-llm.ts); matching/verification stays deterministic; escalations
// and catalog gaps are RETURNED for the plan surface (decision-5: the Brain —
// and the plan preview in front of Alperen — decides; nothing silent).

import { AgentPoolManager } from '../core/agent-pool.js';
import { SkillPoolManager } from '../core/skill-pool.js';
import { validateCapabilities, validateSkillProfile } from '../core/routing/capability-vector.js';
import { loadVocabulary } from '../core/routing/vocabulary.js';
import { loadPolicyPacks } from '../core/routing/policy-pack.js';
import { readCellsSnapshot } from '../core/routing/learning-cells.js';
import type { CellStat } from '../core/routing/axis-numerical.js';
import { producePositional, produceNumerical } from '../core/routing/requirement-vector.js';
import { produceContentBatchLLM } from '../core/routing/content-llm.js';
import type { CompleteFn } from '../core/routing/content-llm.js';
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
  const result: RouteTasksV3Result = { routed: [], escalations: [], contentFallbacks: [] };

  // ── Catalog ────────────────────────────────────────────────────────────
  const pool = new AgentPoolManager(projectRoot).loadAgents();
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

  const skillPool = new SkillPoolManager(projectRoot).loadSkills();
  const skills: RouteCatalog['skills'][number][] = [];
  for (const skill of skillPool.values()) {
    const profile = (skill as unknown as Record<string, unknown>)['profile'];
    const validation = profile ? validateSkillProfile(profile) : null;
    if (!validation?.ok) continue;
    skills.push({ skillId: skill.id, profile: validation.value });
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
      });

      task.assignedAgent = decision.agentId;
      task.assignedSkills = [...decision.skillIds];
      // routingMeta's declared type is V2-shaped ('v2' literal + string
      // confidence); V3 writes its own richer record through the untyped
      // channel until the Slice-3 cut-over retypes the field.
      (task as unknown as { routingMeta?: unknown }).routingMeta = {
        routingVersion: 'v3',
        workType: requirement?.content.workType ?? decision.story.steps[0]?.detail['workType'] ?? 'build',
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
  const meta = (task as unknown as { routingMeta?: { workType?: string; confidence?: number; escalation?: string; storySummary?: string } }).routingMeta;
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
    confidence: meta?.confidence ?? 0,
    workType: meta?.workType ?? 'build',
    escalation: meta?.escalation ?? null,
    storySummary: meta?.storySummary ?? '',
  };
}
