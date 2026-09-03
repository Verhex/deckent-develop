// ─── deckent models CLI Command (Sprint 190 W-F F-9/F-10) ──────────────────
// ADR-012: register<Name>(program) pattern
// ADR-010: no new runtime dependencies — colors via the theme.ts palette roles
// ADR-022-v2: CLI/MCP feature parity with deckent_models MCP tool

import type { Command } from 'commander';
import {
  loadCatalog,
  type CatalogLoadOptions,
} from '../../core/model-catalog.js';
import { modelRegistry, type ModelDefinition } from '../../core/model-registry.js';
import { print, printError } from '../helpers/output.js';
// TERMINAL-I18N-MODELS-001 — colors are palette roles through the theme.ts
// gate (host-theme-mapped; NO_COLOR → plain), never raw SGR literals; every
// user-facing sentence is a catalog row (cli.memcat.models.out.*).
import { theme } from '../helpers/theme.js';
// CLI-INTERACTIVE-001 — a missing model/provider on a terminal is asked as the
// same numbered choice the Terminal picker offers (shared rows + labels).
import { chooseFromSpec, askOnStdin, stdinIsInteractive } from '../helpers/prompt-choice.js';
import { buildPickerLabels } from '../repl/picker-labels.js';
import type { PickerCandidate, PickerSpec } from '../repl/picker.js';
import {
  ModelActivationStore,
  resolveActiveModelPolicy,
  PROVIDER_POLICY_MODES,
  type ProviderPolicyMode,
} from '../../core/model-activation-store.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';

/** The language OUTPUT lines resolve in: the project's configured language
 *  (config.json → env), read per invocation like `deckent config` does. */
function outputLang(): string {
  return detectLang(resolveProjectRoot());
}
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';

// ─── Tier Display ──────────────────────────────────────────────────────────

/** Tier → palette role: the tier WORD is the carrier, the color supplements it
 *  (readability gate: every role reads on every host theme). */
const TIER_ROLES: Record<string, (text: string) => string> = {
  premium_plus: (t) => theme.info(t),
  premium:      (t) => theme.info(t),
  standard:     (t) => theme.success(t),
  economy:      (t) => theme.warning(t),
};

/** Technical tier tokens (registry ids) — not localized. */
const TIER_LABELS: Record<string, string> = {
  premium_plus: 'premium+',
  premium:      'premium',
  standard:     'standard',
  economy:      'economy',
};

function colorTier(tier: string): string {
  const paint = TIER_ROLES[tier] ?? ((t: string) => t);
  const label = TIER_LABELS[tier] ?? tier;
  return paint(label.padEnd(9));
}

/** The provider names quoted in `--provider` help come from the registry —
 *  the presentation can never drift from what the catalog actually knows. */
function knownProviderNames(): string {
  return modelRegistry.getAllProviders().join(', ');
}

/** Provider ids are code-like identifiers → the code role (primary contrast). */
function colorProvider(provider: string): string {
  return theme.code(provider.padEnd(8));
}

function colorStatus(status: string): string {
  if (status === 'preview') return theme.warning(status);
  if (status === 'deprecated') return theme.error(status);
  return theme.success(status);
}

/** `cli.memcat.models.out.<suffix>` in the session language. */
function out(suffix: string, lang: string, vars?: Record<string, string | number>): string {
  const text = vars ? Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, String(v)])) : undefined;
  return memoryCatalogMessage(`cli.memcat.models.out.${suffix}`, lang, text);
}

// ─── Table Rendering ───────────────────────────────────────────────────────

