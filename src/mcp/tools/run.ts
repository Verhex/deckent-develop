import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR } from '../../core/constants.js';
import { writeJobState } from './job-runner.js';
import { enrichResponse } from '../helpers/enrich.js';

function generateJobId(): string {
  return `run-${Date.now().toString(36)}`;
}

export function registerRunTool(server: McpServer): void {
  server.registerTool(
    'deckent_run',
    {
      title: 'Run Task',
      description: 'Run a single one-off task. Creates a task JSON and spawns a worker. Returns jobId for tracking.',
      inputSchema: z.object({
        description: z.string().describe('Task description — what the worker should do'),
        model: z.enum(['opus', 'sonnet', 'haiku']).optional().default('sonnet').describe('Model to use'),
        scope: z.string().optional().describe('Comma-separated directory scope (e.g. "src/,tests/")'),
      }),
    },
    async ({ description, model, scope }) => {
      const root = process.cwd();

      try {
        const jobId = generateJobId();
        const taskId = `run-${jobId}`;
        const tasksDir = join(root, TASKS_DIR);
        mkdirSync(tasksDir, { recursive: true });

        const directories = scope ? scope.split(',').map((s) => s.trim()) : ['src/'];
        const task = {
          id: taskId,
          title: description.slice(0, 80),
          description,
          model,
          effort: 'normal',
          priority: 'NORMAL',
          scope: { directories, filesRead: [], filesWrite: [] },
          dependencies: [],
          status: 'PENDING',
          sprintId: 'one-off',
          createdAt: new Date().toISOString(),
          assignedAgent: 'generic',
          assignedSkills: [],
          provider: 'claude',
        };

        writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify(task, null, 2) + '\n');

        writeJobState(root, {
          jobId,
          status: 'RUNNING',
          startedAt: new Date().toISOString(),
        });

        const enriched = enrichResponse('run', {
          jobId,
          taskId,
          status: 'RUNNING',
          model,
          scope: directories,
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
