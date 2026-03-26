import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatHistoryResponse, wrapResponse, type HistoryData } from '../helpers/format.js';

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
      title: 'Sprint History',
      description: 'Read archived sprint log files from .brain/sprints/. Returns the last N sprint markdown logs sorted by sprint ID, plus a trend analysis (improving/declining/stable) based on task completion rates across sprints. Use to understand long-term project health, compare sprint performance, or review past decisions. Each sprint log contains task outcomes, model usage, and learning notes.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        last: z.number().min(1).max(50).optional().default(5).describe('Number of most recent sprints to return (1-50, default: 5). Sprints are sorted by sprint ID ascending.'),
      }),
    },
    async ({ last }) => {
      const root = process.cwd();
      const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);

      try {
      if (!existsSync(sprintsDir)) {
        const emptyData = { sprints: [], trend: 'insufficient_data' };
        const summary = formatHistoryResponse(emptyData as HistoryData);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('history', emptyData), summary)) }],
        };
      }

      const files = readdirSync(sprintsDir)
        .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
        .sort()
        .slice(-last);

      const sprints = files.map((f) => ({
        id: f.replace('.md', ''),
        content: readFileSync(join(sprintsDir, f), 'utf-8'),
      }));

      const trend = detectTrend(sprints);
      const historyData = { sprints, trend };
      const enriched = enrichResponse('history', historyData);
      const summary = formatHistoryResponse(historyData as HistoryData);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enriched, summary)) }],
      };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Failed to read sprint history: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
