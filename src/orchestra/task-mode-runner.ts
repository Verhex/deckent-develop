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
import type { ModelType } from '../core/types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { buildRunTask, createRunTaskId } from '../cli/commands/run.js';
import { spawnWorkerMultiProvider } from '../cli/commands/spawn.js';
import { buildWorkerPrompt } from './task-builder.js';
import { eventBus } from './event-bus.js';
import { TASKS_DIR } from '../core/constants.js';

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

  // Build task
  const taskId = createRunTaskId();
  const task = buildRunTask(taskId, ctx.description, model, scopeDir);

  // Gap E: write task JSON so agentic-worker-entry can read its spec (mirrors run.ts:261-263)
  const tasksDir = join(projectRoot, TASKS_DIR);
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2), 'utf-8');

  // Gap G fix: buildWorkerPrompt(task, agentPrompt?, skillPrompts?) — do NOT pass projectRoot
  // as agentPrompt. No agent/skill prompt resolution here (task-mode fast path).
  const prompt = buildWorkerPrompt(task);

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
      provider: ctx.provider,
    },
  );

  return { taskId, backend, provider };
}
