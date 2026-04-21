import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerAuditTool(server: McpServer): void {
  server.registerTool(
    'deckent_audit',
    {
      title: 'Sprint Audit',
      description: 'Run Brain Self-Audit Gate for a sprint. Checks tsc, vitest, honesty violations, and observability. Returns gate result (PASS or GATE_FAILURE) and writes to .deckent/<sprint-id>-gate.json. Read-only: does not modify source code or sprint state.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().describe('Sprint ID to audit (e.g. "sprint-150")'),
      }),
    },
    async ({ sprintId }) => {
      const root = process.cwd();

      try {
        const result = await runSelfAuditGate(sprintId, root);

        // Write gate result
        const deckentDir = join(root, '.deckent');
        if (!existsSync(deckentDir)) mkdirSync(deckentDir, { recursive: true });
        const gatePath = join(deckentDir, `${sprintId}-gate.json`);
        writeFileSync(gatePath, JSON.stringify(result, null, 2) + '\n', 'utf-8');

        const enriched = enrichResponse('audit', {
          sprintId,
          overallGate: result.overallGate,
          tsc: result.tsc.status,
          tscErrors: result.tsc.errors.length,
          vitest: result.vitest.status,
          vitestDelta: result.vitest.delta,
          honestyViolations: result.honesty.violations,
          flaggedTasks: result.honesty.flaggedTasks,
          observability: result.observability.metricsJsonlExists ? 'OK' : 'WARNING',
          metricsLineCount: result.observability.lineCount,
          gatePath,
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
