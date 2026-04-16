import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, RETRO_FILE, MEMORY_DB_FILE } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';

export function registerRetroResource(server: McpServer): void {
  server.registerResource(
    'retro',
    'deckent://retro',
    {
      title: 'Sprint Retrospective',
      description: 'Latest sprint retrospective',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const root = process.cwd();

      // DB-first
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(dbPath)) {
        try {
          const store = new MemoryStore(dbPath);
          try {
            const entries = store.getByType('retro');
            const text = entries.length > 0 ? entries[0]!.content : '';
            return { contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }] };
          } finally { store.close(); }
        } catch { /* fall through to V1 */ }
      }

      // V1 fallback
      const filePath = join(root, BRAIN_DIR, RETRO_FILE);
      const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
      return { contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }] };
    },
  );
}
