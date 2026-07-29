// ─── Task Router ────────────────────────────────────────────────────
// Routes tasks to the best provider, agent, and skill set based on
// config overrides, task metadata, agent preferences, and skill affinity.

import type { Task } from '../core/types.js';
import type { ProviderName, ModelType } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { PROVIDER_MODEL_MAP } from '../core/task-types.js';
import { orderedRoleProviders, ProviderError, validateProviderName } from '../core/provider.js';
import { brainEstimateTimeout } from './timeout-estimator.js';
import type { SprintHistory } from './timeout-estimator.js';
import { writeEvent, CHANNELS } from './event-stream.js';
import { taskKindToIntent, type RouterTaskType } from '../core/work-model.js';
import type { IntentType } from '../core/routing-types.js';

// ─── Types ──────────────────────────────────────────────────────────

/** Skill routing configuration — maps task categories to preferred providers */
export interface SkillRoutingConfig {
  design?: string | null;
  testing?: string | null;
  docs?: string | null;
  default?: string;
}

/** Configuration subset used by the task router */
export interface TaskRouterConfig {
  skill_routing?: SkillRoutingConfig;
  brain_provider?: ProviderName;
  worker_provider?: ProviderName;
  fallback_provider?: ResolvedConfig['fallback_provider'];
  provider_fallback?: ResolvedConfig['provider_fallback'];
  providers?: ResolvedConfig['providers'];
  /** Config-level auth mode — resolved after task.authMode override (ADR-076) */
  auth_mode?: ResolvedConfig['auth_mode'];
}

/** Result of routing a task to a provider, agent, and skills */
export interface TaskRouting {
  /** The selected provider for task execution */
  provider: ProviderName;
  /** The assigned agent identifier */
  agent: string;
  /** List of skill identifiers assigned to the task */
  skills: string[];
  /** Human-readable explanation of why this routing was chosen */
  reason: string;
  /** Structured pre-dispatch fallback provenance; absent when the preferred provider won. */
  providerFallback?: ProviderFallbackDecision;
  /** Estimated timeout in seconds from Brain heuristic estimator (optional) */
  timeoutSeconds?: number;
  /**
   * Resolved auth mode for this worker — uniform across Sprint/Task/Process modes.
   * Priority: task.authMode (DIRECTIVES) > config.auth_mode > 'subscription'.
   */
  authMode: 'subscription' | 'api';
}

export interface ProviderFallbackDecision {
  requestedProvider: ProviderName;
  selectedProvider: ProviderName;
  configuredOrder: readonly ProviderName[];
  reasonCode: 'preferred_unavailable';
}

interface ProviderAvailabilityResolution {
  provider: ProviderName;
  fallback?: ProviderFallbackDecision;
}

export type ProviderRoutingErrorCode =
  | 'E_PROVIDER_FALLBACK_EXHAUSTED'
  | 'E_PROVIDER_FALLBACK_PROVENANCE_REQUIRED'
  | 'E_PROVIDER_FALLBACK_PROVENANCE_WRITE_FAILED';

export class ProviderRoutingError extends ProviderError {
  constructor(
    public readonly code: ProviderRoutingErrorCode,
    providerName: ProviderName | '',
  ) {
    super(code, providerName);
    this.name = 'ProviderRoutingError';
  }
}

/**
 * Task type categories detected from scope and file patterns — backward-compat
 * alias of the canonical {@link RouterTaskType} (single-sourced in
 * `core/work-model.ts`, WM-2). Kept as a named re-export so existing importers
 * keep resolving; new code references `RouterTaskType`.
 */
export type TaskType = RouterTaskType;

// ─── Helpers ────────────────────────────────────────────────────────

/** Map from task type to skill_routing config key */
const TASK_TYPE_TO_ROUTING_KEY: Record<RouterTaskType, keyof SkillRoutingConfig | null> = {
  design: 'design',
  test: 'testing',
  doc: 'docs',
  code: null,
  unknown: null,
};

/** Canonical routing-key lookup for IntentType (WM-2c bridge — mirrors TASK_TYPE_TO_ROUTING_KEY semantics) */
const INTENT_TO_ROUTING_KEY: Record<IntentType, keyof SkillRoutingConfig | null> = {
  documentation: 'docs',
  design: 'design',
  implementation: null,
  bugfix: null,
  refactor: null,
  security: null,
  devops: null,
  config: null,
  performance: null,
  migration: null,
  architecture: null,
  unknown: null,
};

