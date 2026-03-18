import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, DEBT_FILE } from '../../core/constants.js';
import type { DebtItem } from '../../core/types.js';
import { parseDebtTable } from '../../core/utils.js';

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
