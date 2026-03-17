import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DIRECTIVES_FILE } from '../../core/constants.js';

export function registerSetDirectivesTool(server: McpServer): void {
  server.registerTool(
    'deckent_set_directives',
    {
      title: 'Set Directives',
      description: 'Write DIRECTIVES.md content. Claude should format natural language goals into "## Görev N:" or "## Task N:" blocks that the brain engine can parse.',
      inputSchema: z.object({
        content: z.string().describe('Formatted DIRECTIVES.md content with ## Görev/Task N: blocks'),
      }),
    },
    async ({ content }) => {
      const root = process.cwd();
      writeFileSync(join(root, DIRECTIVES_FILE), content, 'utf-8');

      // Count tasks by matching ## Görev or ## Task headers
      const taskCount = (content.match(/^##\s+(Görev|Task)\s+\d+/gm) ?? []).length;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, taskCount }),
        }],
      };
    },
  );
}
