/**
 * deckent_cost MCP tool — cost config & pricing view (CLI/MCP surface parity)
 *
 * Delegates entirely to the existing cost/usage SSOT:
 *   loadCostConfig    → budget limits + per-provider/per-model pricing
 *   listEnabledModels → enabled model list (derived from config, no extra math)
 *   readSpendWindow   → today's spend sum from resource-log
 *
 * Read-only, provider-agnostic. tenantId is reserved for future multi-tenant routing.
 * No cost arithmetic is reimplemented here — all numbers come from the SSOT.
 *
 * Sprint 332 Task 332-015
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import {
  loadCostConfig,
  listEnabledModels,
  readSpendWindow,
} from '../../core/cost-config-loader.js';
import type { CostConfig } from '../../core/cost-config-loader.js';
import { mcpToolDescription } from './description-catalog.js';

// ─── Injectable deps ──────────────────────────────────────────────────────────

export interface CostToolDeps {
  /** Override loadCostConfig for hermetic tests (avoids real .deckent/cost-config.json). */
  configFn?: (root: string) => CostConfig;
  /** Override readSpendWindow for hermetic tests (avoids real resource-log.jsonl). */
  spendFn?: (root: string, window: 'day' | 'month') => number;
}

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface CostModelEntry {
  inputPerMTok: number;
  outputPerMTok: number;
  maxInputTokens: number;
  tier?: string;
  aliases?: string[];
}

export interface CostProviderEntry {
  enabled: boolean;
  defaultBillingMode: string;
  models: Record<string, CostModelEntry>;
}

export interface CostView {
  configVersion: string;
  configLastUpdated: string | null;
  budget: {
    sprintMaxUsd: number;
    dailyMaxUsd: number;
    monthlyMaxUsd: number | null;
    autoConfirmBelowUsd: number | null;
  };
  spendTodayUsd: number;
  providers: Record<string, CostProviderEntry>;
}

// ─── Core data function (exported for tests) ─────────────────────────────────

/**
 * Build the cost view by delegating to the existing cost SSOT.
 * Synchronous: both loadCostConfig and readSpendWindow are sync.
 * Returns an honest empty providers map when no models are enabled.
 */
export function getCostView(root: string, deps: CostToolDeps = {}): CostView {
  const loadFn = deps.configFn ?? loadCostConfig;
  const spendFn = deps.spendFn ?? readSpendWindow;

  const config = loadFn(root);
  const spendTodayUsd = spendFn(root, 'day');
  const enabledModels = listEnabledModels(config);

  const providers: Record<string, CostProviderEntry> = {};

  for (const { provider, modelId, pricing } of enabledModels) {
    if (!providers[provider]) {
      const pc = config.providers[provider]!;
      providers[provider] = {
        enabled: pc.enabled,
        defaultBillingMode:
          pc.default_billing_mode ?? pc.billing_modes_supported[0] ?? 'api',
        models: {},
      };
    }

    const entry: CostModelEntry = {
      inputPerMTok: pricing.input_cost_per_token * 1_000_000,
      outputPerMTok: pricing.output_cost_per_token * 1_000_000,
      maxInputTokens: pricing.max_input_tokens,
    };
    if (pricing.deckent_tier) entry.tier = pricing.deckent_tier;
    if (pricing.deckent_aliases?.length) entry.aliases = pricing.deckent_aliases;

    providers[provider]!.models[modelId] = entry;
  }

  return {
    configVersion: config._version,
    configLastUpdated: config._last_updated ?? null,
    budget: {
      sprintMaxUsd: config.cost_limits.sprint_max_usd,
      dailyMaxUsd: config.cost_limits.daily_max_usd,
      monthlyMaxUsd: config.cost_limits.monthly_max_usd ?? null,
      autoConfirmBelowUsd: config.cost_limits.auto_confirm_below_usd ?? null,
    },
    spendTodayUsd,
    providers,
  };
}

// ─── Tool registration ────────────────────────────────────────────────────────

export function registerCostTool(server: McpServer, deps: CostToolDeps = {}): void {
  server.registerTool(
    'deckent_cost',
    {
      title: 'Cost',
      description: mcpToolDescription('deckent_cost'),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        sprint: z
          .string()
          .optional()
          .describe(
            'Sprint ID hint (e.g. "sprint-332") — reserved for future sprint-scoped cost view',
          ),
        tenantId: z
          .string()
          .optional()
          .describe(
            'Tenant scope — reserved for future multi-tenant routing (defaults to "default")',
          ),
      }),
    },
    async (_args) => {
      try {
        const view = getCostView(process.cwd(), deps);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(view, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error reading cost data: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
