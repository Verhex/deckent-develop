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
import {
  ModelActivationStore,
  resolveActiveModelPolicy,
  PROVIDER_POLICY_MODES,
  type ProviderPolicyMode,
} from '../../core/model-activation-store.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';

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

/** Known provider display colors — also the SINGLE source for the provider
 *  names quoted in `--provider` help, so the list can never drift out of sync
 *  with what the command can actually colorize. Unlisted providers still render
 *  (uncolored); this map is presentation metadata, not an allowlist. */
const PROVIDER_COLORS: Record<string, string> = {
  claude: '\x1b[36m',
  codex:  '\x1b[32m',
  gemini: '\x1b[33m',
  ollama: '\x1b[35m',
  cursor: '\x1b[34m',
};

function colorProvider(provider: string): string {
  const code = PROVIDER_COLORS[provider] ?? '\x1b[0m';
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
    .description(getMessage('cli.models.desc', getLanguage(undefined)));

  // list/activation/active-set/tier = read paths; activate/deactivate/refresh/policy <mode> = mutation paths.
  models.addHelpText('after', memoryCatalogMessage('cli.memcat.models.help.paths', getLanguage(undefined)));

  // ── deckent models list [--provider <name>] ──────────────────────────────
  models
    .command('list')
    .description(getMessage('cli.models.list.desc', getLanguage(undefined)))
    .option(
      '--provider <name>',
      memoryCatalogMessage('cli.memcat.models.opt.provider_filter', getLanguage(undefined), { providers: Object.keys(PROVIDER_COLORS).join(', ') }),
    )
    .option('--offline', memoryCatalogMessage('cli.memcat.models.opt.offline', getLanguage(undefined)))
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
    .command('activate')
    .argument('<model>', memoryCatalogMessage('cli.memcat.models.arg.model', getLanguage(undefined)))
    .description(getMessage('cli.models.activate.desc', getLanguage(undefined)))
    .requiredOption('--provider <name>', memoryCatalogMessage('cli.memcat.models.opt.provider_required', getLanguage(undefined)))
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
    .command('deactivate')
    .argument('<model>', memoryCatalogMessage('cli.memcat.models.arg.model', getLanguage(undefined)))
    .description(getMessage('cli.models.deactivate.desc', getLanguage(undefined)))
    .requiredOption('--provider <name>', memoryCatalogMessage('cli.memcat.models.opt.provider_required', getLanguage(undefined)))
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
    .description(getMessage('cli.models.activation.desc', getLanguage(undefined)))
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

  // ── deckent models policy [<provider> <mode>] ────────────────────────────
  // OWNER-MODEL-POLICY-001: switch a provider between implicit-active (default —
  // a detected model is eligible unless deactivated) and explicit-active (ONLY
  // the owner's active records are executable; a newly detected/catalog model
  // can never auto-enter). `default_model` is a preferred pick, not a ceiling —
  // the hard limit is this active-set.
  models
    .command('policy')
    .argument('[provider]', memoryCatalogMessage('cli.memcat.models.arg.policy_provider', getLanguage(undefined)))
    .argument('[mode]', memoryCatalogMessage('cli.memcat.models.arg.policy_mode', getLanguage(undefined)))
    .description(getMessage('cli.models.policy.desc', getLanguage(undefined)))
    .action((provider: string | undefined, mode: string | undefined) => {
      try {
        const lang = getLanguage();
        if (!provider) {
          const policies = withStore((store) => store.listProviderPolicies());
          print(`\n  ${color('\x1b[1m', 'Provider Activation Policy')}`);
          print(`  ${color('\x1b[2m', getMessage('model_policy.default_not_ceiling', lang))}\n`);
          if (policies.length === 0) {
            print('  No policy recorded — every provider is implicit-active (default).\n');
            return;
          }
          for (const p of policies) {
            const badge = p.mode === 'explicit-active'
              ? color('\x1b[35m', 'explicit-active')
              : color('\x1b[32m', 'implicit-active');
            print(`  ${badge}  ${p.provider}  ${color('\x1b[2m', `(${p.actor}, ${p.updatedAt})`)}`);
          }
          print('');
          return;
        }
        if (!mode || !PROVIDER_POLICY_MODES.includes(mode as ProviderPolicyMode)) {
          printError(new Error(`mode must be one of: ${PROVIDER_POLICY_MODES.join(', ')}`));
          process.exitCode = 1;
          return;
        }
        withStore((store) => store.setProviderPolicy(provider, mode as ProviderPolicyMode));
        print(`  ${color('\x1b[32m', '✓')} ${provider} → ${mode}`);
        if (mode === 'explicit-active') {
          print(`  ${color('\x1b[2m', getMessage('model_policy.explicit_active_set', lang, { provider }))}`);
        }
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  // ── deckent models active-set ─────────────────────────────────────────────
  // The resolved executable pool + snapshot digest bound to plan/dispatch
  // evidence (OWNER-MODEL-POLICY-001) — the ground truth a run selects from.
  models
    .command('active-set')
    .description(getMessage('cli.models.active_set.desc', getLanguage(undefined)))
    .action(() => {
      try {
        const lang = getLanguage();
        const policy = resolveActiveModelPolicy(resolveProjectRoot());
        print(`\n  ${color('\x1b[1m', 'Active Execution Set')}  `
          + `${color('\x1b[2m', `sha256:${policy.snapshotDigest.slice(0, 16)}…`)}`);
        print(`  ${color('\x1b[2m', getMessage('model_policy.default_not_ceiling', lang))}\n`);
        const explicit = [...policy.explicitProviders].sort();
        if (explicit.length === 0 && policy.activeModels.length === 0) {
          print('  No explicit-active policy — every provider implicit-active '
            + '(all detected models eligible).\n');
          return;
        }
        print(`  explicit-active providers: ${explicit.length ? explicit.join(', ') : '(none)'}\n`);
        for (const m of policy.activeModels) {
          print(`  ${color('\x1b[32m', 'active')}  ${m.provider}/${m.modelId}`);
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
    .description(getMessage('cli.models.refresh.desc', getLanguage(undefined)))
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
    .command('tier')
    .argument('<model>', memoryCatalogMessage('cli.memcat.models.arg.model', getLanguage(undefined)))
    .description(getMessage('cli.models.tier.desc', getLanguage(undefined)))
    .option('--offline', memoryCatalogMessage('cli.memcat.models.opt.offline', getLanguage(undefined)))
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
