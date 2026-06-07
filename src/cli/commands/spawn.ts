import type { Command } from 'commander';
import type { Task, ModelType, ProviderName } from '../../core/types.js';
import { readTask } from '../../agents/worker.js';
import { ensureSession, spawnWorker } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';
import { TaskStatus, getProviderForModel } from '../../core/task-types.js';
import { buildWorkerPrompt } from '../../orchestra/task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { SpawnBackendFactory } from '../../orchestra/spawn-backend.js';
import { isAdapterProvider, getProviderAdapterForTask } from '../../orchestra/sprint-utils.js';
import { ensureOllamaModelRegistered } from '../../core/model-registry.js';

/**
 * Build a comma-separated allowedTools string from a task's scope.
 * Returns the standard tool set (Read, Write, Edit, Bash, Glob, Grep) when the
 * task has any scoped directories or write-files. Returns undefined when the
 * scope is completely unrestricted (no dirs, no write-files) so the worker
 * retains full tool access.
 */
export function buildAllowedToolsFromScope(task: Task): string | undefined {
  const hasDirs = task.scope.directories.length > 0;
  const hasFiles = task.scope.filesWrite.length > 0;
  if (!hasDirs && !hasFiles) return undefined;
  return 'Read,Write,Edit,Bash,Glob,Grep';
}

/**
 * Spawn a worker using the appropriate backend.
 *
 * Backend selection priority:
 * 0. Host-HTTP adapter providers (e.g. ollama) → host adapter spawn (BEFORE any config backend)
 * 1. config.spawn_backend (user preference — docker/tmux/subprocess/auto)
 * 2. Provider-based fallback: Claude → tmux, Codex/Gemini → subprocess
 *
 * Async because ollama's refreshSupportedModels() must resolve before spawn()
 * is called (dynamicModelsCache must be populated for isSupportedModel to accept
 * custom tags like qwen3.6:27b). Mirrors sprint-spawner.ts's adapterRouted logic.
 * ADR-066/077/027 — autonomous↔ollama execution gap fix, 2026-06-08.
 */
