import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { readContext, checkUsage, adjustSprintSize, planSprint, confirmDraftTasks } from '../../orchestra/brain.js';
import type { BrainPlanningMode } from '../../core/types.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { promptConfirm } from '../helpers/prompt.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Plan a sprint without executing it')
    .option('--no-confirm', 'Skip confirmation, auto-approve plan')
    .option('--structured', 'Force structured parsing (skip AI)')
    .action(async (opts: { confirm?: boolean; structured?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const context = readContext(root);
        const usage = checkUsage(config);
        const recommendation = adjustSprintSize(config, usage);

        const planMode: BrainPlanningMode | undefined = opts.structured ? 'structured' : undefined;
        const asDraft = opts.confirm !== false;

        const sprint = planSprint(root, config, context, recommendation, {
          mode: planMode,
          asDraft,
        });

        print(`Sprint ${sprint.number} (${sprint.id}) planned with ${sprint.tasks.length} tasks:\n`);
        const headers = ['ID', 'Title', 'Model', 'Priority'];
        const rows = sprint.tasks.map((t) => [t.id, t.title, t.model, t.priority]);
        print(formatTable(headers, rows));

        if (sprint.reasoning) {
          print(`\nReasoning: ${sprint.reasoning}`);
        }
        if (sprint.planningMode) {
          print(`Planning mode: ${sprint.planningMode}`);
        }

        if (recommendation.size !== 'full') {
          print(`\nNote: Sprint size ${recommendation.size} — ${recommendation.reason}`);
        }

        // Approval flow for DRAFT tasks
        if (asDraft) {
          const confirmed = await promptConfirm('Approve this plan?');
          if (confirmed) {
            confirmDraftTasks(root, sprint);
            print('Plan approved.');
          } else {
            print('Plan rejected.');
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
