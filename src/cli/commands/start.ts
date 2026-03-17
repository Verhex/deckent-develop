import type { Command } from 'commander';
import type { StartOptions } from '../../core/types.js';
import { loadConfig } from '../../core/config.js';
import { runSprint, BrainError } from '../../orchestra/brain.js';
import { print, printError, formatSprintSummary } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sprint')
    .option('--auto-approve', 'Auto-approve worker actions (--dangerously-skip-permissions)')
    .option('--sandbox-mode', 'Run in sandbox mode (Docker)')
    .action(async (opts: StartOptions) => {
      const root = resolveProjectRoot();

      try {
        if (opts.sandboxMode) {
          print('Sandbox mode not yet implemented. Running normally.');
          return;
        }

        const config = await loadConfig(root);
        const sprint = await runSprint(root, config, {
          autoApprove: opts.autoApprove ?? false,
          sandboxMode: opts.sandboxMode,
        });
        print(formatSprintSummary(sprint));
      } catch (error) {
        if (error instanceof BrainError) {
          printError(new Error(`Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });
}
