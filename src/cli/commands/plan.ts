import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import {
  readContext, checkUsage, checkUsageWithProvider, getDefaultProvider,
  adjustSprintSize, planSprint, confirmDraftTasks, cleanupDraftTasks,
} from '../../orchestra/brain.js';
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

        // A) Use async provider-based usage check when available, fall back to sync
        let usage;
        const provider = getDefaultProvider();
        if (provider) {
          try {
            usage = await checkUsageWithProvider(provider);
          } catch {
            usage = checkUsage(config);
          }
        } else {
          usage = checkUsage(config);
        }

        const recommendation = adjustSprintSize(config, usage);

        // C) Clean up existing DRAFT tasks before planning (idempotency)
        cleanupDraftTasks(root);

        const planMode: BrainPlanningMode | undefined = opts.structured ? 'structured' : undefined;
        const asDraft = opts.confirm !== false;
        const dryRun = opts.dryRun === true;

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
