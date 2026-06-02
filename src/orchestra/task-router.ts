// ─── Task Router ────────────────────────────────────────────────────
// Routes tasks to the best provider, agent, and skill set based on
// config overrides, task metadata, agent preferences, and skill affinity.

import type { Task } from '../core/types.js';
import type { ProviderName, ModelType } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { PROVIDER_MODEL_MAP } from '../core/task-types.js';
import { getDefaultProviderName } from './sprint-utils.js';
import { brainEstimateTimeout } from './timeout-estimator.js';
import type { SprintHistory } from './timeout-estimator.js';
import { writeEvent, CHANNELS } from './event-stream.js';
import { getUserSurfaceBonus, USER_SURFACE_AGENTS } from '../core/routing-engine.js';
import { classifyIntent } from '../core/intent-classifier.js';

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
  brain_provider?: string;
  worker_provider?: string;
  /** Config-level auth mode — resolved after task.authMode override (ADR-076) */
  auth_mode?: 'subscription' | 'api';
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
  /** Estimated timeout in seconds from Brain heuristic estimator (optional) */
  timeoutSeconds?: number;
  /**
   * Resolved auth mode for this worker — uniform across Sprint/Task/Process modes.
   * Priority: task.authMode (DIRECTIVES) > config.auth_mode > 'subscription'.
   */
  authMode: 'subscription' | 'api';
}

/** Task type categories detected from scope and file patterns */
export type TaskType = 'code' | 'test' | 'doc' | 'design' | 'unknown';

// ─── Helpers ────────────────────────────────────────────────────────

/** Map from task type to skill_routing config key */
const TASK_TYPE_TO_ROUTING_KEY: Record<TaskType, keyof SkillRoutingConfig | null> = {
  design: 'design',
  test: 'testing',
  doc: 'docs',
  code: null,
  unknown: null,
};

/**
 * Check if a string is a valid ProviderName.
 * @param value - The string to check
 * @returns True if the value is a recognized provider name
 */
function isProviderName(value: string): value is ProviderName {
  return value === 'claude' || value === 'codex' || value === 'gemini' || value === 'ollama';
}

/**
 * Infer provider from a model identifier.
 * @param model - A model name (e.g., 'opus', 'gpt-5', 'gemini-2.5-pro')
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
export function detectTaskType(task: Task): TaskType {
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

/**
 * Apply routing-engine's user-surface bonus at plan/spawn time. When a task
 * touches a user-facing surface (cli/commands, api, dashboard, ui, e2e) and
 * the user has not pinned `forceAgent`, return the matching surface-owner
 * agent (api-builder / frontend-designer / ci-guardian). Returns `null` when
 * no surface match applies — caller preserves the previously assigned agent.
 *
 * Sprint 219-015: closes the wire-gap where V1 plans collapsed cli/api/
 * dashboard tasks onto refactorer's generic impl@7. Security-bearing tasks
 * touching `src/api/` are handled inside `getUserSurfaceBonus` (returns 0 for
 * api-builder so security-auditor wins).
 *
 * @param task - The task being routed
 * @returns Surface-owner agent id, or null if no surface match
 */
export function applyUserSurfaceBonus(task: Task): string | null {
  // Honor explicit user override — forceAgent wins over surface routing.
  if (task.forceAgent) return null;

  try {
    const taskDNA = classifyIntent({
      title: task.title,
      description: task.description,
      scope: task.scope,
    });
    for (const candidate of USER_SURFACE_AGENTS) {
      if (getUserSurfaceBonus(candidate, taskDNA) > 0) {
        return candidate;
      }
    }
  } catch {
    return null;
  }
  return null;
}

// ─── Main Router ────────────────────────────────────────────────────

