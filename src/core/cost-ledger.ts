// ═══ Cost Ledger — METERING-TRUTH (TT554) ═══════════════════════════════════
//
// The measurement base for COST-10X. Three concerns, one module:
//
//   1. TARIFF/CAPABILITY drift-detection — every claude registry row is checked
//      against the cost SSOT (pricing-data-baseline.json) at RUNTIME, so a stale
//      rate/ctx/maxOut is surfaced from live data, never a hardcoded "expected"
//      magic number (zero-hardcode-live-data). This is what proves the sonnet-5
//      "3/15 vs 5/25" claim FALSE (SSOT says 3/15) and the haiku 0.8/4 vs $1/$5
//      drift TRUE — loudly, not silently.
//
//   2. provider modelUsage → ledger BRIDGE — prices every per-model usage entry
//      (INCLUDING off-task helper calls, e.g. Brain's haiku auxiliary turns that
//      were previously off-ledger) via the existing cost-calculator, so the
//      ledger total actually covers what the provider envelope charged.
//
//   3. LOCAL-vs-PROVIDER variance ALERT — compares the locally-captured total
//      against the provider-envelope total and LOUD-WARNS past a threshold. This
//      is the "silent-drift-dies" gate: the 413-002/003 case (provider $8.48, only
//      $5.08 = 59.9% captured in the ledger → 40% missing) would fire here instead
//      of vanishing.
//
// Contract note (born-562): this module NEVER touches the usage-patch /
// result-collector contract. It reuses cost-calculator.calculateActualCost for
// pricing (no reinvention) and reads the same bundled SSOT the cost-config-loader
// reads. Pure + injectable (config passed in) so tests stay hermetic.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DeckentError } from './errors.js';
import type { ModelDefinition, ModelRegistry } from './model-registry.js';
import { modelRegistry, BUILTIN_MODELS } from './model-registry.js';
import { calculateActualCost, type ActualCostUsage } from './cost-calculator.js';
import type { CostConfig, ModelPricing } from './cost-config-loader.js';

// ─── SSOT accessor (bundled, hermetic) ──────────────────────────────────────

/**
 * Read the anthropic model pricing block from the bundled cost SSOT
 * (`pricing-data-baseline.json`). Resolves the compiled `dist/core/` copy first
 * (copied at build-time), then falls back to `src/core/` (tsc/vitest dev). Reads
 * ONLY the checked-in baseline — never the gitignored `.deckent/cost-config.json`
 * — so callers stay hermetic and reproducible on a fresh checkout.
 *
 * Returns the raw `providers.anthropic.models` map (keyed by wire model id, with
 * per-token costs + `deckent_aliases`). Throws if the baseline cannot be read or
 * is missing the anthropic block — a metering module must fail honestly rather
 * than silently price everything at $0.
 */
export function loadBundledClaudePricing(): Record<string, ModelPricing> {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const distBaseline = join(thisDir, 'pricing-data-baseline.json');
  const srcBaseline = join(thisDir, '..', '..', 'src', 'core', 'pricing-data-baseline.json');
  const path = existsSync(distBaseline) ? distBaseline : srcBaseline;

  const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
    providers?: Record<string, { models?: Record<string, ModelPricing> }>;
  };
  const models = raw.providers?.anthropic?.models;
  if (!models || typeof models !== 'object') {
    throw new DeckentError('DECKENT_E004', `cost-ledger: bundled SSOT at ${path} has no providers.anthropic.models block`);
  }
  return models;
}

/**
 * Resolve the SSOT pricing entry for a registry model definition. Matches by the
 * model's wire id (`apiId`) or deckent id against the SSOT key OR the SSOT entry's
 * `deckent_aliases` — the registry's date-suffixed `claude-haiku-4-5-20251001`
 * resolves to the SSOT key `claude-haiku-4-5` (which lists it as an alias).
 */
export function resolveSsotForModel(
  model: Pick<ModelDefinition, 'id' | 'apiId'>,
  ssotModels: Record<string, ModelPricing>,
): { key: string; pricing: ModelPricing } | null {
  const candidates = [model.apiId, model.id];
  for (const [key, pricing] of Object.entries(ssotModels)) {
    if (candidates.includes(key)) return { key, pricing };
    const aliases = pricing.deckent_aliases ?? [];
    if (candidates.some(c => aliases.includes(c))) return { key, pricing };
  }
  return null;
}

// ─── Tariff / capability drift detection ────────────────────────────────────

/** One registry-field-vs-SSOT comparison (zero-hardcode: both values are live). */
export interface TariffDriftEntry {
  modelId: string;
  apiId: string;
  field: 'inputCostPerMTok' | 'outputCostPerMTok' | 'maxOutputTokens' | 'contextWindow';
  /** Value currently in the model-registry (undefined = unset). */
  registryValue: number | undefined;
  /** Value derived from the bundled cost SSOT. */
  ssotValue: number | undefined;
  /** True when the two disagree beyond floating-point tolerance. */
  drift: boolean;
}

