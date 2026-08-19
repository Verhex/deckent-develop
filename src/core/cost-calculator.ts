/**
 * Cost Calculator — Parametric Multi-Provider Cost Estimation
 *
 * Zero hard-code. All pricing, rate limits, context windows are read from
 * `.deckent/cost-config.json` via cost-config-loader. Three confidence
 * intervals (naive / realistic / worst case) so users understand the
 * uncertainty range.
 *
 * Supports mixed billing modes: API key + subscription + free tier in the
 * same sprint. Opus via Claude Max + GPT-5 via API + Gemini free = all
 * tracked separately with their own cost semantics.
 *
 * Sprint 141 Task 141-SAFE-03
 */

import {
  findModel,
  CostConfigError,
  type CostConfig,
  type ModelPricing,
  type BillingMode,
} from './cost-config-loader.js';
import { modelRegistry, ModelRegistry } from './model-registry.js';
import { resolveProviderExecutionCostClass } from './provider-execution-profile.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskCostInput {
  /** Task ID (for reporting) */
  id: string;
  /** Model ID or alias */
  model: string;
  /** Estimated prompt size in tokens (post-cache breakpoint, incremental) */
  estimatedInputTokens: number;
  /** Estimated output size in tokens */
  estimatedOutputTokens: number;
  /** Billing mode override (default: provider's default_billing_mode) */
  billingMode?: BillingMode;
  /** Task effort (for output token defaults if estimatedOutputTokens not given) */
  effort?: 'low' | 'normal' | 'high';
}

export interface PerProviderBreakdown {
  provider: string;
  billingMode: BillingMode;
  taskCount: number;
  models: Record<
    string,
    {
      taskCount: number;
      uncachedInputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      outputTokens: number;
      costUsd: number;
      /** Live apiId from model-registry (overrides cost-config key for display) */
      displayLabel?: string;
    }
  >;
  totalApiCostUsd: number;
  /** Present only when backed by authoritative provider-limit evidence. */
  subscriptionQuotaPercent?: number;
  /** Unknown is distinct from a measured zero. */
  subscriptionQuotaState?: 'known' | 'unknown';
}

export type SubscriptionQuotaImpact =
  | {
      state: 'known';
      dailyPercent: number;
      evidenceSource: string;
    }
  | {
      state: 'unknown';
      dailyPercent: null;
      reason: 'provider-limit-evidence-not-supplied';
    };

export interface SprintCostEstimate {
  taskCount: number;
  retryMultiplier: number;
  cacheHitRatio: number;

  perProvider: Record<string, PerProviderBreakdown>;

  totalUncachedInputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalOutputTokens: number;

  /** Total USD across all API-billed tasks */
  totalApiCostUsd: number;
  /** Subscription quota impact; unknown is never represented as zero. */
  subscriptionImpact: {
    [provider: string]: SubscriptionQuotaImpact;
  };

  /** Three confidence levels */
  costNaive: number;
  costRealistic: number;
  costWorstCase: number;

  /** Budget comparison */
  budgetUsd: number;
  withinBudget: boolean;
  percentOfBudget: number;

  warnings: string[];
  recommendations: string[];
  /** Exact remote model IDs that had no trusted price evidence. Their work is
   *  intentionally excluded from numeric totals; cost-gate treats this as HOLD. */
  unpricedModels: string[];

  /** Per-task detail for debugging */
  taskDetails?: Array<{
    id: string;
    model: string;
    provider: string;
    costUsd: number;
    fits: boolean;
  }>;
}

export interface EstimateOptions {
  /** Override default cache hit ratio (0-1) */
  cacheHitRatio?: number;
  /** Override default retry multiplier */
  retryMultiplier?: number;
  /** Average cacheable context tokens (system prompt + ADR + agent) */
  cacheableContextTokens?: number;
  /** Include per-task details in result */
  includeDetails?: boolean;
  /** Historical stats from previous sprints */
  historicalStats?: {
    avgCacheHitRatio?: number;
    avgRetryMultiplier?: number;
  };
}

// ─── Defaults (CAN be overridden by config in future) ──────────────────────

const DEFAULT_RETRY_MULTIPLIER = 1.20;

// NOTE (Spec Pillar 5 / F1-TOK): the old fabricated cache-hit-ratio and
// cacheable-context hardcodes were removed. They invented a hit ratio and a
// cacheable-context size that were never measured, which systematically
// mis-estimated $-cost. The hit-ratio is now MEASURED from real `cached_tokens`
// (see calculateRegimeCost); at estimate time, an unmeasured ratio/context
// defaults to zero (assume no caching) rather than an invented number.

/** Output token estimates by effort (rough heuristic, calibrate over time). */
const EFFORT_OUTPUT_DEFAULTS: Record<'low' | 'normal' | 'high', number> = {
  low: 500,
  normal: 1500,
  high: 4000,
};

// ─── Unit Safety ───────────────────────────────────────────────────────────

