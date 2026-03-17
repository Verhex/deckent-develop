import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, RETRO_FILE } from '../../core/constants.js';

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
          content: [{ type: 'text' as const, text: JSON.stringify({ content: null }) }],
        };
      }

      const content = readFileSync(retroPath, 'utf-8');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ content: content || null }) }],
      };
    },
  );
}
