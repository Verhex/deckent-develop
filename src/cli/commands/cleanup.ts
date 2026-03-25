import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, Sprint } from '../../core/types.js';
import { SprintStatus, SprintPhase } from '../../core/types.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { cleanup, runDecay } from '../../orchestra/brain.js';
import { destroy } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';

export function registerCleanup(program: Command): void {
  program
    .command('cleanup')
    .description('Clean up after a sprint')
    .option('--decay', 'Force run memory decay (compress .brain/ files)')
    .option('--dry-run', 'Preview what would be deleted without actually deleting')
    .action((opts: { decay?: boolean; dryRun?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);
      const tasksDir = join(root, TASKS_DIR);

      if (opts.dryRun) {
        const locksDir = join(root, LOCKS_DIR);
        const taskFiles = existsSync(tasksDir)
          ? readdirSync(tasksDir).filter(f => /\.(json|plan|hb|result|paused|log)$/.test(f))
          : [];
        const promptFiles = existsSync(tasksDir)
          ? readdirSync(tasksDir).filter(f => f.startsWith('.prompt-'))
          : [];
        const lockFiles = existsSync(locksDir) ? readdirSync(locksDir) : [];

        print('[dry-run] Would delete:');
        for (const f of taskFiles) print(`  task: ${f}`);
        for (const f of lockFiles) print(`  lock: ${f}`);
        for (const f of promptFiles) print(`  prompt: ${f}`);
        print(`  ${taskFiles.length} task file(s)`);
        print(`  ${lockFiles.length} lock file(s)`);
        print(`  ${promptFiles.length} prompt file(s)`);
        print('  tmux session: deckent-orchestra');
        print('\nRun without --dry-run to execute.');
        return;
      }

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
