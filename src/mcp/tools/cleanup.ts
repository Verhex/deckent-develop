import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR, LOCKS_DIR, BRAIN_TOTAL_LINE_BUDGET } from '../../core/constants.js';
import { countBrainLines, getNextSprintId } from '../../core/utils.js';
import { runDecay } from '../../orchestra/brain.js';
import { enrichResponse } from '../helpers/enrich.js';

const TASK_EXTENSIONS = /\.(json|plan|hb|result|paused|log)$/;

function listCleanableFiles(root: string): string[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir).filter((f) => TASK_EXTENSIONS.test(f));
}

function cleanLocks(root: string): string[] {
  const locksDir = join(root, LOCKS_DIR);
  if (!existsSync(locksDir)) return [];
  const files = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
  for (const f of files) {
    try { unlinkSync(join(locksDir, f)); } catch { /* ignore */ }
  }
  return files;
}

function cleanTasks(root: string): string[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const files = readdirSync(tasksDir).filter((f) => TASK_EXTENSIONS.test(f));
  for (const f of files) {
    try { unlinkSync(join(tasksDir, f)); } catch { /* ignore */ }
  }
  return files;
}

export function registerCleanupTool(server: McpServer): void {
  server.registerTool(
    'deckent_cleanup',
    {
      title: 'Sprint Cleanup',
      description: 'Clean up sprint artifacts: task files, locks, and optionally run memory decay.',
      inputSchema: z.object({
        decay: z.boolean().optional().default(false).describe('Also run memory decay on .brain/ files'),
        dryRun: z.boolean().optional().default(false).describe('Preview what would be deleted without actually deleting'),
      }),
    },
    async ({ decay, dryRun }) => {
      const root = process.cwd();

      try {
        if (dryRun) {
          const taskFiles = listCleanableFiles(root);
          const locksDir = join(root, LOCKS_DIR);
          const lockFiles = existsSync(locksDir)
            ? readdirSync(locksDir).filter((f) => f.endsWith('.lock'))
            : [];
          const brainLines = countBrainLines(root);
          const wouldDecay = decay && brainLines > BRAIN_TOTAL_LINE_BUDGET;

          const enriched = enrichResponse('cleanup', {
            dryRun: true,
            taskFiles: taskFiles.length,
            lockFiles: lockFiles.length,
            brainLines,
            wouldDecay,
          });

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        const removedTasks = cleanTasks(root);
        const removedLocks = cleanLocks(root);
        let decayResult = null;

        if (decay) {
          try {
            const nextId = getNextSprintId(root);
          const num = parseInt(nextId.replace('sprint-', ''), 10);
          const currentSprintId = `sprint-${String(Math.max(1, num - 1)).padStart(3, '0')}`;
          decayResult = runDecay(root, currentSprintId);
          } catch {
            decayResult = { error: 'Decay failed' };
          }
        }

        const enriched = enrichResponse('cleanup', {
          success: true,
          removedTasks: removedTasks.length,
          removedLocks: removedLocks.length,
          decayResult,
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
