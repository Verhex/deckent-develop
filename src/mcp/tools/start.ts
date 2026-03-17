import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { runSprint, BrainError } from '../../orchestra/brain.js';

export function registerStartTool(server: McpServer): void {
  server.registerTool(
    'deckent_start',
    {
      title: 'Start Sprint',
      description: 'Run a full sprint lifecycle (plan → spawn → execute → evaluate → retro → cleanup). This may take several minutes.',
      inputSchema: z.object({
        autoApprove: z.boolean().optional().default(false).describe('Auto-approve worker actions (--dangerously-skip-permissions)'),
      }),
    },
    async ({ autoApprove }) => {
      const root = process.cwd();

      try {
        const config = await loadConfig(root);
        const sprint = await runSprint(root, config, { autoApprove });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              sprint: {
                id: sprint.id,
                number: sprint.number,
                status: sprint.status,
                phase: sprint.phase,
                taskCount: sprint.tasks.length,
                metrics: sprint.metrics,
                startedAt: sprint.startedAt,
                completedAt: sprint.completedAt,
              },
            }),
          }],
        };
      } catch (error) {
        const message = error instanceof BrainError
          ? `Sprint failed at phase ${error.phase ?? 'unknown'}: ${error.message}`
          : error instanceof Error ? error.message : String(error);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: message }) }],
          isError: true,
        };
      }
    },
  );
}
