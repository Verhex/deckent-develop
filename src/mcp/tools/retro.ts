import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, RETRO_FILE, ARCHIVE_DIR } from '../../core/constants.js';
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

export function registerRetroTool(server: McpServer): void {
  server.registerTool(
    'deckent_retro',
    {
      title: 'Sprint Retrospective',
      description: 'Read the latest sprint retrospective from .brain/RETRO.md. Returns: full retrospective content (sprint ID, task outcomes, GO/NO_GO decisions, learnings, agent performance notes), plus up to 5 extracted highlights (bullet points). Use after a sprint completes to understand what went well, what failed, and what tech debt was created. The retro is overwritten after each sprint — use deckent_history for older sprints.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        sprintId: z.string().optional().describe('Read a specific sprint retrospective by sprint ID (e.g. "sprint-083"). Looks in .brain/archive/ for archived retros. If omitted, returns the current .brain/RETRO.md.'),
      }),
    },
    async ({ sprintId }) => {
      const root = process.cwd();
      const retroPath = join(root, BRAIN_DIR, RETRO_FILE);

      try {
      // When sprintId is provided, look for archived retro first
      if (sprintId) {
        const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR);
        let archivedPath: string | null = null;

        if (existsSync(archiveDir)) {
          // Try both naming patterns: retro-sprint-NNN.md and retro-sprint-NNN.md
          const normalizedId = sprintId.startsWith('sprint-') ? sprintId : `sprint-${sprintId}`;
          const candidates = [
            join(archiveDir, `retro-${normalizedId}.md`),
            join(archiveDir, `retro-sprint-${sprintId}.md`),
          ];
          for (const candidate of candidates) {
            if (existsSync(candidate)) {
              archivedPath = candidate;
              break;
            }
          }
          // Fallback: scan archive dir for any file matching the sprintId
          if (!archivedPath) {
            const files = readdirSync(archiveDir).filter((f) => f.includes(sprintId));
            if (files.length > 0 && files[0]) {
              archivedPath = join(archiveDir, files[0]);
            }
          }
        }

        if (!archivedPath) {
          const noRetroData = { content: null, sprintId, message: `No archived retro found for sprint: ${sprintId}` };
          const summary = formatRetroResponse(noRetroData as RetroData);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('retro', noRetroData), summary)) }],
          };
        }

        const content = readFileSync(archivedPath, 'utf-8');
        const highlights = content ? extractHighlights(content) : [];
        const retroData = { content: content || null, sprintId, highlights, archived: true };
        const enriched = enrichResponse('retro', retroData);
        const summary = formatRetroResponse(retroData as RetroData);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enriched, summary)) }],
        };
      }

      if (!existsSync(retroPath)) {
        const noRetroData = { content: null };
        const summary = formatRetroResponse(noRetroData as RetroData);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(wrapResponse(enrichResponse('retro', noRetroData), summary)) }],
        };
      }

      const content = readFileSync(retroPath, 'utf-8');
      const highlights = content ? extractHighlights(content) : [];
      const retroData = { content: content || null, highlights };
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
