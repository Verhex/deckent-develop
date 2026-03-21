import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  runSprint, readContext, checkUsage, adjustSprintSize, planSprint,
  BrainError,
} from '../../orchestra/brain.js';
import { isSessionActive, setupWatchWindow } from '../../orchestra/tmux.js';
import { TMUX_SESSION_NAME } from '../../core/constants.js';
import { runDoctorChecks } from './doctor.js';
import { print, printError, formatSprintSummary, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { prepareZeroConfig, cleanupZeroConfig } from './quick-start.js';

interface StartCommandOpts {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  dryRun?: boolean;
  force?: boolean;
  watch?: boolean;
}

export function registerStart(program: Command): void {
  program
    .command('start [description]')
    .description('Start a new sprint (optionally with a one-line description for zero-config mode)')
    .option('--auto-approve', 'Auto-approve worker actions (--dangerously-skip-permissions)')
    .option('--sandbox-mode', 'Run in sandbox mode (Docker)')
    .option('--dry-run', 'Plan sprint without spawning workers')
    .option('--force', 'Skip doctor pre-flight checks')
    .option('--watch', 'Automatically open watch mode after sprint spawns workers')
    .action(async (description: string | undefined, opts: StartCommandOpts) => {
      const root = resolveProjectRoot();

      // ─── Zero-Config Mode ────────────────────────────────────────
      let zeroConfigResult: ReturnType<typeof prepareZeroConfig> | null = null;

      let warnDirectivesExist = false;

      if (description) {
        zeroConfigResult = prepareZeroConfig(root, description);
        if (zeroConfigResult.alreadyExisted) {
          warnDirectivesExist = true;
          // Don't create temp file — use existing DIRECTIVES.md as-is
          zeroConfigResult = null;
        }
      }

      try {
        const config = await loadConfig(root);
        const lang = config.language;

        if (description && !warnDirectivesExist && zeroConfigResult) {
          print(getMessage('start.zero_config_created', lang, { description }));
        }

        if (warnDirectivesExist) {
          print(getMessage('start.zero_config_directives_exist', lang));
        }

        if (opts.sandboxMode) {
          if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);
          print(getMessage('start.sandbox_not_implemented', lang));
          return;
        }

        // Pre-flight doctor check (unless --force)
        if (!opts.force) {
          const doctorResult = runDoctorChecks(root);
          const requiredFailed = doctorResult.checks.filter(c => c.required && !c.passed);
          if (requiredFailed.length > 0) {
            if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);
            printError(new Error(`Pre-flight failed: ${requiredFailed.map(c => `${c.name}: ${c.message}`).join('; ')}`));
            print(getMessage('start.use_force', lang));
            process.exitCode = 1;
            return;
          }
        }

        // Dry-run mode: plan only, no spawn
        if (opts.dryRun) {
          if (opts.watch) {
            print(getMessage('start.watch_ignored_dry_run', lang));
          }
          const context = readContext(root);
          const usage = checkUsage(config);
          const recommendation = adjustSprintSize(config, usage);
          const sprint = await planSprint(root, config, context, recommendation);

          print(getMessage('start.sprint_planned', lang, {
            number: String(sprint.number),
            id: sprint.id,
            count: String(sprint.tasks.length),
          }));
          const headers = ['ID', 'Title', 'Model', 'Priority'];
          const rows = sprint.tasks.map(t => [t.id, t.title, t.model, t.priority]);
          print(formatTable(headers, rows));
          if (sprint.reasoning) {
            print(getMessage('start.reasoning', lang, { reasoning: sprint.reasoning }));
          }
          if (sprint.planningMode) {
            print(getMessage('start.planning_mode', lang, { mode: sprint.planningMode }));
          }
          print(getMessage('start.workers_info', lang, {
            count: String(sprint.tasks.length),
            model: config.activeModeConfig.brain_model,
          }));
          print(getMessage('start.dry_run_complete', lang));
          if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);
          return;
        }

        // Set up watch window before runSprint blocks
        if (opts.watch) {
          if (isSessionActive()) {
            setupWatchWindow(TMUX_SESSION_NAME, root);
            print(getMessage('start.watch_window_created', lang));
          } else {
            print(getMessage('start.watch_no_tmux', lang));
          }
        }

        const sprint = await runSprint(root, config, {
          autoApprove: opts.autoApprove ?? false,
          sandboxMode: opts.sandboxMode,
        });
        print(formatSprintSummary(sprint));

        // Clean up temporary DIRECTIVES.md after successful sprint
        if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);
      } catch (error) {
        // Always clean up temp DIRECTIVES.md on error too
        if (zeroConfigResult) cleanupZeroConfig(zeroConfigResult);

        if (error instanceof BrainError) {
          printError(new Error(`Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });
}
