// ─── Routing Engine v2 ──────────────────────────────────────────────────────
// Layer 3: The main routing orchestrator.
// Replaces selectAgent() + selectSkills() with a unified, intent-based decision.

import type { TaskScope } from './task-types.js';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import type { SkillDefinition } from './skill-types.js';
import type {
  TaskDNA,
  RoutingDecision,
  RoutingEngineConfig,
  UserOverride,
  LearningBonus,
  SkillBudget,
  ConfidenceLevel,
  ActivationConfig,
  OverrideSource,
  IntentType,
} from './routing-types.js';
import {
  createDefaultRoutingEngineConfig,
  SKILL_BUDGET_BY_SIZE,
  LEARNING_BONUS_CAP,
  DEFAULT_TOKEN_BUDGET_PER_SKILL,
  DEFAULT_TOKEN_BUDGET_TOTAL,
  SKILL_TOKEN_BUDGET_BY_EFFORT,
} from './routing-types.js';
import { classifyIntent } from './intent-classifier.js';
import { evaluateActivation, migrateV1AgentToActivation, migrateV1SkillToActivation, getDynamicExclusions } from './activation-engine.js';
import type { SkillAffinityContext } from './activation-engine.js';
import { AgentSelectionCache } from './agent-cache.js';
import { analyzeSkillInMemory } from '../orchestra/ecosystem-intelligence.js';
import { resolveComposition } from './skill-selector.js';
import { modelRegistry } from './model-registry.js';
import { normalizeTechStack, taskKindToIntent } from './work-model.js';
import type { TaskKind, TechStackKind } from './work-model.js';
import { getAgentDomain, getAgentRole, type AgentDomain, type AgentRole } from './agent-pool.js';
import { debugLog } from './utils.js';

// ─── Agent Fallback Chain ──────────────────────────────────────────────────

/**
 * Intent-based agent fallback chain.
 * When no agent meets the activation score threshold, this chain provides
 * deterministic agent selection based on the task's primary intent.
 * Post-Sprint-148: test-writer removed, testing tasks route to architect/refactorer.
 */
export const AGENT_FALLBACK_CHAIN: Record<IntentType, string[]> = {
  'implementation': ['architect', 'refactorer'],
  'bugfix': ['bug-fixer', 'refactorer'],
  'refactor': ['refactorer', 'architect'],
  'documentation': ['doc-writer'],
  'security': ['security-auditor'],
  'devops': ['devops-engineer', 'architect'],
  'config': ['architect', 'refactorer'],
  'performance': ['performance-analyzer', 'architect'],
  'design': ['frontend-designer'],
  'migration': ['migration-specialist', 'architect'],
  'architecture': ['architecture-planner', 'architect'],
  'unknown': ['architect'],
};

/**
 * Select an agent using the fallback chain when no agent met activation threshold.
 * Iterates the chain for the given intent, returning the first agent that exists
 * in the active agent IDs set.
 *
 * @param primary - The task's primary intent type
 * @param activeAgentIds - Set of currently active (enabled) agent IDs
 * @returns The selected agent ID (defaults to 'architect' as ultimate fallback)
 */
export function selectAgentByFallback(
  primary: IntentType,
  activeAgentIds: Set<string>,
): string {
  const chain = AGENT_FALLBACK_CHAIN[primary] ?? ['architect'];
  for (const agentId of chain) {
    if (activeAgentIds.has(agentId)) return agentId;
  }
  return 'architect'; // ultimate fallback
}

// ─── Domain-Match Bonus (Sprint 209 — Task 209-002) ────────────────────────
//
// Multi-signal scoring fix. Until Sprint 209, agent selection used only
// activation-rule score; refactorer's `intent.primary === 'implementation'`
// rule (score 7) tied or beat every domain-specialized agent in the pool,
// so api/security/devops tasks were all routed to refactorer.
//
// This adds a +DOMAIN_MATCH_BONUS boost when an agent's domain aligns
// with the task — either via the task's intent (security task →
// security-domain agent) or via a path-extracted domain name (src/api/ →
// api-builder). Refactorer/architect still receive impl@7; the bonus
// only adds a tiebreaker for domain-specialists.

/** Score added when an agent's domain matches the task's intent or
 *  one of its path-extracted domain names. Sized to match the skill
 *  `stackBonus` so a domain-specialist + activation rule beats a
 *  generic-impl candidate that has only `impl@7`. */
export const DOMAIN_MATCH_BONUS = 3;

/**
 * WM-7 routing dual — soft penalty for a language-category skill whose language
 * does NOT match the confidently-detected project stack (e.g. typescript-expert
 * on a Go project). Sized to drop a typical mis-routed language skill below
 * `skillMinScore` (3) while letting a very strongly task-signalled skill survive
 * (polyglot-safe). Soft, score-based; `- Skills:` overrides bypass routing.
 */
export const LANGUAGE_MISMATCH_PENALTY = 6;

/** Map task intent → the agent domain that should be boosted. Only
 *  intents that map cleanly to an existing built-in agent domain are
 *  listed; anything else (implementation, refactor, bugfix, …) yields
 *  no domain bonus and falls through to standard scoring. */
export const INTENT_TO_AGENT_DOMAIN: Partial<Record<IntentType, AgentDomain>> = {
  security: 'security',
  devops: 'devops',
  design: 'react',
  documentation: 'doc',
  migration: 'data',
};

/** Map a path-extracted task domain name (TaskDNA.domains[].name) →
 *  the specific built-in agent that owns that domain. Used when the
 *  task intent itself doesn't carry the signal — e.g. an api task is
 *  classified as `implementation` intent, but its `src/api/` scope
 *  populates TaskDNA.domains with `api`, which is the routing hook. */
export const TASK_DOMAIN_TO_AGENT_ID: Readonly<Record<string, string>> = {
  api: 'api-builder',
  auth: 'security-auditor',
  dashboard: 'frontend-designer',
  components: 'frontend-designer',
  ui: 'frontend-designer',
  db: 'data-engineer',
  database: 'data-engineer',
  models: 'data-engineer',
  schemas: 'data-engineer',
  docker: 'devops-engineer',
  kubernetes: 'devops-engineer',
  k8s: 'devops-engineer',
  helm: 'devops-engineer',
};