/** Double-check before any multiplication — prevents 1,000,000× hata. */
function safeCost(tokens: number, costPerToken: number | null | undefined, label: string): number {
  if (costPerToken == null || costPerToken === 0) return 0;
  if (costPerToken > 0.01) {
    throw new CostConfigError(
      `Cost unit error in ${label}: ${costPerToken} > 0.01 threshold. ` +
        `Suspected per-MTok value used as per-token. Cost config loader should have caught this.`,
    );
  }
  if (!Number.isFinite(tokens) || tokens < 0) return 0;
  return tokens * costPerToken;
}

// ─── Per-Task Cost Calculation ─────────────────────────────────────────────

interface TaskCostResult {
  provider: string;
  modelId: string;
  pricing: ModelPricing;
  billingMode: BillingMode;

  uncachedInput: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
  costUsd: number;

  fits: boolean;
  /** Live apiId from model-registry for this task's model (display label) */
  displayLabel?: string;
}

/**
 * Resolve a task's billing mode from its effective auth so the cost estimate
 * FOLLOWS how the work is actually paid for (F1-CB). Without this, a
 * subscription-auth'd codex/gemini task is billed at the provider's static
 * `default_billing_mode` (`'api'` in the shipped cost-config) and shows phantom
 * USD even though the user pays through their plan.
 *
 *  - ollama         → `'local'`        (on-device inference, always $0)
 *  - subscription   → `'subscription'` (already paid via plan, $0 USD, quota-tracked)
 *  - api            → `'api'`          (metered USD)
 *  - hybrid/unknown → `undefined`      (defer to provider's `default_billing_mode`)
 *
 * Returning `undefined` is intentional: it preserves the prior provider-default
 * behaviour for callers/tasks whose auth cannot be determined.
 */
export function resolveBillingModeForAuth(
  provider: string | undefined,
  effectiveAuthMode: 'subscription' | 'api' | 'hybrid' | undefined,
): BillingMode | undefined {
  if (provider && resolveProviderExecutionCostClass(provider) === 'local') return 'local';
  if (effectiveAuthMode === 'subscription') return 'subscription';
  if (effectiveAuthMode === 'api') return 'api';
  return undefined;
}

// ─── Regime-Aware Cost (Spec Pillar 5) ─────────────────────────────────────
//
// Cost economics differ by *billing regime*, not just by provider:
//  - subscription/limit → a weekly-limit BURN unit (price-weighted), where
//    cacheRead is effectively free (zero weight) and cacheWrite dominates at a
//    1.25×input premium. This is NOT money owed — it is the $-equivalent draw on
//    the plan's weekly limit (F1-TOK ground truth:
//    `in·$in + out·$out + cacheWrite·1.25·$in`).
//  - api ($-per-token) → standard metered USD; cacheRead discounted, cacheWrite a
//    premium. Per-model in/out price comes from the model-registry; the cache
//    hit-ratio is MEASURED from real `cached_tokens`, never assumed.
//  - local → $0.
//
// This is ADDITIVE: the legacy estimate/actual paths (estimateSprintCost,
// calculateActualCost) are untouched. New callers opt into regime economics here.

/** Billing regime that governs how a run's tokens translate to cost. */
export type CostRegime = 'subscription' | 'api' | 'local';

/** Spec-formula cache weights (these are real archetype weights, not the removed fabricated defaults). */
const CACHE_WRITE_PREMIUM = 1.25; // cacheWrite priced at 1.25×input (archetype B / limit-burn)
const CACHE_READ_DISCOUNT = 0.10; // api fallback when config has no cacheRead price (≈0.1×input)

/** Real token usage for a regime-priced run (cache fields optional). */
export interface RegimeCostUsage {
  inputTokens: number;
  /**
   * Measured output tokens. `null`/`undefined` means the output side was NOT captured
   * (e.g. a provider that streamed without a final usage block) — distinct from a real
   * `0`. An unmeasured output is priced as 0 here but flagged via
   * {@link RegimeCostResult.outputUnmeasured} so downstream (KPI/ledger) does not mistake
   * an under-count for a genuine zero.
   */
  outputTokens: number | null;
  /** Measured cache-read (hit) tokens — FREE in subscription, discounted in api. */
  cacheReadTokens?: number;
  /** Measured cache-creation (write) tokens — the 1.25×input premium driver. */
  cacheCreationTokens?: number;
}

export interface RegimeCostResult {
  regime: CostRegime;
  /**
   * subscription → $-equivalent weekly-LIMIT burn unit (cacheRead excluded; a quota
   * measure, not money owed). api → metered USD. local → 0.
   */
  value: number;
  currency: 'USD';
  /** True only for subscription: `value` is a limit-burn $-equivalent, not a charge. */
  isLimitBurn: boolean;
  /** Price provenance — `registry:<model>`, `cost-config:<provider>/<model>`, `local`, or `unknown-model:<m>`. */
  pricingSource: string;
  /**
   * Cache-read share of all input-side tokens, MEASURED from the real counts
   * (`cacheRead / (input + cacheRead + cacheWrite)`); never an assumed constant.
   * `null` when there is no input-side activity to measure.
   */
  measuredHitRatio: number | null;
  /**
   * Honest under-count signal: `true` only when the output side was `null`/`undefined`
   * (NOT captured), so `value` omits output cost and is an UNDER-COUNT. `false` for a real
   * `0` output and for any measured output. Lets downstream (KPI/ledger) distinguish a
   * genuinely-zero output from "not measured" instead of silently trusting `value`.
   */
  outputUnmeasured: boolean;
}

