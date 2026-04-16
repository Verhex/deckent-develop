import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { MemoryStore } from '../../core/memory-store.js';

export function registerMemoryResource(server: McpServer): void {
  server.registerResource(
    'memory',
    'deckent://memory',
    {
      title: 'Brain Memory',
      description: 'Learned patterns from previous sprints',
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const root = process.cwd();

      // DB-first (only path)
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(dbPath)) {
        try {
          const store = new MemoryStore(dbPath);
          try {
            const entries = store.getByType('memory');
            const text = entries.map(e => `## ${e.title}\n${e.content}`).join('\n\n');
            return { contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }] };
          } finally { store.close(); }
        } catch { /* DB error — return empty */ }
      }

      // No DB available — return empty
      return { contents: [{ uri: uri.href, text: '', mimeType: 'text/markdown' }] };
    },
  );
}
