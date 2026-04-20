// ─── Routing Engine v2 Types ─────────────────────────────────────────────────
// Task DNA, Activation Rules, Routing Decisions — the foundation of intent-based routing.

// ─── Intent Classification ──────────────────────────────────────────────────

export type IntentType =
  | 'implementation'
  | 'bugfix'
  | 'refactor'
  | 'documentation'
  | 'security'
  | 'devops'
  | 'config'
  | 'performance'
  | 'design'
  | 'migration'
  | 'architecture'
  | 'unknown';

export const ALL_INTENT_TYPES: readonly IntentType[] = [
  'implementation', 'bugfix', 'refactor', 'documentation',
  'security', 'devops', 'config', 'performance', 'design', 'migration', 'architecture', 'unknown',
] as const;

/**
 * Sub-intent types for fine-grained routing within 'core-dev' (implementation) tasks.
 * V3 refinement: allows routing engine to make domain-specific decisions.
 */
export type SubIntentType =
  | 'types'
  | 'config'
  | 'routing'
  | 'observer'
  | 'registry'
  | 'dispatcher';

export const ALL_SUB_INTENT_TYPES: readonly SubIntentType[] = [
  'types', 'config', 'routing', 'observer', 'registry', 'dispatcher',
] as const;

export type OperationType =
  | 'create'
  | 'modify'
  | 'delete'
  | 'rename'
  | 'test'
  | 'document'
  | 'configure';

// ─── Task DNA ───────────────────────────────────────────────────────────────

export interface TaskDNA {
  intent: {
    primary: IntentType;
    secondary: IntentType[];
    confidence: number; // 0.0-1.0
  };
  /** V3: Fine-grained sub-intent for core-dev tasks (types, config, routing, etc.) */
  subIntent?: SubIntentType;
  /** Lightweight tags for cross-cutting concerns (e.g. 'test-coverage'). */
  tags: string[];
  domains: Array<{ name: string; weight: number }>;
  operations: Array<{ type: OperationType; weight: number }>;
  complexity: {
    fileCount: number;
    moduleCount: number;
    crossCutting: boolean;
    estimatedSize: TaskSize;
  };
  scope: {
    writeRatio: Record<string, number>; // dir prefix → proportion of writes
    primaryWriteTarget: string;
    testWriteRatio: number; // 0.0-1.0
  };
}

export type TaskSize = 'trivial' | 'small' | 'medium' | 'large' | 'epic';

// ─── Activation Rules ───────────────────────────────────────────────────────

export interface ActivationRule {
  name?: string;
  when: Record<string, unknown>; // path-based condition on TaskDNA
  score: number;
}

export interface ExclusionRule {
  name?: string;
  when: Record<string, unknown>;
  reason?: string;
}

export interface ActivationConfig {
  rules: ActivationRule[];
  exclude: ExclusionRule[];
  minScore: number;
}

export interface ActivationResult {
  score: number;
  excluded: boolean;
  matchedRules: string[];
  excludeReason?: string;
}

// ─── Confidence ─────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'uncertain';

// ─── Routing Decision ───────────────────────────────────────────────────────

export interface RoutingDecision {
  agentId: string | null;
  agentScore: number;
  agentConfidence: ConfidenceLevel;
  skillIds: string[];
  skillScores: Map<string, number>;
  skillConfidence: ConfidenceLevel;
  overrideSource: OverrideSource;
  taskDNA: TaskDNA;
  reasoning: string[];
  /** Context budget fit assessment: how well the task fits the selected model's context window */
  contextFit?: 'ok' | 'tight' | 'overflow';
  /** Routing engine version used to produce this decision */
  routingVersion: 'v2' | 'v3';
}

export type OverrideSource = 'none' | 'task-directive' | 'sprint-directive' | 'project-config';

// ─── Skill Budget ───────────────────────────────────────────────────────────

export interface SkillBudget {
  maxSkills: number;
  maxTokensTotal: number;
  perSkillTokenBudget: number;
  /** Dynamic per-skill token limit based on task effort level */
  maxTokensPerSkill: number;
  /** Total token budget across all skills for this task */
  totalSkillTokenBudget: number;
  reason: string;
}

// ─── User Override ──────────────────────────────────────────────────────────

export interface UserOverride {
  source: OverrideSource;
  forceAgent?: string;
  forceSkills?: string[];
  excludeSkills?: string[];
  excludeAgents?: string[];
  priority: number; // higher = wins — task(3) > sprint(2) > project(1)
}

// ─── Learning ───────────────────────────────────────────────────────────────

export interface LearningBonus {
  entityId: string;  // agent or skill ID
  bonus: number;     // positive = good history, negative = bad (capped ±3)
  source: string;    // sprint ID or 'summary'
}

// ─── Routing Engine Config ──────────────────────────────────────────────────

export interface RoutingEngineConfig {
  agentMinScore: number;       // default 5
  skillMinScore: number;       // default 3
  maxSkillsDefault: number;    // default 3
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function createDefaultTaskDNA(): TaskDNA {
  return {
    intent: { primary: 'unknown', secondary: [], confidence: 0 },
    tags: [],
    domains: [],
    operations: [],
    complexity: { fileCount: 0, moduleCount: 0, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 },
  };
}

export function createDefaultActivationConfig(minScore = 5): ActivationConfig {
  return { rules: [], exclude: [], minScore };
}

export function createDefaultRoutingEngineConfig(): RoutingEngineConfig {
  return { agentMinScore: 5, skillMinScore: 3, maxSkillsDefault: 3 };
}

export const LEARNING_BONUS_CAP = 3;

export const SKILL_BUDGET_BY_SIZE: Record<TaskSize, number> = {
  trivial: 0,
  small: 1,
  medium: 2,
  large: 3,
  epic: 3,
};

export const DEFAULT_TOKEN_BUDGET_PER_SKILL = 1500;
export const DEFAULT_TOKEN_BUDGET_TOTAL = 4500;

/** Token budget per skill based on effort level: low=1000, normal=1500, high=2500 */
export const SKILL_TOKEN_BUDGET_BY_EFFORT: Record<string, number> = {
  low: 1000,
  normal: 1500,
  high: 2500,
};

export function isValidIntentType(value: string): value is IntentType {
  return (ALL_INTENT_TYPES as readonly string[]).includes(value);
}