/**
 * Map a {@link BillingMode} to its {@link CostRegime}. `free_tier` collapses to
 * `local` for cost purposes (both are $0 with no metered per-token charge).
 */
export function billingModeToRegime(mode: BillingMode): CostRegime {
  switch (mode) {
    case 'subscription':
      return 'subscription';
    case 'local':
    case 'free_tier':
      return 'local';
    case 'api':
    default:
      return 'api';
  }
}

/**
 * Resolve per-token input/output price for a model, registry-first (Spec Pillar 5:
 * "per-model prices come from the registry"), falling back to the cost-config.
 * Also returns the config pricing (when found) so the api regime can read real
 * per-model cache prices. Returns `null` when the model is unknown to both.
 */
function resolveInOutPricePerToken(
  model: string,
  config: CostConfig,
  registry: ModelRegistry,
): { input: number; output: number; source: string; configPricing: ModelPricing | null } | null {
  const def = registry.get(model);
  const found = findModel(config, model);
  if (def) {
    return {
      input: def.costPerMillion.input / 1_000_000,
      output: def.costPerMillion.output / 1_000_000,
      source: `registry:${model}`,
      configPricing: found?.pricing ?? null,
    };
  }
  if (found) {
    return {
      input: found.pricing.input_cost_per_token,
      output: found.pricing.output_cost_per_token,
      source: `cost-config:${found.provider}/${found.modelId}`,
      configPricing: found.pricing,
    };
  }
  return null;
}

/**
 * Compute the regime-aware cost of a run from its REAL token usage (Spec Pillar 5).
 * Pure arithmetic; `config` and `registry` are injected (no disk/global I/O) so the
 * function stays hermetic and testable.
 *
 *  - `local`            → `{ value: 0, pricingSource: 'local' }` regardless of tokens.
 *  - unknown model      → `{ value: 0, pricingSource: 'unknown-model:<m>' }` (never silently priced).
 *  - `subscription`     → limit-burn `in·$in + out·$out + cacheWrite·1.25·$in`; cacheRead EXCLUDED
 *                         (zero weight); `isLimitBurn: true`.
 *  - `api`              → `in·$in + out·$out + cacheRead·$cacheRead + cacheWrite·$cacheWrite`, with
 *                         in/out from the registry and cache prices from config (or archetype-B
 *                         defaults: cacheWrite = 1.25×in, cacheRead = 0.10×in).
 *
 * `measuredHitRatio` is always derived from the supplied counts — the hit-ratio is
 * measured, never assumed. `outputUnmeasured` is set when `usage.outputTokens` is
 * `null`/`undefined` (output never captured, NOT a real `0`): the cost is still computed
 * from the input/cache side but flagged as an under-count so downstream can tell the two
 * apart.
 */
export function calculateRegimeCost(
  usage: RegimeCostUsage,
  model: string,
  regime: CostRegime,
  config: CostConfig,
  registry: ModelRegistry = modelRegistry,
): RegimeCostResult {
  const input = Math.max(0, usage.inputTokens || 0);
  // Honest under-count signal (defense-in-depth): a `null`/`undefined` output side was NOT
  // measured — distinct from a real `0`. We still price it as 0 (arithmetic unchanged) but
  // flag it so a downstream KPI/ledger never mistakes an under-count for a genuine zero.
  // Loose `== null` matches both null and undefined; a real `0` is excluded.
  const outputUnmeasured = usage.outputTokens == null;
  const output = Math.max(0, usage.outputTokens || 0);
  const cacheRead = Math.max(0, usage.cacheReadTokens ?? 0);
  const cacheWrite = Math.max(0, usage.cacheCreationTokens ?? 0);

  // Measured (never assumed) cache-read share of every input-side token.
  const inputSide = input + cacheRead + cacheWrite;
  const measuredHitRatio = inputSide > 0 ? cacheRead / inputSide : null;

  if (regime === 'local') {
    return { regime, value: 0, currency: 'USD', isLimitBurn: false, pricingSource: 'local', measuredHitRatio, outputUnmeasured };
  }

  const price = resolveInOutPricePerToken(model, config, registry);
  if (!price) {
    return {
      regime,
      value: 0,
      currency: 'USD',
      isLimitBurn: false,
      pricingSource: `unknown-model:${model}`,
      measuredHitRatio,
      outputUnmeasured,
    };
  }
  const { input: inUsd, output: outUsd, source, configPricing } = price;

  if (regime === 'subscription') {
    // Weekly-limit burn unit (F1-TOK): cacheRead is FREE (zero weight); cacheWrite is
    // a 1.25×input premium and dominates the burn.
    const value =
      safeCost(input, inUsd, `${model}.input`) +
      safeCost(output, outUsd, `${model}.output`) +
      safeCost(cacheWrite, inUsd * CACHE_WRITE_PREMIUM, `${model}.cacheWrite`);
    return { regime, value, currency: 'USD', isLimitBurn: true, pricingSource: source, measuredHitRatio, outputUnmeasured };
  }

  // regime === 'api' — standard metered economics. Cache prices come from the
  // per-model cost-config when present; otherwise fall back to archetype-B weights
  // relative to the (registry-sourced) input price.
  const cacheReadUsd = configPricing?.cache_read_input_token_cost ?? inUsd * CACHE_READ_DISCOUNT;
  const cacheWriteUsd = configPricing?.cache_creation_input_token_cost ?? inUsd * CACHE_WRITE_PREMIUM;
  const value =
    safeCost(input, inUsd, `${model}.input`) +
    safeCost(output, outUsd, `${model}.output`) +
    safeCost(cacheRead, cacheReadUsd, `${model}.cacheRead`) +
    safeCost(cacheWrite, cacheWriteUsd, `${model}.cacheWrite`);
  return { regime, value, currency: 'USD', isLimitBurn: false, pricingSource: source, measuredHitRatio, outputUnmeasured };
}