/**
 * Check if a string is a valid ProviderName.
 * @param value - The string to check
 * @returns True if the value is a recognized provider name
 */
function isProviderName(value: string): value is ProviderName {
  return validateProviderName(value);
}

/**
 * Infer provider from a model identifier.
 * @param model - An exact model API ID (e.g., 'claude-opus-4-8', 'gpt-5.6-sol')
 * @returns The provider name, or undefined if model is not recognized
 */
function inferProviderFromModel(model: ModelType | string): ProviderName | undefined {
  for (const [provider, models] of Object.entries(PROVIDER_MODEL_MAP)) {
    if ((models as readonly string[]).includes(model)) {
      return provider as ProviderName;
    }
  }
  return undefined;
}

// ─── Task Type Detection ────────────────────────────────────────────

/**
 * Detect task type from scope directories and file patterns.
 * Examines scope.directories, scope.filesWrite, and scope.filesRead to
 * classify the task into one of: 'code', 'test', 'doc', 'design', or 'unknown'.
 * @param task - The task to classify
 * @returns The detected task type category
 */
export function detectTaskType(task: Task): RouterTaskType {
  const dirs = task.scope.directories;
  const allFiles = [...task.scope.filesWrite, ...task.scope.filesRead];
  const writeFiles = task.scope.filesWrite;

  // Design: ui/, components/, .css, .html
  if (
    dirs.some(d => d === 'ui' || d.startsWith('ui/') || d === 'components' || d.startsWith('components/')) ||
    allFiles.some(f => /\.(css|scss|html|svelte|vue|jsx)$/i.test(f))
  ) {
    return 'design';
  }

  // FIX: Check code BEFORE test to prevent misclassification.
  // A task with both src/ and tests/ in scope should be 'code' if most writes are in src/.
  const hasSrcDir = dirs.some(d => d === 'src' || d.startsWith('src/'));
  const hasTestDir = dirs.some(d => d === 'tests' || d.startsWith('tests/') || d === 'test' || d.startsWith('test/'));
  const hasSrcFiles = allFiles.some(f => /\.(ts|tsx|js|jsx|py|java|go|rs)$/i.test(f));
  const hasTestFiles = allFiles.some(f => /\.(test|spec)\./i.test(f));

  // If BOTH src and test signals exist, use write ratio to decide
  if ((hasSrcDir || hasSrcFiles) && (hasTestDir || hasTestFiles)) {
    const srcWriteCount = writeFiles.filter(f => f.startsWith('src/') || (!f.includes('.test.') && !f.includes('.spec.'))).length;
    const testWriteCount = writeFiles.filter(f => f.startsWith('tests/') || f.startsWith('test/') || f.includes('.test.') || f.includes('.spec.')).length;
    // More source writes → code; more test writes → test; equal → code
    return testWriteCount > srcWriteCount ? 'test' : 'code';
  }

  // Code: src/, .ts, .py, .java (checked before test)
  if (hasSrcDir || hasSrcFiles) {
    return 'code';
  }

  // Test: tests/, .test., .spec. (only when no src/ signal)
  if (hasTestDir || hasTestFiles) {
    return 'test';
  }

  // Doc: docs/, .md, README
  if (
    dirs.some(d => d === 'docs' || d.startsWith('docs/') || d === 'doc' || d.startsWith('doc/')) ||
    allFiles.some(f => /\.md$/i.test(f) || /readme/i.test(f))
  ) {
    return 'doc';
  }

  return 'unknown';
}

// ─── Per-Worker Auth Resolution ─────────────────────────────────────

/**
 * Resolve the auth mode for a single worker with uniform priority across
 * Sprint / Task / Process dispatch modes.
 *
 * Priority chain (highest → lowest):
 * 1. task.authMode — DIRECTIVES `- Auth:` override (per-task)
 * 2. config.auth_mode — project-level default from .deckent/config.json
 * 3. 'subscription' — built-in fallback
 *
 * @param task - The task being routed
 * @param config - TaskRouterConfig carrying the project-level auth_mode
 * @returns Resolved auth mode: 'subscription' or 'api'
 */
export function resolveWorkerAuth(task: Task, config: TaskRouterConfig): 'subscription' | 'api' {
  if (task.authMode === 'subscription' || task.authMode === 'api') {
    return task.authMode;
  }
  if (config.auth_mode === 'api') {
    return 'api';
  }
  return 'subscription';
}