/** ROUTE-1 B2 — intents that mark a task as a TOUCH-UP rather than a surface build.
 *  For these the path-extracted domain proxy + user-surface bonus are suppressed so a
 *  comment-sweep / doc edit touching src/api/ is not hijacked by api-builder. The
 *  intent-driven domain bonus (INTENT_TO_AGENT_DOMAIN, path 1) is NOT affected. */
const SURFACE_SUPPRESS_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>(['refactor', 'documentation']);

/** ROUTE-1 B2 — canonical TaskKinds (medium axis) that also suppress the path proxy. */
const SURFACE_SUPPRESS_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>(['audit', 'documentation']);

/**
 * True when the task is genuinely building/extending its surface — path-proxy and
 * user-surface bonuses apply. False for touch-up / non-build work (bonuses suppressed).
 * OR semantics: suppression fires on either the operation arm (intent) or the medium
 * arm (taskKind), so a code-development-medium refactor-operation is still suppressed.
 */
export function isSurfaceBuildTask(intent: IntentType, taskKind?: TaskKind): boolean {
  if (SURFACE_SUPPRESS_INTENTS.has(intent)) return false;
  if (taskKind !== undefined && SURFACE_SUPPRESS_KINDS.has(taskKind)) return false;
  return true;
}

/**
 * Return the domain-match bonus for an agent against a task's DNA.
 *
 * Two match paths, either one yields +DOMAIN_MATCH_BONUS (no doubling):
 *   1. Intent-to-domain: the task's primary intent maps to an agent
 *      domain in INTENT_TO_AGENT_DOMAIN, and the agent's domain matches.
 *   2. Task-domain-to-agent: the agent id appears in
 *      TASK_DOMAIN_TO_AGENT_ID for one of the task's extracted domain
 *      names.
 *
 * @param agentId        The agent id being scored.
 * @param agentDomain    The agent's domain (from getAgentDomain).
 * @param taskDNA        The classified task.
 * @param allowPathProxy When false, path 2 (domain-name proxy) is suppressed;
 *                       path 1 (intent-driven) always runs. Defaults to true so
 *                       existing 3-arg callers are byte-for-byte unchanged.
 * @returns DOMAIN_MATCH_BONUS on match, 0 otherwise.
 */
export function getDomainMatchBonus(
  agentId: string,
  agentDomain: AgentDomain | 'generic',
  taskDNA: TaskDNA,
  allowPathProxy: boolean = true,
): number {
  // Path 1: intent → agent domain (intent-driven, always honoured).
  const targetDomain = INTENT_TO_AGENT_DOMAIN[taskDNA.intent.primary];
  if (targetDomain && agentDomain === targetDomain) {
    return DOMAIN_MATCH_BONUS;
  }

  // Path 2: extracted task domain name → specific agent id (path proxy, gated).
  if (allowPathProxy) {
    for (const domain of taskDNA.domains) {
      const expectedAgent = TASK_DOMAIN_TO_AGENT_ID[domain.name.toLowerCase()];
      if (expectedAgent && expectedAgent === agentId) {
        return DOMAIN_MATCH_BONUS;
      }
    }
  }

  return 0;
}

/**
 * User-surface routing (Sprint 216-003; reconstructed Sprint 218 after a
 * `git reset --hard` wiped the original). A user-facing surface (cli / dashboard
 * / api / serve / e2e harness) must route to its surface-owner agent, not
 * collapse to refactorer's generic impl@7. The bonus (8) clears refactorer's 7
 * even when the agent's own activation rule does not fire (e.g. api-builder's
 * `domains $contains 'api'` rule is silent for a `cli` domain).
 */
export const USER_SURFACE_BONUS = 8;

/** Surface domain name (from TaskDNA.domains/tags) → owning agent id. */
export const SURFACE_DOMAIN_TO_AGENT_ID: Readonly<Record<string, string>> = {
  cli: 'api-builder',
  commands: 'api-builder',
  serve: 'api-builder',
  api: 'api-builder',
  dashboard: 'frontend-designer',
  components: 'frontend-designer',
  ui: 'frontend-designer',
  e2e: 'ci-guardian',
  harness: 'ci-guardian',
};

/** Agents eligible for the user-surface bonus (surface owners). */
export const USER_SURFACE_AGENTS: ReadonlySet<string> = new Set([
  'api-builder',
  'frontend-designer',
  'ci-guardian',
]);

/**
 * Returns USER_SURFACE_BONUS when `agentId` is the surface owner of one of the
 * task's surface domains/tags, else 0. Non-surface agents (refactorer, …) never
 * receive it — that is the anti-collapse guarantee.
 */
