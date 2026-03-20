import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, Sprint } from '../../core/types.js';
import { SprintStatus, SprintPhase } from '../../core/types.js';
import { TASKS_DIR, PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { cleanup, runDecay } from '../../orchestra/brain.js';
import { destroy } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

function readLanguage(root: string): string {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { language?: string };
      return config.language ?? 'en';
    }
  } catch {
    // fallback
  }
  return 'en';
}

export function registerCleanup(program: Command): void {
  program
    .command('cleanup')
    .description('Clean up after a sprint')
    .option('--decay', 'Force run memory decay (compress .brain/ files)')
    .action((opts: { decay?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = readLanguage(root);
      const tasksDir = join(root, TASKS_DIR);

      try {
        if (opts.decay) {
          const result = runDecay(root, 'sprint-cleanup', { force: true });
          print(getMessage('cleanup.decay_complete', lang, {
            before: String(result.linesBefore),
            after: String(result.linesAfter),
          }));
          if (result.archivedSprints.length > 0) {
            print(getMessage('cleanup.archived_sprints', lang, {
              sprints: result.archivedSprints.join(', '),
            }));
          }
          if (result.removedDebtCount > 0 || result.removedPatternCount > 0) {
            print(getMessage('cleanup.removed_items', lang, {
              debt: String(result.removedDebtCount),
              patterns: String(result.removedPatternCount),
            }));
          }
          return;
        }

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

        print(getMessage('cleanup.complete', lang, { count: String(tasks.length) }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
