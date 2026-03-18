import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  runSprint, readContext, checkUsage, adjustSprintSize, planSprint,
  BrainError,
} from '../../orchestra/brain.js';
import { runDoctorChecks } from './doctor.js';
import { print, printError, formatSprintSummary, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface StartCommandOpts {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start a new sprint')
    .option('--auto-approve', 'Auto-approve worker actions (--dangerously-skip-permissions)')
    .option('--sandbox-mode', 'Run in sandbox mode (Docker)')
    .option('--dry-run', 'Plan sprint without spawning workers')
    .option('--force', 'Skip doctor pre-flight checks')
    .action(async (opts: StartCommandOpts) => {
      const root = resolveProjectRoot();

      try {
        if (opts.sandboxMode) {
          print('Sandbox mode not yet implemented. Running normally.');
          return;
        }

        // Pre-flight doctor check (unless --force)
        if (!opts.force) {
          const doctorResult = runDoctorChecks(root);
          const requiredFailed = doctorResult.checks.filter(c => c.required && !c.passed);
          if (requiredFailed.length > 0) {
            printError(new Error(`Pre-flight failed: ${requiredFailed.map(c => `${c.name}: ${c.message}`).join('; ')}`));
            print('Use --force to skip pre-flight checks.');
            process.exitCode = 1;
            return;
          }
        }

        const config = await loadConfig(root);

        // Dry-run mode: plan only, no spawn
        if (opts.dryRun) {
          const context = readContext(root);
          const usage = checkUsage(config);
          const recommendation = adjustSprintSize(config, usage);
          const sprint = planSprint(root, config, context, recommendation);

          print(`Sprint ${sprint.number} (${sprint.id}) planned — ${sprint.tasks.length} tasks:\n`);
          const headers = ['ID', 'Title', 'Model', 'Priority'];
          const rows = sprint.tasks.map(t => [t.id, t.title, t.model, t.priority]);
          print(formatTable(headers, rows));
          if (sprint.reasoning) {
            print(`\nReasoning: ${sprint.reasoning}`);
          }
          if (sprint.planningMode) {
            print(`Planning mode: ${sprint.planningMode}`);
          }
          print(`\nWorkers: ${sprint.tasks.length} | Brain model: ${config.activeModeConfig.brain_model}`);
          print('Dry-run complete. No workers spawned.');
          return;
        }

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
