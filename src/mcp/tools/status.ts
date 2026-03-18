import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DASHBOARD_FILE } from '../../core/constants.js';
import { readLatestJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';

function buildProgressBar(done: number, total: number, width = 10): string {
  if (total <= 0) return '░'.repeat(width);
  const filled = Math.round((done / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function computeEta(done: number, total: number, startedAt?: string): string {
  if (!startedAt || done <= 0 || total <= 0) return 'unknown';
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const perTask = elapsed / done;
  const remaining = (total - done) * perTask;
  const mins = Math.round(remaining / 60000);
  if (mins <= 0) return 'finishing soon';
  return `~${mins} minute${mins === 1 ? '' : 's'}`;
}

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
        const state = JSON.parse(content) as Record<string, unknown>;
        const progress = state['progress'] as { done?: number; total?: number } | undefined;
        const done = progress?.done ?? 0;
        const total = progress?.total ?? 0;
        const agents = state['agents'] as unknown[] | undefined;
        const alerts = state['alerts'] as unknown[] | undefined;
        const sprint = state['sprint'] as { startedAt?: string } | undefined;

        const progressBar = buildProgressBar(done, total);
        const eta = computeEta(done, total, sprint?.startedAt);
        const workerSummary = `${agents?.length ?? 0} active`;
        const alertSummary = `${alerts?.length ?? 0} alert${(alerts?.length ?? 0) === 1 ? '' : 's'}`;

        const enrichedState = enrichResponse('status', {
          ...state,
          job: latestJob,
          progressBar,
          eta,
          workerSummary,
          alertSummary,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enrichedState) }],
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
