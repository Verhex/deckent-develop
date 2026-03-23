// ─── Task Domain Types ──────────────────────────────────────────────────────
// Split from types.ts — Task, planning, and model-related types

// ─── Models ──────────────────────────────────────────────────────────

/** Claude-family model identifiers */
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

/** OpenAI / Codex model identifiers */
export type OpenAIModel = 'gpt-5' | 'gpt-5-mini' | 'gpt-4.1' | 'gpt-4.1-mini' | 'o3' | 'o4-mini';

/** Gemini model identifiers */
export type GeminiModel = 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash';

/** Union of all supported model identifiers across providers */
export type ModelType = ClaudeModel | OpenAIModel | GeminiModel;

/** Supported AI provider names */
export type ProviderName = 'claude' | 'codex' | 'gemini';

/** Mapping from each provider to its supported model list */
export const PROVIDER_MODEL_MAP: Record<ProviderName, readonly ModelType[]> = {
  claude: ['opus', 'sonnet', 'haiku'] as const,
  codex: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'] as const,
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] as const,
} as const;

/** All Claude model names (backward-compat convenience) */
export const CLAUDE_MODELS: readonly ClaudeModel[] = ['opus', 'sonnet', 'haiku'] as const;

/** All valid model names across all providers */
export const ALL_MODELS: readonly ModelType[] = [
  ...CLAUDE_MODELS,
  'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini',
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash',
] as const;

/** Error thrown when a model is not recognized */
export class UnknownModelError extends TypeError {
  constructor(model: string) {
    super(`Unknown model: ${model}`);
    this.name = 'UnknownModelError';
  }
}

/**
 * Get the provider name for a given model.
 * @throws {UnknownModelError} if model is not recognized
 */
export function getProviderForModel(model: ModelType): ProviderName {
  for (const [provider, models] of Object.entries(PROVIDER_MODEL_MAP)) {
    if ((models as readonly string[]).includes(model)) {
      return provider as ProviderName;
    }
  }
  // Should never reach here with valid ModelType — guard for runtime safety
  throw new UnknownModelError(model);
}

/** Type guard: checks whether a model is a Claude model */
export function isClaudeModel(model: ModelType): model is ClaudeModel {
  return (CLAUDE_MODELS as readonly string[]).includes(model);
}

/** Type guard: checks whether a model is an OpenAI/Codex model */
export function isOpenAIModel(model: ModelType): model is OpenAIModel {
  return (PROVIDER_MODEL_MAP.codex as readonly string[]).includes(model);
}

/** Type guard: checks whether a model is a Gemini model */
export function isGeminiModel(model: ModelType): model is GeminiModel {
  return (PROVIDER_MODEL_MAP.gemini as readonly string[]).includes(model);
}

/**
 * Get a numeric rank for model capability tier (provider-agnostic).
 * Higher = more capable. Used for model comparison/upgrade logic.
 *   Tier 0 (economy): haiku, gpt-5-mini, gpt-4.1-mini, o4-mini, gemini-2.0-flash
 *   Tier 1 (standard): sonnet, gpt-4.1, o3, gemini-2.5-flash
 *   Tier 2 (premium): opus, gpt-5, gemini-2.5-pro
 */
export function getModelTier(model: ModelType): number {
  switch (model) {
    case 'haiku':
    case 'gpt-5-mini':
    case 'gpt-4.1-mini':
    case 'o4-mini':
    case 'gemini-2.0-flash':
      return 0;
    case 'sonnet':
    case 'gpt-4.1':
    case 'o3':
    case 'gemini-2.5-flash':
      return 1;
    case 'opus':
    case 'gpt-5':
    case 'gemini-2.5-pro':
      return 2;
  }
}

/**
 * Check if a string is a valid model name.
 */
export function isValidModel(value: string): value is ModelType {
  return (ALL_MODELS as readonly string[]).includes(value);
}

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
  /** User-specified provider from DIRECTIVES.md (e.g., 'codex', 'gemini') */
  provider?: ProviderName;
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

// ─── Feedback Loop Metrics ───────────────────────────────────────────
/** Tracks worker self-healing attempts (tsc + test verify loops) */
export interface FeedbackLoop {
  tscAttempts: number;
  testAttempts: number;
  tscErrorsFixed: number;
  testFailuresFixed: number;
  totalRetryTimeMs: number;
}

/** Result from running vitest verify loop */
export interface VerifyTestsResult {
  success: boolean;
  failedTests: string[];
  output: string;
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
  /** Worker feedback loop metrics (tsc/test verify retries) */
  feedbackLoop?: FeedbackLoop;
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
