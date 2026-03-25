import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, RETRO_FILE } from '../../core/constants.js';

export function registerRetroResource(server: McpServer): void {
  server.registerResource(
    'retro',
    'deckent://retro',
    {
      title: 'Sprint Retrospective',
      description: 'Latest sprint retrospective (.brain/RETRO.md)',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const root = process.cwd();
      const filePath = join(root, BRAIN_DIR, RETRO_FILE);

      const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

      return {
        contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }],
      };
    },
  );
}