// Per-MTok comparison tolerance — SSOT stores per-token (e.g. 3e-6); ×1e6 back to
// per-MTok introduces sub-cent float noise, so compare with a small epsilon.
const COST_EPSILON_PER_MTOK = 1e-6;

/**
 * Compare every supplied claude model against the cost SSOT and return one entry
 * per (model, field) with a `drift` flag. Numbers come entirely from the registry
 * and the live SSOT — nothing is hardcoded — so this is the evidence table the
 * task's "kanıt-referanslı, hardcode-yamasız" requirement demands.
 *
 * Models the SSOT does not know (non-claude, unregistered) are skipped.
 */
export function detectTariffDrift(
  models: readonly ModelDefinition[],
  ssotModels: Record<string, ModelPricing>,
): TariffDriftEntry[] {
  const out: TariffDriftEntry[] = [];
  for (const m of models) {
    if (m.provider !== 'claude') continue;
    const resolved = resolveSsotForModel(m, ssotModels);
    if (!resolved) continue;
    const p = resolved.pricing;

    const ssotInputPerMTok = p.input_cost_per_token * 1_000_000;
    const ssotOutputPerMTok = p.output_cost_per_token * 1_000_000;

    out.push({
      modelId: m.id, apiId: m.apiId, field: 'inputCostPerMTok',
      registryValue: m.costPerMillion.input, ssotValue: ssotInputPerMTok,
      drift: Math.abs(m.costPerMillion.input - ssotInputPerMTok) > COST_EPSILON_PER_MTOK,
    });
    out.push({
      modelId: m.id, apiId: m.apiId, field: 'outputCostPerMTok',
      registryValue: m.costPerMillion.output, ssotValue: ssotOutputPerMTok,
      drift: Math.abs(m.costPerMillion.output - ssotOutputPerMTok) > COST_EPSILON_PER_MTOK,
    });
    out.push({
      modelId: m.id, apiId: m.apiId, field: 'maxOutputTokens',
      registryValue: m.maxOutputTokens, ssotValue: p.max_output_tokens,
      // A registry entry that leaves maxOutputTokens unset while the SSOT defines
      // one IS drift (the pre-TT554 opus/haiku state).
      drift: p.max_output_tokens !== undefined && m.maxOutputTokens !== p.max_output_tokens,
    });
    out.push({
      modelId: m.id, apiId: m.apiId, field: 'contextWindow',
      registryValue: m.contextWindow, ssotValue: p.max_input_tokens,
      drift: m.contextWindow !== p.max_input_tokens,
    });
  }
  return out;
}

/** Convenience: the drifting subset only. */
export function tariffDrifts(
  models: readonly ModelDefinition[] = BUILTIN_MODELS,
  ssotModels: Record<string, ModelPricing> = loadBundledClaudePricing(),
): TariffDriftEntry[] {
  return detectTariffDrift(models, ssotModels).filter(e => e.drift);
}

// ─── provider modelUsage → ledger bridge ────────────────────────────────────

/** One per-model usage record to be priced into the ledger. */
export interface CostLedgerEntry {
  /** Model id / alias / wire id — resolved by cost-config findModel(). */
  model: string;
  /** Real (or estimated) token counts for this model's turns. */
  usage: ActualCostUsage;
  /**
   * Optional label distinguishing task work from auxiliary helper calls (e.g.
   * `'brain-helper'`). Off-task helper calls MUST be included so their cost is
   * not off-ledger (the haiku-helper $0.0127 gap).
   */
  kind?: 'task' | 'helper' | string;
}

export interface CostLedgerRow {
  model: string;
  kind: string;
  usd: number;
  pricingSource: string;
  isLocal: boolean;
}

export interface CostLedger {
  rows: CostLedgerRow[];
  /** Sum of every row's USD — task AND helper. */
  totalUsd: number;
  /** Number of entries that priced to `unknown-model:*` (never silently $0). */
  unpricedCount: number;
}

/**
 * Bridge provider per-model usage (the provider's `modelUsage` envelope, plus any
 * auxiliary helper turns) into a priced ledger. Pricing is delegated to the
 * existing {@link calculateActualCost} (SSOT-backed via `config`) — no reinvention
 * — so every entry, including off-task helper calls, contributes to `totalUsd`.
 *
 * `config` is injected (never loaded from disk here) so the bridge stays pure and
 * hermetic, matching the cost-calculator contract.
 */
