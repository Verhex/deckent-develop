// ═══ Task Mode Runner ════════════════════════════════════════════════
// Sprint 149 — Task 149-003
//
// Centralized one-shot task execution for `deckent_style === 'task'`.
// Bypasses the full sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP)
// and runs a single task directly via the spawn backend.
//
// Used by:
//   - `deckent run "description"` CLI command (task mode)
//   - `deckent_run` MCP tool (task mode)
//   - Any future task-mode entrypoint

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { ModelType, ProviderName } from '../core/types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { buildExecutionRequest, resolveToTask } from './execution-request-builder.js';
import { createRunTaskId } from '../cli/commands/run.js';
import { spawnWorkerMultiProvider } from '../cli/commands/spawn.js';
import { buildWorkerPrompt } from './task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';
import { eventBus } from './event-bus.js';
import { TASKS_DIR } from '../core/constants.js';
import { AgentPoolManager } from '../core/agent-pool.js';
import { SkillPoolManager } from '../core/skill-pool.js';
import { detectProjectStack } from '../core/stack-detector.js';
import { routeTaskV2 } from '../core/routing-engine.js';
import type { UserOverride } from '../core/routing-types.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface TaskModeContext {
  /** Human-readable description of what the task should accomplish */
  description: string;
  /** Optional scope constraints */
  scope?: {
    directories?: string[];
    filesWrite?: string[];
  };
  /** Model to use (default: 'sonnet') */
  model?: ModelType;
  /**
   * Provider hint forwarded from the autonomous dispatcher's backlog entry.
   * When set to 'ollama', spawnWorkerMultiProvider calls ensureOllamaModelRegistered
   * before getProviderForModel so dynamic tags (e.g. qwen3.6:27b) resolve correctly.
   */
  provider?: string;
  /** Timeout in milliseconds (default: 300_000 = 5 minutes) */
  timeoutMs?: number;
  /** Auto-approve tool calls */
  autoApprove?: boolean;
  /** Project root override */
  projectRoot?: string;
}

export interface TaskModeResult {
  /** Unique task identifier */
  taskId: string;
  /** Backend used for spawning */
  backend: string;
  /** Provider used */
  provider: string;
}

// ─── Guard ──────────────────────────────────────────────────────────

/**
 * Validate that config is in task mode.
 * Throws if deckent_style !== 'task'.
 */
function assertTaskMode(config: ResolvedConfig): void {
  if (config.deckent_style !== 'task') {
    throw new Error(
      'runTaskMode called but config.deckent_style !== "task". ' +
      'Set deckent_style=task in config or run `deckent mode task`.',
    );
  }
}

// ─── Runner ─────────────────────────────────────────────────────────

/**
 * Execute a single task in task mode — bypasses the full sprint lifecycle.
 *
 * Flow:
 * 1. Validate task mode config
 * 2. Build task JSON from description
 * 3. Emit TASK_MODE_START event
 * 4. Spawn worker via multi-provider backend
 * 5. Return task ID + backend info
 */
export async function runTaskMode(
  ctx: TaskModeContext,
  config: ResolvedConfig,
): Promise<TaskModeResult> {
  assertTaskMode(config);

  const projectRoot = ctx.projectRoot ?? process.cwd();
  const model: ModelType = ctx.model ?? 'sonnet';
  const scopeDir = ctx.scope?.directories?.[0] ?? '.';

  // Build task — WM-1: unify on the canonical ExecutionRequest contract (sets
  // task.type, resolves provider via config, tags origin='autonomous').
  const taskId = createRunTaskId();
  const execReq = buildExecutionRequest({
    description: ctx.description,
    model,
    provider: ctx.provider as ProviderName | undefined,
    scope: { directories: [scopeDir] },
    projectRoot,
    config,
    autoApprove: ctx.autoApprove ?? false,
    origin: 'autonomous',
  });
  const task = resolveToTask(execReq, taskId);

  // WM-1b: V2 routing — assign the right agent + skills (fail-safe: any error keeps 'generic')
  try {
    const routingVersion = config.routing_engine ?? 'v2';
    if (routingVersion === 'v2') {
      const agentPool = new AgentPoolManager(projectRoot);
      const pool = agentPool.loadAgents();
      const projectStack = detectProjectStack(projectRoot);
      const skillPool = new SkillPoolManager(projectRoot);
      const skills = skillPool.loadSkills();

      const overrides: UserOverride[] = [];
      if (task.forceAgent || task.forceSkills || task.excludeSkills || task.excludeAgent) {
        overrides.push({
          source: 'task-directive',
          forceAgent: task.forceAgent,
          forceSkills: task.forceSkills,
          excludeSkills: task.excludeSkills,
          excludeAgents: task.excludeAgent,
          priority: 3,
        });
      }

      const decision = routeTaskV2(task, pool, skills, {
        projectStack,
        overrides,
        learningData: [],
        config: { ...config.routing_config, agentMinScore: config.agent_min_score },
        sprintId: '',
        taskId: task.id,
        projectRoot,
      });

      task.assignedAgent = decision.agentId ?? 'generic';
      task.assignedSkills = decision.skillIds;
    }
  } catch (routingErr) {
    debugLog('task-mode:routing', `V2 routing failed, using generic fallback: ${routingErr}`);
  }

  // Gap E: write task JSON so agentic-worker-entry can read its spec (mirrors run.ts:261-263)
  const tasksDir = join(projectRoot, TASKS_DIR);
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2), 'utf-8');

  // Resolve agent and skill prompts for domain-expertise parity with sprint tasks.
  // Both resolve to undefined/[] for 'generic' agent or empty skills — backward-safe fallback.
  const agentPrompt = await resolveAgentPrompt(projectRoot, task);
  const skillPrompts = await resolveSkillPrompts(projectRoot, task);
  const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);

  // Emit event for nervous system / observers
  try {
    eventBus.emit('deckent-event', {
      type: 'TASK_MODE_START',
      taskId,
      style: 'task',
      description: ctx.description,
      model,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Never let event emission break task execution
  }

  // Spawn worker — forward provider hint so dynamic ollama tags are pre-registered
  const { backend, provider } = await spawnWorkerMultiProvider(
    taskId,
    model,
    prompt,
    projectRoot,
    {
      autoApprove: ctx.autoApprove ?? false,
      spawnBackend: config.spawn_backend,
      dockerImage: config.docker_image,
      dockerTimeout: config.docker_timeout,
      provider: execReq.provider,
    },
  );

  return { taskId, backend, provider };
}