export function getUserSurfaceBonus(agentId: string, taskDNA: TaskDNA): number {
  if (!USER_SURFACE_AGENTS.has(agentId)) return 0;
  const signals = [
    ...taskDNA.domains.map((d) => d.name.toLowerCase()),
    ...((taskDNA.tags ?? []) as string[]).map((t) => String(t).toLowerCase()),
  ];
  // Security/auth tasks belong to security-auditor even when they touch
  // `src/api/` — the surface bonus must NOT divert them to api-builder.
  const hasSecuritySignal =
    taskDNA.intent.primary === 'security' ||
    signals.some((s) => s === 'auth' || s === 'security' || s === 'rbac');
  if (hasSecuritySignal && agentId === 'api-builder') return 0;
  for (const s of signals) {
    if (SURFACE_DOMAIN_TO_AGENT_ID[s] === agentId) return USER_SURFACE_BONUS;
  }
  return 0;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoutingOptions {
  projectStack?: { language: string; framework: string; dependencies: string[] } | null;
  overrides?: UserOverride[];
  learningData?: LearningBonus[];
  config?: Partial<RoutingEngineConfig>;
  /** Task effort level for dynamic skill token budget calculation */
  effort?: 'low' | 'normal' | 'high';
  /** Sprint ID for decision trail persistence */
  sprintId?: string;
  /** Task ID for decision trail persistence */
  taskId?: string;
  /** Project root for decision trail persistence */
  projectRoot?: string;
  /** Estimated token count for the task's full worker prompt (from estimateTaskContextBudget) */
  estimatedTokens?: number;
  /** Model ID assigned to the task — used for context budget fit assessment */
  modelId?: string;
  /** Set of active agent IDs for fallback chain resolution */
  activeAgentIds?: Set<string>;
  /**
   * Enable skill→agent affinity bonus (ADR-075). Default-off.
   * When true, agents receive SKILL_AGENT_AFFINITY_BONUS when an assigned skill
   * maps to them in SKILL_AGENT_MAP. Skills are selected BEFORE agent selection
   * (skill-first ordering) so the affinity signal is always available.
   */
  skillAgentAffinity?: boolean;
  /**
   * Enable agent selection cache. Default-off.
   * When true, selectBestAgent results are memoized via agentSelectionCache.
   * Cache key includes selected skill IDs so affinity-on cache is correct.
   * Call agentSelectionCache.clear() when pool or config changes.
   */
  agentCache?: boolean;
}

// ─── Agent Selection Cache (module-level singleton) ─────────────────────────
//
// Exported so callers can call .clear() when the agent pool or routing config
// changes (pool/config-change invalidation — required by agentCache flag semantics).
// Default-off (agentCache option must be true for it to be used).

export const agentSelectionCache = new AgentSelectionCache();

interface ScoredCandidate {
  id: string;
  rawScore: number;
  learningBonus: number;
  finalScore: number;
  matchedRules: string[];
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Route a task to the best agent + skills using the v2 intent-based engine.
 *
 * Skill-first ordering (Sprint 324-007): skills are selected BEFORE the agent so
 * the assigned skill IDs are available as an affinity signal for agent scoring
 * (`skillAgentAffinity` flag, default-off). When both flags are off the routing
 * output is byte-identical to the pre-reorder behavior.
 */
export function routeTaskV2(
  task: { title: string; description: string; scope: TaskScope; type?: TaskKind },
  agentPool: AgentPool,
  skillPool: Map<string, SkillDefinition>,
  options?: RoutingOptions,
): RoutingDecision {
  const cfg = { ...createDefaultRoutingEngineConfig(), ...options?.config };
  const overrides = options?.overrides ?? [];
  const learningData = options?.learningData ?? [];
  const reasoning: string[] = [];
  const overrideWarnings: string[] = [];
  const skillAgentAffinityEnabled = options?.skillAgentAffinity ?? false;
  const agentCacheEnabled = options?.agentCache ?? false;

  // Step 1: Classify task intent
  const taskDNA = classifyIntent(task);
  reasoning.push(`Intent: ${taskDNA.intent.primary} (confidence: ${taskDNA.intent.confidence})`);

  // ROUTE-1 B3 — when the keyword classifier cannot resolve an intent, fall back to the
  // canonical TaskKind SSOT (scope-shape) instead of 'unknown'. Confident classifications
  // are never overridden — the operation axis outranks the medium axis.
  if (taskDNA.intent.primary === 'unknown' && task.type !== undefined) {
    const kindIntent = taskKindToIntent(task.type);
    if (kindIntent !== 'unknown') {
      taskDNA.intent.primary = kindIntent;
      taskDNA.intent.confidence = 0.5; // SSOT-derived intent — modest confidence, not classifier-certain
      reasoning.push(`Intent from TaskKind SSOT: ${kindIntent} (task.type=${task.type})`);
    }
  }

  // Step 2: Resolve user overrides
  const resolved = resolveOverrides(overrides);
  let overrideSource: OverrideSource = 'none';
  if (resolved.forceAgent || resolved.forceSkills) {
    overrideSource = overrides[0]?.source ?? 'task-directive';
  }

  // Step 3: Calculate skill budget (effort-aware token allocation)
  // Moved before agent selection so skill IDs are available as affinity signal.
  const skillBudget = calculateSkillBudget(taskDNA, cfg, options?.effort);
  reasoning.push(`Skill budget: max ${skillBudget.maxSkills} (${skillBudget.reason})`);

  // Step 4: Select skills (skill-first — before agent, for affinity signal)
  let skillIds: string[] = [];
  const skillScores = new Map<string, number>();
  let skillConfidence: ConfidenceLevel = 'uncertain';

  if (resolved.forceSkills !== undefined) {
    // forceSkills=[] means "Skills: none" (explicit no-skills directive), respect it
    skillIds = resolved.forceSkills;
    for (const id of skillIds) skillScores.set(id, 100);
    skillConfidence = skillIds.length > 0 ? 'high' : 'uncertain';
    reasoning.push(
      skillIds.length > 0
        ? `Skills forced by override: [${skillIds.join(', ')}]`
        : 'Skills cleared by override (none)',
    );
  } else {
    const skillResult = selectBestSkills(
      taskDNA, skillPool, cfg, learningData,
      resolved.excludeSkills ?? [], skillBudget,
      options?.projectStack ?? null, task.type,
    );
    skillIds = skillResult.skillIds;
    for (const [id, score] of skillResult.scores) skillScores.set(id, score);
    skillConfidence = skillResult.confidence;
    reasoning.push(...skillResult.reasoning);
  }

  // Step 5: Select agent (receives selected skill IDs for optional affinity scoring)
  let agentId: string | null = null;
  let agentScore = 0;
  let agentConfidence: ConfidenceLevel = 'uncertain';

  if (resolved.forceAgent) {
    agentId = resolved.forceAgent;
    agentScore = 100;
    agentConfidence = 'high';
    reasoning.push(`Agent forced by override: ${agentId}`);

    // F8 (Sprint 182): Semantic check — run activation rules on the forced agent
    // against TaskDNA. If the score is below `forceAgentWarnRatio * agentMinScore`
    // emit an advisory warning. Override is still honored (PLAN continues).
    const semanticWarning = evaluateForceAgentSemantic(
      resolved.forceAgent,
      taskDNA,
      agentPool,
      cfg,
    );
    if (semanticWarning) {
      overrideWarnings.push(semanticWarning);
      reasoning.push(`Override warning: ${semanticWarning}`);
    }
  } else {
    // Compute dynamic exclusions based on intent + scope (replaces hard-coded global exclusions)
    const dynamicExclusions = getDynamicExclusions(
      taskDNA.intent.primary,
      task.scope.directories,
    );
    const allExcludeAgents = [...new Set([...(resolved.excludeAgents ?? []), ...dynamicExclusions])];
    if (dynamicExclusions.length > 0) {
      reasoning.push(`Dynamic exclusions: [${dynamicExclusions.join(', ')}]`);
    }

    // Cache key (computed once, reused for lookup + store if agentCacheEnabled)
    const cacheKey = agentCacheEnabled
      ? agentSelectionCache.taskSignature({
          title: task.title,
          description: task.description,
          scope: { directories: task.scope.directories, filesWrite: task.scope.filesWrite },
          taskType: task.type,
          assignedSkills: skillIds,
        })
      : undefined;

    // Cache lookup (flag-gated, default-off)
    let cacheHit = false;
    if (cacheKey !== undefined) {
      const cached = agentSelectionCache.get(cacheKey);
      if (cached) {
        agentId = cached.agentId || null;
        agentScore = cached.score;
        agentConfidence = (cached.confidence ?? 'uncertain') as ConfidenceLevel;
        reasoning.push('[agent-cache hit]', ...(cached.reasoningLines ?? []));
        cacheHit = true;
      }
    }

    if (!cacheHit) {
      const agentResult = selectBestAgent(
        taskDNA, agentPool, cfg, learningData, allExcludeAgents, task.type,
        skillIds, skillAgentAffinityEnabled,
      );
      agentId = agentResult.agentId;
      agentScore = agentResult.score;
      agentConfidence = agentResult.confidence;
      reasoning.push(...agentResult.reasoning);

      // Store in cache when enabled and an agent was found (skip null — let fallback handle it)
      if (cacheKey !== undefined && agentId !== null) {
        agentSelectionCache.cache(cacheKey, {
          agentId,
          score: agentScore,
          reason: 'agent-cache',
          confidence: agentConfidence,
          reasoningLines: agentResult.reasoning,
        });
      }

      // Fallback chain if no agent met threshold
      if (agentId === null && options?.activeAgentIds) {
        agentId = selectAgentByFallback(taskDNA.intent.primary, options.activeAgentIds);
        agentScore = 50; // fallback score
        agentConfidence = 'low';
        reasoning.push(`Agent fallback chain: '${agentId}' (intent=${taskDNA.intent.primary})`);
      } else if (agentId === null) {
        // No activeAgentIds provided — use static fallback
        const chain = AGENT_FALLBACK_CHAIN[taskDNA.intent.primary] ?? ['architect'];
        agentId = chain[0] ?? 'architect';
        agentScore = 50;
        agentConfidence = 'low';
        reasoning.push(`Agent static fallback: '${agentId}' (intent=${taskDNA.intent.primary})`);
      }
    }
  }

  // Step 6: Context budget fit assessment
  const contextFit = assessContextFit(options?.estimatedTokens, options?.modelId, reasoning);

  return {
    agentId,
    agentScore,
    agentConfidence,
    skillIds,
    skillScores,
    skillConfidence,
    overrideSource,
    taskDNA,
    reasoning,
    contextFit,
    routingVersion: 'v3' as const,
    overrideWarnings: overrideWarnings.length > 0 ? overrideWarnings : undefined,
  };
}

// ─── F8: Force-Agent Semantic Check ─────────────────────────────────────────

/**
 * F8 (Sprint 182): Evaluate whether a `forceAgent` override is semantically
 * aligned with the task's intent. Computes the agent's activation score
 * against the task DNA and returns a warning string when the agent is missing,
 * excluded, or scores below `forceAgentWarnRatio * agentMinScore`.
 *
 * Severity: `warn` (locked) — PLAN continues, override is honored.
 *
 * @returns A human-readable warning string, or `null` if the override is
 *   semantically appropriate.
 */
export function evaluateForceAgentSemantic(
  forcedAgentId: string,
  taskDNA: TaskDNA,
  agentPool: AgentPool,
  cfg: RoutingEngineConfig,
): string | null {
  const agent = agentPool.get(forcedAgentId);
  if (!agent) {
    return `forceAgent '${forcedAgentId}' is not registered in the agent pool (intent=${taskDNA.intent.primary})`;
  }
  if (!agent.enabled) {
    return `forceAgent '${forcedAgentId}' is registered but disabled (intent=${taskDNA.intent.primary})`;
  }

  const activation = getAgentActivation(agent);
  const result = evaluateActivation(taskDNA, activation);
  if (result.excluded) {
    return `forceAgent '${forcedAgentId}' is excluded by its own activation rules ` +
      `(reason='${result.excludeReason ?? 'unknown'}', intent=${taskDNA.intent.primary})`;
  }

  const ratio = cfg.forceAgentWarnRatio ?? 0.3;
  const threshold = cfg.agentMinScore * ratio;
  if (result.score < threshold) {
    return `forceAgent '${forcedAgentId}' has low semantic relevance: ` +
      `activation score=${result.score} < threshold=${threshold.toFixed(2)} ` +
      `(agentMinScore=${cfg.agentMinScore} × ratio=${ratio}, intent=${taskDNA.intent.primary}). ` +
      `Override honored; verify this is intentional.`;
  }
  return null;
}

// ─── Agent Selection ────────────────────────────────────────────────────────

/**
 * PCOMP-W5 (persona role signal): the roles a task kind actually needs. An
 * `audit` task wants a reviewer/analyst persona; every other kind ships a diff
 * and wants an implementer. Undefined kind → no opinion (no penalty).
 */
export function getRoleMismatchPenalty(agentRole: AgentRole, taskKind?: TaskKind): number {
  if (!taskKind) return 0;
  const wantsReview = taskKind === 'audit';
  const compatible = wantsReview
    ? agentRole === 'reviewer' || agentRole === 'analyst'
    : agentRole === 'implementer';
  // −3 by design, NOT the analysis' −5 strawman: it exactly cancels the +3
  // domain-match bonus, so a domain-specialized reviewer (today the ONLY agent
  // carrying the `security` domain is the reviewer security-auditor) still
  // competes on activation merit for a security implement-task instead of being
  // hard-excluded in favor of a generic agent with zero domain knowledge. The
  // long-term winning combo is implementer + secure-coding skill (PCOMP-W5b);
  // this signal tips ties that way without degrading today's routing.
  return compatible ? 0 : -3;
}

function selectBestAgent(
  taskDNA: TaskDNA,
  pool: AgentPool,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeAgents: string[],
  taskKind?: TaskKind,
  assignedSkills?: string[],
  skillAgentAffinity?: boolean,
): { agentId: string | null; score: number; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const reasoning: string[] = [];

  // ROUTE-1 B2 — suppress path-proxy + user-surface bonus for touch-up / non-build tasks.
  const buildTask = isSurfaceBuildTask(taskDNA.intent.primary, taskKind);

  for (const [id, agent] of pool) {
    if (!agent.enabled) continue;

    // Sprint 216-003 — user-surface bonus. A surface-owner agent on its own
    // surface (cli/api→api-builder, dashboard→frontend-designer, e2e→ci-guardian)
    // gets +USER_SURFACE_BONUS and BYPASSES excludes (override + activation), so
    // a user-facing task cannot collapse to refactorer's generic impl@7.
    // ROUTE-1 B2: suppressed for non-build tasks (touch-ups, refactor, doc, audit).
    const surfaceBonus = buildTask ? getUserSurfaceBonus(id, taskDNA) : 0;

    if (excludeAgents.includes(id)) {
      if (surfaceBonus > 0) {
        reasoning.push(`Agent '${id}' surface exclude bypass (user-surface owner)`);
      } else {
        reasoning.push(`Agent '${id}' excluded by override`);
        continue;
      }
    }

    // Get activation config (v2 or migrated from v1)
    const activation = getAgentActivation(agent);
    // Skill→agent affinity context (ADR-075, Sprint 324-007). Flag-gated, default-off.
    // When enabled, SKILL_AGENT_AFFINITY_BONUS is added inside evaluateActivation when
    // an assigned skill maps to this agent via SKILL_AGENT_MAP.
    const affinityCtx: SkillAffinityContext | undefined = skillAgentAffinity
      ? { agentId: id, assignedSkills, enabled: true }
      : undefined;
    const result = evaluateActivation(taskDNA, activation, affinityCtx);

    if (result.excluded) {
      if (surfaceBonus > 0) {
        reasoning.push(`Agent '${id}' surface exclude bypass: ${result.excludeReason}`);
      } else {
        reasoning.push(`Agent '${id}' excluded: ${result.excludeReason}`);
        continue;
      }
    }

    // Apply learning bonus
    const bonus = getLearningBonus(id, learningData);

    // Sprint 209 — multi-signal: domain-match bonus so a domain-specialized
    // agent (api-builder / security-auditor / devops-engineer / …) beats
    // the generic refactorer impl@7 candidate. Refactorer/architect still
    // get impl@7; this is purely an additive tiebreaker.
    const domainBonus = getDomainMatchBonus(id, getAgentDomain(agent), taskDNA, buildTask);
    if (domainBonus > 0) {
      reasoning.push(`Agent '${id}' domain-match bonus: +${domainBonus} (intent=${taskDNA.intent.primary}, domains=[${taskDNA.domains.map(d => d.name).join(', ')}])`);
    }
    if (surfaceBonus > 0) {
      reasoning.push(`Agent '${id}' user-surface bonus: +${surfaceBonus} (domains=[${taskDNA.domains.map(d => d.name).join(', ')}])`);
    }

    // PCOMP-W5: role-mismatch signal — a review/analyst persona on an implement
    // task (or vice versa) is the output-format-conflict failure class.
    const rolePenalty = getRoleMismatchPenalty(getAgentRole(agent), taskKind);
    if (rolePenalty !== 0) {
      reasoning.push(`Agent '${id}' role-mismatch penalty: ${rolePenalty} (role=${getAgentRole(agent)}, taskKind=${taskKind})`);
    }

    const finalScore = result.score + bonus + domainBonus + surfaceBonus + rolePenalty;

    if (finalScore >= cfg.agentMinScore) {
      candidates.push({
        id,
        rawScore: result.score + domainBonus + surfaceBonus + rolePenalty,
        learningBonus: bonus,
        finalScore,
        matchedRules: result.matchedRules,
      });
    }
  }

  if (candidates.length === 0) {
    reasoning.push('No agent met minimum score threshold');
    return { agentId: null, score: 0, confidence: 'uncertain', reasoning };
  }

  // Sort by finalScore descending, then by learning bonus for tiebreaker
  // (V2: stats live in learnings.json, not agent.json — pool stats are always 0)
  candidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return getLearningBonus(b.id, learningData) - getLearningBonus(a.id, learningData);
  });

  const best = candidates[0]!;
  const second = candidates[1];
  const confidence = calculateConfidence(best.finalScore, second?.finalScore ?? 0, candidates.length);

  reasoning.push(`Agent selected: '${best.id}' (score=${best.finalScore}, rules=[${best.matchedRules.join(', ')}])`);

  return { agentId: best.id, score: best.finalScore, confidence, reasoning };
}

