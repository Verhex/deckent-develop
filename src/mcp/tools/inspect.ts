// ═══ deckent_inspect — MCP twin of the `deckent inspect` CLI face ═══════════
//
// RUN-INSPECTOR-001 package 3: surface parity by construction. This tool serves
// the EXACT projections the CLI `--json` face serves — both consume ONLY
// src/core/run-inspector-read-model.ts, so lifecycle can never be re-inferred
// on this surface (the module delegates it to the run-status authority).
// Read-only by construction: no runtime state is written.

import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  listRunInspectorRuns,
  readRunInspectorTaskDetail,
  SPRINT_TASK_ID_RE,
} from '../../core/run-inspector-read-model.js';
import { mcpToolDescription } from './description-catalog.js';

export function registerInspectTool(server: McpServer): void {
  server.registerTool(
    'deckent_inspect',
    {
      title: 'Run Inspector',
      description: mcpToolDescription('deckent_inspect'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        taskId: z.string().optional().describe('Task id for the drill-down view (e.g. "541-001"). Omit for the run listing.'),
      }),
    },
    async ({ taskId }) => {
      try {
        const root = process.cwd();
        if (taskId === undefined) {
          const listing = listRunInspectorRuns(root);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(listing) }],
          };
        }
        if (!SPRINT_TASK_ID_RE.test(taskId)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: true, code: 'INSPECT_INVALID_TASK_ID', taskId }),
            }],
            isError: true,
          };
        }
        const detail = readRunInspectorTaskDetail(root, taskId);
        if (detail === null) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: true, code: 'INSPECT_TASK_NOT_FOUND', taskId }),
            }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ taskId, ...detail }) }],
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
