import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, MEMORY_FILE } from '../../core/constants.js';

export function registerMemoryResource(server: McpServer): void {
  server.registerResource(
    'memory',
    'deckent://memory',
    {
      title: 'Brain Memory',
      description: 'Learned patterns from previous sprints (.brain/MEMORY.md)',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const root = process.cwd();
      const filePath = join(root, BRAIN_DIR, MEMORY_FILE);

      const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

      return {
        contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }],
      };
    },
  );
}