// ─── Skill Selection ────────────────────────────────────────────────────────

/** ROUTE-1 B4 — guaranteed skill when none cleared skillMinScore. */
const KIND_DEFAULT_SKILL: Partial<Record<TaskKind, string>> = {
  'code-development': 'typescript-expert',
  refactor:          'code-simplifier',
  documentation:     'documentation-writer',
  audit:             'code-simplifier',
  test:              'testing-expert',
};
// Fallback when taskKind is unavailable (pickSkillFloor tries KIND_DEFAULT_SKILL first).
const INTENT_DEFAULT_SKILL: Partial<Record<IntentType, string>> = {
  refactor:       'code-simplifier',
  implementation: 'typescript-expert',
  documentation:  'documentation-writer',
};

/** ROUTE-1 — project stack language → the built-in language-expert skill id.
 *  Only stacks with a real built-in expert are listed; others fall back to
 *  code-simplifier (language-agnostic) inside resolvePrincipledDefault. */
const LANGUAGE_EXPERT_SKILL: Partial<Record<TechStackKind, string>> = {
  typescript: 'typescript-expert',
  javascript: 'typescript-expert',
  python:     'python-expert',
};

/**
 * Resolve the principled floor default for a task (the kind/intent-appropriate
 * skill), stack-aware for code work. Returns null when no curated default fits.
 * Skipped for `unknown` intent by the caller to preserve the honest-empty contract.
 */
