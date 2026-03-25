import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TASKS_DIR } from '../../core/constants.js';

export function registerTasksResource(server: McpServer): void {
  server.registerResource(
    'tasks',
    'deckent://tasks',
    {
      title: 'Active Tasks',
      description: 'Active task list from .tasks/*.json',
      mimeType: 'application/json',
    },
    async (uri) => {
      const root = process.cwd();
      const tasksDir = join(root, TASKS_DIR);

      if (!existsSync(tasksDir)) {
        const text = JSON.stringify({ tasks: [] });
        return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
      }

      const tasks: unknown[] = [];
      let files: string[] = [];
      try {
        files = readdirSync(tasksDir).filter((f) => f.startsWith('task-') && f.endsWith('.json'));
      } catch { /* empty on read error */ }

      for (const file of files) {
        try {
          const content = readFileSync(join(tasksDir, file), 'utf-8');
          tasks.push(JSON.parse(content));
        } catch { /* skip malformed files */ }
      }

      const text = JSON.stringify({ tasks });
      return { contents: [{ uri: uri.href, text, mimeType: 'application/json' }] };
    },
  );
}
