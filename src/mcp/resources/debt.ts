import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, DEBT_FILE, DEBT_TABLE_HEADER } from '../../core/constants.js';
import type { DebtItem } from '../../core/types.js';
import { DebtPriority } from '../../core/types.js';

function parseDebtTable(content: string): DebtItem[] {
  const lines = content.split('\n').filter((l) => l.startsWith('|') && !l.startsWith(DEBT_TABLE_HEADER.slice(0, 5)) && !l.startsWith('|-'));
  return lines.map((line) => {
    const cols = line.split('|').slice(1, -1).map((c) => c.trim());
    return {
      id: cols[0] ?? '',
      description: cols[1] ?? '',
      originTaskId: cols[2] ?? '',
      originSprintId: cols[3] ?? '',
      priority: (cols[4] as DebtPriority) ?? DebtPriority.NORMAL,
      sprintsOpen: parseInt(cols[5] ?? '0', 10),
      resolved: cols[6] === 'true',
      resolvedInSprintId: cols[7] || undefined,
      createdAt: cols[8] ?? '',
    };
  }).filter((item) => item.id.length > 0);
}

export function registerDebtResource(server: McpServer): void {
  server.registerResource(
    'debt',
    'deckent://debt',
    {
      title: 'Tech Debt',
      description: 'Technical debt items tracked in .brain/DEBT.md',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const filePath = join(root, BRAIN_DIR, DEBT_FILE);

      let items: DebtItem[] = [];
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          items = parseDebtTable(content);
        } catch { /* empty array on parse error */ }
      }

      return {
        contents: [{ uri: uri.href, text: JSON.stringify(items), mimeType: 'application/json' }],
      };
    },
  );
}
