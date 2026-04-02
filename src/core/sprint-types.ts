// ─── Sprint Domain Types ────────────────────────────────────────────────────
// Split from types.ts — Sprint lifecycle, metrics, debt, memory, and brain context

import type { Task, TaskEvaluation, ModelType } from './task-types.js';

// ─── Sprint System ──────────────────────────────────────────────────
export enum SprintPhase {
  DIRECTIVE = 'DIRECTIVE',
  PLAN = 'PLAN',
  SPAWN = 'SPAWN',
  EXECUTE = 'EXECUTE',
  EVALUATE = 'EVALUATE',
  FIX = 'FIX',
  RETRO = 'RETRO',
  DECAY = 'DECAY',
  TRANSITION = 'TRANSITION',
  COMPLETE = 'COMPLETE',
}

export enum SprintStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  EVALUATING = 'EVALUATING',
  FIXING = 'FIXING',
  RETROSPECTIVE = 'RETROSPECTIVE',
  COMPLETE = 'COMPLETE',
  PAUSED = 'PAUSED',
  ABORTED = 'ABORTED',
}

export interface SprintUsageReport {
  totalCalls: number;
  totalTokens: number;
  modelBreakdown: Array<{ model: string; calls: number; tokens: number }>;
}

export interface Sprint {
  id: string;
  number: number;
  status: SprintStatus;
  phase: SprintPhase;
  tasks: Task[];
  workers: string[];
  metrics?: SprintMetrics;
  startedAt?: string;
  completedAt?: string;
  reasoning?: string;
  planningMode?: string;
  usageReport?: SprintUsageReport;
  /** True if a rollback was triggered during this sprint (all tasks NO_GO) */
  rolledBack?: boolean;
  /** Human-readable rollback result message */
  rollbackResult?: string;
}

export interface SprintMetrics {
  totalTasks: number;
  completedTasks: number;
  techDebtTasks: number;
  noGoTasks: number;
  durationMs: number;
  coveragePercent: number;
  noGoRate: number;
  newDebtCount: number;
  resolvedDebtCount: number;
  totalOpenDebt: number;
  boundaryViolations: number;
  crossAssignments: number;
  contextLinesUsed: number;
}

// ─── Sprint Result ─────────────────────────────────────────────────
export interface SprintResult {
  sprint: Sprint;
  evaluations: Map<string, TaskEvaluation>;
  metrics: SprintMetrics;
}

// ─── Tech Debt (Blueprint 8) ────────────────────────────────────────
export enum DebtPriority {
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface DebtItem {
  id: string;
  description: string;
  originTaskId: string;
  originSprintId: string;
  priority: DebtPriority;
  sprintsOpen: number;
  resolved: boolean;
  resolvedInSprintId?: string;
  createdAt: string;
}

// ─── Memory System (Blueprint 6) ────────────────────────────────────
export interface MemoryEntry {
  content: string;
  addedInSprint: string;
  lastUsedInSprint: string;
  sprintsSinceLastUse: number;
}

export interface PatternEntry {
  pattern: string;
  occurrences: number;
  firstDetectedInSprint: string;
  lastDetectedInSprint: string;
  resolved: boolean;
}

// ─── Decay Result ──────────────────────────────────────────────
export interface DecayResult {
  linesBefore: number;
  linesAfter: number;
  archivedSprints: string[];
  removedDebtCount: number;
  removedPatternCount: number;
}

// ─── Brain Context ──────────────────────────────────────────────────
export interface BrainContext {
  directives: string;
  memory: string;
  retro: string;
  debt: DebtItem[];
  patterns: string;
  decisions: string;
  projectIdentity?: string;
  existingTasks: Task[];
  projectState: ProjectState;
}

export interface ProjectState {
  gitStatus: string;
  fileTree: string[];
}

export interface SprintSizeRecommendation {
  size: 'full' | 'reduced' | 'minimal';
  maxWorkers: number;
  modelConstraint: ModelType | null;
  reason: string;
}
