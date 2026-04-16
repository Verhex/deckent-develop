import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, DEBT_FILE, MEMORY_DB_FILE } from '../../core/constants.js';
import type { DebtItem } from '../../core/types.js';
import { parseDebtTable } from '../../core/utils.js';
import { MemoryStore } from '../../core/memory-store.js';

export function registerDebtResource(server: McpServer): void {
  server.registerResource(
    'debt',
    'deckent://debt',
    {
      title: 'Tech Debt',
      description: 'Technical debt items',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();

      // DB-first
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(dbPath)) {
        try {
          const store = new MemoryStore(dbPath);
          try {
            const entries = store.getByType('debt');
            const items: DebtItem[] = entries.map(d => {
              const meta = JSON.parse(d.metadata || '{}');
              return {
                id: d.id,
                description: d.title,
                originTaskId: meta.originTaskId ?? '',
                originSprintId: meta.originSprintId ?? d.sprint_id ?? '',
                priority: (d.priority?.toUpperCase() ?? 'NORMAL') as DebtItem['priority'],
                sprintsOpen: meta.sprintsOpen ?? 0,
                resolved: d.status === 'resolved',
                resolvedInSprintId: meta.resolvedInSprintId,
                createdAt: d.created_at,
              };
            });
            return { contents: [{ uri: uri.href, text: JSON.stringify(items), mimeType: 'application/json' }] };
          } finally { store.close(); }
        } catch { /* fall through to V1 */ }
      }

      // V1 fallback
      const filePath = join(root, BRAIN_DIR, DEBT_FILE);
      let items: DebtItem[] = [];
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          items = parseDebtTable(content);
        } catch { /* empty array on parse error */ }
      }
      return { contents: [{ uri: uri.href, text: JSON.stringify(items), mimeType: 'application/json' }] };
    },
  );
}
