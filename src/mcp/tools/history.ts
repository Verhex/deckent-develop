import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatHistoryResponse, wrapResponse, type HistoryData } from '../helpers/format.js';
import { collectSprintFiles } from '../../orchestra/sprint-reporter.js';
import { mcpToolDescription } from './description-catalog.js';

function detectTrend(sprints: Array<{ id: string; content: string }>): string {
  if (sprints.length < 2) return 'insufficient_data';
  const taskCounts = sprints.map((s) => {
    const match = s.content.match(/(\d+)\/(\d+)\s*(tasks?|görev)/i);
    if (match) return { done: parseInt(match[1] ?? '0', 10), total: parseInt(match[2] ?? '0', 10) };
    return null;
  }).filter(Boolean) as Array<{ done: number; total: number }>;

  if (taskCounts.length < 2) return 'insufficient_data';
  const last = taskCounts.at(-1);
  const prev = taskCounts.at(-2);
  if (!last || !prev) return 'insufficient_data';
  const lastRate = last.total > 0 ? last.done / last.total : 0;
  const prevRate = prev.total > 0 ? prev.done / prev.total : 0;
  if (lastRate > prevRate) return 'improving';
  if (lastRate < prevRate) return 'declining';
  return 'stable';
}

export function registerHistoryTool(server: McpServer): void {
  server.registerTool(
    'deckent_history',
    {
      title: 'Run History',
      description: mcpToolDescription('deckent_history'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        last: z.number().min(1).max(50).optional().default(5).describe('Number of most recent runs to return (1-50, default: 5). Runs are sorted by sprint ID ascending.'),
        json: z.boolean().optional().default(false).describe('Return raw JSON data without the human-readable summary wrapper. Useful for programmatic consumption or piping to other tools.'),
      }),
    },
    async ({ last, json }) => {
      const root = process.cwd();

      try {
      const allEntries = collectSprintFiles(root);

      if (allEntries.length === 0) {
        const emptyData = { sprints: [], trend: 'insufficient_data' };
        if (json) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(emptyData) }] };
        }
        const summary = formatHistoryResponse(emptyData as HistoryData);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('history', emptyData), summary)) }],
        };
      }

      const entries = allEntries.slice(-last);

      const sprints = entries.map(({ file, dir }) => ({
        id: file.replace('.md', ''),
        content: readFileSync(join(dir, file), 'utf-8'),
      }));

      const trend = detectTrend(sprints);
      const historyData = { sprints, trend };

      if (json) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(historyData) }] };
      }

      const enriched = enrichResponse('history', historyData);
      const summary = formatHistoryResponse(historyData as HistoryData);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enriched, summary)) }],
      };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Failed to read run history: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
