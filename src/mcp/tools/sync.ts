import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE } from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { enrichResponse } from '../helpers/enrich.js';

export function registerSyncTool(server: McpServer): void {
  server.registerTool(
    'deckent_sync',
    {
      title: 'Sync Deckent',
      description: 'Sync AI adapter files (CLAUDE.md, AGENTS.md) to ensure they import DECKENT.md as the single source of truth. Additive only — prepends the @DECKENT.md reference if missing, never overwrites existing content. Use when CLAUDE.md or AGENTS.md loses its Deckent reference (e.g. after a manual edit or merge conflict). Requires DECKENT.md to exist (run deckent_init first).',
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
