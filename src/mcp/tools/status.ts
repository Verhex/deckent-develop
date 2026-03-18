import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { readLatestJobState } from './job-runner.js';

export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    'deckent_status',
    {
      title: 'Sprint Status',
      description: 'Get the current sprint dashboard status. Returns agent states, progress, usage metrics, alerts, and background job state.',
    },
    async () => {
      const root = process.cwd();
      const dashPath = join(root, DASHBOARD_FILE);

      const latestJob = readLatestJobState(root);

      if (!existsSync(dashPath)) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ active: false, message: 'No active sprint.', job: latestJob }),
          }],
        };
      }

      try {
        const content = readFileSync(dashPath, 'utf-8');
        const state = JSON.parse(content);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ...state, job: latestJob }) }],
        };
      } catch {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ active: false, message: 'Cannot parse dashboard file.', job: latestJob }),
          }],
          isError: true,
        };
      }
    },
  );
}
