import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { enrichResponse } from '../helpers/enrich.js';
import { validateSprintId, validatePhase, validatePath } from '../../core/validators.js';

// ─── Types ──────────────────────────────────────────────────────────

interface CheckpointFile {
  phase: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function getCheckpointsDir(root: string): string {
  return join(root, '.deckent', 'checkpoints');
}

function listCheckpoints(root: string): Array<{ sprintId: string; phase: string; status: string; summary: string; createdAt: string }> {
  const dir = getCheckpointsDir(root);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
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

function updateCheckpointStatus(root: string, sprintId: string, phase: string, status: 'approved' | 'rejected'): { success: boolean; message: string } {
  validateSprintId(sprintId);
  validatePhase(phase);
  const dir = getCheckpointsDir(root);
  const filePath = join(dir, `checkpoint-${sprintId}-${phase}.json`);
  validatePath(dir, `checkpoint-${sprintId}-${phase}.json`);

  if (!existsSync(filePath)) {
    return { success: false, message: `Checkpoint not found: ${sprintId}/${phase}` };
  }

  try {
    const checkpoint = JSON.parse(readFileSync(filePath, 'utf-8')) as CheckpointFile;
    if (checkpoint.status !== 'pending') {
      return { success: false, message: `Checkpoint already ${checkpoint.status}: ${sprintId}/${phase}` };
    }
    checkpoint.status = status;
    writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    return { success: true, message: `Checkpoint ${sprintId}/${phase} ${status}.` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Registration ───────────────────────────────────────────────────

export function registerCheckpointTool(server: McpServer): void {
  server.registerTool(
    'deckent_checkpoint',
    {
      title: 'Checkpoint Management',
      description: 'List, approve, or reject human checkpoints in sprint lifecycle. Checkpoints pause sprint execution at configured phases (plan/evaluate/fix) until a human approves or rejects. Use action=list to see pending checkpoints, action=approve/reject with sprintId and phase to respond.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['list', 'approve', 'reject']).describe('Action to perform: list all checkpoints, approve a pending checkpoint, or reject a pending checkpoint.'),
        sprintId: z.string().optional().describe('Sprint ID (e.g. "sprint-089"). Required for approve/reject actions.'),
        phase: z.string().optional().describe('Phase name (e.g. "plan", "evaluate", "fix"). Required for approve/reject actions.'),
        root: z.string().optional().describe('Project root directory. Defaults to current working directory.'),
      }),
    },
    async ({ action, sprintId, phase, root: rootArg }) => {
      const root = rootArg ?? process.cwd();

      try {
        if (action === 'list') {
          const checkpoints = listCheckpoints(root);
          const enriched = enrichResponse('checkpoint', {
            action: 'list',
            checkpoints,
            total: checkpoints.length,
            pending: checkpoints.filter(c => c.status === 'pending').length,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
          };
        }

        if (!sprintId || !phase) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'sprintId and phase are required for approve/reject actions.' }) }],
            isError: true,
          };
        }

        validateSprintId(sprintId);
        validatePhase(phase);

        const status = action === 'approve' ? 'approved' as const : 'rejected' as const;
        const result = updateCheckpointStatus(root, sprintId, phase, status);

        if (!result.success) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: result.message }) }],
            isError: true,
          };
        }

        const enriched = enrichResponse('checkpoint', {
          action,
          sprintId,
          phase,
          status,
          message: result.message,
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
