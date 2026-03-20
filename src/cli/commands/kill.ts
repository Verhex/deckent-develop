import type { Command } from 'commander';
import { killWorker, TmuxError } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';

export function registerKill(program: Command): void {
  program
    .command('kill <taskId>')
    .description('Kill a running worker')
    .action(async (taskId: string) => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root).catch(() => ({ language: 'en' }));
      const lang = config.language ?? 'en';

      try {
        killWorker(taskId);
        print(getMessage('kill.worker_killed', lang, { taskId }));
      } catch (error) {
        if (error instanceof TmuxError) {
          printError(new Error(getMessage('kill.worker_not_found', lang, { taskId })));
          process.exitCode = 1;
        } else {
          throw error;
        }
      }
    });
}