function resolvePrincipledDefault(
  intent: IntentType,
  taskKind: TaskKind | undefined,
  projectStack: { language: string } | null | undefined,
  pool: Map<string, SkillDefinition>,
): string | null {
  const isCode = taskKind === 'code-development' || intent === 'implementation' || intent === 'bugfix';
  if (isCode) {
    const lang = normalizeTechStack(projectStack?.language);
    const langSkill = LANGUAGE_EXPERT_SKILL[lang];
    if (langSkill && pool.has(langSkill)) return langSkill;
    if (pool.has('code-simplifier')) return 'code-simplifier'; // language-agnostic code skill
    // else fall through to the kind/intent defaults below
  }
  const byKind = taskKind ? KIND_DEFAULT_SKILL[taskKind] : undefined;
  if (byKind && pool.has(byKind)) return byKind;
  const byIntent = INTENT_DEFAULT_SKILL[intent];
  if (byIntent && pool.has(byIntent)) return byIntent;
  return null;
}

/**
 * Pick a floor skill when no candidate cleared the threshold:
 *  (1) the kind/intent principled default (stack-aware for code work), else
 *  (2) the best sub-threshold candidate (score > 0).
 * Returns null for genuinely unclassifiable tasks (intent 'unknown', no default,
 * no sub-threshold) so an empty pool / no-signal task honestly yields no skill.
 */
