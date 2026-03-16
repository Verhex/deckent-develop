import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, Sprint } from '../../core/types.js';
import { SprintStatus, SprintPhase } from '../../core/types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { cleanup } from '../../orchestra/brain.js';
import { destroy } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerCleanup(program: Command): void {
  program
    .command('cleanup')
    .description('Clean up after a sprint')
    .action(() => {
      const root = resolveProjectRoot();
      const tasksDir = join(root, TASKS_DIR);

      try {
        const tasks: Task[] = [];
        if (existsSync(tasksDir)) {
          const files = readdirSync(tasksDir).filter(
            (f) => f.startsWith('task-') && f.endsWith('.json'),
          );
          for (const f of files) {
            try {
              const task = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task;
              tasks.push(task);
            } catch {
              // skip malformed task files
            }
          }
        }

        const sprint: Sprint = {
          id: `cleanup-${Date.now()}`,
          number: 0,
          status: SprintStatus.COMPLETE,
          phase: SprintPhase.COMPLETE,
          tasks,
          workers: [],
        };

        cleanup(root, sprint);

        try {
          destroy();
        } catch {
          // session may not exist
        }

        print(`Cleanup complete. Removed artifacts for ${tasks.length} tasks.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
