import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../../core/constants.js';

export function registerHistoryTool(server: McpServer): void {
  server.registerTool(
    'deckent_history',
    {
      title: 'Sprint History',
      description: 'Read sprint history logs from .brain/sprints/. Returns the last N sprint logs.',
      inputSchema: z.object({
        last: z.number().optional().default(5).describe('Number of recent sprints to return (default: 5)'),
      }),
    },
    async ({ last }) => {
      const root = process.cwd();
      const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);

      if (!existsSync(sprintsDir)) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ sprints: [] }) }],
        };
      }

      const files = readdirSync(sprintsDir)
        .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
        .sort()
        .slice(-last);

      const sprints = files.map((f) => ({
        id: f.replace('.md', ''),
        content: readFileSync(join(sprintsDir, f), 'utf-8'),
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ sprints }) }],
      };
    },
  );
}
