// ═══ deckent_feature_query — MCP Feature Query Tool ══════════════════════
// Sprint 150 Task 029 — Feature Manifest Canlılaştırma
// ADR-022-V2: CLI/MCP parity with `deckent features` CLI command

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DECKENT_DIR } from '../../core/constants.js';

interface FeatureEntry {
  id: string;
  label: string;
  files: string[];
  description: string;
  [key: string]: unknown;
}

interface FeaturesManifest {
  _meta: {
    version: string;
    generatedAt: string;
    sprintId: string;
    [key: string]: unknown;
  };
  active: FeatureEntry[];
  lightly_used: FeatureEntry[];
  dormant: FeatureEntry[];
  dead: FeatureEntry[];
}

function readManifest(root: string): FeaturesManifest | null {
  const manifestPath = join(root, DECKENT_DIR, 'features-manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as FeaturesManifest;
  } catch {
    return null;
  }
}

export function registerFeatureQueryTool(server: McpServer): void {
  server.registerTool(
    'deckent_feature_query',
    {
      title: 'Feature Query',
      description:
        'Query the Deckent feature manifest — list features by category (active, lightly_used, dormant, dead, all) ' +
        'or look up a specific feature by ID. Returns feature metadata including files, description, and category. ' +
        'Reads from .deckent/features-manifest.json. Run `node scripts/sync-manifest.mjs` to regenerate.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        category: z.string().optional().describe('Filter by category: active, lightly_used, dormant, dead, all (default: all)'),
        id: z.string().optional().describe('Look up a specific feature by ID'),
      }),
    },
    async ({ category: inputCategory, id: inputId }) => {
      const root = process.cwd();

      try {
        const manifest = readManifest(root);
        if (!manifest) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: true, message: 'features-manifest.json not found. Run `node scripts/sync-manifest.mjs` to generate.' }),
            }],
            isError: true,
          };
        }

        // Single feature lookup
        if (inputId) {
          const all = [
            ...manifest.active.map(e => ({ ...e, category: 'active' })),
            ...manifest.lightly_used.map(e => ({ ...e, category: 'lightly_used' })),
            ...manifest.dormant.map(e => ({ ...e, category: 'dormant' })),
            ...manifest.dead.map(e => ({ ...e, category: 'dead' })),
          ];
          const feature = all.find(e => e.id === inputId);
          if (!feature) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ error: true, message: `Feature "${inputId}" not found.` }),
              }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(feature) }],
          };
        }

        // Category filter
        const category = inputCategory ?? 'all';
        const validCategories = ['active', 'lightly_used', 'dormant', 'dead', 'all'];
        if (!validCategories.includes(category)) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: true, message: `Invalid category "${category}". Valid: ${validCategories.join(', ')}` }),
            }],
            isError: true,
          };
        }

        let features: Array<FeatureEntry & { category: string }>;
        if (category === 'all') {
          features = [
            ...manifest.active.map(e => ({ ...e, category: 'active' })),
            ...manifest.lightly_used.map(e => ({ ...e, category: 'lightly_used' })),
            ...manifest.dormant.map(e => ({ ...e, category: 'dormant' })),
            ...manifest.dead.map(e => ({ ...e, category: 'dead' })),
          ];
        } else {
          const entries = manifest[category as keyof Omit<FeaturesManifest, '_meta'>] as FeatureEntry[];
          features = entries.map(e => ({ ...e, category }));
        }

        const response = {
          manifest_version: manifest._meta.version,
          sprint: manifest._meta.sprintId,
          category,
          count: features.length,
          features,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: true, message }) }],
          isError: true,
        };
      }
    },
  );
}