// ─── Actual Cost (post-run, from real token usage) ─────────────────────────

/**
 * Cross-provider cost record for a completed run — matches the result contract's
 * `cost` block (`task-result-schema.ts` §1.4): `{ usd, currency, pricingSource, isLocal }`.
 * The assembler/reconciler drop this straight into a `TaskResult`.
 */
export interface ResultCost {
  /** Incremental billed USD. Zero for subscription/free-tier/local inference. */
  usd: number;
  currency: 'USD';
  /**
   * Catalog/provider-equivalent value retained for quota and comparison
   * observability when {@link usd} is structurally zero.
   */
  referenceUsd?: number;
  /** Effective billing authority used to settle billed versus reference value. */
  billingMode?: BillingMode;
  /** Price provenance — `cost-config:<provider>/<modelId>`, `local`, or `unknown-model:<m>`. */
  pricingSource: string;
  /** True for on-device / self-hosted inference (no metered third-party billing). */
  isLocal: boolean;
}

/**
 * Resolve post-run billing authority without coupling it to a provider name.
 *
 * Explicit execution auth wins. `hybrid` is intentionally unresolved: choosing
 * API or subscription without a per-attempt authority receipt would fabricate a
 * charge. When no auth was supplied at all (library/task-mode compatibility),
 * the model's configured provider billing mode is used.
 */
export function resolveActualBillingMode(
  config: CostConfig,
  model: string,
  provider: string | undefined,
  effectiveAuthMode: 'subscription' | 'api' | 'hybrid' | undefined,
): BillingMode | undefined {
  const authResolved = resolveBillingModeForAuth(provider, effectiveAuthMode);
  if (authResolved) return authResolved;
  if (effectiveAuthMode === 'hybrid') return undefined;

  const found = findModel(config, model);
  if (!found) return undefined;
  const providerConfig = config.providers[found.provider];
  return providerConfig?.default_billing_mode
    ?? providerConfig?.billing_modes_supported[0];
}

/**
 * The token fields {@link calculateActualCost} needs — a structural subset of the
 * provider-agnostic `TokenUsage` (`token-usage.ts`). Cache fields are optional so a
 * legacy claude-shaped usage (no cache split) still prices correctly.
 */
export interface ActualCostUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/**
 * On-device / self-hosted inference provider identifiers — these always bill $0 with
 * `isLocal:true`. Identity classification (not pricing hard-code): config remains the
 * primary signal (`default_billing_mode === 'local'`); this set only rescues a local
 * model that is not catalogued in cost-config.
 */
const LOCAL_PROVIDER_NAMES = new Set(['ollama', 'local', 'self-hosted', 'vllm']);

/**
 * Providers whose CLI surface is billed exclusively through the user's plan and
 * that publish no per-token tariff, so cost-config can carry no pricing row for
 * them (identity classification, not a pricing hard-code — an explicit
 * cost-config entry still wins everywhere below).
 *
 * Their incremental USD is STRUCTURALLY zero, which is a different fact from
 * "price unknown". Keeping the two apart is the whole point: a subscription run
 * settles as `billingMode:'subscription'` with a pricing source that names WHY
 * it is zero, while a genuinely unpriced model keeps reporting `unknown-model:`.
 * Neither path may emit a bare, unexplained $0.
 */
const SUBSCRIPTION_ONLY_PROVIDER_NAMES = new Set(['cursor']);

