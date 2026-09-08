import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  runSprintRecoveryOperation,
  SprintRecoveryOperationError,
} from '../../orchestra/sprint-recovery-operation.js';
import { enrichResponse } from '../helpers/enrich.js';
import { mcpToolDescription, mcpFieldDescription } from './description-catalog.js';

export function registerRecoverTool(server: McpServer): void {
  server.registerTool(
    'deckent_recover',
    {
      title: 'Sprint Recovery',
      description: mcpToolDescription('deckent_recover'),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      inputSchema: z.object({
        sprintId: z.string().describe(mcpFieldDescription('deckent_recover', 'sprintId')),
        dryRun: z.boolean().optional().default(true).describe(mcpFieldDescription('deckent_recover', 'dryRun')),
        skipAudit: z.boolean().optional().default(false).describe(mcpFieldDescription('deckent_recover', 'skipAudit')),
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
        }).optional().describe(mcpFieldDescription('deckent_recover', 'approval')),
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
