import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DASHBOARD_FILE } from '../../core/constants.js';

export function registerDashboardResource(server: McpServer): void {
  server.registerResource(
    'dashboard',
    'deckent://dashboard',
    {
      title: 'Sprint Dashboard',
      description: 'Live sprint status: agents, progress, usage, alerts',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const dashPath = join(root, DASHBOARD_FILE);

      let text: string;
      if (!existsSync(dashPath)) {
        text = JSON.stringify({ active: false });
      } else {
        try {
          text = readFileSync(dashPath, 'utf-8');
          JSON.parse(text); // validate JSON
        } catch {
          text = JSON.stringify({ active: false, error: 'Cannot parse dashboard' });
        }
      }

      return {
        contents: [{ uri: uri.href, text, mimeType: 'application/json' }],
      };
    },
  );
}
