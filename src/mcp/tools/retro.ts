import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, RETRO_FILE } from '../../core/constants.js';
import { enrichResponse } from '../helpers/enrich.js';

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
      description: 'Read the latest sprint retrospective from .brain/RETRO.md.',
    },
    async () => {
      const root = process.cwd();
      const retroPath = join(root, BRAIN_DIR, RETRO_FILE);

      if (!existsSync(retroPath)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enrichResponse('retro', { content: null })) }],
        };
      }

      const content = readFileSync(retroPath, 'utf-8');
      const highlights = content ? extractHighlights(content) : [];
      const enriched = enrichResponse('retro', { content: content || null, highlights });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
      };
    },
  );
}
