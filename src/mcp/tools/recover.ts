import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { cleanOrphanIpcDirs } from '../../core/orphan-cleaner.js';
import { clearStaleLocks } from '../../core/file-lock.js';
import { postFinalizeCleanup } from '../../core/orphan-cleaner.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { TASKS_DIR, LOCKS_DIR } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';

const STALE_LOCK_AGE_MS = 5 * 60 * 1000;

export function registerRecoverTool(server: McpServer): void {
  server.registerTool(
    'deckent_recover',
    {
      title: 'Sprint Recovery',
      description: 'Recover from a crashed or stuck sprint. Runs audit, cleans orphan IPC directories (dead PIDs only), clears stale locks (>5min), and archives terminal task files. Active tasks are preserved. Use dryRun=true to preview before executing. DESTRUCTIVE: modifies .tasks/, .locks/, and .deckent/ directories.',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        sprintId: z.string().describe('Sprint ID to recover (e.g. "sprint-150")'),
        dryRun: z.boolean().optional().default(false).describe('Preview mode: show what would be cleaned without making changes'),
        skipAudit: z.boolean().optional().default(false).describe('Skip the self-audit gate step'),
      }),
    },
    async ({ sprintId, dryRun, skipAudit }) => {
      const root = process.cwd();

      try {
        // Step 1: Optional audit
        let auditGate: 'PASS' | 'GATE_FAILURE' | 'SKIPPED' = 'SKIPPED';
        if (!skipAudit) {
          try {
            const auditResult = await runSelfAuditGate(sprintId, root);
            auditGate = auditResult.overallGate;
          } catch {
            auditGate = 'SKIPPED';
          }
        }

        if (dryRun) {
          // Preview only
          const deckentDir = join(root, '.deckent');
          const ipcPattern = /^sprint-\d+-ipc$/;
          const orphanIpcCount = existsSync(deckentDir)
            ? readdirSync(deckentDir).filter(e => ipcPattern.test(e)).length
            : 0;

          let staleLockCount = 0;
          const locksDir = join(root, LOCKS_DIR);
          if (existsSync(locksDir)) {
            const now = Date.now();
            for (const f of readdirSync(locksDir).filter(f => f.endsWith('.lock'))) {
              try {
                const st = statSync(join(locksDir, f));
                if (now - st.mtimeMs > STALE_LOCK_AGE_MS) staleLockCount++;
              } catch { /* skip */ }
            }
          }

          let taskFileCount = 0;
          const tasksDir = join(root, TASKS_DIR);
          if (existsSync(tasksDir)) {
            taskFileCount = readdirSync(tasksDir).filter(
              f => f.endsWith('.json') || f.endsWith('.result') || f.endsWith('.hb'),
            ).length;
          }

          const enriched = enrichResponse('recover', {
            dryRun: true,
            sprintId,
            auditGate,
            orphanIpcDirs: orphanIpcCount,
            staleLocks: staleLockCount,
            taskFiles: taskFileCount,
          });

          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        // Step 2: Clean orphan IPC directories
        let orphanIpcDirs: string[] = [];
        try {
          orphanIpcDirs = cleanOrphanIpcDirs(root, { checkLivePid: true });
        } catch { /* best-effort */ }

        // Step 3: Clear stale locks
        let staleLocksCleaned = 0;
        try {
          staleLocksCleaned = clearStaleLocks(root, STALE_LOCK_AGE_MS);
        } catch { /* best-effort */ }

        // Step 4: Archive terminal task files
        let taskFilesArchived = 0;
        let taskFilesPreserved = 0;
        try {
          const cleanupResult = postFinalizeCleanup(root, sprintId);
          taskFilesArchived = cleanupResult.archivedFiles.length;
          taskFilesPreserved = cleanupResult.preservedFiles.length;
        } catch { /* best-effort */ }

        const enriched = enrichResponse('recover', {
          success: true,
          sprintId,
          auditGate,
          orphanIpcDirsRemoved: orphanIpcDirs.length,
          staleLocksCleaned,
          taskFilesArchived,
          taskFilesPreserved,
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
