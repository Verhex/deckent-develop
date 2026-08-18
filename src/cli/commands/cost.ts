/**
 * `deckent cost` — User Safety Shield CLI commands
 *
 * Subcommands:
 *   deckent cost show [--provider X] [--model Y]   — Display pricing
 *   deckent cost update [--provider X] [--dry-run] — Fetch latest pricing
 *   deckent cost budget [--set N]                   — Get/set sprint budget
 *   deckent cost estimate [--task-count N]          — Quick cost estimate
 *
 * Sprint 141 Task 141-SAFE-02 (pricing update) + 141-SAFE-04 (CLI entry)
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import {
  loadCostConfig,
  initCostConfig,
  findModel,
  listEnabledModels,
  formatCostPerMTok,
  CostConfigError,
} from '../../core/cost-config-loader.js';
import { updatePricing, formatUpdateResult } from '../../core/pricing-updater.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

// ─── Subcommand: show ──────────────────────────────────────────────────────

async function runShow(options: { provider?: string; model?: string }): Promise<void> {
  const root = resolveProjectRoot();

  // Ensure config exists (falls back to baseline if missing)
  try {
    const config = loadCostConfig(root);

    if (options.model) {
      const found = findModel(config, options.model);
      if (!found) {
        printError(`Model not found: ${options.model}`);
        process.exit(1);
      }
      const { provider, modelId, pricing } = found;
      print(`\n📊 Model: ${provider}/${modelId}`);
      print(`  Input:          ${formatCostPerMTok(pricing.input_cost_per_token)}`);
      print(`  Output:         ${formatCostPerMTok(pricing.output_cost_per_token)}`);
      if (pricing.cache_read_input_token_cost != null) {
        print(`  Cache read:     ${formatCostPerMTok(pricing.cache_read_input_token_cost)}`);
      }
      if (pricing.cache_creation_input_token_cost != null) {
        print(`  Cache write 5m: ${formatCostPerMTok(pricing.cache_creation_input_token_cost)}`);
      }
      if (pricing.cache_creation_input_token_cost_above_1hr != null) {
        print(`  Cache write 1h: ${formatCostPerMTok(pricing.cache_creation_input_token_cost_above_1hr)}`);
      }
      print(`  Max input:      ${pricing.max_input_tokens.toLocaleString()} tokens`);
      if (pricing.max_output_tokens) {
        print(`  Max output:     ${pricing.max_output_tokens.toLocaleString()} tokens`);
      }
      print(`  Tier:           ${pricing.deckent_tier ?? 'unspecified'}`);
      print(`  Features:       ${[
        pricing.supports_prompt_caching && 'cache',
        pricing.supports_reasoning && 'reasoning',
        pricing.supports_vision && 'vision',
      ].filter(Boolean).join(', ') || 'none listed'}`);
      if (pricing.deckent_aliases?.length) {
        print(`  Aliases:        ${pricing.deckent_aliases.join(', ')}`);
      }
      return;
    }

    // List all (or filtered by provider)
    const allModels = listEnabledModels(config);
    const filtered = options.provider
      ? allModels.filter((m) => m.provider === options.provider)
      : allModels;

    if (filtered.length === 0) {
      printError(`No enabled models found${options.provider ? ` for provider ${options.provider}` : ''}`);
      process.exit(1);
    }

    print(`\n📊 Pricing (${filtered.length} models, source: ${config._update_source ?? 'bundled'})`);
    print(`Last updated: ${config._last_updated ?? 'N/A'}\n`);

    // Group by provider
    const byProvider = new Map<string, typeof filtered>();
    for (const m of filtered) {
      if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
      byProvider.get(m.provider)!.push(m);
    }

    for (const [provider, models] of byProvider.entries()) {
      const providerConfig = config.providers[provider];
      const billingModes = providerConfig?.billing_modes_supported.join('/') ?? 'unknown';
      print(`── ${provider} (billing: ${billingModes}) ──`);
      for (const { modelId, pricing } of models) {
        const input = formatCostPerMTok(pricing.input_cost_per_token);
        const output = formatCostPerMTok(pricing.output_cost_per_token);
        const cache = pricing.cache_read_input_token_cost != null
          ? formatCostPerMTok(pricing.cache_read_input_token_cost)
          : 'N/A';
        const ctx = `${Math.round(pricing.max_input_tokens / 1000)}K`;
        print(`  ${modelId.padEnd(30)} in=${input.padEnd(12)} out=${output.padEnd(12)} cache=${cache.padEnd(10)} ctx=${ctx}`);
      }
      if (providerConfig?.subscription_tracking && !providerConfig.subscription_tracking.supported) {
        print(`  ⚠ ${provider} subscription tracking: ${providerConfig.subscription_tracking.reason ?? 'not supported'}`);
      }
      print('');
    }

    print(`💡 Edit .deckent/cost-config.json to customize, or run \`deckent cost update\` to fetch latest.`);
  } catch (err) {
    if (err instanceof CostConfigError) {
      printError(`Cost config error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

// ─── Subcommand: update ────────────────────────────────────────────────────

async function runUpdate(options: {
  provider?: string;
  dryRun?: boolean;
  skipValidation?: boolean;
}): Promise<void> {
  const root = resolveProjectRoot();

  // Ensure baseline is initialized first
  const init = initCostConfig(root);
  if (init.created) {
    print(`ℹ Initialized ${init.path} from bundled baseline`);
  }

  print(`🔄 Fetching pricing data...`);
  try {
    const result = await updatePricing(root, {
      providers: options.provider ? [options.provider] : undefined,
      dryRun: options.dryRun ?? false,
      skipValidation: options.skipValidation ?? false,
    });
    print(formatUpdateResult(result));

    if (!result.success) {
      process.exit(1);
    }
  } catch (err) {
    printError(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// ─── Subcommand: budget ────────────────────────────────────────────────────

async function runBudget(options: { set?: string; daily?: string; monthly?: string }): Promise<void> {
  const root = resolveProjectRoot();
  initCostConfig(root); // Ensure file exists
  const configPath = join(root, '.deckent', 'cost-config.json');

  if (options.set || options.daily || options.monthly) {
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    config.cost_limits = config.cost_limits ?? {};

    if (options.set) {
      const val = parseFloat(options.set);
      if (!Number.isFinite(val) || val < 0) {
        printError(`Invalid budget: ${options.set}`);
        process.exit(1);
      }
      config.cost_limits.sprint_max_usd = val;
      print(`✓ Set sprint_max_usd = $${val.toFixed(2)}`);
    }
    if (options.daily) {
      const val = parseFloat(options.daily);
      if (!Number.isFinite(val) || val < 0) {
        printError(`Invalid daily budget: ${options.daily}`);
        process.exit(1);
      }
      config.cost_limits.daily_max_usd = val;
      print(`✓ Set daily_max_usd = $${val.toFixed(2)}`);
    }
    if (options.monthly) {
      const val = parseFloat(options.monthly);
      if (!Number.isFinite(val) || val < 0) {
        printError(`Invalid monthly budget: ${options.monthly}`);
        process.exit(1);
      }
      config.cost_limits.monthly_max_usd = val;
      print(`✓ Set monthly_max_usd = $${val.toFixed(2)}`);
    }

    config._last_updated = new Date().toISOString();
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } else {
    const config = loadCostConfig(root);
    print(`\n💰 Cost Budgets`);
    print(`  Sprint:  $${config.cost_limits.sprint_max_usd.toFixed(2)}`);
    print(`  Daily:   $${config.cost_limits.daily_max_usd.toFixed(2)}`);
    if (config.cost_limits.monthly_max_usd != null) {
      print(`  Monthly: $${config.cost_limits.monthly_max_usd.toFixed(2)}`);
    }
    if (config.cost_limits.auto_confirm_below_usd != null) {
      print(`  Auto-confirm below: $${config.cost_limits.auto_confirm_below_usd.toFixed(2)}`);
    }
    print(`\nEdit .deckent/cost-config.json or use --set/--daily/--monthly flags.`);
  }
}

// ─── Registration ──────────────────────────────────────────────────────────

export function registerCostCommand(program: Command): void {
  const cost = program.command('cost').description(getMessage('cli.cost.desc', getLanguage(undefined)));

  cost
    .command('show')
    .description(getMessage('cli.cost.show.desc', getLanguage(undefined)))
    .option('--provider <name>', 'Filter by provider (anthropic, openai, google)')
    .option('--model <id>', 'Show single model details')
    .action(async (options) => {
      await runShow(options);
    });

  cost
    .command('update')
    .description(getMessage('cli.cost.update.desc', getLanguage(undefined)))
    .option('--provider <name>', 'Update only this provider')
    .option('--dry-run', 'Preview changes without writing')
    .option('--skip-validation', 'Skip OpenRouter delta check')
    .action(async (options) => {
      await runUpdate(options);
    });

  cost
    .command('budget')
    .description(getMessage('cli.cost.budget.desc', getLanguage(undefined)))
    .option('--set <usd>', 'Set sprint max budget in USD')
    .option('--daily <usd>', 'Set daily max budget in USD')
    .option('--monthly <usd>', 'Set monthly max budget in USD')
    .action(async (options) => {
      await runBudget(options);
    });
}
