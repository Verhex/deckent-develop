// ─── Task Domain Types ──────────────────────────────────────────────────────
// Split from types.ts — Task, planning, and model-related types
// Model data is now delegated to ModelRegistry (single source of truth).

import { createHash } from 'node:crypto';

import { modelRegistry, registerCodexParityModels } from './model-registry.js';
import type { TaskKind, ActorContext, ExecutionBudget } from './work-model.js';
import type { ProviderBillingEvidence } from './provider-billing-evidence.js';
import type { ExecutionBudgetRole, ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionAdmissionMode } from './execution-admission.js';
import type { AttendedExecutionProposalReference } from './attended-execution-proposal.js';
import type { InvocationReceiptRef } from './invocation-receipt.js';
import type { FinalOnlyUsageAuthorization } from './execution-budget-policy.js';
import type {
  ProductionWiringContract,
  ProductionWiringEvidence,
} from './production-wiring-contract.js';
import {
  POST_SETTLEMENT_MAX_ARG_BYTES,
  POST_SETTLEMENT_MAX_COMMAND_ARGS,
} from './post-settlement-verification.js';
import type {
  BoundedVerificationCommand,
  PostSettlementIngress,
} from './post-settlement-verification.js';

// ─── Models ──────────────────────────────────────────────────────────

/** Provider-family model identifiers are registry-validated opaque API IDs. */
export type ClaudeModel = string & {};
export type OpenAIModel = string & {};
export type GeminiModel = string & {};

/**
 * Union of all supported model identifiers across providers.
 *
 * The `(string & {})` tail keeps autocomplete + narrowing for the literal IDs
 * above while accepting arbitrary runtime model IDs registered dynamically by
 * `bootstrapFromCatalog()` (models.dev). Registry-validation guards the
 * runtime side; the literal union covers the bundled builtin-13 surface.
 */
export type ModelType = string & {};

/**
 * Supported AI provider names.
 *
 * Sprint 202 Task 202-001 (F1 Provider Independence): widened to include
 * `'ollama'` so the local-LLM provider becomes a first-class bootstrap target.
 * Prior to this widening, `worker_provider=ollama` passed config validation
 * but `getProviderAdapterForTask('ollama')` returned null → silent Claude
 * fallback. See ADR-017 (provider adapter pattern) and provider.ts:detectOllama.
 *
 * OPENROUTER-PROVIDER (row 477): widened again to include `'openrouter'`. Before
 * this, `providers/openrouter.ts` was registered via `'openrouter' as ProviderName`
 * casts (provider.ts:1427/1430/1435) and no OpenRouter model could be added to the
 * model registry at all (`ModelDefinition.provider` is `RegistryProviderName`), so
 * `- Provider: openrouter` was silently dropped at directive-parse time
 * (task-builder.ts:1138-1148, `VALID_PROVIDERS_ALL` miss) and every lookup
 * `isModelAvailable(*, 'openrouter')` returned false. Keep this union in sync with
 * `ProviderNameExt` (core/types.ts) and `RegistryProviderName`
 * (core/model-registry-types.ts) — they are hand-mirrored.
 */
export type ProviderName = 'claude' | 'codex' | 'gemini' | 'ollama' | 'openrouter';

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
    openrouter: {
      get: () => modelRegistry.getByProvider('openrouter').map(m => m.id) as readonly ModelType[],
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
 * LIVE model-id listesi (born-683 zero-hardcode). `ALL_MODELS` modül-yükleme
 * ANINDA donan bir snapshot'tır — opt-in aileler (registerCodexParityModels'in
 * gpt-5.5/5.6'sı, dinamik ollama tag'leri) provider-modülü yüklenmeden orada
 * görünmez; config-validasyonu bu yüzden gpt-5.6-sol gibi kayıtlı-ama-geç
 * modelleri reddediyordu (2026-07-12 canlı-vakası). Bu çağrı validasyon-ANINDA
 * parity-kaydını garanti edip (idempotent Map.set) registry'nin o anki tam
 * listesini döner — literal liste YOK, tek-kaynak registry.
 */
export function getAllKnownModelIds(): readonly string[] {
  registerCodexParityModels();
  return modelRegistry.getAllModelIds();
}

