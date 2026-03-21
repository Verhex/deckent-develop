// ─── Decision System Types ─────────────────────────────────────────────────
import type { ModelType, TaskEffort, TaskScope, PatternEntry, UsageMetrics, ResolvedConfig } from './types.js';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import type { SkillDefinition, ProjectStack } from './skill-types.js';

// ─── Task Type ─────────────────────────────────────────────────────────────

export type TaskType = 'code' | 'test' | 'doc' | 'security' | 'refactor' | 'devops' | 'config';

const VALID_TASK_TYPES: readonly TaskType[] = ['code', 'test', 'doc', 'security', 'refactor', 'devops', 'config'];

// ─── Task Analysis ─────────────────────────────────────────────────────────

export interface TaskAnalysis {
  type: TaskType;
  complexity: number;  // 0-10
  keywords: string[];
  scopeWeight: number;
  estimatedDurationMs: number;
}

// ─── Decision Log ──────────────────────────────────────────────────────────

export interface DecisionLogEntry {
  step: number;  // 1-6
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  reasoning: string;
}

// ─── Decision Result ───────────────────────────────────────────────────────

export interface DecisionResult {
  analysis: TaskAnalysis;
  agent: AgentDefinition | null;
  skills: SkillDefinition[];
  model: ModelType;
  effort: TaskEffort;
  scope: TaskScope;
  decisionLog: DecisionLogEntry[];
}

// ─── Decision Context ──────────────────────────────────────────────────────

export interface DecisionContext {
  projectStack: ProjectStack | null;
  agentPool: AgentPool;
  skillPool: Map<string, SkillDefinition>;
  patterns: PatternEntry[];
  usageMetrics: UsageMetrics;
  config: ResolvedConfig;
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Create a default TaskAnalysis with zeroed/empty fields.
 */
export function createDefaultAnalysis(): TaskAnalysis {
  return {
    type: 'code',
    complexity: 0,
    keywords: [],
    scopeWeight: 0,
    estimatedDurationMs: 0,
  };
}

/**
 * Type guard: checks if a string is a valid TaskType.
 */
export function isValidTaskType(type: string): type is TaskType {
  return VALID_TASK_TYPES.includes(type as TaskType);
}

/**
 * Create a DecisionLogEntry with given step, name, and reasoning.
 * Input/output default to empty objects, durationMs defaults to 0.
 */
export function createDecisionLogEntry(
  step: number,
  name: string,
  reasoning: string,
): DecisionLogEntry {
  return {
    step,
    name,
    input: {},
    output: {},
    durationMs: 0,
    reasoning,
  };
}