/** Decide whether a run was on-device/self-hosted — config-first, provider-name fallback. */
function isLocalInference(
  provider: string | undefined,
  found: { provider: string } | null,
  config: CostConfig,
): boolean {
  if (provider && LOCAL_PROVIDER_NAMES.has(provider.toLowerCase())) return true;
  if (found) {
    const pc = config.providers[found.provider];
    if (pc?.default_billing_mode === 'local') return true;
    if (pc && pc.billing_modes_supported.length === 1 && pc.billing_modes_supported[0] === 'local') {
      return true;
    }
  }
  return false;
}

/**
 * Compute the ACTUAL cost of a completed worker run from its real token usage
 * (spec §1.4 — the post-run counterpart to {@link estimateSprintCost}). Pure
 * arithmetic over per-token pricing; the only special case is local/self-hosted
 * inference, which is always $0 (`isLocal:true`).
 *
 * Cross-provider: pricing is resolved by {@link findModel} (model id/alias across
 * every provider in `config`), so the deckent `provider` name (`'claude'`/`'codex'`/
 * `'gemini'`/`'ollama'`/`'cursor'`) need not match the cost-config provider key
 * (`'anthropic'`/…) — the `provider` argument is used only to classify inference
 * economics: on-device (local) versus plan-billed
 * ({@link SUBSCRIPTION_ONLY_PROVIDER_NAMES}) versus metered.
 *
 * `config` is injected (not loaded from disk) so the function stays pure and tests
 * stay hermetic (ADR-087), consistent with {@link estimateSprintCost}.
 *
 * Behaviour:
 *  - local/self-hosted  → `{ usd:0, pricingSource:'local', isLocal:true }` (even with tokens).
 *  - plan-billed CLI    → `{ usd:0, billingMode:'subscription',
 *                          pricingSource:'subscription-provider:<p>' }` when the provider is
 *                          subscription-only and carries no cost-config row: the zero is
 *                          structural and labelled as such, never an unpriced gap.
 *  - unknown model      → `{ usd:0, pricingSource:'unknown-model:<m>', isLocal:false }` — never
 *                          silently priced, so the caller can surface the gap honestly.
 *  - metered            → per-token sum (input + output + cache_read + cache_creation), with the
 *                          unit-safety pin ({@link safeCost}) guarding against per-MTok unit errors.
 *
 * Subscription billing is intentionally NOT zeroed here: §1.4 defines this field as the raw
 * arithmetic cost (local→$0 only); subscription/quota accounting lives in the estimate and
 * reconciler paths.
 */
export function calculateActualCost(
  usage: ActualCostUsage,
  model: string,
  provider: string | undefined,
  config: CostConfig,
): ResultCost {
  const found = findModel(config, model);

  // Local/self-hosted inference → no metered billing, regardless of token counts.
  if (isLocalInference(provider, found, config)) {
    return { usd: 0, currency: 'USD', pricingSource: 'local', isLocal: true };
  }

  // Subscription-only provider with no cost-config row → the $0 is structural,
  // not a gap. Labelling it `unknown-model:` would read as missing pricing data
  // and invite someone to "fix" it with a fabricated tariff; the honest
  // settlement names the billing authority instead.
  if (!found && provider && SUBSCRIPTION_ONLY_PROVIDER_NAMES.has(provider.toLowerCase())) {
    return {
      usd: 0,
      currency: 'USD',
      billingMode: 'subscription',
      pricingSource: `subscription-provider:${provider.toLowerCase()}`,
      isLocal: false,
    };
  }

  // Unknown model → cannot price. Report honestly rather than silently charging $0.
  if (!found) {
    return { usd: 0, currency: 'USD', pricingSource: `unknown-model:${model}`, isLocal: false };
  }

  const { provider: pricedProvider, modelId, pricing } = found;
  const usd =
    safeCost(usage.inputTokens, pricing.input_cost_per_token, `${modelId}.input`) +
    safeCost(usage.outputTokens, pricing.output_cost_per_token, `${modelId}.output`) +
    safeCost(usage.cacheReadTokens ?? 0, pricing.cache_read_input_token_cost, `${modelId}.cache_read`) +
    safeCost(
      usage.cacheCreationTokens ?? 0,
      pricing.cache_creation_input_token_cost,
      `${modelId}.cache_creation`,
    );

  return {
    usd,
    currency: 'USD',
    pricingSource: `cost-config:${pricedProvider}/${modelId}`,
    isLocal: false,
  };
}

