import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';
import { enrichResponse } from '../helpers/enrich.js';
import { formatRetroResponse, wrapResponse, type RetroData } from '../helpers/format.js';

function extractHighlights(content: string): string[] {
  const highlights: string[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed.length > 2) {
      highlights.push(trimmed.slice(2));
    }
  }
  return highlights.slice(0, 5);
}

/**
 * Read a sprint retrospective from the Memory V2 DB.
 * B8: retros live in memory.db as `type='retro'` entries (id `retro-<id>`) —
 * the legacy `.brain/RETRO.md` file is no longer produced.
 */
function readRetro(root: string, sprintId?: string): { content: string | null; sprintId?: string } {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return { content: null, sprintId };

  const store = new MemoryStore(dbPath);
  try {
    if (sprintId) {
      const normalizedId = sprintId.startsWith('sprint-') ? sprintId : `sprint-${sprintId}`;
      const entry = store.getById(`retro-${normalizedId}`);
      return { content: entry?.content ?? null, sprintId: normalizedId };
    }
    const retros = store.getByType('retro')
      .sort((a, b) => (b.sprint_num ?? 0) - (a.sprint_num ?? 0));
    const latest = retros[0];
    return { content: latest?.content ?? null, sprintId: latest?.sprint_id ?? undefined };
  } finally {
    store.close();
  }
}

export function registerRetroTool(server: McpServer): void {
  server.registerTool(
    'deckent_retro',
    {
      title: 'Sprint Retrospective',
      description: 'Read a sprint retrospective from the Memory V2 DB (.brain/memory.db `retro` entries). Returns: full retrospective content (sprint ID, task outcomes, GO/NO_GO decisions, learnings, agent performance notes), plus up to 5 extracted highlights (bullet points). Use after a sprint completes to understand what went well, what failed, and what tech debt was created. Every sprint keeps its own retro entry — pass sprintId for an older one.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Read a specific sprint retrospective by sprint ID (e.g. "sprint-083"). If omitted, returns the most recent sprint retrospective.'),
      }),
    },
    async ({ sprintId }) => {
      const root = process.cwd();
      try {
        const { content, sprintId: resolvedId } = readRetro(root, sprintId);

        if (!content) {
          const noRetroData = sprintId
            ? { content: null, sprintId, message: `No retrospective found for sprint: ${sprintId}` }
            : { content: null };
          const summary = formatRetroResponse(noRetroData as RetroData);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('retro', noRetroData), summary)) }],
          };
        }

        const retroData = {
          content,
          ...(resolvedId ? { sprintId: resolvedId } : {}),
          highlights: extractHighlights(content),
        };
        const enriched = enrichResponse('retro', retroData);
        const summary = formatRetroResponse(retroData as RetroData);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enriched, summary)) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Failed to read retrospective: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
