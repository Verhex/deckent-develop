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
import { resolveComposition } from './skill-selector.js';
import { modelRegistry } from './model-registry.js';
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
}

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
 */
export function routeTaskV2(
  task: { title: string; description: string; scope: TaskScope },
  agentPool: AgentPool,
  skillPool: Map<string, SkillDefinition>,
  options?: RoutingOptions,
): RoutingDecision {
  const cfg = { ...createDefaultRoutingEngineConfig(), ...options?.config };
  const overrides = options?.overrides ?? [];
  const learningData = options?.learningData ?? [];
  const reasoning: string[] = [];
  const overrideWarnings: string[] = [];

  // Step 1: Classify task intent
  const taskDNA = classifyIntent(task);
  reasoning.push(`Intent: ${taskDNA.intent.primary} (confidence: ${taskDNA.intent.confidence})`);

  // Step 2: Resolve user overrides
  const resolved = resolveOverrides(overrides);
  let overrideSource: OverrideSource = 'none';
  if (resolved.forceAgent || resolved.forceSkills) {
    overrideSource = overrides[0]?.source ?? 'task-directive';
  }

  // Step 3: Select agent
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
    const agentResult = selectBestAgent(taskDNA, agentPool, cfg, learningData, allExcludeAgents);
    agentId = agentResult.agentId;
    agentScore = agentResult.score;
    agentConfidence = agentResult.confidence;
    reasoning.push(...agentResult.reasoning);

    // Step 3b: Fallback chain if no agent met threshold
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

  // Step 4: Calculate skill budget (effort-aware token allocation)
  const skillBudget = calculateSkillBudget(taskDNA, cfg, options?.effort);
  reasoning.push(`Skill budget: max ${skillBudget.maxSkills} (${skillBudget.reason})`);

  // Step 5: Select skills
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
      options?.projectStack ?? null,
    );
    skillIds = skillResult.skillIds;
    for (const [id, score] of skillResult.scores) skillScores.set(id, score);
    skillConfidence = skillResult.confidence;
    reasoning.push(...skillResult.reasoning);
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

function selectBestAgent(
  taskDNA: TaskDNA,
  pool: AgentPool,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeAgents: string[],
): { agentId: string | null; score: number; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const reasoning: string[] = [];

  for (const [id, agent] of pool) {
    if (!agent.enabled) continue;
    if (excludeAgents.includes(id)) {
      reasoning.push(`Agent '${id}' excluded by override`);
      continue;
    }

    // Get activation config (v2 or migrated from v1)
    const activation = getAgentActivation(agent);
    const result = evaluateActivation(taskDNA, activation);

    if (result.excluded) {
      reasoning.push(`Agent '${id}' excluded: ${result.excludeReason}`);
      continue;
    }

    // Apply learning bonus
    const bonus = getLearningBonus(id, learningData);
    const finalScore = result.score + bonus;

    if (finalScore >= cfg.agentMinScore) {
      candidates.push({
        id,
        rawScore: result.score,
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

function selectBestSkills(
  taskDNA: TaskDNA,
  pool: Map<string, SkillDefinition>,
  cfg: RoutingEngineConfig,
  learningData: LearningBonus[],
  excludeSkills: string[],
  budget: SkillBudget,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
): { skillIds: string[]; scores: Map<string, number>; confidence: ConfidenceLevel; reasoning: string[] } {
  const candidates: ScoredCandidate[] = [];
  const reasoning: string[] = [];

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
        if (langMatch) stackBonus += 3;
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
    const intentBonus = getIntentPriorityBonus(id, taskDNA, projectStack);
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
    }
  }

  if (candidates.length === 0) {
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

/**
 * Intent-based priority bonus for skill selection.
 * Boosts skills that align with the task's primary intent:
 * - testing → testing-expert +2
 * - documentation → documentation-writer +2
 * - implementation + typescript → typescript-expert +2
 */
function getIntentPriorityBonus(
  skillId: string,
  taskDNA: TaskDNA,
  projectStack: { language: string; framework: string; dependencies: string[] } | null,
): number {
  const primary = taskDNA.intent.primary;

  // Sprint 148: test-coverage tag replaces former 'testing' primary intent
  if (taskDNA.tags?.includes('test-coverage') && skillId === 'testing-expert') return 2;
  if (primary === 'documentation' && skillId === 'documentation-writer') return 2;

  if (primary === 'implementation' && skillId === 'typescript-expert') {
    // Boost typescript-expert when TypeScript is the project language or detected in domains
    const isTypeScript =
      projectStack?.language?.toLowerCase() === 'typescript' ||
      taskDNA.domains.some(d => d.name.toLowerCase().includes('typescript'));
    if (isTypeScript) return 2;
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