function renderModelsTable(models: ModelDefinition[], lang: string = outputLang()): string {
  if (models.length === 0) {
    return theme.warning(out('no_models', lang));
  }

  const header = [
    theme.bold(out('col.id', lang).padEnd(32)),
    theme.bold(out('col.provider', lang).padEnd(10)),
    theme.bold(out('col.tier', lang).padEnd(11)),
    theme.bold(out('col.status', lang).padEnd(12)),
    theme.bold(out('col.ctx', lang)),
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

function sourceBadge(source: string, lang: string = outputLang()): string {
  if (source === 'remote') return theme.success(out('badge_live', lang));
  if (source === 'cache') return theme.warning(out('badge_cached', lang));
  return theme.muted(out('badge_bundled', lang));
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
      memoryCatalogMessage('cli.memcat.models.opt.provider_filter', getLanguage(undefined), { providers: knownProviderNames() }),
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

        const lang = outputLang();
        const badge = sourceBadge(result.source, lang);
        print(`\n  ${theme.bold(out('catalog_header', lang))}  [${badge}]  ${out('model_count', lang, { n: models.length })}\n`);
        print(renderModelsTable(models, lang));

        if (result.warnings.length > 0) {
          print('');
          for (const w of result.warnings) {
            print(theme.warning(`  ⚠ ${w}`));
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
  function withStore<T>(
    fn: (store: ModelActivationStore) => T,
    options: { readOnly?: boolean } = {},
  ): T {
    const store = new ModelActivationStore(resolveProjectRoot(), {
      readOnly: options.readOnly === true,
    });
    try {
      return fn(store);
    } finally {
      store.close();
    }
  }

  // CLI-INTERACTIVE-001 — resolve the (provider, model) pair: both given →
  // use them; a missing one on an interactive terminal → numbered choice
  // (registry providers, then the catalog's models for that provider, the row
  // already in the target state marked current); off a terminal → typed error.
  async function resolveActivationTarget(
    verb: 'activate' | 'deactivate',
    model: string | undefined,
    provider: string | undefined,
    offline: boolean | undefined,
    lang: string,
  ): Promise<{ provider: string; model: string } | null> {
    if (model && provider) return { provider, model };
    if (!stdinIsInteractive()) {
      printError(new Error(out('missing_args', lang, { verb })));
      return null;
    }
    const labels = buildPickerLabels((key) => getMessage(key, lang));
    const command = `deckent models ${verb}`;
    const report = (outcome: Awaited<ReturnType<typeof chooseFromSpec>>): PickerCandidate | null => {
      if (outcome.kind === 'chosen') return outcome.candidate;
      if (outcome.kind === 'cancelled') print(`  ${out('cancelled', lang)}`);
      else if (outcome.kind === 'not-found') printError(new Error(out('choice_not_found', lang, { arg: outcome.arg })));
      else printError(new Error(`${outcome.candidate.id}: ${outcome.candidate.blockedCode ?? ''}`));
      return null;
    };
    let chosenProvider = provider;
    if (!chosenProvider) {
      const providers = modelRegistry.getAllProviders();
      const spec: PickerSpec = {
        kind: 'provider', initialId: providers[0] ?? null, scopes: ['apply'],
        candidates: providers.map((p) => ({ id: p, label: p, facts: [{ key: 'models', value: labels.factModels.replace('{n}', String(modelRegistry.getByProvider(p).length)) }], state: 'ok' as const })),
      };
      print(`\n  ${theme.bold(out('choose_provider', lang))}`);
      const picked = report(await chooseFromSpec(spec, labels, `${command} --provider`, print, askOnStdin));
      if (!picked) return null;
      chosenProvider = picked.id;
    }
    if (model) return { provider: chosenProvider, model };
    const catalog = await loadCatalog({ offline });
    const candidates = catalog.models.filter((m) => (m.provider as string) === chosenProvider);
    if (candidates.length === 0) {
      printError(new Error(out('no_catalog_models', lang, { provider: chosenProvider })));
      return null;
    }
    const inTargetState = (id: string): boolean => withStore((store) => store.isActive(chosenProvider as string, id)) === (verb === 'activate');
    const spec: PickerSpec = {
      kind: 'model', initialId: candidates[0]?.id ?? null, scopes: ['apply'],
      candidates: candidates.map((m) => ({
        id: m.id, label: m.id,
        facts: [{ key: 'provider', value: chosenProvider as string }, { key: 'tier', value: m.tier }, { key: 'status', value: m.status }],
        state: inTargetState(m.id) ? 'current' as const : 'ok' as const,
      })),
    };
    print(`\n  ${theme.bold(out('choose_model', lang, { provider: chosenProvider }))}`);
    const picked = report(await chooseFromSpec(spec, labels, command, print, askOnStdin));
    return picked ? { provider: chosenProvider, model: picked.id } : null;
  }

  models
    .command('activate')
    .argument('[model]', memoryCatalogMessage('cli.memcat.models.arg.model', getLanguage(undefined)))
    .description(getMessage('cli.models.activate.desc', getLanguage(undefined)))
    .option('--provider <name>', memoryCatalogMessage('cli.memcat.models.opt.provider_required', getLanguage(undefined)))
    .option('--offline', memoryCatalogMessage('cli.memcat.models.opt.offline', getLanguage(undefined)))
    .action(async (model: string | undefined, opts: { provider?: string; offline?: boolean }) => {
      try {
        const lang = outputLang();
        const target = await resolveActivationTarget('activate', model, opts.provider, opts.offline, lang);
        if (!target) { process.exitCode = 1; return; }
        withStore((store) => store.setActivation(target.provider, target.model, true));
        print(`  ${theme.success('✓')} ${out('activated', lang, { provider: target.provider, model: target.model })}`);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  models
    .command('deactivate')
    .argument('[model]', memoryCatalogMessage('cli.memcat.models.arg.model', getLanguage(undefined)))
    .description(getMessage('cli.models.deactivate.desc', getLanguage(undefined)))
    .option('--provider <name>', memoryCatalogMessage('cli.memcat.models.opt.provider_required', getLanguage(undefined)))
    .option('--offline', memoryCatalogMessage('cli.memcat.models.opt.offline', getLanguage(undefined)))
    .action(async (model: string | undefined, opts: { provider?: string; offline?: boolean }) => {
      try {
        const lang = outputLang();
        const target = await resolveActivationTarget('deactivate', model, opts.provider, opts.offline, lang);
        if (!target) { process.exitCode = 1; return; }
        withStore((store) => store.setActivation(target.provider, target.model, false));
        print(`  ${theme.warning('✓')} ${out('deactivated', lang, { provider: target.provider, model: target.model })}`);
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
        const lang = outputLang();
        const records = withStore((store) => store.list(), { readOnly: true });
        if (records.length === 0) {
          print(`\n  ${out('no_activation', lang)}\n`);
          return;
        }
        print(`\n  ${theme.bold(out('activation_header', lang))}  ${out('decision_count', lang, { n: records.length })}\n`);
        for (const r of records) {
          const mark = r.active
            ? theme.success(out('mark_active', lang).padEnd(8))
            : theme.error(out('mark_inactive', lang).padEnd(8));
          print(`  ${mark}  ${r.provider}/${r.modelId}  ${theme.muted(`(${r.actor}, ${r.updatedAt})`)}`);
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
        const lang = outputLang();
        if (!provider) {
          const policies = withStore(
            (store) => store.listProviderPolicies(),
            { readOnly: true },
          );
          print(`\n  ${theme.bold(out('policy_header', lang))}`);
          print(`  ${theme.muted(getMessage('model_policy.default_not_ceiling', lang))}\n`);
          if (policies.length === 0) {
            print(`  ${out('no_policy', lang)}\n`);
            return;
          }
          for (const p of policies) {
            // The mode word is the carrier (a registry token); the color supplements it.
            const badge = p.mode === 'explicit-active' ? theme.info(p.mode) : theme.success(p.mode);
            print(`  ${badge}  ${p.provider}  ${theme.muted(`(${p.actor}, ${p.updatedAt})`)}`);
          }
          print('');
          return;
        }
        if (!mode) {
          const policy = withStore(
            (store) => ({
              mode: store.getProviderPolicy(provider),
              record: store.listProviderPolicies().find((entry) => entry.provider === provider),
            }),
            { readOnly: true },
          );
          const badge = policy.mode === 'explicit-active'
            ? theme.info(policy.mode)
            : theme.success(policy.mode);
          print(`\n  ${theme.bold(out('policy_header', lang))}`);
          print(`  ${theme.muted(getMessage('model_policy.default_not_ceiling', lang))}\n`);
          const provenance = policy.record
            ? theme.muted(`(${policy.record.actor}, ${policy.record.updatedAt})`)
            : '';
          print(`  ${badge}  ${provider}${provenance ? `  ${provenance}` : ''}\n`);
          return;
        }
        if (!PROVIDER_POLICY_MODES.includes(mode as ProviderPolicyMode)) {
          printError(new Error(out('policy_mode_invalid', lang, { modes: PROVIDER_POLICY_MODES.join(', ') })));
          process.exitCode = 1;
          return;
        }
        withStore((store) => store.setProviderPolicy(provider, mode as ProviderPolicyMode));
        print(`  ${theme.success('✓')} ${out('policy_set', lang, { provider, mode })}`);
        if (mode === 'explicit-active') {
          print(`  ${theme.muted(getMessage('model_policy.explicit_active_set', lang, { provider }))}`);
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
        const lang = outputLang();
        const policy = resolveActiveModelPolicy(resolveProjectRoot());
        print(`\n  ${theme.bold(out('active_set_header', lang))}  `
          + `${theme.muted(`sha256:${policy.snapshotDigest.slice(0, 16)}…`)}`);
        print(`  ${theme.muted(getMessage('model_policy.default_not_ceiling', lang))}\n`);
        const explicit = [...policy.explicitProviders].sort();
        if (explicit.length === 0 && policy.activeModels.length === 0) {
          print(`  ${out('no_explicit_policy', lang)}\n`);
          return;
        }
        print(`  ${out('explicit_providers', lang, { list: explicit.length ? explicit.join(', ') : out('none', lang) })}\n`);
        for (const m of policy.activeModels) {
          print(`  ${theme.success(out('mark_active', lang))}  ${m.provider}/${m.modelId}`);
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
        const lang = outputLang();
        print(theme.muted(`  ${out('refreshing', lang)}`));
        const result = await loadCatalog({ forceRefresh: true });
        print(`  ${theme.success('✓')} ${out('refreshed', lang, { n: result.models.length })}`);
        print(`    ${out('source', lang, { badge: sourceBadge(result.source, lang) })}`);
        if (result.fetchedAt) {
          const d = new Date(result.fetchedAt);
          print(`    ${out('fetched', lang, { when: d.toISOString() })}`);
        }
        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            print(theme.warning(`  ⚠ ${w}`));
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

        const lang = outputLang();
        if (!found) {
          printError(new Error(out('not_found', lang, { model: modelId })));
          process.exitCode = 1;
          return;
        }

        // One label column (widest localized field word) — alignment carries the hierarchy.
        const fields: Array<[string, string]> = [
          [out('field.provider', lang), colorProvider(found.provider)],
          [out('field.tier', lang), colorTier(found.tier)],
          [out('field.api_id', lang), found.apiId],
          [out('field.status', lang), colorStatus(found.status)],
          [out('field.context', lang), out('context_tokens', lang, { k: Math.round(found.contextWindow / 1000) })],
          [out('field.cost', lang), out('cost_line', lang, { in: found.costPerMillion.input, out: found.costPerMillion.output })],
        ];
        const width = Math.max(...fields.map(([label]) => label.length));
        print(`\n  ${theme.bold(found.id)}`);
        for (const [label, value] of fields) print(`    ${label.padEnd(width)} : ${value}`);
        print('');
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}

// ─── Exports for testing ───────────────────────────────────────────────────

export { renderModelsTable, findModel, sourceBadge, colorTier };
