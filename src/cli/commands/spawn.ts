import type { Command } from 'commander';
import { readTask } from '../../agents/worker.js';
import { ensureSession, spawnWorker } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';
import { TaskStatus } from '../../core/task-types.js';
import { buildWorkerPrompt } from '../../orchestra/task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';

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

        ensureSession();

        // Build rich prompt
        const agentPrompt = resolveAgentPrompt(root, task);
        const skillPrompts = resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);

        spawnWorker(taskId, task.model, prompt, root, {
          // autoApprove is a CLI permission flag — never derived from haiku_allowed (model config)
          autoApprove: opts.autoApprove ?? false,
        });

        print(getMessage('spawn.worker_spawned', lang, { taskId, model: task.model }));

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