/**
 * Route a task to the best provider, agent, and skill set.
 *
 * Priority order:
 * 1. Config override: skill_routing category matches task type → use that provider
 * 2. Task force: task.forceModel set → infer provider from model
 * 3. Agent preference: task.assignedAgent has preferredProvider → use it (if available)
 * 4. Skill affinity: task type maps to config skill_routing category
 * 5. Provider availability: if chosen provider not in availableProviders → first available
 * 6. Default: skill_routing.default or worker_provider or first available
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
  // Sprint 219-015: route user-surface tasks (cli/api/dashboard/e2e) to their
  // surface-owner agent before falling back to whatever the planner assigned.
  // Prevents collapse onto refactorer's generic impl@7. forceAgent honored upstream.
  const surfaceAgent = applyUserSurfaceBonus(task);
  const agent = surfaceAgent ?? task.assignedAgent ?? 'generic';
  const authMode = resolveWorkerAuth(task, config);

  // Guard: no providers available
  // Sprint 202 Task 202-003: resolve via registry default before the absolute
  // 'claude' floor so pure-Ollama configs don't silently route to a missing
  // Claude adapter.
  if (availableProviders.length === 0) {
    const fallback = getDefaultProviderName();
    return {
      provider: fallback,
      agent,
      skills,
      reason: `No providers available; falling back to '${fallback}' (registry default)`,
      authMode,
    };
  }

  const taskType = detectTaskType(task);
  const routing = config.skill_routing;

  // ─── Priority 1: Config override via skill_routing ────────────────
  const routingKey = TASK_TYPE_TO_ROUTING_KEY[taskType];
  if (routingKey && routing) {
    const configProvider = routing[routingKey];
    if (configProvider && isProviderName(configProvider)) {
      const provider = ensureAvailable(configProvider, availableProviders);
      return {
        provider,
        agent,
        skills,
        reason: provider === configProvider
          ? `Config skill_routing.${routingKey} = '${configProvider}' for ${taskType} task`
          : `Config skill_routing.${routingKey} = '${configProvider}' (unavailable, fell back to '${provider}')`,
        authMode,
      };
    }
  }

  // ─── Priority 2: Task forceModel ──────────────────────────────────
  if (task.forceModel) {
    const inferred = inferProviderFromModel(task.forceModel);
    if (inferred) {
      const provider = ensureAvailable(inferred, availableProviders);
      return {
        provider,
        agent,
        skills,
        reason: provider === inferred
          ? `Task forceModel '${task.forceModel}' → provider '${inferred}'`
          : `Task forceModel '${task.forceModel}' → provider '${inferred}' (unavailable, fell back to '${provider}')`,
        authMode,
      };
    }
  }

  // ─── Priority 3: Task-level provider field ────────────────────────
  if (task.provider && isProviderName(task.provider)) {
    const provider = ensureAvailable(task.provider, availableProviders);
    return {
      provider,
      agent,
      skills,
      reason: provider === task.provider
        ? `Task provider field '${task.provider}'`
        : `Task provider field '${task.provider}' (unavailable, fell back to '${provider}')`,
      authMode,
    };
  }

  // ─── Priority 4: Skill affinity via default routing key ───────────
  // (This covers task types that don't have a specific routing key but
  //  the 'default' key in skill_routing applies)
  if (routing?.default && isProviderName(routing.default)) {
    const provider = ensureAvailable(routing.default, availableProviders);
    return {
      provider,
      agent,
      skills,
      reason: provider === routing.default
        ? `Config skill_routing.default = '${routing.default}'`
        : `Config skill_routing.default = '${routing.default}' (unavailable, fell back to '${provider}')`,
      authMode,
    };
  }

  // ─── Priority 5: worker_provider from config ──────────────────────
  if (config.worker_provider && isProviderName(config.worker_provider)) {
    const provider = ensureAvailable(config.worker_provider, availableProviders);
    return {
      provider,
      agent,
      skills,
      reason: provider === config.worker_provider
        ? `Config worker_provider = '${config.worker_provider}'`
        : `Config worker_provider = '${config.worker_provider}' (unavailable, fell back to '${provider}')`,
      authMode,
    };
  }

  // ─── Priority 6: First available provider ─────────────────────────
  // Sprint 202 Task 202-003: registry-default before the absolute 'claude' floor.
  const fallback = availableProviders[0] ?? getDefaultProviderName();
  return {
    provider: fallback,
    agent,
    skills,
    reason: `Default: first available provider '${fallback}'`,
    authMode,
  };
}

/**
 * Ensure a provider is in the available list; if not, return the first available.
 * @param preferred - The preferred provider
 * @param available - List of available providers
 * @returns The preferred provider if available, otherwise the first available
 */
function ensureAvailable(preferred: ProviderName, available: ProviderName[]): ProviderName {
  if (available.includes(preferred)) {
    return preferred;
  }
  // Sprint 202 Task 202-003: registry-default before the absolute 'claude' floor.
  return available[0] ?? getDefaultProviderName();
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
): void {
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
}
