// ─── Decision System Types ─────────────────────────────────────────────────
import type { ModelType, TaskEffort, TaskScope, PatternEntry, ResolvedConfig } from './types.js';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import type { SkillDefinition, ProjectStack } from './skill-types.js';
import type { TaskKind } from './work-model.js';

// ─── Task Type (WM-2 canonical-reconciled) ──────────────────────────────────
// Single source of truth for the decision taxonomy values. Previously the union
// literal and a parallel runtime validation array duplicated the same seven
// members; `TaskType` is now DERIVED from one const tuple (no drift, no
// duplicate array). The decision taxonomy is a faithful projection of the
// canonical `TaskKind` SSOT (src/core/work-model.ts) via the `decisionTypeToKind`
// adapter — see {@link DecisionCanonicalKind} + tests/core/wm2-canonical.test.ts.

const DECISION_TASK_TYPES = ['code', 'test', 'doc', 'security', 'refactor', 'devops', 'config'] as const;

export type TaskType = (typeof DECISION_TASK_TYPES)[number];

/**
 * The canonical {@link TaskKind} a decision {@link TaskType} reconciles to (via
 * work-model `decisionTypeToKind`). Canonical-import anchor — links decision
 * callsites to the one work-model SSOT instead of re-deriving a taxonomy.
 * Compile-time only; erased at runtime.
 */
export type DecisionCanonicalKind = TaskKind;

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
  return (DECISION_TASK_TYPES as readonly string[]).includes(type);
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