/**
 * Canonical model identity map. Keys and values are intentionally identical;
 * retained temporarily for source compatibility while consumers move to the
 * direct API ID.
 */
export const MODEL_API_IDS: Record<string, string> = Object.fromEntries(
  modelRegistry.getAllModels().map(m => [m.id, m.apiId]),
);

/**
 * Validate and return a canonical provider API model ID unchanged.
 * @throws {UnknownModelError} if model is not recognized
 */
export function resolveApiModelId(model: ModelType): string {
  if (!modelRegistry.has(model)) {
    throw new UnknownModelError(model);
  }
  const apiId = modelRegistry.resolveApiId(model);
  if (apiId !== model) {
    throw new UnknownModelError(model);
  }
  return model;
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
 *   • NOT_DISPATCHED → Sprint 351 Task 351-008 (MOAT-3): dispatch itself
 *                never happened for this task — no spawn reached it, no
 *                container ever started, and NONE of `.result` / `.hb` /
 *                `.log` ever touched disk (verified via disk evidence, not
 *                just in-memory state). Distinct from NO_GO, which implies
 *                a worker actually ran (even if it crashed or produced
 *                nothing) — NOT_DISPATCHED is an orchestrator/dispatcher-
 *                side gap, never the worker's fault. The FIX phase treats
 *                NOT_DISPATCHED task ids as re-dispatch candidates and
 *                never routes them through the NO_GO blame-fix pipeline
 *                (see `classifyFixPhaseTasks` in result-evaluator.ts).
 *                Sibling to DEFERRED (also dispatcher-side, also excluded
 *                from cascade) but kept as a separate value: DEFERRED is a
 *                pre-EVALUATE dispatch-deadline signal computed by the
 *                caller, NOT_DISPATCHED is EVALUATE's own disk-evidence
 *                verdict for a task it directly inspected.
 */
export enum TaskEvaluation {
  DONE = 'DONE',
  GO_WITH_TECH_DEBT = 'GO_WITH_TECH_DEBT',
  NO_GO = 'NO_GO',
  DEFERRED = 'DEFERRED',
  NOT_DISPATCHED = 'NOT_DISPATCHED',
}

export type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

// ─── Task Scope (Blueprint 15) ──────────────────────────────────────
export interface TaskScope {
  directories: string[];
  filesRead: string[];
  filesWrite: string[];
}

// ─── GO / NO-GO Criteria (Blueprint 8) ──────────────────────────────
export type GoNoGoCriterionPolarity = 'go' | 'no-go';

/**
 * One machine-addressable acceptance criterion.
 *
 * The legacy display strings remain canonical user-facing summaries. `items`
 * preserve the authored criterion boundaries and evidence contract for host
 * settlement without guessing that punctuation inside free text is a boundary.
 */
export interface GoNoGoCriterionItem {
  /** Content-addressed host identity; stable across item reordering. */
  id: string;
  polarity: GoNoGoCriterionPolarity;
  statement: string;
  evidenceRequirements: string[];
}

export interface GoNoGoCriterionItemInput {
  polarity: GoNoGoCriterionPolarity;
  statement: string;
  evidenceRequirements?: readonly string[];
}

function normalizeCriterionText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

/**
 * Build the canonical criterion item used by every authoring path.
 *
 * IDs are derived by the host, never accepted from planner prose. Evidence
 * requirements are a set for identity purposes, so order-only planner drift
 * cannot change the criterion ID.
 */
export function createGoNoGoCriterionItem(
  input: GoNoGoCriterionItemInput,
): GoNoGoCriterionItem {
  const statement = normalizeCriterionText(input.statement);
  if (!statement) throw new TypeError('GO/NO-GO criterion statement must not be empty');
  const evidenceRequirements = [...new Set(
    (input.evidenceRequirements ?? [])
      .map(normalizeCriterionText)
      .filter(Boolean),
  )].sort();
  const digest = createHash('sha256')
    .update(JSON.stringify([input.polarity, statement, evidenceRequirements]))
    .digest('hex');
  return {
    id: `criterion-${input.polarity}-${digest}`,
    polarity: input.polarity,
    statement,
    evidenceRequirements,
  };
}

export interface GoNoGoCriteria {
  goCriteria: string;
  noGoCriteria: string;
  techDebtAcceptable: string;
  /** Additive structured authority; absent only on unmigrated external inputs. */
  items?: GoNoGoCriterionItem[];
}

export const PRODUCTION_WIRING_EVIDENCE_VERSION = 1 as const;

/** Plan-time wiring authority bound to the exact canonical contract bytes. */
export interface ProductionWiringPlanEvidence {
  readonly version: typeof PRODUCTION_WIRING_EVIDENCE_VERSION;
  readonly contractDigest: string;
  readonly contract: ProductionWiringContract;
}

/**
 * Worker-observed evidence is deliberately incapable of claiming completion.
 * Host settlement may promote it only after independently verifying the bound
 * plan contract and attaching canonical consumer execution evidence.
 */
export interface ProductionWiringResultEvidence {
  readonly version: typeof PRODUCTION_WIRING_EVIDENCE_VERSION;
  readonly contractDigest: string;
  readonly observedBy: 'worker';
  readonly evidence: Exclude<ProductionWiringEvidence, { readonly state: 'complete' }>;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Build the only supported plan evidence shape; callers never author its digest. */
export function createProductionWiringPlanEvidence(
  contract: ProductionWiringContract,
): ProductionWiringPlanEvidence {
  const contractDigest = createHash('sha256').update(canonicalJson(contract)).digest('hex');
  return {
    version: PRODUCTION_WIRING_EVIDENCE_VERSION,
    contractDigest,
    contract,
  };
}

export const POST_SETTLEMENT_PLAN_PROJECTION_VERSION = 1 as const;
export const POST_SETTLEMENT_PLAN_PROJECTION_KIND = 'post-settlement-plan-projection' as const;

/**
 * Platform this task's post-settlement command adapter is declared to run on.
 * Mirrors the exact platform set from Immutable Law 2 (EVERY ENVIRONMENT), plus
 * an explicit platform-agnostic value for adapters with no OS dependency.
 */
export type PostSettlementPlatformCapability = 'linux' | 'darwin' | 'win32' | 'wsl' | 'any';

/** Author-supplied (pre-digest) content of a post-settlement plan projection. */
export interface PostSettlementPlanProjectionContract {
  readonly ingress: PostSettlementIngress;
  readonly scope: TaskScope;
  readonly platformCapability: PostSettlementPlatformCapability;
  readonly command: BoundedVerificationCommand;
}

/**
 * Digest-bound plan-time declaration of the post-settlement promotion proof a
 * task requires (488-014). Represented separately from the task's own
 * executable work (`goNogo`/`scope`/`description`) — a projection is proof
 * metadata carried alongside a Task, never a Task of its own: attaching it
 * never adds an entry to `Sprint.tasks` and never changes `sprint.tasks.length`.
 */
export interface PostSettlementPlanProjection extends PostSettlementPlanProjectionContract {
  readonly version: typeof POST_SETTLEMENT_PLAN_PROJECTION_VERSION;
  readonly kind: typeof POST_SETTLEMENT_PLAN_PROJECTION_KIND;
  readonly contractDigest: string;
}

/** Thrown when a promotion-proof declaration exceeds the bounded-command limits. */
export class PostSettlementPlanProjectionBoundsError extends TypeError {
  constructor(reason: string) {
    super(`Post-settlement plan projection command out of bounds: ${reason}`);
    this.name = 'PostSettlementPlanProjectionBoundsError';
  }
}

/**
 * Build the only supported post-settlement plan projection shape; callers
 * never author its digest. Enforces the same bounded-argv limits as the
 * runtime reducer (post-settlement-verification.ts) so a plan-time
 * declaration can never smuggle an unbounded or malformed command through.
 */
export function createPostSettlementPlanProjection(
  contract: PostSettlementPlanProjectionContract,
): PostSettlementPlanProjection {
  const { command } = contract;
  if (command.args.length > POST_SETTLEMENT_MAX_COMMAND_ARGS) {
    throw new PostSettlementPlanProjectionBoundsError(
      `command has ${command.args.length} args (max ${POST_SETTLEMENT_MAX_COMMAND_ARGS})`,
    );
  }
  for (const value of [command.executable, command.cwdRef, ...command.args]) {
    if (Buffer.byteLength(value, 'utf8') > POST_SETTLEMENT_MAX_ARG_BYTES) {
      throw new PostSettlementPlanProjectionBoundsError(
        `argument exceeds ${POST_SETTLEMENT_MAX_ARG_BYTES} bytes`,
      );
    }
  }
  if (command.args.some(arg => arg.includes('\0')) || command.executable.includes('\0')) {
    throw new PostSettlementPlanProjectionBoundsError('argument contains a NUL byte');
  }
  const contractDigest = createHash('sha256').update(canonicalJson(contract)).digest('hex');
  return {
    ...contract,
    version: POST_SETTLEMENT_PLAN_PROJECTION_VERSION,
    kind: POST_SETTLEMENT_PLAN_PROJECTION_KIND,
    contractDigest,
  };
}

/**
 * Immutable plan-time provenance for the worker budget carried by `Task.budget`.
 * This is a policy snapshot, not an executable permit: final provider/model/auth/
 * backend reachability and live limit evidence are bound later by host admission.
 */
export interface TaskExecutionBudgetPolicySnapshot {
  readonly state: 'allow' | 'hold';
  readonly role: ExecutionBudgetRole;
  readonly taskKind?: TaskKind;
  readonly resolvedProvider: ProviderName | 'unknown';
  readonly executionCostClass: 'remote' | 'local';
  readonly profileRef: string;
  readonly policyDigest?: string;
  readonly reasonCode?:
    | 'budget-policy-missing'
    | 'role-profile-missing'
    | 'landing-policy-missing'
    | 'landing-turn-reserve-insufficient'
    | 'final-only-usage-authorization-missing';
  readonly requiredContinuationTurns?: number;
  readonly guaranteedContinuationTurns?: number;
  /** Exact owner grant for a final-only provider; absent means no such execution authority. */
  readonly finalOnlyUsage?: Readonly<FinalOnlyUsageAuthorization>;
  /** ADR-G-037 attendance is explicit; missing producer evidence resolves to unattended. */
  readonly admissionMode: ExecutionAdmissionMode;
  /** Owner-authored landing contract included in the execution-policy digest. */
  readonly landingPolicy?: Readonly<ExecutionLandingPolicyConfig>;
  /**
   * Immutable ApprovalBroker request reference carried as provenance only.
   * It is never an execution permit without final host receipt verification.
   */
  readonly approvalEvidenceRef?: string;
  /**
   * Exact immutable proposal digests approved by the owner. The request
   * reference above is never sufficient without this host-verified projection.
   */
  readonly approvalProposal?: Readonly<AttendedExecutionProposalReference>;
  /** The pre-policy request, retained because a request may narrow but never widen owner authority. */
  readonly requestedBudget?: Readonly<ExecutionBudget>;
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
  /**
   * Per-task MODEL reasoning-effort override from DIRECTIVES.md (`- ModelEffort: <level>`).
   * Sprint 252 (F1-RE): reasoning DEPTH the model's CLI offers (claude --effort
   * low|medium|high|xhigh|max; codex model_reasoning_effort minimal|low|medium|high).
   * DISTINCT from `effort`/`forceEffort` (work SIZE → timeout/budget/token-estimate).
   * Opt-in: when undefined, no reasoning-effort flag is sent (CLI default kept).
   * Validated per-provider at spawn time via `resolveReasoningEffort`.
   */
  modelEffort?: string;
  /** Sprint 196 WP-2: Intent mode for FIX worker — how to approach the re-execution. */
  fixMode?: 'verify-only' | 'amend' | 're-implement';
  /**
   * Tier-1 Proof-of-Function smoke directive (216-004, officially landed PLAN-W1).
   * Parsed from a DIRECTIVES `Smoke: <cmd> → <expect>` line and threaded through
   * the structured/AI planner into the written `.tasks/task-*.json`. Consumed by
   * `proof-of-function.readSmokeSpec` for the post-sprint real-binary run-verify
   * gate (ADR-079). Absent for Tier-0 tasks.
   */
  smoke?: { command: string; expect: string };
  /** Assigned agent ID (from agent pool) or 'generic' */
  assignedAgent?: string;
  /** Assigned skill IDs (from skill pool) */
  assignedSkills?: string[];
  /** Estimated token count for the full worker prompt (populated by buildWorkerPrompt) */
  estimatedTokens?: number;
  /** Routing metadata for debugging and learning */
  routingMeta?: {
    taskDNA?: unknown;
    confidence?: string | number;
    routingVersion?: 'v2' | 'v3';
    /** Routing Engine v3 semantic work classification. */
    workType?: string;
    /** Decision provenance emitted by the v3 vector pipeline. */
    provenance?: string;
    /** Persona guidance slices selected in the same decision as agent + skills. */
    personaSlices?: string[];
    /** Human-readable compact decision story for status/audit surfaces. */
    storySummary?: string;
    /** Typed escalation reason when v3 cannot make an unambiguous selection. */
    escalation?: string;
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
  /** Requesting actor — threaded from ExecutionRequest for downstream RBAC seam (data only, no enforcement). */
  actor?: ActorContext;
  /** Durable per-task token/USD ceiling propagated from ExecutionRequest. */
  budget?: ExecutionBudget;
  /** Plan-time owner-policy provenance for `budget`; never an execution permit. */
  budgetPolicy?: TaskExecutionBudgetPolicySnapshot;
  /** Digest-bound production-wiring authority supplied by the planner/host. */
  productionWiring?: ProductionWiringPlanEvidence;
  /**
   * Digest-bound post-settlement promotion-proof declaration (488-014),
   * parsed from a `- PromotionProof:` directive line. Represented separately
   * from this task's own executable work — never a hidden Task, never counted
   * toward `sprint.tasks.length`. Absent unless explicitly declared.
   */
  postSettlementProjection?: PostSettlementPlanProjection;
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

/**
 * Root-cause category for a NO_GO evaluation result.
 * Set by `enrichEvaluationWithCategory` in result-evaluator.ts.
 * Only present on NO_GO decisions — DONE/GO_WITH_TECH_DEBT leave this undefined.
 */
export type NoGoCategory =
  | 'BOUNDARY_VIOLATION'
  | 'POLICY_CONFLICT'
  | 'RUNTIME_ERROR'
  | 'TECHNICAL'
  | 'FATAL_ERROR'
  | 'DEPENDENCY_CONFLICT'
  | 'ADR_VIOLATION'
  | 'UNKNOWN';

/** Full evaluation result from rubric-based grading */
export interface EvaluationResult {
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  totalScore: number;
  rubricScores: RubricScore[];
  retryCount: number;
  /** Root-cause category (STATE-W1). Only set on NO_GO decisions. */
  noGoCategory?: NoGoCategory;
  /** Files from result.filesChanged that are within task.scope (in-scope). Only set on NO_GO. */
  filesInScope?: string[];
  /** Files from result.filesChanged outside task.scope and not auxiliary. Only set on NO_GO. */
  filesOutOfScope?: string[];
  /** True when filesInScope is non-empty — partial promotion is possible. Only set on NO_GO. */
  isPartialPromotable?: boolean;
}

// ─── Token Usage ────────────────────────────────────────────────────
/** Token usage data from a worker's LLM interaction */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  /**
   * Cache-CREATION (write) tokens — the limit-dominant cost the heuristic
   * estimator missed entirely (it only ever set cacheRead). Real value flows
   * from the provider's native session-store (sprint-334 TOKEN-REAL-CAPTURE);
   * priced by cost-calculator's existing `RegimeCostUsage.cacheCreationTokens`.
   * Additive optional — absent on legacy/estimate-only usage.
   */
  cacheCreationTokens?: number;
  /**
   * Provenance of these counts — set honestly by the resolver so consumers can
   * tell a real measurement from an estimate:
   *   - `'session-store'` — REAL, summed from the provider's native per-session
   *     usage store (the only source carrying real `cacheCreationTokens`).
   *   - `'envelope'` — the Claude CLI `--output-format json` side-channel.
   *   - `'estimate'` — heuristic fallback (NOT a measurement).
   * Additive optional + open string for forward providers; absent = unknown/legacy.
   */
  source?: 'session-store' | 'envelope' | 'estimate' | string;
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
export type CrossVerifyVerdict = 'confirmed' | 'refuted' | 'unclear';

/** Host authority for a task rejected before any worker/backend invocation. */
export interface HostPreDispatchSettlement {
  readonly version: 1;
  readonly state: 'NOT_DISPATCHED';
  readonly attemptId: string;
  readonly reasonCode: string;
  readonly evidenceRef: string;
}

/** Host-observed execution truth for one semantic cross-verification verdict. */
export interface CrossVerifyExecutionEvidence {
  outcome: 'completed' | 'budget-exhausted' | 'failed';
  initialAttemptId: string;
  terminalAttemptId: string;
  reason?: string;
  cumulativeUsage?: {
    turns: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    maxContextTokens: number;
  };
}

/** Exact host-authority references that admitted a verifier candidate. */
export interface CrossVerifyEligibilityEvidence {
  reachabilityRef: string;
  limitEvidenceRefs: string[];
  accountRefHash: string | null;
  authMode: string;
  transport: string;
  executionBackend: string;
  executionProfileRef: string;
}

/** Durable cross-provider verification evidence appended by the orchestrator. */
export type CrossVerifyEvidence =
  | {
      outcome: CrossVerifyVerdict;
      verifier: ProviderName;
      verifierModel: string;
      verdict: CrossVerifyVerdict;
      reason: string;
      execution?: CrossVerifyExecutionEvidence;
      eligibility?: CrossVerifyEligibilityEvidence;
      invocationReceiptRef?: InvocationReceiptRef;
      assurance?: 'typed-host-adjudicated';
      adjudicationReceiptRef?: string;
    }
  | {
      outcome: 'unavailable';
      verifier?: ProviderName;
      verifierModel?: string;
      reason: string;
      invocationReceiptRef?: InvocationReceiptRef;
      authorityEvidenceRef?: string;
    };

export interface TaskResult {
  /** born-610: set by cascadeSkipDeadBlocked — this task was NEVER dispatched;
   *  its NO_GO is a synthetic skip (dead upstream), not a worker failure.
   *  Fix/cross-fix gates MUST exempt it (NOT_DISPATCHED-muafiyeti emsali) —
   *  otherwise a dependencies:[] fix re-runs work on the unreviewed foundation. */
  cascadeSkipped?: boolean;
  taskId: string;
  workerId: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  /** Host-authored claim-time work attribution. Worker prose is never authority. */
  workAttribution?: {
    state: 'VERIFIED' | 'HOLD';
    attemptId: string;
    baselineRef: string;
    baselineSha256?: string;
    scopeDigest: string;
    reasonCode?: string;
    claimedOutsideScope?: string[];
  };
  /** Exact zero-work authority when dispatch was rejected before worker spawn. */
  preDispatchSettlement?: HostPreDispatchSettlement;
  testsPassed: boolean;
  /** Provider compatibility evidence: commands recovered from a legacy testsPassed string array. */
  testCommands?: string[];
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
   * Computed monetary cost of this task's LLM usage (Worker Output Contract §1.4),
   * filled orchestrator-side from {@link tokenUsage} + per-model pricing. Local /
   * self-hosted models (ollama) → `{ usd: 0, isLocal: true }`. Inline type avoids a
   * task-types ↔ cost-calculator import cycle; structurally equals `ResultCost`.
   */
  cost?: {
    usd: number;
    currency: string;
    referenceUsd?: number;
    billingMode?: 'api' | 'subscription' | 'free_tier' | 'local';
    pricingSource: string;
    isLocal: boolean;
  };
  /**
   * Provider-final price/usage evidence. It is authoritative over local
   * repricing, but effective execution auth still decides billed vs reference.
   */
  providerBilling?: ProviderBillingEvidence;
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
  /** Cross-provider verification truth; absent means not requested or legacy result. */
  crossVerify?: CrossVerifyEvidence;
  /** Non-authoritative worker observations bound to the task's plan contract. */
  productionWiringEvidence?: ProductionWiringResultEvidence;
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
