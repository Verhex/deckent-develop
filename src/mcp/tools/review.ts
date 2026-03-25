import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR } from '../../core/constants.js';
import { loadConfig } from '../../core/config.js';
import { getNextSprintId } from '../../core/utils.js';
import { enrichResponse } from '../helpers/enrich.js';

interface TaskResultData {
  taskId?: string;
  selfAssessment?: string;
  testsPassed?: boolean;
  filesChanged?: string[];
  notes?: string;
}

interface TaskData {
  id?: string;
  title?: string;
  status?: string;
  sprintId?: string;
}

function loadTaskResults(root: string, sprintId: string): Array<{ task: TaskData; result: TaskResultData | null }> {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];

  const entries = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.json'),
  );

  const results: Array<{ task: TaskData; result: TaskResultData | null }> = [];

  for (const entry of entries) {
    try {
      const task = JSON.parse(readFileSync(join(tasksDir, entry), 'utf-8')) as TaskData;
      if (task.sprintId && task.sprintId !== sprintId) continue;

      const resultPath = join(tasksDir, entry.replace('.json', '.result'));
      let result: TaskResultData | null = null;
      if (existsSync(resultPath)) {
        result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResultData;
      }
      results.push({ task, result });
    } catch {
      // skip malformed
    }
  }

  return results;
}

export function registerReviewTool(server: McpServer): void {
  server.registerTool(
    'deckent_review',
    {
      title: 'Sprint Review',
      description: 'Review sprint task results. Returns task statuses, self-assessments, and review decisions.',
      inputSchema: z.object({
        auto: z.boolean().optional().default(false).describe('Auto-approve tasks that pass (DONE + tests passed)'),
      }),
    },
    async ({ auto }) => {
      const root = process.cwd();

      try {
        await loadConfig(root);
        const nextId = getNextSprintId(root);
        const num = parseInt(nextId.replace('sprint-', ''), 10);
        const sprintId = `sprint-${String(Math.max(1, num - 1)).padStart(3, '0')}`;
        const taskResults = loadTaskResults(root, sprintId);

        if (taskResults.length === 0) {
          const enriched = enrichResponse('review', { sprintId, reviews: [], message: 'No tasks found for review.' });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        const reviews = taskResults.map(({ task, result }) => {
          const taskId = task.id ?? 'unknown';
          const title = task.title ?? '';
          const assessment = result?.selfAssessment ?? 'PENDING';
          const testsPassed = result?.testsPassed ?? false;

          let decision = 'pending';
          if (auto && assessment === 'DONE' && testsPassed) {
            decision = 'approved';
          } else if (assessment === 'NO_GO') {
            decision = 'rejected';
          }

          return { taskId, title, assessment, testsPassed, decision, filesChanged: result?.filesChanged ?? [], notes: result?.notes };
        });

        const approved = reviews.filter((r) => r.decision === 'approved').length;
        const rejected = reviews.filter((r) => r.decision === 'rejected').length;
        const pending = reviews.filter((r) => r.decision === 'pending').length;

        const enriched = enrichResponse('review', {
          sprintId,
          reviews,
          summary: { total: reviews.length, approved, rejected, pending },
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}
