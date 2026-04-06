import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { bootstrapProviders } from '../../core/provider.js';
import {
  readContext, planSprint, confirmDraftTasks, cleanupDraftTasks,
} from '../../orchestra/brain.js';
import type { SprintSizeRecommendation } from '../../core/types.js';
import type { BrainPlanningMode } from '../../core/types.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { promptConfirm } from '../helpers/prompt.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Plan a sprint without executing it')
    .option('--no-confirm', 'Skip confirmation, auto-approve plan')
    .option('--structured', 'Force structured parsing (skip AI)')
    .option('--dry-run', 'Show plan without writing task files to disk')
    .action(async (opts: { confirm?: boolean; structured?: boolean; dryRun?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const lang = config.language;
        const context = readContext(root);

        // Provider bootstrap — follows start.ts pattern
        // For --dry-run, providers are optional (structured parse suffices)
        let planMode: BrainPlanningMode | undefined = opts.structured ? 'structured' : undefined;
        const dryRun = opts.dryRun === true;

        if (dryRun) {
          // --dry-run: force structured mode, no provider needed
          if (!planMode) {
            planMode = 'structured';
          }
        } else {
          try {
            await bootstrapProviders(config);
          } catch {
            // Provider bootstrap failed (no API key, etc.) — fall back to structured mode
            if (!planMode) {
              print('[warn] Provider bootstrap failed — falling back to structured mode.');
              planMode = 'structured';
            }
          }
        }

        const recommendation: SprintSizeRecommendation = {
          size: 'full',
          maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
          modelConstraint: null,
          reason: 'No usage constraints',
        };

        // Clean up existing DRAFT tasks before planning (idempotency)
        cleanupDraftTasks(root);

        const asDraft = opts.confirm !== false;

        const sprint = await planSprint(root, config, context, recommendation, {
          mode: planMode,
          asDraft,
          dryRun,
        });

        print(getMessage('plan.sprint_planned', lang, {
          number: String(sprint.number),
          id: sprint.id,
          count: String(sprint.tasks.length),
        }));
        const headers = ['ID', 'Title', 'Model', 'Priority'];
        const rows = sprint.tasks.map((t) => [t.id, t.title, t.model, t.priority]);
        print(formatTable(headers, rows));

        if (sprint.reasoning) {
          print(getMessage('plan.reasoning', lang, { reasoning: sprint.reasoning }));
        }
        if (sprint.planningMode) {
          print(getMessage('plan.planning_mode', lang, { mode: sprint.planningMode }));
        }

        if (recommendation.size !== 'full') {
          print(getMessage('plan.note_sprint_size', lang, {
            size: recommendation.size,
            reason: recommendation.reason,
          }));
        }

        if (dryRun) {
          print('[dry-run] No task files written to disk.');
          return;
        }

        // Approval flow for DRAFT tasks
        if (asDraft) {
          const confirmed = await promptConfirm('Approve this plan?');
          if (confirmed) {
            confirmDraftTasks(root, sprint);
            print(getMessage('plan.approved', lang));
          } else {
            print(getMessage('plan.rejected', lang));
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
