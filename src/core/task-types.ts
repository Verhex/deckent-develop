// ─── Task Domain Types ──────────────────────────────────────────────────────
// Split from types.ts — Task, planning, and model-related types
// Model data is now delegated to ModelRegistry (single source of truth).

import { modelRegistry } from './model-registry.js';
import type { TaskKind } from './work-model.js';

// ─── Models ──────────────────────────────────────────────────────────

/** Claude-family model identifiers */
export type ClaudeModel = 'opus' | 'sonnet' | 'haiku';

/** OpenAI / Codex model identifiers */
export type OpenAIModel = 'gpt-5' | 'gpt-5-mini' | 'gpt-4.1' | 'gpt-4.1-mini' | 'o3' | 'o4-mini';

/** Gemini model identifiers */
export type GeminiModel = 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash' | 'gemini-3.1-pro-preview';

/**
 * Union of all supported model identifiers across providers.
 *
 * The `(string & {})` tail keeps autocomplete + narrowing for the literal IDs
 * above while accepting arbitrary runtime model IDs registered dynamically by
 * `bootstrapFromCatalog()` (models.dev). Registry-validation guards the
 * runtime side; the literal union covers the bundled builtin-13 surface.
 */
export type ModelType = ClaudeModel | OpenAIModel | GeminiModel | (string & {});

/**
 * Supported AI provider names.
 *
 * Sprint 202 Task 202-001 (F1 Provider Independence): widened to include
 * `'ollama'` so the local-LLM provider becomes a first-class bootstrap target.
 * Prior to this widening, `worker_provider=ollama` passed config validation
 * but `getProviderAdapterForTask('ollama')` returned null → silent Claude
 * fallback. See ADR-017 (provider adapter pattern) and provider.ts:detectOllama.
 */
export type ProviderName = 'claude' | 'codex' | 'gemini' | 'ollama';

/**
 * Mapping from each provider to its supported model list.
 *
 * Sprint 230 Task 230-002: each property is now a **live getter** over
 * `modelRegistry.getByProvider(p)` rather than a frozen module-load snapshot.
 * This lets `bootstrapFromCatalog()` (models.dev) and lazy provider
 * registrations (e.g. ollama) flow through without restarting the process.
 * Existing readers (`PROVIDER_MODEL_MAP.codex`, `Object.keys/.entries`) still
 * work — each access returns a fresh, registry-derived array.
 */
export const PROVIDER_MODEL_MAP: Record<ProviderName, readonly ModelType[]> = Object.defineProperties(
  {} as Record<ProviderName, readonly ModelType[]>,
  {
    claude: {
      get: () => modelRegistry.getByProvider('claude').map(m => m.id) as readonly ModelType[],
      enumerable: true,
    },
    codex: {
      get: () => modelRegistry.getByProvider('codex').map(m => m.id) as readonly ModelType[],
      enumerable: true,
    },
    gemini: {
      get: () => modelRegistry.getByProvider('gemini').map(m => m.id) as readonly ModelType[],
      enumerable: true,
    },
    // ollama models are registered lazily by providers/ollama.ts; getter reads
    // whatever is currently in the registry under the 'ollama' provider key.
    ollama: {
      get: () => modelRegistry.getAllModels().filter(m => m.provider as string === 'ollama').map(m => m.id) as readonly ModelType[],
      enumerable: true,
    },
  },
);

/** All Claude model names (backward-compat convenience) */
export const CLAUDE_MODELS: readonly ClaudeModel[] = modelRegistry
  .getByProvider('claude')
  .map(m => m.id) as unknown as readonly ClaudeModel[];

/** All valid model names across all providers — derived from ModelRegistry */
export const ALL_MODELS: readonly ModelType[] = modelRegistry.getAllModelIds() as unknown as readonly ModelType[];

/**
 * Mapping from internal model aliases to actual provider API model IDs.
 * Derived from ModelRegistry.
 */
export const MODEL_API_IDS: Record<string, string> = Object.fromEntries(
  modelRegistry.getAllModels().map(m => [m.id, m.apiId]),
);

/**
 * Resolve the actual provider API model ID from an internal alias.
 * Delegates to ModelRegistry.
 * @throws {UnknownModelError} if model is not recognized
 */
export function resolveApiModelId(model: ModelType): string {
  if (!modelRegistry.has(model)) {
    throw new UnknownModelError(model);
  }
  return modelRegistry.resolveApiId(model);
}

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
  const def = modelRegistry.get(model);
  if (!def) {
    throw new UnknownModelError(model);
  }
  return def.provider;
}

