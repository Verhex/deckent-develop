// ─── deckent models CLI Command (Sprint 190 W-F F-9/F-10) ──────────────────
// ADR-012: register<Name>(program) pattern
// ADR-010: no new runtime dependencies — ANSI via existing color() helper
// ADR-022-v2: CLI/MCP feature parity with deckent_models MCP tool

import type { Command } from 'commander';
import {
  loadCatalog,
  type CatalogLoadOptions,
} from '../../core/model-catalog.js';
import type { ModelDefinition } from '../../core/model-registry.js';
import { print, printError, color } from '../helpers/output.js';
import { ModelActivationStore } from '../../core/model-activation-store.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Tier Display ──────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  premium_plus: '\x1b[35m',
  premium:      '\x1b[34m',
  standard:     '\x1b[32m',
  economy:      '\x1b[33m',
};

const TIER_LABELS: Record<string, string> = {
  premium_plus: 'premium+',
  premium:      'premium',
  standard:     'standard',
  economy:      'economy',
};

function colorTier(tier: string): string {
  const code = TIER_COLORS[tier] ?? '\x1b[0m';
  const label = TIER_LABELS[tier] ?? tier;
  return color(code, label.padEnd(9));
}

function colorProvider(provider: string): string {
  const providerColors: Record<string, string> = {
    claude: '\x1b[36m',
    codex:  '\x1b[32m',
    gemini: '\x1b[33m',
    ollama: '\x1b[35m',
  };
  const code = providerColors[provider] ?? '\x1b[0m';
  return color(code, provider.padEnd(8));
}

function colorStatus(status: string): string {
  if (status === 'preview') return color('\x1b[33m', status);
  if (status === 'deprecated') return color('\x1b[31m', status);
  return color('\x1b[32m', status);
}

// ─── Table Rendering ───────────────────────────────────────────────────────

function renderModelsTable(models: ModelDefinition[]): string {
  if (models.length === 0) {
    return color('\x1b[33m', 'No models found.');
  }

  const header = [
    color('\x1b[1m', 'ID'.padEnd(32)),
    color('\x1b[1m', 'PROVIDER'.padEnd(10)),
    color('\x1b[1m', 'TIER'.padEnd(11)),
    color('\x1b[1m', 'STATUS'.padEnd(12)),
    color('\x1b[1m', 'CTX'),
  ].join('  ');

  const sep = '-'.repeat(84);

  const rows = models.map((m) => {
    const id = m.id.padEnd(32);
    const provider = colorProvider(m.provider);
    const tier = colorTier(m.tier);
    const status = colorStatus(m.status).padEnd(12);
    const ctx = `${Math.round(m.contextWindow / 1000)}k`.padStart(6);
    return [id, provider, tier, status, ctx].join('  ');
  });

  return [header, sep, ...rows].join('\n');
}

// ─── Model lookup helper ───────────────────────────────────────────────────

