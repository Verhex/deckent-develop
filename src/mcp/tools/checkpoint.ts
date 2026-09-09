import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { enrichResponse } from '../helpers/enrich.js';
import { getMessage } from '../../cli/helpers/messages.js';
import { mcpToolDescription, mcpFieldDescription, getMcpToolDescriptionLanguage } from './description-catalog.js';

interface CheckpointFile {
  phase: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

function getCheckpointsDir(root: string): string {
  return join(root, '.deckent', 'checkpoints');
}

function listCheckpoints(root: string): Array<{ sprintId: string; phase: string; status: string; summary: string; createdAt: string }> {
  const dir = getCheckpointsDir(root);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((file) => file.startsWith('checkpoint-') && file.endsWith('.json'));
  const results: Array<{ sprintId: string; phase: string; status: string; summary: string; createdAt: string }> = [];

  for (const file of files) {
    try {
      const checkpoint = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as CheckpointFile;
      const match = file.match(/^checkpoint-(.+)-(\w+)\.json$/);
      if (match && match[1] && match[2]) {
        results.push({
          sprintId: match[1],
          phase: match[2],
          status: checkpoint.status,
          summary: checkpoint.summary,
          createdAt: checkpoint.createdAt,
        });
      }
    } catch {
      // Skip malformed files
    }
  }

  return results;
}

function decisionSurfaceRefusal(
  action: 'approve' | 'reject',
  sprintId: string | undefined,
  phase: string | undefined,
  lang: string,
) {
  const commandParts = ['deckent', 'checkpoint', action];
  if (sprintId) commandParts.push(sprintId);
  if (phase) commandParts.push(phase);
  const payload = {
    error: true,
    reasonCode: 'NOT_A_DECISION_SURFACE' as const,
    action,
    ...(sprintId !== undefined ? { sprintId } : {}),
    ...(phase !== undefined ? { phase } : {}),
    decideCommand: getMessage('approvals.federated.hint_checkpoint', lang),
    message: getMessage('mcp.checkpoint.not_a_decision_surface', lang, { command: commandParts.join(' ') }),
  };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: true as const,
  };
}

export function registerCheckpointTool(server: McpServer): void {
  server.registerTool(
    'deckent_checkpoint',
    {
      title: 'Checkpoint Management',
      description: mcpToolDescription('deckent_checkpoint'),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        action: z.enum(['list', 'approve', 'reject']).describe(mcpFieldDescription('deckent_checkpoint', 'action')),
        sprintId: z.string().optional().describe(mcpFieldDescription('deckent_checkpoint', 'sprintId')),
        phase: z.string().optional().describe(mcpFieldDescription('deckent_checkpoint', 'phase')),
        root: z.string().optional().describe(mcpFieldDescription('deckent_checkpoint', 'root')),
      }),
    },
    async ({ action, sprintId, phase, root: rootArg }) => {
      const root = rootArg ?? process.cwd();
      const lang = getMcpToolDescriptionLanguage();

      try {
        if (action === 'list') {
          const checkpoints = listCheckpoints(root);
          const enriched = enrichResponse('checkpoint', {
            action: 'list',
            checkpoints,
            total: checkpoints.length,
            pending: checkpoints.filter((checkpoint) => checkpoint.status === 'pending').length,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        return decisionSurfaceRefusal(action, sprintId, phase, lang);
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
