// ─── `deckent openrouter-probe [--json]` — OPENROUTER-LIVE-PREP (Sprint 365 Task 365-004) ──
//
// The only real caller of `fetchOpenRouterModels` (core/openrouter-models.ts,
// Sprint 360 Task 360-007) — before this command, that probe shipped
// code-complete and tested but had zero live trigger (docs/features/openrouter.md
// documented this gap explicitly: "no `deckent` CLI command or scheduled job
// triggers this function").
//
// Honest key-gated contract:
//   - `$DECK:OPENROUTER_API_KEY` resolves (bare `OPENROUTER_API_KEY` or the
//     `DECKENT_`-prefixed convention, mirroring `providers/openrouter.ts`'s
//     `resolveApiKey()`) -> live fetch + atomic cache write
//     (`.deckent/settings/openrouter-models.json`) + a rendered summary.
//   - Key absent -> HONEST unavailable, never a fabricated/empty result:
//     exit 0 (this is normal/expected until Alperen wires the key — not a
//     failure), reason explains exactly what's missing.
//   - Key present but the live call fails (network/shape error from
//     `OpenRouterProbeError`) -> honest fetch-failure message, exit 1 (this
//     IS a failure: the operator configured a key and it didn't work).
//
// Modeled on cli/commands/limits.ts (closest existing pattern: resolveProjectRoot
// + getLangFromConfig + an injectable-deps object as the fake-fetch/fake-secrets
// test seam + a --json branch + an honest-unavailable branch that stays at exit 0).

import type { Command } from 'commander';
import {
  fetchOpenRouterModels,
  writeFreeModelCache,
  FREE_MODEL_CACHE_FILE,
  type FetchFn,
  type OpenRouterFreeModel,
} from '../../core/openrouter-models.js';
import { loadDeckSecrets } from '../../core/deck-file.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

// ─── Key resolution ─────────────────────────────────────────────────────

/** Canonical env var name — matches `providers/openrouter.ts`'s `OPENROUTER_API_KEY_ENV`. */
const OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';

/** The canonical `$DECK:` reference a user configures — surfaced in the unavailable reason. */
const OPENROUTER_DECK_REF = `$DECK:${OPENROUTER_API_KEY_ENV}`;

/**
 * Bare key first, then the `DECKENT_`-prefixed convention every other
 * built-in provider uses — same two-key lookup `OpenRouterProvider.resolveApiKey()`
 * performs (that method is private, so this mirrors it locally rather than
 * exporting a provider internal out of its module).
 */
function resolveOpenRouterKey(secrets: Record<string, string>): string | undefined {
  const key = secrets[OPENROUTER_API_KEY_ENV] ?? secrets[`DECKENT_${OPENROUTER_API_KEY_ENV}`];
  return key && key.length > 0 ? key : undefined;
}

// ─── Command options + injectable deps ─────────────────────────────────

export interface OpenRouterProbeCommandOpts {
  json?: boolean;
}

export interface OpenRouterProbeDeps {
  resolveProjectRootFn?: () => string;
  getLangFn?: (root: string) => string;
  loadSecretsFn?: (root: string) => Record<string, string>;
  fetchImpl?: FetchFn;
  writeCacheFn?: (root: string, list: OpenRouterFreeModel[]) => { generatedAt: string };
}

const MAX_LISTED_MODELS = 10;

// ─── Run command ────────────────────────────────────────────────────────

export async function runOpenRouterProbeCommand(
  opts: OpenRouterProbeCommandOpts,
  deps: OpenRouterProbeDeps = {},
): Promise<void> {
  const resolveProjectRootFn = deps.resolveProjectRootFn ?? resolveProjectRoot;
  const getLangFn = deps.getLangFn ?? getLangFromConfig;
  const loadSecretsFn = deps.loadSecretsFn ?? loadDeckSecrets;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const writeCacheFn = deps.writeCacheFn ?? writeFreeModelCache;

  const root = resolveProjectRootFn();
  const lang = getLangFn(root);

  const apiKey = resolveOpenRouterKey(loadSecretsFn(root));

  // ─── Key absent: honest-unavailable, exit 0 ────────────────────────────
  if (!apiKey) {
    const reason = `${OPENROUTER_DECK_REF} not set in .deck — openrouter-probe unavailable`;
    if (opts.json) {
      print(JSON.stringify({ available: false, reason }, null, 2));
    } else {
      print(getMessage('openrouter_probe.header', lang));
      print(getMessage('openrouter_probe.unavailable', lang, { reason }));
    }
    return;
  }

  // ─── Key present: live fetch ────────────────────────────────────────────
  let models: OpenRouterFreeModel[];
  try {
    models = await fetchOpenRouterModels(fetchImpl);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      print(JSON.stringify({ available: true, error: reason }, null, 2));
    } else {
      print(getMessage('openrouter_probe.header', lang));
      print(getMessage('openrouter_probe.fetch_failed', lang, { reason }));
    }
    process.exitCode = 1;
    return;
  }

  const cache = writeCacheFn(root, models);

  if (opts.json) {
    print(JSON.stringify(
      {
        available: true,
        count: models.length,
        generatedAt: cache.generatedAt,
        cacheFile: FREE_MODEL_CACHE_FILE,
        models,
      },
      null,
      2,
    ));
    return;
  }

  print(getMessage('openrouter_probe.header', lang));
  print(getMessage('openrouter_probe.summary', lang, {
    count: String(models.length),
    cacheFile: FREE_MODEL_CACHE_FILE,
  }));

  if (models.length > 0) {
    print('');
    for (const m of models.slice(0, MAX_LISTED_MODELS)) {
      print(getMessage('openrouter_probe.model_line', lang, {
        id: m.id,
        context: String(m.context),
        modality: m.modality,
      }));
    }
    if (models.length > MAX_LISTED_MODELS) {
      print(getMessage('openrouter_probe.more', lang, {
        count: String(models.length - MAX_LISTED_MODELS),
      }));
    }
  }
}

// ─── Registration ───────────────────────────────────────────────────────

export function registerOpenRouterProbe(program: Command): void {
  program
    .command('openrouter-probe')
    .description(getMessage('cli.openrouter_probe.desc', getLanguage(undefined)))
    .option('--json', 'Output as JSON')
    .action(async (opts: OpenRouterProbeCommandOpts) => {
      await runOpenRouterProbeCommand(opts);
    });
}
