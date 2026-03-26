import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UsageTracker } from '../../core/usage-tracker.js';
import { loadConfig } from '../../core/config.js';
import { getNextSprintId } from '../../core/utils.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerUsageTool(server: McpServer): void {
  server.registerTool(
    'deckent_usage',
    {
      title: 'Usage Stats',
      description: 'Get sprint usage statistics: token counts, API calls, cost estimates, model breakdown.',
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Sprint ID (e.g. "sprint-059"). Defaults to current sprint.'),
      }),
    },
    async ({ sprintId }) => {
      const root = process.cwd();

      try {
        await loadConfig(root);
        const nextId = getNextSprintId(root);
        const num = parseInt(nextId.replace('sprint-', ''), 10);
        const currentSprintId = `sprint-${String(Math.max(1, num - 1)).padStart(3, '0')}`;
        const resolvedSprintId = sprintId ?? currentSprintId;
        const tracker = new UsageTracker(root);
        const usage = tracker.getSprintUsage(resolvedSprintId);
        const total = tracker.getTotalUsage();
        const modelBreakdown = tracker.getModelBreakdown();

        const enriched = enrichResponse('usage', {
          sprintId: resolvedSprintId,
          usage,
          total,
          modelBreakdown,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
