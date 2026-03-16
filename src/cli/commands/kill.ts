import type { Command } from 'commander';
import { killWorker, TmuxError } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';

export function registerKill(program: Command): void {
  program
    .command('kill <taskId>')
    .description('Kill a running worker')
    .action((taskId: string) => {
      try {
        killWorker(taskId);
        print(`Worker for task ${taskId} killed.`);
      } catch (error) {
        if (error instanceof TmuxError) {
          printError(new Error(`Worker not found: ${taskId}`));
          process.exitCode = 1;
        } else {
          throw error;
        }
      }
    });
}
