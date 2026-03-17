import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { readContext, checkUsage, adjustSprintSize, planSprint } from '../../orchestra/brain.js';

export function registerPlanTool(server: McpServer): void {
  server.registerTool(
    'deckent_plan',
    {
      title: 'Plan Sprint',
      description: 'Plan a sprint based on current DIRECTIVES.md. Returns task list and recommendation without executing.',
      inputSchema: z.object({
        dryRun: z.boolean().optional().default(true).describe('Always dry-run for plan tool'),
      }),
    },
    async () => {
      const root = process.cwd();
      const config = await loadConfig(root);
      const context = readContext(root);
      const usage = checkUsage(config);
      const recommendation = adjustSprintSize(config, usage);
      const sprint = planSprint(root, config, context, recommendation);

      const tasks = sprint.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        model: t.model,
        priority: t.priority,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            sprintId: sprint.id,
            sprintNumber: sprint.number,
            tasks,
            recommendation: {
              size: recommendation.size,
              maxWorkers: recommendation.maxWorkers,
              reason: recommendation.reason,
            },
          }),
        }],
      };
    },
  );
}
