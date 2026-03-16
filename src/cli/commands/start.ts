import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { runSprint, BrainError } from '../../orchestra/brain.js';
import { print, printError, formatSprintSummary } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sprint')
    .option('--auto-approve', 'Auto-approve worker actions')
    .option('--sandbox', 'Run in sandbox mode (Docker)')
    .action(async (opts: { autoApprove?: boolean; sandbox?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        if (opts.sandbox) {
          print('Sandbox mode not yet implemented. Running normally.');
          return;
        }

        const config = await loadConfig(root);

        // DEBT-005: --auto-approve maps to haiku_allowed
        if (opts.autoApprove) {
          config.activeModeConfig = { ...config.activeModeConfig, haiku_allowed: true };
        }

        const sprint = runSprint(root, config);
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