function pickSkillFloor(
  subThreshold: Array<{ id: string; finalScore: number }>,
  intent: IntentType,
  taskKind: TaskKind | undefined,
  pool: Map<string, SkillDefinition>,
  projectStack?: { language: string } | null,
): string | null {
  // Principled default first (the kind/intent-appropriate skill is a stronger
  // signal than a coincidentally-bonused sub-threshold candidate). Skipped for
  // `unknown` intent so an unclassifiable task can still return [].
  if (intent !== 'unknown') {
    const principled = resolvePrincipledDefault(intent, taskKind, projectStack, pool);
    if (principled) return principled;
  }
  // Fallback: best sub-threshold candidate (some real signal scored, just below threshold).
  if (subThreshold.length > 0) {
    return [...subThreshold].sort((a, b) => b.finalScore - a.finalScore)[0]!.id;
  }
  return null;
}

function selectBestSkills(
  taskDNA: TaskDNA,
  pool: Map<string, SkillDefinition>,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeSkills: string[],
  budget: SkillBudget,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
  taskKind?: TaskKind,
): { skillIds: string[]; scores: Map<string, number>; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const subThreshold: Array<{ id: string; finalScore: number }> = [];
  const reasoning: string[] = [];
  const buildTask = isSurfaceBuildTask(taskDNA.intent.primary, taskKind);

  for (const [id, skill] of pool) {
    if (!skill.enabled) continue;
    if (excludeSkills.includes(id)) {
      reasoning.push(`Skill '${id}' excluded by override`);
      continue;
    }

    // Get activation config (v2 or migrated from v1)
    const activation = getSkillActivation(skill);
    const result = evaluateActivation(taskDNA, activation);

    if (result.excluded) {
      reasoning.push(`Skill '${id}' excluded: ${result.excludeReason}`);
      continue;
    }

    // Stack detection bonus (project language/framework match)
    let stackBonus = 0;
    if (projectStack) {
      if (skill.category === 'language') {
        const langMatch = skill.triggers.some(t => t.toLowerCase() === projectStack.language.toLowerCase());
        if (langMatch) {
          stackBonus += 3;
        } else {
          // WM-7 routing dual: a language-category skill whose language does NOT
          // match the confidently-detected project stack is the wrong specialist
          // (e.g. typescript-expert on a Go project). Soft-penalize so it drops
          // below the candidate threshold for typical mis-routes, while a very
          // strong task signal can still override (polyglot-safe). `- Skills:`
          // overrides bypass routing entirely, so explicit pins are unaffected.
          const projStack = normalizeTechStack(projectStack.language);
          if (projStack !== 'generic') {
            const normMatch = skill.triggers.some(t => normalizeTechStack(t) === projStack);
            if (!normMatch) {
              stackBonus -= LANGUAGE_MISMATCH_PENALTY;
              reasoning.push(`Skill '${id}' language-mismatch penalty: -${LANGUAGE_MISMATCH_PENALTY} (skill not for ${projStack} stack)`);
            }
          }
        }
      }
      if (skill.category === 'framework') {
        const fwMatch = skill.triggers.some(t => t.toLowerCase() === projectStack.framework.toLowerCase());
        if (fwMatch) stackBonus += 3;
      }
      for (const dep of skill.stackDetection.dependencies) {
        if (projectStack.dependencies.includes(dep)) {
          stackBonus += 1;
          break; // only +1 for dependency match total
        }
      }
    }

    // Intent-based priority bonus: boost skills aligned with task's primary intent
    const intentBonus = getIntentPriorityBonus(id, taskDNA, projectStack, buildTask);
    if (intentBonus > 0) {
      reasoning.push(`Skill '${id}' intent-priority bonus: +${intentBonus} (intent=${taskDNA.intent.primary})`);
    }

    // Apply learning bonus (sprint recency: +3 for recent success, -2 for recent failure)
    const skillBonus = getLearningBonus(id, learningData);
    if (skillBonus !== 0) {
      reasoning.push(`Skill '${id}' learning bonus: ${skillBonus > 0 ? '+' : ''}${skillBonus} (sprint recency)`);
    }
    const finalScore = result.score + stackBonus + intentBonus + skillBonus;

    if (finalScore >= cfg.skillMinScore) {
      candidates.push({
        id,
        rawScore: result.score + stackBonus,
        learningBonus: skillBonus,
        finalScore,
        matchedRules: result.matchedRules,
      });
    } else if (finalScore > 0) {
      subThreshold.push({ id, finalScore });
    }
  }

  if (candidates.length === 0) {
    // ROUTE-1 B4 — empty-skill floor: never return [] for a classified task.
    const floorId = pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool, projectStack);
    if (floorId) {
      reasoning.push(`Skill floor: '${floorId}' (no candidate ≥ ${cfg.skillMinScore})`);
      return { skillIds: [floorId], scores: new Map([[floorId, 0]]), confidence: 'low', reasoning };
    }
    reasoning.push('No skill met minimum score threshold');
    return { skillIds: [], scores: new Map(), confidence: 'uncertain', reasoning };
  }

  // Sort by finalScore descending, then priority
  candidates.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    const skillA = pool.get(a.id);
    const skillB = pool.get(b.id);
    return (skillB?.priority ?? 0) - (skillA?.priority ?? 0);
  });

  // Apply composition conflict resolution
  const selectedSkillDefs = candidates
    .slice(0, budget.maxSkills + 2) // take extras for composition resolution
    .map(c => pool.get(c.id)!)
    .filter(Boolean);

  const { resolved } = resolveComposition(selectedSkillDefs);
  const resolvedIds = new Set(resolved.map(s => s.id));

  // Cap at budget
  const finalCandidates = candidates
    .filter(c => resolvedIds.has(c.id))
    .slice(0, budget.maxSkills);

  // ROUTE-1 B4 — budget-cap floor: trivial tasks (maxSkills=0) would drop all
  // candidates; preserve the best-scored candidate as a floor instead.
  // Unknown-intent guard: mirrors pickSkillFloor contract — unclassifiable tasks return [].
  if (finalCandidates.length === 0 && taskDNA.intent.primary !== 'unknown') {
    const budgetFloorId = candidates[0]?.id
      ?? pickSkillFloor(subThreshold, taskDNA.intent.primary, taskKind, pool, projectStack);
    if (budgetFloorId) {
      const topScore = candidates[0]?.finalScore ?? 0;
      reasoning.push(`Skill floor (budget cap): '${budgetFloorId}' (maxSkills=${budget.maxSkills})`);
      return { skillIds: [budgetFloorId], scores: new Map([[budgetFloorId, topScore]]), confidence: 'low', reasoning };
    }
  }

  const scores = new Map<string, number>();
  const skillIds: string[] = [];
  for (const c of finalCandidates) {
    skillIds.push(c.id);
    scores.set(c.id, c.finalScore);
    reasoning.push(`Skill selected: '${c.id}' (score=${c.finalScore}, rules=[${c.matchedRules.join(', ')}])`);
  }

  const confidence = finalCandidates.length > 0
    ? calculateConfidence(
        finalCandidates[0]!.finalScore,
        finalCandidates[1]?.finalScore ?? 0,
        finalCandidates.length,
      )
    : 'uncertain';

  return { skillIds, scores, confidence, reasoning };
}

