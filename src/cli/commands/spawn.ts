import type { Command } from 'commander';
import { readTask } from '../../agents/worker.js';
import { ensureSession, spawnWorker } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerSpawn(program: Command): void {
  program
    .command('spawn <taskId>')
    .description('Manually spawn a worker for a task')
    .action(async (taskId: string) => {
      const root = resolveProjectRoot();

      try {
        const task = readTask(root, taskId);

        ensureSession();
        const prompt = `You are a Worker agent. Read your task file (.tasks/task-${taskId}.json) and execute it.`;
        spawnWorker(taskId, task.model, prompt, root, {
          // autoApprove is a CLI permission flag — never derived from haiku_allowed (model config)
          autoApprove: false,
        });

        print(`Worker spawned for task ${taskId} (model: ${task.model}).`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