// ─── User-Surface Agent Resolution (Sprint 219-015) ─────────────────


// ─── Main Router ────────────────────────────────────────────────────

/**
 * Route a task to the best provider, agent, and skill set.
 *
 * Priority order:
 * 1. Config override: skill_routing category matches task type → use that provider
 * 2. Task force: task.forceModel set → infer provider from model
 * 3. Agent preference: task.assignedAgent has preferredProvider → use it (if available)
 * 4. Skill affinity: task type maps to config skill_routing category
 * 5. Provider availability: if chosen provider is unavailable → configured worker fallback order
 * 6. Default: first available candidate in the configured worker provider order
 *
 * @param task - The task to route
 * @param config - Configuration containing routing preferences
 * @param availableProviders - List of currently available providers
 * @returns Routing decision with provider, agent, skills, and reason
 */
export function routeTask(
  task: Task,
  config: TaskRouterConfig,
  availableProviders: ProviderName[],
): TaskRouting {
  const skills = task.assignedSkills ?? [];
  // S3 (ROUTING-V3): the V2 spawn-time surface-override lane is retired — the
  // planner's V3 decision (positional axis owns surfaces/domains) is authoritative.
  const agent = task.assignedAgent ?? 'generic';
  const authMode = resolveWorkerAuth(task, config);
  const workerOrder = orderedRoleProviders('worker', config);
  const configuredProviders = [workerOrder.primary, ...workerOrder.fallbacks];

  const taskType = detectTaskType(task);
  const routing = config.skill_routing;

  // ─── Priority 1: Config override via skill_routing ────────────────
  // Canonical path (WM-2c): task.type (TaskKind) set → derive routing key via SSOT adapter.
  // Legacy fallback: scope-shape detectTaskType, backward-compatible when task.type absent.
  const routingKey = task.type != null
    ? INTENT_TO_ROUTING_KEY[taskKindToIntent(task.type)]
    : TASK_TYPE_TO_ROUTING_KEY[taskType];
  if (routingKey && routing) {
    const configProvider = routing[routingKey];
    if (configProvider && isProviderName(configProvider)) {
      const selection = ensureAvailable(configProvider, availableProviders, configuredProviders);
      const provider = selection.provider;
      return {
        provider,
        agent,
        skills,
        reason: provider === configProvider
          ? `Config skill_routing.${routingKey} = '${configProvider}' for ${taskType} task`
          : `Config skill_routing.${routingKey} = '${configProvider}' (unavailable, fell back to '${provider}')`,
        ...(selection.fallback ? { providerFallback: selection.fallback } : {}),
        authMode,
      };
    }
  }

  // ─── Priority 2: Task forceModel ──────────────────────────────────
  if (task.forceModel) {
    const inferred = inferProviderFromModel(task.forceModel);
    if (inferred) {
      const selection = ensureAvailable(inferred, availableProviders, configuredProviders);
      const provider = selection.provider;
      return {
        provider,
        agent,
        skills,
        reason: provider === inferred
          ? `Task forceModel '${task.forceModel}' → provider '${inferred}'`
          : `Task forceModel '${task.forceModel}' → provider '${inferred}' (unavailable, fell back to '${provider}')`,
        ...(selection.fallback ? { providerFallback: selection.fallback } : {}),
        authMode,
      };
    }
  }

  // ─── Priority 3: Task-level provider field ────────────────────────
  if (task.provider && isProviderName(task.provider)) {
    const selection = ensureAvailable(task.provider, availableProviders, configuredProviders);
    const provider = selection.provider;
    return {
      provider,
      agent,
      skills,
      reason: provider === task.provider
        ? `Task provider field '${task.provider}'`
        : `Task provider field '${task.provider}' (unavailable, fell back to '${provider}')`,
      ...(selection.fallback ? { providerFallback: selection.fallback } : {}),
      authMode,
    };
  }

  // ─── Priority 4: Skill affinity via default routing key ───────────
  // (This covers task types that don't have a specific routing key but
  //  the 'default' key in skill_routing applies)
  if (routing?.default && isProviderName(routing.default)) {
    const selection = ensureAvailable(routing.default, availableProviders, configuredProviders);
    const provider = selection.provider;
    return {
      provider,
      agent,
      skills,
      reason: provider === routing.default
        ? `Config skill_routing.default = '${routing.default}'`
        : `Config skill_routing.default = '${routing.default}' (unavailable, fell back to '${provider}')`,
      ...(selection.fallback ? { providerFallback: selection.fallback } : {}),
      authMode,
    };
  }

  // ─── Priority 5: worker_provider from config ──────────────────────
  if (config.worker_provider && isProviderName(config.worker_provider)) {
    const selection = ensureAvailable(config.worker_provider, availableProviders, configuredProviders);
    const provider = selection.provider;
    return {
      provider,
      agent,
      skills,
      reason: provider === config.worker_provider
        ? `Config worker_provider = '${config.worker_provider}'`
        : `Config worker_provider = '${config.worker_provider}' (unavailable, fell back to '${provider}')`,
      ...(selection.fallback ? { providerFallback: selection.fallback } : {}),
      authMode,
    };
  }

  // ─── Priority 6: Configured worker provider order ─────────────────
  const selection = ensureAvailable(workerOrder.primary, availableProviders, configuredProviders);
  const fallback = selection.provider;
  return {
    provider: fallback,
    agent,
    skills,
    reason: fallback === workerOrder.primary
      ? `Default: configured worker provider '${fallback}'`
      : `Default worker provider '${workerOrder.primary}' (unavailable, fell back to '${fallback}')`,
    ...(selection.fallback ? { providerFallback: selection.fallback } : {}),
    authMode,
  };
}

