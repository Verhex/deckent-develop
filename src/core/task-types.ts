// ─── Task Domain Types ──────────────────────────────────────────────────────
// Split from types.ts — Task, planning, and model-related types

// ─── Models ──────────────────────────────────────────────────────────
export type ModelType = 'opus' | 'sonnet' | 'haiku';
export type TaskEffort = 'low' | 'normal' | 'high';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';

// ─── Task System ─────────────────────────────────────────────────────
export enum TaskStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  EXECUTING = 'EXECUTING',
  TESTING = 'TESTING',
  DOCUMENTING = 'DOCUMENTING',
  DONE = 'DONE',
  NO_GO = 'NO_GO',
  PAUSED = 'PAUSED',
}

export enum TaskEvaluation {
  DONE = 'DONE',
  GO_WITH_TECH_DEBT = 'GO_WITH_TECH_DEBT',
  NO_GO = 'NO_GO',
}

export type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

// ─── Task Scope (Blueprint 15) ──────────────────────────────────────
export interface TaskScope {
  directories: string[];
  filesRead: string[];
  filesWrite: string[];
}

// ─── GO / NO-GO Criteria (Blueprint 8) ──────────────────────────────
export interface GoNoGoCriteria {
  goCriteria: string;
  noGoCriteria: string;
  techDebtAcceptable: string;
}

// ─── Task ────────────────────────────────────────────────────────────
export interface Task {
  id: string;
  title: string;
  description: string;
  model: ModelType;
  effort: TaskEffort;
  priority: TaskPriority;
  reason: string;
  scope: TaskScope;
  dependencies: string[];
  goNogo: GoNoGoCriteria;
  status: TaskStatus;
  sprintId?: string;
  assignedWorker?: string;
  isPriorityFix?: boolean;
  fixForTaskId?: string;
  /** User-specified model override from DIRECTIVES.md (bypasses all auto-selection layers) */
  forceModel?: ModelType;
  /** User-specified effort override from DIRECTIVES.md */
  forceEffort?: TaskEffort;
  /** Assigned agent ID (from agent pool) or 'generic' */
  assignedAgent?: string;
  /** Assigned skill IDs (from skill pool) */
  assignedSkills?: string[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── TaskResult ──────────────────────────────────────────────────────
export interface TaskResult {
  taskId: string;
  workerId: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testsPassed: boolean;
  coverage: number;
  selfAssessment: SelfAssessment;
  notes: string;
  /** Agent ID that produced this result */
  agentId?: string;
  /** Skill IDs used during this task execution */
  skillIds?: string[];
  completedAt?: string;
  durationMs?: number;
}

// ─── TaskPlan ────────────────────────────────────────────────────────
export interface TaskPlan {
  taskId: string;
  workerId: string;
  filesToCreate: string[];
  filesToModify: string[];
  executionSteps: string[];
  testStrategy: string;
  documentationPlan: string;
  estimatedDurationMin?: number;
}

// ─── AI Planner ─────────────────────────────────────────────────────
export interface PlannerTask {
  title: string;
  description: string;
  model: ModelType;
  effort: TaskEffort;
  priority: TaskPriority;
  reason: string;
  scope: TaskScope;
  dependencies: string[];
  goNogo: GoNoGoCriteria;
}

export interface PlannerResult {
  tasks: PlannerTask[];
  reasoning: string;
}
