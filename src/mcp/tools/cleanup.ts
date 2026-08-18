import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR, LOCKS_DIR, BRAIN_DIR, MEMORY_DB_FILE, PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { getNextSprintId } from '../../core/utils.js';
import { MemoryStore } from '../../core/memory-store.js';
import { runDecay } from '../../orchestra/brain.js';
import { enrichResponse } from '../helpers/enrich.js';
import { mcpToolDescription } from './description-catalog.js';

/** DB-first memory entry count — replaces legacy countBrainLines. */
function getMemoryEntryCount(projectRoot: string): number {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return 0;
  try {
    const store = new MemoryStore(dbPath);
    try { return store.totalCount(); }
    finally { store.close(); }
  } catch { return 0; }
}

const TASK_EXTENSIONS = /\.(json|plan|hb|result|paused|log)$/;

function listCleanableFiles(root: string): string[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  return readdirSync(tasksDir).filter((f) =>
    TASK_EXTENSIONS.test(f) || f.startsWith('.prompt-') || (f.startsWith('.worker-') && f.endsWith('.sh')),
  );
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
  const files = readdirSync(tasksDir).filter((f) =>
    TASK_EXTENSIONS.test(f) || f.startsWith('.prompt-') || (f.startsWith('.worker-') && f.endsWith('.sh')),
  );
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
      description: mcpToolDescription('deckent_cleanup'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        decay: z.boolean().optional().default(false).describe('Also run memory decay on .brain/ files if they exceed the configured line budget (default: 900 lines). Trims old sprint logs and compresses MEMORY.md.'),
        dryRun: z.boolean().optional().default(false).describe('Preview mode: show what would be deleted (file counts, brain line count, decay decision) without actually deleting anything. Recommended before first cleanup.'),
      }),
    },
    async ({ decay, dryRun }) => {
      const root = process.cwd();

      // Read memory config from project config (sync)
      let memoryBudget = 900;
      let decayAfterSprints = 8;
      try {
        const cfgPath = join(root, PROJECT_CONFIG_PATH);
        if (existsSync(cfgPath)) {
          const rawCfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { memory_budget?: number; decay_after_sprints?: number };
          if (typeof rawCfg.memory_budget === 'number') memoryBudget = rawCfg.memory_budget;
          if (typeof rawCfg.decay_after_sprints === 'number') decayAfterSprints = rawCfg.decay_after_sprints;
        }
      } catch { /* use defaults */ }

      try {
        if (dryRun) {
          const taskFiles = listCleanableFiles(root);
          const locksDir = join(root, LOCKS_DIR);
          const lockFiles = existsSync(locksDir)
            ? readdirSync(locksDir).filter((f) => f.endsWith('.lock'))
            : [];
          const brainLines = getMemoryEntryCount(root);
          const wouldDecay = decay && brainLines > memoryBudget;

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
          decayResult = runDecay(root, currentSprintId, { memoryBudget, decaySprints: decayAfterSprints });
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
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