/**
 * Return the first provider in owner-authored order that is proven available.
 * Registration/list order is never an authority.
 */
function firstConfiguredAvailable(
  configured: readonly ProviderName[],
  available: readonly ProviderName[],
  excluded?: ProviderName,
): ProviderName {
  const selected = configured.find(
    candidate => candidate !== excluded && available.includes(candidate),
  );
  if (selected) return selected;
  throw new ProviderRoutingError(
    'E_PROVIDER_FALLBACK_EXHAUSTED',
    excluded ?? configured[0] ?? '',
  );
}

/**
 * Ensure a provider is in the available list; if not, follow configured worker order.
 * @param preferred - The preferred provider
 * @param available - List of available providers
 * @param configured - Owner-authored worker primary + fallback chain
 * @returns The preferred provider if available, otherwise the first configured available fallback
 */
function ensureAvailable(
  preferred: ProviderName,
  available: readonly ProviderName[],
  configured: readonly ProviderName[],
): ProviderAvailabilityResolution {
  if (available.includes(preferred)) {
    return { provider: preferred };
  }
  const provider = firstConfiguredAvailable(configured, available, preferred);
  return {
    provider,
    fallback: {
      requestedProvider: preferred,
      selectedProvider: provider,
      configuredOrder: [...configured],
      reasonCode: 'preferred_unavailable',
    },
  };
}

// ─── Timeout Event Emission ────────────────────────────────────────

/**
 * Emit timeout-related events after task routing.
 *
 * Writes TIMEOUT_ASSIGN for every routed task with its timeout breakdown.
 * If the estimated timeout exceeds the backend max (clampReason = 'max_ceiling'),
 * also writes TIMEOUT_CAP_EXCEEDED.
 *
 * @param task - The routed task
 * @param config - Resolved project config (used by brainEstimateTimeout)
 * @param history - Sprint history for adaptive timeout
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint identifier
 */
export function emitTimeoutEvents(
  task: Task,
  config: ResolvedConfig,
  history: SprintHistory,
  projectRoot: string,
  sprintId: string,
): number {
  const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, history);

  writeEvent(
    projectRoot,
    sprintId,
    'brain',
    'worker',
    CHANNELS.TIMEOUT_ASSIGN,
    { taskId: task.id, timeoutSeconds, breakdown },
  );

  if (breakdown.clampReason === 'max_ceiling') {
    writeEvent(
      projectRoot,
      sprintId,
      'auditor',
      'brain',
      CHANNELS.TIMEOUT_CAP_EXCEEDED,
      { taskId: task.id, requested: breakdown.estimated, capped: timeoutSeconds },
    );
  }

  // Sprint 280 root-cause fix: return the per-task adaptive timeout so the
  // spawn sites can pass it as `taskTimeoutSeconds`. Previously this function
  // was a 0-caller (dormant) telemetry-only emit, so every worker silently
  // fell back to the static `docker_timeout` (default 1200s = 20min) in
  // spawn-backend-docker.ts:`effectiveTimeout = taskTimeoutSeconds ?? this.timeoutSeconds`.
  // Wiring the return value makes `docker_timeout` the FALLBACK, not the de-facto cap.
  return timeoutSeconds;
}