export function buildCostLedger(
  entries: readonly CostLedgerEntry[],
  config: CostConfig,
  provider = 'claude',
): CostLedger {
  const rows: CostLedgerRow[] = [];
  let totalUsd = 0;
  let unpricedCount = 0;
  for (const e of entries) {
    const cost = calculateActualCost(e.usage, e.model, provider, config);
    if (cost.pricingSource.startsWith('unknown-model:')) unpricedCount += 1;
    rows.push({
      model: e.model,
      kind: e.kind ?? 'task',
      usd: cost.usd,
      pricingSource: cost.pricingSource,
      isLocal: cost.isLocal,
    });
    totalUsd += cost.usd;
  }
  return { rows, totalUsd, unpricedCount };
}

// ─── LOCAL-vs-PROVIDER variance alert ───────────────────────────────────────

/**
 * Default variance tolerance. The provider envelope and the locally-captured
 * ledger should agree within 15%; the 413-002/003 case was ~40% off (only 59.9%
 * captured) — well past this — so it would fire loudly.
 */
export const DEFAULT_COST_VARIANCE_THRESHOLD = 0.15;

export interface CostVarianceReport {
  /** Locally-captured total (deckent's own ledger). */
  localUsd: number;
  /** Provider-envelope total (ground truth). */
  providerUsd: number;
  /** Signed relative gap: (provider − local) / provider. Positive = under-count. */
  variance: number;
  /** Absolute variance vs the threshold. */
  threshold: number;
  /** True when |variance| exceeds the threshold — an alert MUST be surfaced. */
  exceeded: boolean;
}

/**
 * Compute the LOCAL-vs-PROVIDER cost variance. A positive `variance` means the
 * local ledger UNDER-counts the provider envelope (the dangerous direction). When
 * the provider total is 0 but the local total is not, the variance is reported as
 * the local magnitude relative to itself (1 = 100% unexplained), so a spurious
 * local charge is never silently accepted either.
 */
export function detectCostVariance(
  localUsd: number,
  providerUsd: number,
  threshold: number = DEFAULT_COST_VARIANCE_THRESHOLD,
): CostVarianceReport {
  let variance: number;
  if (providerUsd > 0) {
    variance = (providerUsd - localUsd) / providerUsd;
  } else if (localUsd > 0) {
    variance = 1; // provider says $0, local says >$0 — fully unexplained
  } else {
    variance = 0; // both zero — nothing to reconcile
  }
  return {
    localUsd,
    providerUsd,
    variance,
    threshold,
    exceeded: Math.abs(variance) > threshold,
  };
}

/**
 * Render a loud, human-readable variance alert. Returns the empty string when the
 * report is within tolerance (nothing to shout about). Kept pure (returns text) so
 * the caller owns the emit channel; pair with {@link warnOnCostVariance} for the
 * side-effecting loud-warn.
 */
export function formatCostVarianceAlert(report: CostVarianceReport): string {
  if (!report.exceeded) return '';
  const pct = (report.variance * 100).toFixed(1);
  const dir = report.variance >= 0 ? 'UNDER-counted' : 'OVER-counted';
  return (
    `⚠️  COST-VARIANCE: local ledger $${report.localUsd.toFixed(4)} vs provider ` +
    `$${report.providerUsd.toFixed(4)} — ${dir} by ${pct}% ` +
    `(threshold ${(report.threshold * 100).toFixed(0)}%). Metering drift — investigate before trusting the ledger.`
  );
}

/**
 * Side-effecting loud-warn: emit the variance alert through `log` (defaults to
 * `console.warn`) IFF the threshold is exceeded, and report whether it fired.
 * This is the "silent-drift-dies" enforcement point — an exceeded variance can
 * never pass without a warning.
 */
export function warnOnCostVariance(
  report: CostVarianceReport,
  log: (msg: string) => void = console.warn,
): boolean {
  const msg = formatCostVarianceAlert(report);
  if (msg) {
    log(msg);
    return true;
  }
  return false;
}

/**
 * End-to-end helper: bridge `entries` into a ledger, compare its total against the
 * provider-envelope total, and (loudly) warn on drift. Returns both the ledger and
 * the variance report so callers can persist/report the numbers.
 */
export function reconcileLedgerAgainstProvider(
  entries: readonly CostLedgerEntry[],
  providerUsd: number,
  config: CostConfig,
  opts: { provider?: string; threshold?: number; log?: (msg: string) => void } = {},
): { ledger: CostLedger; variance: CostVarianceReport; warned: boolean } {
  const ledger = buildCostLedger(entries, config, opts.provider ?? 'claude');
  const variance = detectCostVariance(
    ledger.totalUsd,
    providerUsd,
    opts.threshold ?? DEFAULT_COST_VARIANCE_THRESHOLD,
  );
  const warned = warnOnCostVariance(variance, opts.log);
  return { ledger, variance, warned };
}

// Re-export the singleton registry so callers can `detectTariffDrift` against the
// live catalog without a second import.
export { modelRegistry, type ModelRegistry };
