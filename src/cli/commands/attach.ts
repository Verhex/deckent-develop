import type { Command } from 'commander';
import { isSessionActive, attach, TmuxError } from '../../orchestra/tmux.js';
import { printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage } from '../helpers/messages.js';

export function registerAttach(program: Command): void {
  program
    .command('attach')
    .description('Attach to the tmux orchestra session')
    .action(async () => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root).catch(() => ({ language: 'en' }));
      const lang = config.language ?? 'en';

      try {
        if (!isSessionActive()) {
          printError(new Error(getMessage('attach.no_active_session', lang)));
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
