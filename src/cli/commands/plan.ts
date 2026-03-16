import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { readContext, checkUsage, adjustSprintSize, planSprint } from '../../orchestra/brain.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Plan a sprint without executing it')
    .action(async () => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const context = readContext(root);
        const usage = checkUsage(config);
        const recommendation = adjustSprintSize(config, usage);

        const sprint = planSprint(root, config, context, recommendation);

        print(`Sprint ${sprint.number} (${sprint.id}) planned with ${sprint.tasks.length} tasks:\n`);
        const headers = ['ID', 'Title', 'Model', 'Priority'];
        const rows = sprint.tasks.map((t) => [t.id, t.title, t.model, t.priority]);
        print(formatTable(headers, rows));

        if (recommendation.size !== 'full') {
          print(`\nNote: Sprint size ${recommendation.size} — ${recommendation.reason}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