// ─── Skill Budget ───────────────────────────────────────────────────────────

/**
 * Calculate how many skills a task should receive based on its complexity.
 * Token budgets are dynamically adjusted by effort level: low=1000, normal=1500, high=2500.
 */
export function calculateSkillBudget(
  taskDNA: TaskDNA,
  config?: Partial<RoutingEngineConfig>,
  effort?: string,
): SkillBudget {
  const maxDefault = config?.maxSkillsDefault ?? 3;
  let maxSkills = SKILL_BUDGET_BY_SIZE[taskDNA.complexity.estimatedSize] ?? 2;

  // Cross-cutting tasks get +1
  if (taskDNA.complexity.crossCutting && taskDNA.complexity.moduleCount >= 3) {
    maxSkills = Math.min(maxSkills + 1, maxDefault);
  }

  // Single-domain, single-operation tasks get -1
  if (taskDNA.domains.length <= 1 && taskDNA.operations.length <= 1 && maxSkills > 1) {
    maxSkills = Math.max(maxSkills - 1, 0);
  }

  // Hard cap
  maxSkills = Math.min(maxSkills, maxDefault);

  // Dynamic per-skill token budget based on effort level
  const maxTokensPerSkill = (effort !== undefined ? SKILL_TOKEN_BUDGET_BY_EFFORT[effort] : undefined) ?? DEFAULT_TOKEN_BUDGET_PER_SKILL;
  const totalSkillTokenBudget = Math.min(maxSkills * maxTokensPerSkill, DEFAULT_TOKEN_BUDGET_TOTAL * 2);

  return {
    maxSkills,
    maxTokensTotal: Math.min(maxSkills * DEFAULT_TOKEN_BUDGET_PER_SKILL, DEFAULT_TOKEN_BUDGET_TOTAL),
    perSkillTokenBudget: DEFAULT_TOKEN_BUDGET_PER_SKILL,
    maxTokensPerSkill,
    totalSkillTokenBudget,
    reason: `${taskDNA.complexity.estimatedSize} task, ${taskDNA.complexity.moduleCount} module(s), effort=${effort ?? 'normal'}`,
  };
}

// ─── Override Resolution ────────────────────────────────────────────────────

/**
 * Resolve user overrides by priority (task > sprint > project).
 * Higher priority overrides win.
 */
export function resolveOverrides(overrides: UserOverride[]): {
  forceAgent?: string;
  forceSkills?: string[];
  excludeSkills: string[];
  excludeAgents: string[];
} {
  // Sort by priority descending (highest first)
  const sorted = [...overrides].sort((a, b) => b.priority - a.priority);

  let forceAgent: string | undefined;
  let forceSkills: string[] | undefined;
  const excludeSkills = new Set<string>();
  const excludeAgents = new Set<string>();

  for (const override of sorted) {
    // First non-undefined forceAgent wins (highest priority)
    if (override.forceAgent !== undefined && forceAgent === undefined) {
      forceAgent = override.forceAgent;
    }
    // First non-undefined forceSkills wins
    if (override.forceSkills !== undefined && forceSkills === undefined) {
      forceSkills = override.forceSkills;
    }
    // Exclusions are additive (all levels)
    if (override.excludeSkills) {
      for (const s of override.excludeSkills) excludeSkills.add(s);
    }
    if (override.excludeAgents) {
      for (const a of override.excludeAgents) excludeAgents.add(a);
    }
  }

  return {
    forceAgent,
    forceSkills,
    excludeSkills: [...excludeSkills],
    excludeAgents: [...excludeAgents],
  };
}

// ─── Confidence Calculation ─────────────────────────────────────────────────

/**
 * Calculate confidence level based on score gap and candidate count.
 */
