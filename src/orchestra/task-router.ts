// ─── Task Router ────────────────────────────────────────────────────
// Routes tasks to the best provider, agent, and skill set based on
// config overrides, task metadata, agent preferences, and skill affinity.

import type { Task } from '../core/types.js';
import type { ProviderName, ModelType } from '../core/task-types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { PROVIDER_MODEL_MAP } from '../core/task-types.js';
import { brainEstimateTimeout } from './timeout-estimator.js';
import type { SprintHistory } from './timeout-estimator.js';
import { writeEvent, CHANNELS } from './event-stream.js';

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
  return value === 'claude' || value === 'codex' || value === 'gemini';
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
  const agent = task.assignedAgent ?? 'generic';

  // Guard: no providers available
  if (availableProviders.length === 0) {
    return {
      provider: 'claude',
      agent,
      skills,
      reason: 'No providers available; falling back to claude (default)',
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
    };
  }

  // ─── Priority 6: First available provider ─────────────────────────
  const fallback = availableProviders[0] ?? 'claude' as ProviderName;
  return {
    provider: fallback,
    agent,
    skills,
    reason: `Default: first available provider '${fallback}'`,
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
  return available[0] ?? 'claude' as ProviderName;
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