function calculateTaskCost(
  task: TaskCostInput,
  config: CostConfig,
  options: Required<Pick<EstimateOptions, 'cacheHitRatio' | 'retryMultiplier' | 'cacheableContextTokens'>>,
): TaskCostResult | null {
  const found = findModel(config, task.model);
  const dynamic = found ? undefined : modelRegistry.get(task.model);
  if (!found && !dynamic) return null;

  const provider = found?.provider ?? dynamic!.provider;
  const modelId = found?.modelId ?? dynamic!.id;
  const providerConfig = config.providers[provider];
  if (found && (!providerConfig || !providerConfig.enabled)) return null;

  const billingMode: BillingMode =
    task.billingMode
      ?? providerConfig?.default_billing_mode
      ?? providerConfig?.billing_modes_supported[0]
      // Last-resort default for a registry-known model the cost-config does not
      // catalogue: on-device inference is local, a plan-billed CLI provider is
      // subscription (so the pricing-evidence gate below does not reject it as
      // unpriced API spend), everything else stays metered API.
      ?? (provider === 'ollama'
        ? 'local'
        : SUBSCRIPTION_ONLY_PROVIDER_NAMES.has(provider.toLowerCase())
          ? 'subscription'
          : 'api');

  // Pricing evidence is an execution prerequisite only for metered API
  // billing. A registry-known subscription/local/free-tier model has a
  // verified runtime identity and capability envelope, while its incremental
  // USD is structurally zero. Requiring a price there incorrectly converts
  // "quota evidence unknown" into COST_PRICING_UNKNOWN and blocks dogfood.
  if (!found
    && billingMode === 'api'
    && (typeof dynamic!.pricingEvidenceRef !== 'string'
      || dynamic!.pricingEvidenceRef.length === 0)) {
    return null;
  }
  const pricing: ModelPricing = found?.pricing ?? {
    input_cost_per_token: dynamic!.costPerMillion.input / 1_000_000,
    output_cost_per_token: dynamic!.costPerMillion.output / 1_000_000,
    max_input_tokens: dynamic!.contextWindow,
    max_output_tokens: dynamic!.maxOutputTokens,
    supports_prompt_caching: false,
    enabled: true,
    _source: dynamic!.pricingEvidenceRef
      ?? `model-registry-capability:${dynamic!.id}`,
  };

  const incrementalInput = task.estimatedInputTokens;
  const output =
    task.estimatedOutputTokens ?? EFFORT_OUTPUT_DEFAULTS[task.effort ?? 'normal'];

  // Cache math per-task (simplified — 1 task = 1 API call, assumes cache window spans multiple tasks)
  // Cache hit ratio governs how often the cacheable prefix is read vs rewritten.
  const cacheableContext = options.cacheableContextTokens;
  const cacheHitProbability = pricing.supports_prompt_caching ? options.cacheHitRatio : 0;

  // On a cache hit, the cacheable prefix is read (cheap). On a cache miss, it's a
  // fresh cache creation (slightly more expensive than uncached input).
  const cacheRead = cacheableContext * cacheHitProbability;
  const cacheCreation = cacheableContext * (1 - cacheHitProbability);
  // Incremental input is always fresh (the task-specific content)
  const uncachedInput = incrementalInput;

  // Apply retry multiplier to everything
  const mult = options.retryMultiplier;

  // Compute cost — billing mode affects USD vs quota accounting
  let costUsd = 0;
  if (billingMode === 'api') {
    costUsd =
      safeCost(uncachedInput * mult, pricing.input_cost_per_token, `${modelId}.input`) +
      safeCost(output * mult, pricing.output_cost_per_token, `${modelId}.output`) +
      safeCost(cacheCreation * mult, pricing.cache_creation_input_token_cost, `${modelId}.cache_creation`) +
      safeCost(cacheRead * mult, pricing.cache_read_input_token_cost, `${modelId}.cache_read`);
  } else if (billingMode === 'subscription') {
    // Subscription: USD cost is $0 (user already paid subscription), but we track
    // tokens for quota calculations.
    costUsd = 0;
  } else if (billingMode === 'free_tier') {
    costUsd = 0;
  } else if (billingMode === 'local') {
    // Local on-device inference (Ollama): zero USD, no subscription quota draw.
    costUsd = 0;
  }

  // Context fit check
  const totalInput = incrementalInput + cacheableContext;
  const fits = totalInput <= pricing.max_input_tokens;

  // Resolve live apiId from model-registry (parametric label, avoids stale cost-config keys)
  const displayLabel = modelRegistry.get(task.model)?.apiId;

  return {
    provider,
    modelId,
    pricing,
    billingMode,
    uncachedInput: uncachedInput * mult,
    cacheCreation: cacheCreation * mult,
    cacheRead: cacheRead * mult,
    output: output * mult,
    costUsd,
    fits,
    displayLabel,
  };
}

// ─── Main Estimation Function ──────────────────────────────────────────────