/** Type guard: checks whether a model belongs to the Claude provider.
 *
 *  Sprint 230 Task 230-002: switched from module-load CLAUDE_MODELS snapshot
 *  to a live `modelRegistry.get()` lookup so models added at runtime
 *  (bootstrapFromCatalog / register) pass the guard.
 */
export function isClaudeModel(model: ModelType): model is ClaudeModel {
  return modelRegistry.get(model)?.provider === 'claude';
}

/** Type guard: checks whether a model belongs to the OpenAI/Codex provider.
 *
 *  Sprint 230 Task 230-002: switched from module-load PROVIDER_MODEL_MAP.codex
 *  snapshot to a live `modelRegistry.get()` lookup.
 */
export function isOpenAIModel(model: ModelType): model is OpenAIModel {
  return modelRegistry.get(model)?.provider === 'codex';
}

/** Type guard: checks whether a model belongs to the Gemini provider.
 *
 *  Sprint 230 Task 230-002: switched from module-load PROVIDER_MODEL_MAP.gemini
 *  snapshot to a live `modelRegistry.get()` lookup.
 */
export function isGeminiModel(model: ModelType): model is GeminiModel {
  return modelRegistry.get(model)?.provider === 'gemini';
}

/**
 * Get a numeric rank for model capability tier (provider-agnostic).
 * Delegates to ModelRegistry.getNumericTier().
 * Higher = more capable.
 *   Tier 0 (economy): haiku, gpt-5-mini, gpt-4.1-mini, o4-mini, gemini-2.0-flash
 *   Tier 1 (standard): sonnet, gpt-4.1, o3, o4-mini, gemini-2.5-flash
 *   Tier 2 (premium): opus, gpt-5, gemini-2.5-pro
 *   Tier 3 (premium_plus): gemini-3.1-pro-preview
 */
export function getModelTier(model: ModelType): number {
  return modelRegistry.getNumericTier(model);
}

/**
 * Check if a string is a valid model name.
 */
export function isValidModel(value: string): value is ModelType {
  return modelRegistry.has(value);
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
  /**
   * Sprint 195 195-001 (W-INTEGRITY): worker did not write `.result` but
   * disk-verify (`verifyDiskAgainstClaim`) detected on-disk evidence
   * (numstat delta or untracked files in scope). Brain converts the
   * synthetic NO_GO into this status so a human can review the partial
   * work before reroute. Treated as a non-terminal hint, NOT a success.
   */
  MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED',
}

/**
 * Brain's terminal evaluation outcome for a task.
 *
 * Sprint 192 Task 192-010 (W-INTEGRITY I-4) added `DEFERRED` for transparent
 * retro reporting. Semantic distinction from existing TaskStatus.PAUSED:
 *   • PAUSED   → task is blocked because a depended-upon task reached NO_GO
 *                (dependency-scheduler.ts marks via TaskStatus); cascades a
 *                downstream fix per debt-manager.handleCrossDependencies.
 *   • DEFERRED → dispatcher saturation (max_workers cap or wave throughput);
 *                the task never reached EXECUTE before the EVALUATE gate fired.
 *                Cascade is NOT triggered (handleCrossDependencies filters
 *                only NO_GO; DEFERRED is intentionally excluded so saturation
 *                does not spawn xfix tasks downstream).
 */
