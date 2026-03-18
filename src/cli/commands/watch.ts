import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { isSessionActive, createWatchLayout, attachToWorkerPane, TmuxError } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerWatch(program: Command): void {
  program
    .command('watch')
    .description('Live tmux split view: dashboard + worker panes')
    .option('--follow <taskId>', 'Attach to a specific worker pane')
    .action((opts: { follow?: string }) => {
      const root = resolveProjectRoot();

      if (!existsSync(join(root, DASHBOARD_FILE))) {
        printError(new Error('No active sprint. Run `deckent start` first.'));
        process.exitCode = 1;
        return;
      }

      if (!isSessionActive()) {
        printError(new Error('No tmux session found. Run `deckent start` first.'));
        process.exitCode = 1;
        return;
      }

      try {
        if (opts.follow) {
          attachToWorkerPane(opts.follow);
        } else {
          createWatchLayout(root);
        }

        print('Watch mode active. Press Ctrl+B D to detach.');
      } catch (error) {
        if (error instanceof TmuxError) {
          printError(error);
          process.exitCode = 1;
        } else {
          throw error;
        }
      }
    });
}
