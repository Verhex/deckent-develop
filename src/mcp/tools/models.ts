// ─── deckent_models MCP Tool (Sprint 190 W-F F-9/F-10) ─────────────────────
// ADR-022-v2: CLI/MCP feature parity with `deckent models` CLI command
// ReadOnly: yes — catalog fetch is a read-only operation

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  loadCatalog,
  type CatalogLoadOptions,
} from '../../core/model-catalog.js';
import type { ModelDefinition } from '../../core/model-registry.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function findModel(models: ModelDefinition[], modelId: string): ModelDefinition | undefined {
  return models.find((m) => m.id === modelId || m.apiId === modelId);
}

// ─── registerModelsTool ────────────────────────────────────────────────────

export function registerModelsTool(server: McpServer): void {
  server.registerTool(
    'deckent_models',
    {
      title: 'Model Catalog',
      description:
        'Browse and manage the Deckent model catalog. ' +
        'Actions: ' +
        '"list" — list all available models (optionally filtered by provider); ' +
        '"refresh" — force-refresh the catalog from models.dev and invalidate the 24h cache; ' +
        '"tier" — look up the tier (premium_plus/premium/standard/economy) of a specific model. ' +
        'Catalog sources: remote (models.dev live), cache (~/.deckent/cache/models-catalog.json 24h TTL), bundled (offline fallback). ' +
        'ADR-022-v2: CLI/MCP parity with `deckent models` CLI command.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        action: z
          .enum(['list', 'refresh', 'tier'])
          .describe('Action to perform: list | refresh | tier'),
        provider: z
          .string()
          .optional()
          .describe('Provider filter for "list" action (claude, codex, gemini, ollama)'),
        model: z
          .string()
          .optional()
          .describe('Model ID or API ID for "tier" action'),
        offline: z
          .boolean()
          .optional()
          .describe('Use cached/bundled catalog without network (default: false)'),
      }),
    },
    async ({ action, provider, model, offline }) => {
      const loaderOpts: CatalogLoadOptions = { offline: offline ?? false };

      try {
        if (action === 'refresh') {
          const result = await loadCatalog({ ...loaderOpts, forceRefresh: true });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  action: 'refresh',
                  source: result.source,
                  modelCount: result.models.length,
                  fetchedAt: result.fetchedAt,
                  warnings: result.warnings,
                }),
              },
            ],
          };
        }

        const result = await loadCatalog(loaderOpts);

        if (action === 'tier') {
          if (!model) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: true,
                    message: 'The "tier" action requires a "model" parameter.',
                  }),
                },
              ],
              isError: true,
            };
          }

          const found = findModel(result.models, model);
          if (!found) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    error: true,
                    message: `Model not found: ${model}. Use the "list" action to see available models.`,
                  }),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  action: 'tier',
                  id: found.id,
                  apiId: found.apiId,
                  provider: found.provider,
                  tier: found.tier,
                  status: found.status,
                  contextWindow: found.contextWindow,
                  costPerMillion: found.costPerMillion,
                  capabilities: found.capabilities,
                  source: result.source,
                }),
              },
            ],
          };
        }

        // action === 'list'
        let models = result.models;
        if (provider) {
          const providerFilter = provider.toLowerCase().trim();
          models = models.filter((m) => (m.provider as string) === providerFilter);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                action: 'list',
                source: result.source,
                fetchedAt: result.fetchedAt,
                ageMs: result.ageMs,
                modelCount: models.length,
                provider: provider ?? 'all',
                models: models.map((m) => ({
                  id: m.id,
                  apiId: m.apiId,
                  provider: m.provider,
                  tier: m.tier,
                  status: m.status,
                  contextWindow: m.contextWindow,
                  costPerMillion: m.costPerMillion,
                  capabilities: m.capabilities,
                })),
                warnings: result.warnings,
              }),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: true, message: msg }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
