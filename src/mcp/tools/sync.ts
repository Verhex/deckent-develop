import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE } from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';

export function registerSyncTool(server: McpServer): void {
  server.registerTool(
    'deckent_sync',
    {
      title: 'Sync Deckent',
      description: 'Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference. Additive — never overwrites existing content.',
    },
    async () => {
      const root = process.cwd();

      if (!existsSync(join(root, DECKENT_FILE))) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'DECKENT.md not found. Run deckent init first.' }) }],
          isError: true,
        };
      }

      const synced: string[] = [];
      ensureDeckentImport(join(root, CLAUDE_FILE));
      synced.push(CLAUDE_FILE);

      ensureDeckentImport(join(root, AGENTS_FILE));
      synced.push(AGENTS_FILE);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: true, synced }) }],
      };
    },
  );
}
