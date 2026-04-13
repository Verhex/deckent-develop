// ═══ Sprint Spawner ════════════════════════════════════════════════
// Extracted from sprint-controller.ts — worker spawn functions:
//   spawnWorkers(), respawnEligibleTasks(), validateTaskDependencies(),
//   routeSprintTasks()

// ─── Node Builtins ─────────────────────────────────────────────────
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, AgentStatus,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, Sprint, ResolvedConfig,
  AgentInfo, ProviderName,
} from '../core/types.js';

import { TASKS_DIR } from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { debugLog } from '../core/utils.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers } from '../core/config.js';

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import {
  now,
  isTmuxProvider, resolveTaskProvider, getProviderAdapterForTask,
} from './sprint-utils.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';

// ─── Tmux ────────────────────────────────────────────────────────
import { ensureSession, spawnWorker } from './tmux.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { updateDashboard } from '../monitor/auditor.js';

// ─── Result Collector ─────────────────────────────────────────────
import { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';

// ─── Task Builder ─────────────────────────────────────────────────
import { buildWorkerPrompt } from './task-builder.js';

// ─── Parallel Pipeline ───────────────────────────────────────────
import { ParallelPipelineManager } from './parallel-pipeline.js';

// ─── Task Router ────────────────────────────────────────────────
import { routeTask } from './task-router.js';

// ─── Observability ──────────────────────────────────────────────
import { metric } from '../core/observability.js';

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Spawn worker agents for sprint tasks via the configured backend.
 * Respects max_workers limit; excess tasks are returned as a queue.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint containing tasks to execute
 * @param config - Resolved project configuration
 * @param spawnOpts - Optional spawn settings (auto-approve, usage tracker, backend)
 * @returns Array of queued tasks that exceeded the worker limit
 */
export async function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Promise<Task[]> {
  const backend = spawnOpts?.spawnBackend;

  let needsTmuxSession = false;

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);

  // Dependency pipeline guard: when enabled, only spawn tasks whose dependencies are all DONE
  let activeTasks: Task[];
  let queuedTasks: Task[];
  if (config.dependency_pipeline_enabled) {
    const doneTasks = new Set(
      sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
    );
    const eligibleTasks = sprint.tasks.filter(t => {
      if (t.status !== TaskStatus.PENDING) return false;
      if (!t.dependencies || t.dependencies.length === 0) return true;
      return t.dependencies.every(dep => doneTasks.has(dep));
    });
    activeTasks = eligibleTasks.slice(0, maxWorkers);
    queuedTasks = eligibleTasks.slice(maxWorkers);
  } else {
    activeTasks = sprint.tasks.slice(0, maxWorkers);
    queuedTasks = sprint.tasks.slice(maxWorkers);
  }

  // Pre-check: do any active tasks need tmux?
  if (!backend) {
    needsTmuxSession = activeTasks.some(task => {
      const provider = resolveTaskProvider(task);
      return isTmuxProvider(provider);
    });
    if (needsTmuxSession) {
      ensureSession();
    }
  }

  // Observability: wave start metric
  const waveId = config.dependency_pipeline_enabled ? 'dep-pipeline' : 'legacy';
  metric('wave.start', 0, { wave: waveId, count: String(activeTasks.length) });

  for (const task of activeTasks) {
    const agentPrompt = await resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = await resolveSkillPrompts(projectRoot, task);
    const prompt = buildWorkerPrompt(task, agentPrompt, taskSkillPrompts);
    const model = task.model;
    const writeTargets = ['.tasks/', ...task.scope.directories, ...task.scope.filesWrite].filter(Boolean);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
      : 'Read,Write,Edit,Bash,Glob,Grep';

    const taskProvider = resolveTaskProvider(task);

    // Single spawn path — NEVER spawn the same task twice.
    if (backend) {
      backend.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
    } else {
      spawnWorker(task.id, model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

    // Update task status to EXECUTING and persist to disk
    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) { debugLog('spawnWorkers:writeTaskFile', e); }

  }

  const agents: AgentInfo[] = activeTasks.map(task => ({
    id: `w-${task.id}`,
    role: 'worker' as const,
    status: AgentStatus.EXECUTING,
    model: task.model,
    tmuxWindow: `w-${task.id}`,
    taskId: task.id,
    currentAction: `Starting [${resolveTaskProvider(task)}]`,
    spawnedAt: now(),
  }));

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents,
    progress: { done: 0, active: activeTasks.length, blocked: 0, total: sprint.tasks.length },
    alerts: [],
    updatedAt: now(),
  });

  return queuedTasks;
}