export function calculateConfidence(
  topScore: number,
  secondScore: number,
  candidateCount: number,
): ConfidenceLevel {
  if (topScore <= 0) return 'uncertain';
  if (candidateCount === 0) return 'uncertain';

  const gap = topScore - secondScore;
  const ratio = gap / topScore;

  // Single strong candidate
  if (candidateCount === 1 && topScore >= 5) return 'high';

  // Large gap between top two
  if (ratio >= 0.5 && topScore >= 5) return 'high';
  if (ratio >= 0.3 && topScore >= 3) return 'medium';
  if (ratio >= 0.1) return 'low';

  return 'uncertain';
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function getAgentActivation(agent: AgentDefinition): ActivationConfig {
  if (agent.activation) return agent.activation;
  return migrateV1AgentToActivation(
    agent.triggerKeywords,
    agent.triggerScopes,
    agent.triggerFilePatterns,
  );
}

function getSkillActivation(skill: SkillDefinition): ActivationConfig {
  if (skill.activation) return skill.activation;
  // Ecosystem intelligence: derive intent-based activation from skill metadata.
  // Richer signal than V1 migration for skills without a persisted V2 manifest.
  const ecosystemActivation = analyzeSkillInMemory({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    triggers: skill.triggers,
  });
  if (ecosystemActivation.rules.some(r => r.score >= 5)) {
    return ecosystemActivation;
  }
  return migrateV1SkillToActivation(
    skill.triggers,
    skill.category,
    skill.stackDetection,
  );
}

function getLearningBonus(entityId: string, learningData: LearningBonus[]): number {
  const entry = learningData.find(l => l.entityId === entityId);
  if (!entry) return 0;
  // Cap bonus to prevent runaway effects
  return Math.max(-LEARNING_BONUS_CAP, Math.min(LEARNING_BONUS_CAP, entry.bonus));
}

// ─── Skill Domain / Intent Bonus (Sprint 209-004) ──────────────────────────
//
// Counterpart to DOMAIN_MATCH_BONUS / TASK_DOMAIN_TO_AGENT_ID for agents.
// When a task's primary intent or a path-extracted domain name maps to a
// specific skill, that skill receives SKILL_DOMAIN_BONUS so domain-specialized
// skills (api-builder, security-specialist, react-specialist, …) surface ahead
// of the generic typescript-expert default.

/** Score added when a skill's id matches the task's intent or domain signal.
 *  Sized equal to DOMAIN_MATCH_BONUS so skill routing keeps pace with agent
 *  domain routing introduced in Sprint 209-002. */
export const SKILL_DOMAIN_BONUS = 3;

/** Map task primary intent → the skill that best serves that intent.
 *  documentation is excluded (handled by existing early-return at +2).
 *  The intent→skill mapping gives domain-specific skills a tiebreaker when
 *  the task intent is already classified beyond 'implementation'. */
export const INTENT_TO_SKILL_ID: Partial<Record<IntentType, string>> = {
  security:      'security-specialist',
  devops:        'devops-engineer',
  design:        'react-specialist',
  migration:     'database-migration',
  performance:   'performance-optimizer',
  architecture:  'system-architect',
  refactor:      'code-simplifier',   // ROUTE-1 B4
  config:        'devops-engineer',   // ROUTE-1 B4
};

/** Map path-extracted task domain name (TaskDNA.domains[].name) → skill id.
 *  Parallel to TASK_DOMAIN_TO_AGENT_ID; applied inside getIntentPriorityBonus
 *  so that scope-path signals (src/api/, src/auth/, dashboard/) steer the
 *  domain skill bonus even when intent is still 'implementation'. */
export const TASK_DOMAIN_TO_SKILL_ID: Readonly<Record<string, string>> = {
  api:        'api-builder',
  auth:       'security-specialist',
  security:   'security-specialist',
  dashboard:  'react-specialist',
  components: 'react-specialist',
  frontend:   'react-specialist',
  ui:         'react-specialist',
  db:         'database-migration',
  database:   'database-migration',
  models:     'database-migration',
  schemas:    'database-migration',
  docker:     'docker-expert',
  kubernetes: 'docker-expert',
  k8s:        'docker-expert',
  helm:       'docker-expert',
};

/**
 * Intent-based priority bonus for skill selection.
 * Boosts skills that align with the task's primary intent:
 * - testing → testing-expert +2
 * - documentation → documentation-writer +2
 * - implementation + typescript → typescript-expert +2
 * - intent→skill mapping (security/devops/design/…) → domain skill +3
 * - domain→skill mapping (api/auth/dashboard/…) → domain skill +3
 */
function getIntentPriorityBonus(
  skillId: string,
  taskDNA: TaskDNA,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
  allowPathProxy: boolean = true,
): number {
  const primary = taskDNA.intent.primary;

  if (taskDNA.tags?.includes('test-coverage') && skillId === 'testing-expert') return 2;
  if (primary === 'documentation' && skillId === 'documentation-writer') return 2;

  if (primary === 'implementation' && skillId === 'typescript-expert') {
    const isTypeScript =
      projectStack?.language?.toLowerCase() === 'typescript' ||
      taskDNA.domains.some(d => d.name.toLowerCase().includes('typescript'));
    if (isTypeScript) return 2;
  }

  // intent→skill (intent-driven, always honoured)
  const intentSkillId = INTENT_TO_SKILL_ID[primary];
  if (intentSkillId === skillId) return SKILL_DOMAIN_BONUS;

  // domain→skill (path proxy, gated — ROUTE-1 B4)
  if (allowPathProxy) {
    for (const domain of taskDNA.domains) {
      const domainSkillId = TASK_DOMAIN_TO_SKILL_ID[domain.name.toLowerCase()];
      if (domainSkillId === skillId) return SKILL_DOMAIN_BONUS;
    }
  }

  return 0;
}

// ─── Context Budget Fit ────────────────────────────────────────────────────

/** Context budget thresholds */
const CONTEXT_TIGHT_THRESHOLD = 0.75;
const CONTEXT_OVERFLOW_THRESHOLD = 0.90;

/**
 * Assess how well a task's estimated token usage fits within the model's context window.
 * Returns 'ok' if within 75%, 'tight' if between 75-90%, 'overflow' if above 90%.
 * When estimatedTokens or modelId is not provided, returns undefined (no assessment).
 */
export function assessContextFit(
  estimatedTokens: number | undefined,
  modelId: string | undefined,
  reasoning: string[],
): 'ok' | 'tight' | 'overflow' | undefined {
  if (estimatedTokens === undefined || modelId === undefined) return undefined;

  const modelDef = modelRegistry.get(modelId);
  if (!modelDef) return undefined;

  const contextWindow = modelDef.contextWindow;
  const utilization = estimatedTokens / contextWindow;

  if (utilization > CONTEXT_OVERFLOW_THRESHOLD) {
    reasoning.push(
      `Context fit: OVERFLOW — estimated ${estimatedTokens} tokens vs ${contextWindow} context window ` +
      `(${(utilization * 100).toFixed(1)}% utilization). Consider splitting the task.`,
    );
    debugLog('routing-engine', `Task context overflow: ${estimatedTokens}/${contextWindow} (${(utilization * 100).toFixed(1)}%) for model ${modelId}. SPLIT recommended.`);
    return 'overflow';
  }

  if (utilization > CONTEXT_TIGHT_THRESHOLD) {
    reasoning.push(
      `Context fit: TIGHT — estimated ${estimatedTokens} tokens vs ${contextWindow} context window ` +
      `(${(utilization * 100).toFixed(1)}% utilization). Consider upgrading to a higher-tier model.`,
    );
    return 'tight';
  }

  reasoning.push(
    `Context fit: OK — estimated ${estimatedTokens} tokens vs ${contextWindow} context window ` +
    `(${(utilization * 100).toFixed(1)}% utilization).`,
  );
  return 'ok';
}
