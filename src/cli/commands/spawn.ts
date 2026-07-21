import { existsSync, statSync, writeFileSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, ModelType, ProviderName, TaskResult } from '../../core/types.js';
import { readTask } from '../../agents/worker.js';
import { ensureSession, spawnWorker } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';
import { TaskStatus, getProviderForModel } from '../../core/task-types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { readJsonSafe, debugLog } from '../../core/utils.js';
import { buildWorkerPrompt } from '../../orchestra/task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { SpawnBackendFactory } from '../../orchestra/spawn-backend.js';
import { isAdapterProvider, getProviderAdapterForTask } from '../../orchestra/sprint-utils.js';
import { ensureOllamaModelRegistered } from '../../core/model-registry.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import { resolveReasoningEffort } from '../../core/reasoning-effort.js';
import { normalizeTaskResultShape } from '../../core/task-result-schema.js';
import type { ExecutionBudget } from '../../core/work-model.js';
import {
  assertExecutionBudgetShape,
  assertLiveUsageBudgetSupport,
} from '../../core/live-execution-budget.js';
import { resolveTaskExecutionBudget } from '../../orchestra/runtime-budget-monitor.js';

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
  opts: { autoApprove?: boolean; allowedTools?: string; spawnBackend?: string; dockerImage?: string; dockerTimeout?: number; provider?: string; modelEffort?: string; executionBudget?: ExecutionBudget },
): Promise<{ backend: string; provider: ProviderName }> {
  const executionBudget = resolveTaskExecutionBudget(root, taskId, opts.executionBudget);

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
  // OPENROUTER-PROVIDER (row 477): same on-demand registration contract as the
  // ollama branch above — OpenRouter ids are catalog-driven, never in the static
  // registry, so `getProviderForModel` below would throw UnknownModelError first.
  // Shared seam with run.ts/MCP-run/autonomous (`registerOpenRouterModelFromCache`):
  // registers from the VERIFIED probe cache only. Cache miss → no registration →
  // downstream lookup fails honestly; an unprobed model must never be silently
  // priced as free (remedy: `deckent openrouter-probe`).
  if (opts.provider === 'openrouter') {
    registerOpenRouterModelFromCache(root, model);
  }
  const provider = getProviderForModel(model as ModelType);
  // Admission happens before provider bootstrap/session/backend creation. A
  // budgetless remote one-shot must produce exactly zero external side effects.
  assertExecutionBudgetShape(
    executionBudget,
    provider,
    provider === 'ollama' ? 'local' : 'remote',
  );

  // F1-RE (268-003): resolve the model reasoning-effort ONCE for the resolved
  // provider — same SSOT + opt-in semantics as the sprint path
  // (sprint-spawner.ts:511). Invalid/unsupported level → undefined → no flag
  // emitted (CLI default kept). Previously the manual paths (deckent spawn /
  // deckent run) silently dropped task.modelEffort.
  const reasoningEffort = resolveReasoningEffort(provider, opts.modelEffort);

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
    let adapter = getProviderAdapterForTask(provider);
    // OPENROUTER-PROVIDER (row 477): lazy re-bootstrap, mirroring
    // sprint-spawner.ts's `wantsHostAdapter && !adapterRouted` recovery. Unlike the
    // sprint path, `deckent run` / autonomous kind=task never call
    // `bootstrapProviders` at all, so the registry is EMPTY here and every
    // host-adapter provider silently fell through to the docker backend — which
    // then honest-fails ("no ProviderCommandSpec"). Registering on demand is what
    // makes `--provider openrouter` (and `--provider ollama`) actually reach its
    // adapter from this entry point. Idempotent + best-effort: on fault we keep
    // null and fall through to the pre-existing backend path.
    if (!adapter) {
      try {
        const { bootstrapProviders } = await import('../../core/provider.js');
        const cfg = await loadConfig(root);
        await bootstrapProviders(cfg, root);
        adapter = getProviderAdapterForTask(provider);
      } catch {
        // keep null — fall through to the backend path below
      }
    }
    if (adapter) {
      assertLiveUsageBudgetSupport(
        executionBudget,
        adapter.liveUsageBudgetSupport,
        adapter.name,
        adapter.executionCostClass,
      );
      const refresh = (adapter as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
      if (typeof refresh === 'function') {
        await refresh.call(adapter);
      }
      adapter.spawn(taskId, model as ModelType, prompt, {
        allowedTools: opts.allowedTools,
        autoApprove: opts.autoApprove ?? false,
        projectDir: root,
        reasoningEffort,
        executionBudget,
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
    assertLiveUsageBudgetSupport(
      executionBudget,
      backend.liveUsageBudgetSupport,
      backend.name,
    );
    backend.spawn(taskId, model as ModelType, prompt, {
      autoApprove: opts.autoApprove ?? false,
      projectDir: root,
      allowedTools: opts.allowedTools,
      reasoningEffort,
      executionBudget,
    });
    return { backend: backend.name, provider };
  }

  // No config override → provider-based fallback
  if (provider === 'claude') {
    assertLiveUsageBudgetSupport(executionBudget, undefined, 'tmux');
    ensureSession();
    spawnWorker(taskId, model as ModelType, prompt, root, {
      autoApprove: opts.autoApprove ?? false,
      allowedTools: opts.allowedTools,
      reasoningEffort,
    });
    return { backend: 'tmux', provider };
  }

  // Codex/Gemini → subprocess backend
  const backend = SpawnBackendFactory.create({
    backend: 'subprocess',
    projectDir: root,
  });
  assertLiveUsageBudgetSupport(
    executionBudget,
    backend.liveUsageBudgetSupport,
    backend.name,
  );
  backend.spawn(taskId, model as ModelType, prompt, {
    autoApprove: opts.autoApprove ?? false,
    projectDir: root,
    allowedTools: opts.allowedTools,
    reasoningEffort,
    executionBudget,
  });
  return { backend: 'subprocess', provider };
}

/**
 * Finalize the task JSON `status` from the worker's `.result` file (268-003).
 *
 * Manual `deckent spawn` previously left the task JSON at EXECUTING/CLAIMED after
 * the worker wrote its `.result` — a second spawn could then run a duplicate
 * worker (267-004 live evidence). Derives status from `selfAssessment` with the
 * same mapping as the sprint path's applyStatusMutation (ADR-045 §1,
 * result-collector.ts): DONE / GO_WITH_TECH_DEBT → DONE, NO_GO → NO_GO.
 *
 * @returns the finalized TaskStatus, or null when the result file is missing,
 *          malformed, or carries an unknown selfAssessment (task JSON untouched).
 */
export function finalizeTaskStatusFromResult(root: string, taskId: string): TaskStatus | null {
  const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);
  if (!existsSync(resultPath)) return null;
  const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
  if (!result) return null;

  const assessment = result.selfAssessment;
  const status =
    assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT' ? TaskStatus.DONE
    : assessment === 'NO_GO' ? TaskStatus.NO_GO
    : null;
  if (status === null) return null;

  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  try {
    const task = readTask(root, taskId);
    task.status = status;
    writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');
    return status;
  } catch (e) {
    debugLog('spawn:finalizeTaskStatus', e);
    return null;
  }
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn <taskId>')
    // NOTE: with the docker backend this command BLOCKS until the worker
    // container exits — DockerSpawnBackend.monitorContainer keeps a `docker wait`
    // child alive, so the CLI process only returns once the worker is finished.
    // tmux/subprocess spawns remain fire-and-forget.
    .description('Manually spawn a worker for a task (BLOCKS until the worker exits on the docker backend; fire-and-forget on tmux/subprocess)')
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
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts, root);

        // Derive scope-based allowedTools for boundary enforcement
        const allowedTools = buildAllowedToolsFromScope(task);

        // Stale-result guard for the post-spawn finalize below: a pre-existing
        // .result (e.g. --force respawn of a DONE/NO_GO task) must not be read
        // as the NEW run's outcome — only a result created/modified after this
        // point finalizes the task status.
        const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);
        let preSpawnResultMtime: number | null = null;
        try { preSpawnResultMtime = statSync(resultPath).mtimeMs; } catch { /* no prior result */ }

        // Spawn via config-aware backend (respects spawn_backend setting).
        // Docker backend: this call starts the container and the process then
        // stays alive until the container exits (`docker wait` monitor) — i.e.
        // `deckent spawn` is BLOCKING on docker. tmux/subprocess: fire-and-forget.
        const cfgAny = config as { spawn_backend?: string; docker_image?: string; docker_timeout?: number };
        const { backend, provider } = await spawnWorkerMultiProvider(taskId, task.model, prompt, root, {
          autoApprove: opts.autoApprove ?? false,
          allowedTools,
          spawnBackend: cfgAny.spawn_backend,
          dockerImage: cfgAny.docker_image,
          dockerTimeout: cfgAny.docker_timeout,
          // F1-RE (268-003): forward the task's reasoning-depth override so the
          // manual spawn path emits the provider flag like the sprint path does.
          modelEffort: task.modelEffort,
          executionBudget: task.budget,
          // OPENROUTER-PROVIDER (row 477): forward the task's OWN provider. Without
          // it the on-demand registration branches in spawnWorkerMultiProvider
          // (`opts.provider === 'ollama' | 'openrouter'`) never fired on this path,
          // so `deckent spawn <taskId>` threw UnknownModelError for any dynamic id
          // — ollama tags included. Unlike `deckent run`, this path never calls
          // `resolveExecutionModelIdentity`, so nothing else registers the model here.
          provider: task.provider,
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

        // 268-003 completion finalize: when the worker's .result appears, derive
        // the task JSON status from selfAssessment so a later spawn cannot run a
        // duplicate worker against a stale EXECUTING/CLAIMED status (267-004).
        // A result is only honored when it is NEW relative to the pre-spawn
        // snapshot (mtime guard above).
        const isNewResult = (): boolean => {
          try {
            const mtime = statSync(resultPath).mtimeMs;
            return preSpawnResultMtime === null || mtime !== preSpawnResultMtime;
          } catch {
            return false;
          }
        };
        const tryFinalize = (): boolean => {
          if (!isNewResult()) return false;
          const finalized = finalizeTaskStatusFromResult(root, taskId);
          if (finalized !== null) {
            print(`  Task status finalized: ${finalized}`);
            return true;
          }
          return false;
        };

        // Blocking backends (docker) may have completed already — finalize now.
        if (!tryFinalize()) {
          // Fire-and-forget backends: watch for the result WITHOUT keeping the
          // process alive (persistent: false). If the process stays alive anyway
          // (docker's `docker wait` monitor), the watcher fires on completion;
          // if the CLI exits first (tmux/subprocess), behavior is unchanged.
          try {
            const watcher = fsWatch(join(root, TASKS_DIR), { persistent: false }, (_event, filename) => {
              if (filename === `task-${taskId}.result` && tryFinalize()) {
                watcher.close();
              }
            });
            watcher.on('error', () => watcher.close());
          } catch (e) {
            debugLog('spawn:resultWatch', e);
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