export function estimateSprintCost(
  tasks: TaskCostInput[],
  config: CostConfig,
  options: EstimateOptions = {},
): SprintCostEstimate {
  // Hit-ratio / cacheable-context are MEASURED, not assumed (Spec Pillar 5 / F1-TOK).
  // When neither the caller nor historical stats supplies one, default to 0 — i.e.
  // assume no caching rather than fabricate a ratio/size (the removed cache-default fiction).
  const cacheHitRatio =
    options.cacheHitRatio ??
    options.historicalStats?.avgCacheHitRatio ??
    0;
  const retryMultiplier =
    options.retryMultiplier ??
    options.historicalStats?.avgRetryMultiplier ??
    DEFAULT_RETRY_MULTIPLIER;
  const cacheableContextTokens = options.cacheableContextTokens ?? 0;

  const opts = { cacheHitRatio, retryMultiplier, cacheableContextTokens };

  const perProvider: Record<string, PerProviderBreakdown> = {};
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const taskDetails: SprintCostEstimate['taskDetails'] = [];
  const unknownModels = new Set<string>();

  let totalUncachedInputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let totalOutputTokens = 0;
  let totalApiCostUsd = 0;

  for (const task of tasks) {
    const result = calculateTaskCost(task, config, opts);
    if (!result) {
      unknownModels.add(task.model);
      continue;
    }

    const { provider, modelId, billingMode, uncachedInput, cacheCreation, cacheRead, output, costUsd, fits, displayLabel } = result;

    // Aggregate per-provider
    if (!perProvider[provider]) {
      perProvider[provider] = {
        provider,
        billingMode,
        taskCount: 0,
        models: {},
        totalApiCostUsd: 0,
      };
    }
    const pp = perProvider[provider]!;
    pp.taskCount++;

    if (!pp.models[modelId]) {
      pp.models[modelId] = {
        taskCount: 0,
        uncachedInputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        displayLabel,
      };
    }
    const pm = pp.models[modelId]!;
    pm.taskCount++;
    pm.uncachedInputTokens += uncachedInput;
    pm.cacheCreationTokens += cacheCreation;
    pm.cacheReadTokens += cacheRead;
    pm.outputTokens += output;
    pm.costUsd += costUsd;

    pp.totalApiCostUsd += costUsd;

    totalUncachedInputTokens += uncachedInput;
    totalCacheCreationTokens += cacheCreation;
    totalCacheReadTokens += cacheRead;
    totalOutputTokens += output;
    totalApiCostUsd += costUsd;

    taskDetails.push({
      id: task.id,
      model: modelId,
      provider,
      costUsd,
      fits,
    });

    if (!fits) {
      warnings.push(
        `Task ${task.id}: exceeds ${modelId} context window (${task.estimatedInputTokens + cacheableContextTokens} > ${result.pricing.max_input_tokens})`,
      );
      recommendations.push(
        `Task ${task.id}: consider larger context model or split into sub-tasks`,
      );
    }
  }

  // Unknown models warning
  for (const m of unknownModels) {
    warnings.push(`Unknown model: ${m} — not found in cost-config.json. Skipped in estimation.`);
    recommendations.push(`Add ${m} to .deckent/cost-config.json or use a known alias`);
  }

  // Subscription quota is provider/account/window evidence, not a function of
  // estimated prompt tokens. Without that authority the only honest value is
  // unknown; USD remains $0 because the plan is already subscription-paid.
  const subscriptionImpact: SprintCostEstimate['subscriptionImpact'] = {};
  for (const [provider, breakdown] of Object.entries(perProvider)) {
    if (breakdown.billingMode === 'subscription') {
      subscriptionImpact[provider] = {
        state: 'unknown',
        dailyPercent: null,
        reason: 'provider-limit-evidence-not-supplied',
      };
      breakdown.subscriptionQuotaState = 'unknown';
      warnings.push(
        `${provider} subscription quota is unknown: no authoritative provider-limit evidence was supplied. USD $0 is not a quota-availability verdict.`,
      );
    }
  }

  // Budget check
  const budgetUsd = config.cost_limits.sprint_max_usd;
  const withinBudget = totalApiCostUsd <= budgetUsd;
  const percentOfBudget = budgetUsd > 0 ? (totalApiCostUsd / budgetUsd) * 100 : 0;

  // Confidence intervals
  // Naive: assumes full cache hit + no retry (best case)
  // Worst case: assumes cache miss + heavy retry (1.6x realistic)
  const optimisticFactor = 0.7; // If cache hit were 100% and no retry
  const worstCaseFactor = 1.6; // Retry storm + cache miss
  const costRealistic = totalApiCostUsd;
  const costNaive = costRealistic * optimisticFactor;
  const costWorstCase = costRealistic * worstCaseFactor;

  // Budget warnings
  if (percentOfBudget >= 100) {
    warnings.push(
      `Realistic cost $${costRealistic.toFixed(2)} exceeds sprint budget $${budgetUsd.toFixed(2)}. Use --force or raise budget.`,
    );
  } else if (percentOfBudget >= 75) {
    warnings.push(
      `Cost is ${percentOfBudget.toFixed(0)}% of sprint budget. Consider reducing task count or using cheaper models.`,
    );
  }

  if (costWorstCase > budgetUsd) {
    recommendations.push(
      `Worst case ($${costWorstCase.toFixed(2)}) exceeds budget. Consider increasing buffer or enabling prompt caching.`,
    );
  }

  if (cacheHitRatio < 0.5 && totalCacheReadTokens > 0) {
    recommendations.push(
      `Low cache hit ratio (${(cacheHitRatio * 100).toFixed(0)}%). Enable prompt caching in Claude adapter for cost savings.`,
    );
  }

  return {
    taskCount: tasks.length,
    retryMultiplier,
    cacheHitRatio,
    perProvider,
    totalUncachedInputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalOutputTokens,
    totalApiCostUsd,
    subscriptionImpact,
    costNaive,
    costRealistic,
    costWorstCase,
    budgetUsd,
    withinBudget,
    percentOfBudget,
    warnings,
    recommendations,
    unpricedModels: [...unknownModels],
    taskDetails: options.includeDetails ? taskDetails : undefined,
  };
}

