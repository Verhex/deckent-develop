import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { readContext, checkUsage, adjustSprintSize, planSprint, confirmDraftTasks } from '../../orchestra/brain.js';
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
    .action(async (opts: { confirm?: boolean; structured?: boolean }) => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const lang = config.language;
        const context = readContext(root);
        const usage = checkUsage(config);
        const recommendation = adjustSprintSize(config, usage);

        const planMode: BrainPlanningMode | undefined = opts.structured ? 'structured' : undefined;
        const asDraft = opts.confirm !== false;

        const sprint = await planSprint(root, config, context, recommendation, {
          mode: planMode,
          asDraft,
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
