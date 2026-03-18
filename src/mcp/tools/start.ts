import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig } from '../../core/config.js';
import { runSprint, BrainError } from '../../orchestra/brain.js';
import { writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerStartTool(server: McpServer): void {
  server.registerTool(
    'deckent_start',
    {
      title: 'Start Sprint',
      description: 'Start a sprint in the background (plan → spawn → execute → evaluate → retro → cleanup). Returns immediately with a jobId. Use deckent_status to track progress.',
      inputSchema: z.object({
        autoApprove: z.boolean().optional().default(false).describe('Auto-approve worker actions (--dangerously-skip-permissions)'),
      }),
    },
    async ({ autoApprove }) => {
      const root = process.cwd();

      try {
        const config = await loadConfig(root);
        const jobId = `sprint-${Date.now()}`;
        const startedAt = new Date().toISOString();

        writeJobState(root, { jobId, status: 'RUNNING', startedAt });

        // Fire and forget — don't await. Sprint runs in background.
        runSprint(root, config, { autoApprove }).then(sprint => {
          writeJobState(root, {
            jobId,
            status: 'COMPLETE',
            startedAt,
            completedAt: new Date().toISOString(),
            sprintId: sprint.id,
          });
        }).catch(err => {
          const message = err instanceof BrainError
            ? `Sprint failed at phase ${err.phase ?? 'unknown'}: ${err.message}`
            : err instanceof Error ? err.message : String(err);

          writeJobState(root, {
            jobId,
            status: 'FAILED',
            startedAt,
            completedAt: new Date().toISOString(),
            error: message,
          });
        });

        const startResponse = enrichResponse('start', {
          success: true,
          jobId,
          status: 'RUNNING',
          message: 'Sprint started in background. Use deckent_status to track progress.',
          activeWorkers: 0,
          queuedTasks: 0,
          estimatedDuration: '~10-30 minutes',
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(startResponse),
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