export async function spawnWorkerMultiProvider(
  taskId: string,
  model: string,
  prompt: string,
  root: string,
  opts: { autoApprove?: boolean; allowedTools?: string; spawnBackend?: string; dockerImage?: string; dockerTimeout?: number; provider?: string },
): Promise<{ backend: string; provider: ProviderName }> {
  // Resolve provider from registry. Dynamic ollama tags (e.g. qwen3.6:27b) are not in
  // the static registry at process start — the sprint path calls ensureOllamaModelRegistered
  // at plan-time, but the autonomous kind=task path and deckent run do not. When the caller
  // passes opts.provider='ollama' (autonomous dispatcher forwards entry.provider), pre-register
  // the tag before getProviderForModel so it resolves to 'ollama' instead of throwing
  // UnknownModelError. Only ollama tags auto-register here; genuinely-unknown cloud models
  // still throw (real-bug signal preserved).
  if (opts.provider === 'ollama') {
    ensureOllamaModelRegistered(model);
  }
  const provider = getProviderForModel(model as ModelType);

  // Host-HTTP adapter providers (e.g. ollama) run via their host adapter
  // (agentic-worker-entry on localhost:11434), NOT a docker/tmux/subprocess backend —
  // even when config.spawn_backend is set. Mirrors sprint-spawner.ts's adapterRouted
  // routing so `deckent run` + the autonomous engine's kind=task path reach the
  // ollama worker correctly.
  //
  // refreshSupportedModels() is awaited (not fire-and-forget) because OllamaAdapter.spawn()
  // calls isSupportedModel() synchronously — dynamicModelsCache must be populated before
  // spawn() is invoked, otherwise custom tags (qwen3.6:27b) that are not in the static
  // catalog are rejected with ProviderError. The race is deterministic: without await,
  // spawn() executes in the same tick as the unresolved refresh promise.
  if (isAdapterProvider(provider)) {
    const adapter = getProviderAdapterForTask(provider);
    if (adapter) {
      const refresh = (adapter as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
      if (typeof refresh === 'function') {
        await refresh.call(adapter);
      }
      adapter.spawn(taskId, model as ModelType, prompt, {
        allowedTools: opts.allowedTools,
        autoApprove: opts.autoApprove ?? false,
        projectDir: root,
      });
      return { backend: 'host-adapter', provider };
    }
    // No adapter registered for this provider — fall through to config-backend path
  }

  // If config specifies a backend, use SpawnBackendFactory for all providers
  if (opts.spawnBackend) {
    const backend = SpawnBackendFactory.create({
      backend: opts.spawnBackend as 'docker' | 'tmux' | 'subprocess' | 'auto',
      projectDir: root,
      dockerImage: opts.dockerImage,
      dockerTimeoutSeconds: opts.dockerTimeout,
    });
    backend.spawn(taskId, model as ModelType, prompt, {
      autoApprove: opts.autoApprove ?? false,
      projectDir: root,
      allowedTools: opts.allowedTools,
    });
    return { backend: backend.name, provider };
  }

  // No config override → provider-based fallback
  if (provider === 'claude') {
    ensureSession();
    spawnWorker(taskId, model as ModelType, prompt, root, {
      autoApprove: opts.autoApprove ?? false,
      allowedTools: opts.allowedTools,
    });
    return { backend: 'tmux', provider };
  }

  // Codex/Gemini → subprocess backend
  const backend = SpawnBackendFactory.create({
    backend: 'subprocess',
    projectDir: root,
  });
  backend.spawn(taskId, model as ModelType, prompt, {
    autoApprove: opts.autoApprove ?? false,
    projectDir: root,
    allowedTools: opts.allowedTools,
  });
  return { backend: 'subprocess', provider };
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn <taskId>')
    .description('Manually spawn a worker for a task')
    .option('--force', 'Force respawn even if task is DONE or NO_GO')
    .option('--auto-approve', 'Enable auto-approve mode for the worker')
    .action(async (taskId: string, opts: { force?: boolean; autoApprove?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        const task = readTask(root, taskId);
        const config = await loadConfig(root).catch(() => ({ language: 'en' }));
        const lang = (config as Record<string, unknown>).language as string ?? 'en';

        // Status checks
        if (task.status === TaskStatus.EXECUTING) {
          printError(`Task ${taskId} is already running. Kill first with \`deckent kill ${taskId}\`.`);
          process.exitCode = 1;
          return;
        }

        if ((task.status === TaskStatus.DONE || task.status === TaskStatus.NO_GO) && !opts.force) {
          printError(`Task ${taskId} already ${task.status}. Use --force to respawn.`);
          process.exitCode = 1;
          return;
        }

        // Build rich prompt
        const agentPrompt = await resolveAgentPrompt(root, task);
        const skillPrompts = await resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);

        // Derive scope-based allowedTools for boundary enforcement
        const allowedTools = buildAllowedToolsFromScope(task);

        // Spawn via config-aware backend (respects spawn_backend setting)
        const cfgAny = config as { spawn_backend?: string; docker_image?: string; docker_timeout?: number };
        const { backend, provider } = await spawnWorkerMultiProvider(taskId, task.model, prompt, root, {
          autoApprove: opts.autoApprove ?? false,
          allowedTools,
          spawnBackend: cfgAny.spawn_backend,
          dockerImage: cfgAny.docker_image,
          dockerTimeout: cfgAny.docker_timeout,
        });

        print(getMessage('spawn.worker_spawned', lang, { taskId, model: task.model }));
        print(`  Backend: ${backend}`);
        print(`  Provider: ${provider}`);

        // Show scope info
        if (task.scope.directories.length > 0) {
          print(`  Scope dirs: ${task.scope.directories.join(', ')}`);
        }
        if (task.scope.filesWrite.length > 0) {
          print(`  Write files: ${task.scope.filesWrite.join(', ')}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