export enum TaskEvaluation {
  DONE = 'DONE',
  GO_WITH_TECH_DEBT = 'GO_WITH_TECH_DEBT',
  NO_GO = 'NO_GO',
  DEFERRED = 'DEFERRED',
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
  /** Canonical work-model kind (WM-2a, optional/additive). Set at plan-time by future consumers. */
  type?: TaskKind;
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
  /** User-specified agent override from DIRECTIVES.md */
  forceAgent?: string;
  /** User-specified skill overrides from DIRECTIVES.md */
  forceSkills?: string[];
  /** User-specified agent exclusions from DIRECTIVES.md (prefix: -) */
  excludeAgent?: string[];
  /** User-specified skill exclusions from DIRECTIVES.md (prefix: -) */
  excludeSkills?: string[];
  /**
   * Per-task auth mode override from DIRECTIVES.md (`- Auth: subscription|api`).
   * When 'api', spawn-backend-docker skips `~/.claude` mount and REQUIRES
   * `ANTHROPIC_API_KEY` in env. When undefined, falls back to config `auth_mode`
   * via `readAuthMode()`. 'subscription' = default behavior (session mount).
   */
  authMode?: 'subscription' | 'api';
  /**
   * Per-task spawn backend override from DIRECTIVES.md (`- Backend: docker|tmux|subprocess`).
   * Uses the existing spawn-backend vocabulary (config `spawn_backend`); does NOT
   * invent a `host` value (the host-adapter routing for codex/gemini/ollama is a
   * separate axis — see `isAdapterProvider`). Sprint 252 (PSL-1 verify): setting
   * this forces the task onto the named backend, overriding both the config
   * `spawn_backend` AND host-adapter routing — so codex/gemini can be exercised IN
   * a docker container via the ProviderCommandSpec + per-provider OAuth mount.
   * When undefined, default routing applies (unchanged behavior).
   */
  backend?: 'docker' | 'tmux' | 'subprocess';
  /** Sprint 196 WP-2: Intent mode for FIX worker — how to approach the re-execution. */
  fixMode?: 'verify-only' | 'amend' | 're-implement';
  /** Assigned agent ID (from agent pool) or 'generic' */
  assignedAgent?: string;
  /** Assigned skill IDs (from skill pool) */
  assignedSkills?: string[];
  /** Estimated token count for the full worker prompt (populated by buildWorkerPrompt) */
  estimatedTokens?: number;
  /** Routing metadata for debugging and learning */
  routingMeta?: {
    taskDNA?: unknown;
    confidence?: string;
    routingVersion?: 'v1' | 'v2';
    /** Number of mid-sprint reroute attempts applied to this task */
    rerouteCount?: number;
    /**
     * F8 (Sprint 182): Semantic warnings from forceAgent/forceSkills override
     * activation checks (e.g., low-relevance forced agent). Advisory only —
     * PLAN proceeds with override honored.
     */
    overrideWarnings?: string[];
    /**
     * Sprint 196 WP-3: Test-scope auto-derivation audit trail.
     * Records which test file paths were inferred from scope.filesWrite.
     */
    scopeDerivation?: {
      extraFiles: string[];
      extraDirs: string[];
      reason: string;
    };
  };
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

// ─── Rubric-Based Evaluation ───────────────────────────────────────
/** A single criterion in an evaluation rubric */
export interface RubricCriterion {
  name: string;
  weight: number;
  threshold: number;
  evaluator: 'auto' | 'pattern' | 'metric';
}

/** Rubric configuration for structured task evaluation */
export interface EvaluationRubric {
  criteria: RubricCriterion[];
  passingScore: number;
  maxRetries: number;
}

/** Score for a single rubric criterion */
export interface RubricScore {
  criterion: string;
  score: number;
  passed: boolean;
  reason: string;
}

/** Full evaluation result from rubric-based grading */
export interface EvaluationResult {
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  totalScore: number;
  rubricScores: RubricScore[];
  retryCount: number;
}

// ─── Token Usage ────────────────────────────────────────────────────
/** Token usage data from a worker's LLM interaction */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  provider?: ProviderName;
  model?: ModelType;
}

// ─── Worker Question / Brain Answer ─────────────────────────────────
/** Action a worker can request from Brain when it encounters ambiguity */
export type QuestionAction = 'continue' | 'skip' | 'abort' | 'retry';

/** A question written by a worker to .tasks/task-{id}.question */
export interface WorkerQuestion {
  taskId: string;
  workerId: string;
  question: string;
  context?: string;
  suggestedAction?: QuestionAction;
  timestamp: string;
}

/** An answer written by Brain to .tasks/task-{id}.answer */
export interface BrainAnswer {
  taskId: string;
  action: QuestionAction;
  message?: string;
  timestamp: string;
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
  /** Token usage data from the worker's LLM interaction */
  tokenUsage?: TokenUsage;
  /**
   * Worker self-reported rubric scores.
   * @deprecated Sprint 146: Worker self-report removed — use Quality Assessor dimensions
   * (assessQuality() from quality-assessor.ts) as the canonical quality scoring system.
   * This field is retained for backward compatibility with existing result files only.
   */
  rubricScores?: {
    correctness?: number;
    test_coverage?: number;
    scope_compliance?: number;
    documentation?: number;
  };
  /** Brain's final evaluation decision for this task */
  evaluationDecision?: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
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
  /** User-specified agent override from AI planner output */
  forceAgent?: string;
  /** User-specified skill overrides from AI planner output */
  forceSkills?: string[];
  /** User-specified agent exclusions from AI planner output */
  excludeAgent?: string[];
  /** User-specified skill exclusions from AI planner output */
  excludeSkills?: string[];
}

export interface PlannerResult {
  tasks: PlannerTask[];
  reasoning: string;
}
