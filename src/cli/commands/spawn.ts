import type { Command } from 'commander';
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

/**
 * Spawn a worker using the appropriate backend based on the task's provider.
 * Claude models use tmux, Codex/Gemini models use subprocess backend.
 */
export function spawnWorkerMultiProvider(
  taskId: string,
  model: string,
  prompt: string,
  root: string,
  opts: { autoApprove?: boolean },
): { backend: string } {
  const provider = getProviderForModel(model as import('../../core/types.js').ModelType);

  if (provider === 'claude') {
    ensureSession();
    spawnWorker(taskId, model as import('../../core/types.js').ModelType, prompt, root, {
      autoApprove: opts.autoApprove ?? false,
    });
    return { backend: 'tmux' };
  }

  // Codex/Gemini → subprocess backend
  const backend = SpawnBackendFactory.create({
    backend: 'subprocess',
    projectDir: root,
  });
  backend.spawn(taskId, model as import('../../core/types.js').ModelType, prompt, {
    autoApprove: opts.autoApprove ?? false,
    projectDir: root,
  });
  return { backend: 'subprocess' };
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
        const agentPrompt = resolveAgentPrompt(root, task);
        const skillPrompts = resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);

        // Spawn via appropriate backend based on model's provider
        const { backend } = spawnWorkerMultiProvider(taskId, task.model, prompt, root, {
          autoApprove: opts.autoApprove ?? false,
        });

        print(getMessage('spawn.worker_spawned', lang, { taskId, model: task.model }));
        print(`  Backend: ${backend}`);

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
