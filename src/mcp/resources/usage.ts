import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_DIR } from '../../core/constants.js';

export function registerUsageResource(server: McpServer): void {
  server.registerResource(
    'usage',
    'deckent://usage',
    {
      title: 'Sprint Usage',
      description: 'Current sprint token/cost usage (.deckent/usage/sprint-NNN.json)',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const usageDir = join(root, DECKENT_DIR, 'usage');
      const configPath = join(root, DECKENT_DIR, 'config.json');

      let sprintId: string | undefined;
      if (existsSync(configPath)) {
        try {
          const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
          sprintId = typeof cfg['last_sprint_id'] === 'string' ? cfg['last_sprint_id'] : undefined;
        } catch { /* ignore */ }
      }

      if (!sprintId) {
        const text = JSON.stringify({ error: 'No active sprint found' });
        return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
      }

      const usagePath = join(usageDir, `${sprintId}.json`);
      if (!existsSync(usagePath)) {
        const text = JSON.stringify({ sprintId, entries: [] });
        return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
      }

      try {
        const entries = JSON.parse(readFileSync(usagePath, 'utf-8')) as unknown[];
        const text = JSON.stringify({ sprintId, entries });
        return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
      } catch {
        const text = JSON.stringify({ error: 'Cannot parse usage file', sprintId });
        return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
      }
    },
  );
}
