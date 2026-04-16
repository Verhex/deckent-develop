import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, MEMORY_FILE, MEMORY_DB_FILE } from '../../core/constants.js';
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

      // DB-first
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(dbPath)) {
        try {
          const store = new MemoryStore(dbPath);
          try {
            const entries = store.getByType('memory');
            const text = entries.map(e => `## ${e.title}\n${e.content}`).join('\n\n');
            return { contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }] };
          } finally { store.close(); }
        } catch { /* fall through to V1 */ }
      }

      // V1 fallback
      const filePath = join(root, BRAIN_DIR, MEMORY_FILE);
      const text = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
      return { contents: [{ uri: uri.href, text, mimeType: 'text/markdown' }] };
    },
  );
}
