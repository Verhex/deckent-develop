import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE } from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { enrichResponse } from '../helpers/enrich.js';
import { mcpToolDescription } from './description-catalog.js';

export function registerSyncTool(server: McpServer): void {
  server.registerTool(
    'deckent_sync',
    {
      title: 'Sync Deckent',
      description: mcpToolDescription('deckent_sync'),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      const root = process.cwd();

      if (!existsSync(join(root, DECKENT_FILE))) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, success: false, message: 'DECKENT.md not found. Run deckent init first.' }) }],
          isError: true,
        };
      }

      try {
        const synced: string[] = [];
        ensureDeckentImport(join(root, CLAUDE_FILE));
        synced.push(CLAUDE_FILE);

        ensureDeckentImport(join(root, AGENTS_FILE));
        synced.push(AGENTS_FILE);

        const changeCount = synced.length;
        const enriched = enrichResponse('sync', { success: true, synced, changeCount });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(enriched) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Sync failed: ${message}` }) }],
          isError: true,
        };
      }
    },
  );
}
