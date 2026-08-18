import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  runSprintRecoveryOperation,
  SprintRecoveryOperationError,
} from '../../orchestra/sprint-recovery-operation.js';
import { enrichResponse } from '../helpers/enrich.js';
import { mcpToolDescription } from './description-catalog.js';

export function registerRecoverTool(server: McpServer): void {
  server.registerTool(
    'deckent_recover',
    {
      title: 'Sprint Recovery',
      description: mcpToolDescription('deckent_recover'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        sprintId: z.string().describe('Sprint ID to recover (e.g. "sprint-150")'),
        dryRun: z.boolean().optional().default(true).describe('Preview mode: show what would be cleaned without making changes'),
        skipAudit: z.boolean().optional().default(false).describe('Skip the self-audit gate step'),
        approval: z.object({
          approvalRef: z.string().min(1),
          idempotencyKey: z.string().min(1),
          identity: z.object({
            executionId: z.string().min(1),
            generation: z.number().int().nonnegative(),
            taskId: z.string().min(1),
            attemptId: z.string().min(1),
            fenceToken: z.string().min(1),
          }),
        }).optional().describe('Required exact identity/generation/fence binding for mutation'),
      }),
    },
    async ({ sprintId, dryRun, skipAudit, approval }) => {
      const root = process.cwd();

      try {
        // CLI and MCP deliberately share this one application operation.
        // The MCP layer projects stable fields only; it does not classify
        // lifecycle, scan global locks, or invent its own cleanup policy.
        const report = await runSprintRecoveryOperation(
          root,
          sprintId,
          { dryRun, skipAudit, ...(approval ? { approval } : {}) },
        );

        const enriched = enrichResponse('recover', {
          success: true,
          sprintId,
          dryRun,
          identity: report.identity,
          auditGate: report.audit.overallGate,
          orphanIpcDirsRemoved: report.orphanIpcDirs.length,
          staleLocksCleaned: report.staleLocksCleaned,
          staleSpawnLocksCleaned: report.staleSpawnLocksCleaned,
          taskFilesArchived: report.taskFilesArchived,
          taskFilesPreserved: report.taskFilesPreserved,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const errorCode = err instanceof SprintRecoveryOperationError
          ? err.code
          : 'RECOVERY_INTERNAL_ERROR';
        const details = err instanceof SprintRecoveryOperationError
          ? err.details
          : {};
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: true, errorCode, details }),
          }],
          isError: true,
        };
      }
    },
  );
}