// ─── Display Formatter ─────────────────────────────────────────────────────

export function formatEstimate(est: SprintCostEstimate): string {
  const lines: string[] = [];
  lines.push(`\n🛡  Sprint Cost Estimate`);
  lines.push(`${'='.repeat(50)}`);
  lines.push(`Task count:          ${est.taskCount}`);
  lines.push(`Retry multiplier:    ${est.retryMultiplier.toFixed(2)}x`);
  lines.push(`Cache hit ratio:     ${(est.cacheHitRatio * 100).toFixed(0)}%`);

  lines.push(`\nModel distribution:`);
  for (const [providerName, pp] of Object.entries(est.perProvider)) {
    const billing = pp.billingMode;
    for (const [modelId, mm] of Object.entries(pp.models)) {
      const label = mm.displayLabel ?? modelId;
      lines.push(`  ${providerName}/${label.padEnd(25)} ${String(mm.taskCount).padStart(3)} task (${billing})`);
    }
  }

  lines.push(`\nToken Estimate:`);
  lines.push(`  Uncached input:      ${Math.round(est.totalUncachedInputTokens).toLocaleString()}`);
  lines.push(`  Cache read:          ${Math.round(est.totalCacheReadTokens).toLocaleString()} (90% discount)`);
  lines.push(`  Cache creation:      ${Math.round(est.totalCacheCreationTokens).toLocaleString()}`);
  lines.push(`  Output:              ${Math.round(est.totalOutputTokens).toLocaleString()}`);

  lines.push(`\nCost Breakdown (USD):`);
  for (const [providerName, pp] of Object.entries(est.perProvider)) {
    if (pp.billingMode === 'api') {
      lines.push(`  ${providerName.padEnd(20)} $${pp.totalApiCostUsd.toFixed(4)} (api)`);
    } else if (pp.billingMode === 'subscription') {
      const quota = pp.subscriptionQuotaState === 'known'
        ? `~${pp.subscriptionQuotaPercent!.toFixed(1)}% daily quota`
        : 'quota UNKNOWN';
      lines.push(`  ${providerName.padEnd(20)} $0 (subscription; ${quota})`);
    } else if (pp.billingMode === 'local') {
      lines.push(`  ${providerName.padEnd(20)} $0 (local)`);
    } else {
      lines.push(`  ${providerName.padEnd(20)} $0 (free tier)`);
    }
  }
  lines.push(`  ${'─'.repeat(40)}`);
  lines.push(`  Realistic:           $${est.costRealistic.toFixed(4)}  ← current estimate`);
  lines.push(`  Optimistic (cache):  $${est.costNaive.toFixed(4)}`);
  lines.push(`  Worst case (retry):  $${est.costWorstCase.toFixed(4)}`);

  if (Object.keys(est.subscriptionImpact).length > 0) {
    lines.push(`\nSubscription impact:`);
    for (const [prov, impact] of Object.entries(est.subscriptionImpact)) {
      lines.push(impact.state === 'known'
        ? `  ${prov} daily: ${impact.dailyPercent.toFixed(1)}% (${impact.evidenceSource})`
        : `  ${prov}: UNKNOWN (${impact.reason})`);
    }
  }

  lines.push(`\nAPI/USD budget check:`);
  lines.push(`  Sprint USD budget:   $${est.budgetUsd.toFixed(2)} (config: cost_limits.sprint_max_usd)`);
  lines.push(`  API USD used:        ${est.percentOfBudget.toFixed(1)}%`);
  const statusIcon = est.withinBudget ? '✅' : '❌';
  lines.push(`  USD status:          ${statusIcon} ${est.withinBudget ? 'Within API/USD budget' : 'EXCEEDS API/USD BUDGET'}`);

  if (est.warnings.length > 0) {
    lines.push(`\nWarnings:`);
    for (const w of est.warnings.slice(0, 5)) lines.push(`  ⚠ ${w}`);
    if (est.warnings.length > 5) lines.push(`  ... +${est.warnings.length - 5} more`);
  }

  if (est.recommendations.length > 0) {
    lines.push(`\nRecommendations:`);
    for (const r of est.recommendations.slice(0, 5)) lines.push(`  ℹ ${r}`);
    if (est.recommendations.length > 5) lines.push(`  ... +${est.recommendations.length - 5} more`);
  }

  return lines.join('\n');
}
