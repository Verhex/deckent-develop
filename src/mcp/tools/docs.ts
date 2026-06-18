// ─── MCP Tool: deckent_docs ───────────────────────────────────────────────
// Manage user-defined documents in sprint lifecycle.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { addDoc, removeDoc, loadDocsConfig, saveDocsConfig } from '../../orchestra/managed-docs/docs-config.js';
import { runManagedDocUpdates, buildStandaloneDocContext } from '../../orchestra/managed-docs/managed-doc-runner.js';
import { validatePath } from '../../core/validators.js';
import { runDocsTrackScan, runDocsTrackStatus } from '../../cli/commands/docs.js';

export function registerDocsTool(server: McpServer): void {
  server.registerTool(
    'deckent_docs',
    {
      title: 'Managed Docs',
      description: 'Manage user-defined documents in sprint lifecycle. Actions: "add" registers a file; "remove" unregisters; "list" shows all; "update" modifies section rules; "run" triggers doc updates without a sprint; "track-scan" runs a DB-only doc-tracking scan (hash + DCR + stale); "track-status" lists tracked doc health. Auto sections are updated with generated content (metrics, debt, history, etc.). Protected sections are never touched.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      inputSchema: z.object({
        action: z.enum(['add', 'remove', 'list', 'update', 'run', 'track-scan', 'track-status']).describe('Action to perform'),
        file: z.string().optional().describe('File path or doc ID (required for add/remove/update)'),
        autoSections: z.array(z.string()).optional().describe('Section headings for auto-update (e.g., ["Sprint Metrics", "Active Debt"])'),
        protectedSections: z.array(z.string()).optional().describe('Section headings to protect (e.g., ["Vision", "Architecture"])'),
        addAutoSections: z.array(z.string()).optional().describe('Add auto-update sections (for update action)'),
        removeAutoSections: z.array(z.string()).optional().describe('Remove auto-update sections (for update action)'),
        addProtectedSections: z.array(z.string()).optional().describe('Add protected sections (for update action)'),
        skills: z.array(z.string()).optional().describe('Skill IDs for content generation (e.g., ["typescript-expert"])'),
        maxLines: z.number().optional().describe('Max lines for auto sections'),
        root: z.string().optional().describe('Project root (default: cwd)'),
      }),
    },
    async ({ action, file, autoSections, protectedSections, addAutoSections, removeAutoSections, addProtectedSections, skills, maxLines, root: rootArg }) => {
      const root = rootArg ?? process.cwd();

      try {
        if (action === 'track-scan') {
          const { count, stale } = await runDocsTrackScan(root, { write: false, prune: false });
          return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, count, stale }) }] };
        }
        if (action === 'track-status') {
          const rows = runDocsTrackStatus(root, { stale: false });
          return { content: [{ type: 'text' as const, text: JSON.stringify({ docs: rows }) }] };
        }

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

        if (action === 'run') {
          const ctx = buildStandaloneDocContext(root);
          if (!ctx) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'No docs config found. Use action=add first.' }) }],
              isError: true,
            };
          }
          const results = runManagedDocUpdates(ctx);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: true, results }) }],
          };
        }

        if (action === 'update') {
          if (!file) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'file is required for action=update' }) }],
              isError: true,
            };
          }
          validatePath(root, file);
          const config = loadDocsConfig(root);
          if (!config) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'No docs config found.' }) }],
              isError: true,
            };
          }
          const entry = config.docs.find(d => d.id === file || d.path === file);
          if (!entry) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: `Not found: ${file}` }) }],
              isError: true,
            };
          }
          if (addAutoSections?.length) {
            entry.autoSections = [...new Set([...(entry.autoSections ?? []), ...addAutoSections])];
          }
          if (removeAutoSections?.length) {
            const removeSet = new Set(removeAutoSections.map(s => s.toLowerCase()));
            entry.autoSections = (entry.autoSections ?? []).filter(s => !removeSet.has(s.toLowerCase()));
          }
          if (addProtectedSections?.length) {
            entry.protectedSections = [...new Set([...(entry.protectedSections ?? []), ...addProtectedSections])];
          }
          if (maxLines !== undefined) {
            entry.maxLines = maxLines;
          }
          saveDocsConfig(root, config);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id: entry.id, updated: entry }) }],
          };
        }

        if (action === 'add') {
          if (!file) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message: 'file is required for action=add' }) }],
              isError: true,
            };
          }
          validatePath(root, file);
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
        validatePath(root, file);
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
