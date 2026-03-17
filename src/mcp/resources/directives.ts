import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';

export function registerDirectivesResource(server: McpServer): void {
  server.registerResource(
    'directives',
    'deckent://directives',
    {
      title: 'Project Directives',
      description: 'Current DIRECTIVES.md content — sprint goals and tasks',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const root = process.cwd();
      const filePath = join(root, DIRECTIVES_FILE);

      const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

      return {
        contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }],
      };
    },
  );
}