function findModel(models: ModelDefinition[], modelId: string): ModelDefinition | undefined {
  return models.find(
    (m) => m.id === modelId || m.apiId === modelId,
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────

function sourceBadge(source: string): string {
  if (source === 'remote') return color('\x1b[32m', 'live');
  if (source === 'cache') return color('\x1b[33m', 'cached');
  return color('\x1b[2m', 'bundled');
}

// ─── registerModels ────────────────────────────────────────────────────────

export function registerModels(program: Command): void {
  const models = program
    .command('models')
    .description('Manage and browse the model catalog');

  // ── deckent models list [--provider <name>] ──────────────────────────────
  models
    .command('list')
    .description('List available models from the catalog')
    .option('--provider <name>', 'Filter by provider (claude, codex, gemini, ollama)')
    .option('--offline', 'Use cached or bundled catalog without network')
    .action(async (opts: { provider?: string; offline?: boolean }) => {
      try {
        const loaderOpts: CatalogLoadOptions = { offline: opts.offline };
        const result = await loadCatalog(loaderOpts);

        let models = result.models;
        if (opts.provider) {
          const providerFilter = opts.provider.toLowerCase().trim();
          models = models.filter(
            (m) => (m.provider as string) === providerFilter,
          );
        }

        const badge = sourceBadge(result.source);
        print(`\n  ${color('\x1b[1m', 'Model Catalog')}  [${badge}]  ${models.length} model(s)\n`);
        print(renderModelsTable(models));

        if (result.warnings.length > 0) {
          print('');
          for (const w of result.warnings) {
            print(color('\x1b[33m', `  ⚠ ${w}`));
          }
        }
        print('');
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  // ── deckent models activate|deactivate|activation ────────────────────────
  // MODEL-ACTIVATION-001: detection says what a provider OFFERS; these say what
  // the owner ALLOWS. First-class surface so model/provider management never
  // requires editing a file (dual-lens: the same store governs dogfood runs).
  // A model with NO record is active, so an untouched project is unchanged.
  function withStore<T>(fn: (store: ModelActivationStore) => T): T {
    const store = new ModelActivationStore(resolveProjectRoot());
    try {
      return fn(store);
    } finally {
      store.close();
    }
  }

  models
    .command('activate <model>')
    .description('Allow a detected model to enter the routing pool')
    .requiredOption('--provider <name>', 'Provider that serves this model')
    .action((model: string, opts: { provider: string }) => {
      try {
        withStore((store) => store.setActivation(opts.provider, model, true));
        print(`  ${color('\x1b[32m', '✓')} ${opts.provider}/${model} activated`);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  models
    .command('deactivate <model>')
    .description('Remove a model from the routing pool (detection still sees it)')
    .requiredOption('--provider <name>', 'Provider that serves this model')
    .action((model: string, opts: { provider: string }) => {
      try {
        withStore((store) => store.setActivation(opts.provider, model, false));
        print(`  ${color('\x1b[33m', '✓')} ${opts.provider}/${model} deactivated — it will not be routed`);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  models
    .command('activation')
    .description('Show recorded model activation decisions (unrecorded = active)')
    .action(() => {
      try {
        const records = withStore((store) => store.list());
        if (records.length === 0) {
          print('\n  No activation decisions recorded — every detected model is active.\n');
          return;
        }
        print(`\n  ${color('\x1b[1m', 'Model Activation')}  ${records.length} decision(s)\n`);
        for (const r of records) {
          const mark = r.active
            ? color('\x1b[32m', 'active  ')
            : color('\x1b[31m', 'inactive');
          print(`  ${mark}  ${r.provider}/${r.modelId}  ${color('\x1b[2m', `(${r.actor}, ${r.updatedAt})`)}`);
        }
        print('');
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  // ── deckent models refresh ───────────────────────────────────────────────
  models
    .command('refresh')
    .description('Force-refresh the model catalog (invalidates 24h cache)')
    .action(async () => {
      try {
        print(color('\x1b[2m', '  Refreshing model catalog…'));
        const result = await loadCatalog({ forceRefresh: true });
        print(`  ${color('\x1b[32m', '✓')} Catalog refreshed — ${result.models.length} model(s) loaded`);
        print(`    Source: ${sourceBadge(result.source)}`);
        if (result.fetchedAt) {
          const d = new Date(result.fetchedAt);
          print(`    Fetched: ${d.toISOString()}`);
        }
        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            print(color('\x1b[33m', `  ⚠ ${w}`));
          }
        }
        print('');
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  // ── deckent models tier <model> ──────────────────────────────────────────
  models
    .command('tier <model>')
    .description('Look up the tier of a specific model by ID or API ID')
    .option('--offline', 'Use cached or bundled catalog without network')
    .action(async (modelId: string, opts: { offline?: boolean }) => {
      try {
        const result = await loadCatalog({ offline: opts.offline });
        const found = findModel(result.models, modelId);

        if (!found) {
          printError(new Error(`Model not found: ${modelId}. Run \`deckent models list\` to see available models.`));
          process.exitCode = 1;
          return;
        }

        print(`\n  ${color('\x1b[1m', found.id)}`);
        print(`    Provider : ${colorProvider(found.provider)}`);
        print(`    Tier     : ${colorTier(found.tier)}`);
        print(`    API ID   : ${found.apiId}`);
        print(`    Status   : ${colorStatus(found.status)}`);
        print(`    Context  : ${Math.round(found.contextWindow / 1000)}k tokens`);
        print(`    Cost/M   : $${found.costPerMillion.input} in / $${found.costPerMillion.output} out`);
        print('');
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}

// ─── Exports for testing ───────────────────────────────────────────────────

export { renderModelsTable, findModel, sourceBadge, colorTier };
