import type { Command } from 'commander';
import { isSessionActive, attach, TmuxError } from '../../orchestra/tmux.js';
import { printError } from '../helpers/output.js';

export function registerAttach(program: Command): void {
  program
    .command('attach')
    .description('Attach to the tmux orchestra session')
    .action(() => {
      try {
        if (!isSessionActive()) {
          printError(new Error('No active session. Run `deckent start` first.'));
          process.exitCode = 1;
          return;
        }
        attach();
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
