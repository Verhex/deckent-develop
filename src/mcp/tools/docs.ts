// ─── MCP Tool: deckent_docs ───────────────────────────────────────────────
// Manage user-defined documents in sprint lifecycle.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDoc, removeDoc, loadDocsConfig } from '../../orchestra/managed-docs/docs-config.js';

export function registerDocsTool(server: McpServer): void {
  server.registerTool(
    'deckent_docs',
    {
      title: 'Managed Docs',
      description: 'Manage user-defined documents in sprint lifecycle. Actions: "add" registers a file with auto-update and protected section rules; "remove" unregisters a file; "list" shows all managed docs and their rules. Auto sections are updated by Deckent at sprint end with generated content (metrics, debt, history, etc.). Protected sections are never touched.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        action: z.enum(['add', 'remove', 'list']).describe('Action to perform'),
        file: z.string().optional().describe('File path relative to project root (required for add/remove)'),
        autoSections: z.array(z.string()).optional().describe('Section headings for auto-update (e.g., ["Sprint Metrics", "Active Debt"])'),
        protectedSections: z.array(z.string()).optional().describe('Section headings to protect (e.g., ["Vision", "Architecture"])'),
        skills: z.array(z.string()).optional().describe('Skill IDs for content generation (e.g., ["typescript-expert"])'),
        maxLines: z.number().optional().describe('Max lines for auto sections'),
        root: z.string().optional().describe('Project root (default: cwd)'),
      }),
    },
    async ({ action, file, autoSections, protectedSections, skills, maxLines, root: rootArg }) => {
      const root = rootArg ?? process.cwd();

      try {
        if (action === 'list') {
          const config = loadDocsConfig(root);
          if (!config || config.docs.length === 0) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ docs: [], message: 'No managed documents configured. Use action=add to register a file.' }) }],
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ docs: config.docs }) }],
          };
        }

        if (action === 'add') {
          if (!file) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'file is required for action=add' }) }],
              isError: true,
            };
          }
          if (!existsSync(join(root, file))) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `File not found: ${file}` }) }],
              isError: true,
            };
          }
          const id = addDoc(root, { path: file, autoSections, protectedSections, skills, maxLines });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id, path: file, autoSections, protectedSections }) }],
          };
        }

        // action === 'remove'
        if (!file) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'file is required for action=remove' }) }],
            isError: true,
          };
        }
        const removed = removeDoc(root, file);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: removed, message: removed ? `Removed: ${file}` : `Not found: ${file}` }) }],
        };
      } catch (e) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: String(e) }) }],
          isError: true,
        };
      }
    },
  );
}
