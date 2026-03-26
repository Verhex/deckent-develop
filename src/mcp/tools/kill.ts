import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';

interface TaskFileData {
  id?: string;
  status?: string;
  forceModel?: string;
}

function killTaskById(root: string, taskId: string): boolean {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return false;

  const files = readdirSync(tasksDir);
  const taskFile = files.find(
    (f) => f === `task-${taskId}.json` || (f.endsWith(`-${taskId}.json`) && f.startsWith('task-')),
  );
  if (!taskFile) return false;

  const taskPath = join(tasksDir, taskFile);
  try {
    const data = JSON.parse(readFileSync(taskPath, 'utf-8')) as TaskFileData;
    data.status = 'PAUSED';
    writeFileSync(taskPath, JSON.stringify(data, null, 2) + '\n');
  } catch {
    return false;
  }

  // Clean up heartbeat and lock files
  const hbFile = taskFile.replace('.json', '.hb');
  const hbPath = join(tasksDir, hbFile);
  if (existsSync(hbPath)) {
    try { unlinkSync(hbPath); } catch { /* ignore */ }
  }

  // Remove locks owned by this task
  const locksDir = join(root, LOCKS_DIR);
  if (existsSync(locksDir)) {
    try {
      for (const lockFile of readdirSync(locksDir)) {
        const lockPath = join(locksDir, lockFile);
        const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as { taskId?: string };
        if (lock.taskId === taskId) {
          unlinkSync(lockPath);
        }
      }
    } catch { /* ignore */ }
  }

  return true;
}

function killAllTasks(root: string): number {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return 0;

  const files = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.json'),
  );

  let killed = 0;
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as TaskFileData;
      if (data.status === 'EXECUTING' || data.status === 'CLAIMED' || data.status === 'TESTING') {
        const taskId = data.id ?? f.replace('task-', '').replace('.json', '');
        if (killTaskById(root, taskId)) killed++;
      }
    } catch { /* skip */ }
  }

  return killed;
}

export function registerKillTool(server: McpServer): void {
  server.registerTool(
    'deckent_kill',
    {
      title: 'Kill Worker',
      description: 'Stop a running worker by task ID, or kill all active workers. Sets task status to PAUSED and cleans up locks.',
      inputSchema: z.object({
        taskId: z.string().optional().describe('Task ID to kill (e.g. "059-001")'),
        all: z.boolean().optional().default(false).describe('Kill all active workers'),
      }),
    },
    async ({ taskId, all }) => {
      const root = process.cwd();

      try {
        if (!taskId && !all) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'Provide taskId or set all=true' }) }],
            isError: true,
          };
        }

        if (all) {
          const killed = killAllTasks(root);
          const enriched = enrichResponse('kill', { all: true, killedCount: killed });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        const success = killTaskById(root, taskId!);
        const enriched = enrichResponse('kill', { taskId, success, killedCount: success ? 1 : 0 });
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
