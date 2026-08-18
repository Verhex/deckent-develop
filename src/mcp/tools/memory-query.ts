import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { MemoryStore } from '../../core/memory-store.js';
import { searchMemory } from '../../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { mcpToolDescription } from './description-catalog.js';

export function registerMemoryQueryTool(server: McpServer): void {
  server.registerTool(
    'deckent_memory_query',
    {
      title: 'Memory Query',
      description: mcpToolDescription('deckent_memory_query'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        query: z.string().describe('Search query text'),
        type: z.array(z.string()).optional().describe('Filter by type: adr, memory, sprint, debt, pattern, retro'),
        status: z.array(z.string()).optional().describe('Filter by status: active, accepted, deprecated, resolved'),
        limit: z.number().optional().default(5).describe('Max results (default 5)'),
        sprint_min: z.number().optional().describe('Minimum sprint number'),
        mode: z.enum(['and', 'or']).optional().default('or').describe('FTS5 token join: or (default, broader recall) | and (all tokens must match)'),
        root: z.string().optional().describe('Project root path'),
      }),
    },
    async ({ query, type, status, limit, sprint_min, mode, root: rootParam }) => {
      const root = rootParam || process.cwd();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        return {
          content: [{ type: 'text' as const, text: 'Memory V2 DB not found. Run migration first.' }],
        };
      }

      const store = new MemoryStore(dbPath);
      try {
        const results = searchMemory(store, {
          text: query,
          type,
          status,
          limit,
          sprint_range: sprint_min !== undefined ? { min: sprint_min } : undefined,
          mode,
        });

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No results for "${query}".` }],
          };
        }

        const text = results.map((r, i) => {
          const sprint = r.entry.sprint_id ? ` (${r.entry.sprint_id})` : '';
          const summary = r.entry.summary ?? r.entry.content.slice(0, 200);
          return `${i + 1}. [${r.entry.type}] **${r.entry.title}**${sprint}\n   ${summary}`;
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text }] };
      } finally {
        store.close();
      }
    },
  );
}