/**
 * Re-evaluate and spawn tasks that are now eligible because their dependencies are DONE.
 * Called after a task completes (finalizeTaskResult) when dependency_pipeline_enabled is true.
 * Each respawn event can optionally emit a wave.transition metric via the provided callback.
 * @returns Array of newly spawned task IDs
 */
export async function respawnEligibleTasks(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
  onWaveTransition?: (durationMs: number, fromWave: string, toWave: string) => void,
): Promise<string[]> {
  if (!config.dependency_pipeline_enabled) return [];

  const waveStart = Date.now();

  const doneTasks = new Set(
    sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
  );

  const nowEligible = sprint.tasks.filter(t => {
    if (t.status !== TaskStatus.PENDING) return false;
    if (!t.dependencies || t.dependencies.length === 0) return false;
    return t.dependencies.every(dep => doneTasks.has(dep));
  });

  if (nowEligible.length === 0) return [];

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);
  const currentlyExecuting = sprint.tasks.filter(
    t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotsAvailable = Math.max(0, maxWorkers - currentlyExecuting);

  const toSpawn = nowEligible.slice(0, slotsAvailable);
  if (toSpawn.length === 0) return [];

  const backend = spawnOpts?.spawnBackend;

  for (const task of toSpawn) {
    const agentPrompt = await resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = await resolveSkillPrompts(projectRoot, task);
    const prompt = buildWorkerPrompt(task, agentPrompt, taskSkillPrompts);
    const writeTargets = ['.tasks/', ...task.scope.directories, ...task.scope.filesWrite].filter(Boolean);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
      : 'Read,Write,Edit,Bash,Glob,Grep';

    const taskProvider = resolveTaskProvider(task);

    if (backend) {
      backend.spawn(task.id, task.model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, task.model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
    } else {
      spawnWorker(task.id, task.model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) { debugLog('respawnEligibleTasks:writeTaskFile', e); }
  }

  const waveDuration = Date.now() - waveStart;
  metric('wave.transition', waveDuration, { from_wave: 'dep-wait', to_wave: `wave-${toSpawn.length}` });
  if (onWaveTransition) {
    try {
      onWaveTransition(waveDuration, 'dep-wait', `wave-${toSpawn.length}`);
    } catch (e) { debugLog('respawnEligibleTasks:onWaveTransition', e); }
  }

  debugLog('respawnEligibleTasks', `Spawned ${toSpawn.length} newly eligible tasks: ${toSpawn.map(t => t.id).join(', ')}`);
  return toSpawn.map(t => t.id);
}

/**
 * Validate task dependencies using topological sort.
 * Throws DependencyCycleError (DECKENT_E049) if circular dependencies are detected.
 * @returns ExecutionWave[] for informational purposes
 */
export function validateTaskDependencies(tasks: Task[]): import('./parallel-pipeline.js').ExecutionWave[] {
  const pipeline = new ParallelPipelineManager();
  return pipeline.createPipeline(
    tasks.map(t => ({ id: t.id, dependencies: t.dependencies ?? [] })),
  );
}

/**
 * Route all sprint tasks to providers using the TaskRouter.
 * Sets task.provider, task.assignedAgent, and task.assignedSkills based on routing decisions.
 * Exported for testability — called from runSprint Phase 1.5.
 * @param tasks - Array of tasks to route
 * @param config - Resolved config with skill_routing overrides
 * @param availableProviders - List of available provider names (from Connector or registry)
 */
export function routeSprintTasks(
  tasks: Task[],
  config: ResolvedConfig,
  availableProviders: ProviderName[],
): void {
  for (const task of tasks) {
    const routing = routeTask(task, config, availableProviders);
    task.provider = routing.provider;
    if (routing.agent !== 'generic') task.assignedAgent = routing.agent;
    if (routing.skills.length > 0) task.assignedSkills = routing.skills;
  }
}
