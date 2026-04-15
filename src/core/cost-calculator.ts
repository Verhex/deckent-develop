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
  type CostConfig,
  type ModelPricing,
  type BillingMode,
} from './cost-config-loader.js';

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
    }
  >;
  totalApiCostUsd: number;
  /** For subscription mode: estimated % of daily quota consumed */
  subscriptionQuotaPercent?: number;
}

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
  /** Subscription impact (Claude Max only — ChatGPT/Gemini impossible) */
  subscriptionImpact: {
    [provider: string]: { dailyPercent: number };
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

const DEFAULT_CACHE_HIT_RATIO = 0.70;
const DEFAULT_RETRY_MULTIPLIER = 1.20;
const DEFAULT_CACHEABLE_CONTEXT = 8000; // system + ADR + agent boilerplate

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
    throw new Error(
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
}

function calculateTaskCost(
  task: TaskCostInput,
  config: CostConfig,
  options: Required<Pick<EstimateOptions, 'cacheHitRatio' | 'retryMultiplier' | 'cacheableContextTokens'>>,
): TaskCostResult | null {
  const found = findModel(config, task.model);
  if (!found) return null;

  const { provider, modelId, pricing } = found;
  const providerConfig = config.providers[provider];
  if (!providerConfig || !providerConfig.enabled) return null;

  const billingMode: BillingMode =
    task.billingMode ?? providerConfig.default_billing_mode ?? providerConfig.billing_modes_supported[0] ?? 'api';

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
  }

  // Context fit check
  const totalInput = incrementalInput + cacheableContext;
  const fits = totalInput <= pricing.max_input_tokens;

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
  };
}

// ─── Main Estimation Function ──────────────────────────────────────────────

export function estimateSprintCost(
  tasks: TaskCostInput[],
  config: CostConfig,
  options: EstimateOptions = {},
): SprintCostEstimate {
  const cacheHitRatio =
    options.cacheHitRatio ??
    options.historicalStats?.avgCacheHitRatio ??
    DEFAULT_CACHE_HIT_RATIO;
  const retryMultiplier =
    options.retryMultiplier ??
    options.historicalStats?.avgRetryMultiplier ??
    DEFAULT_RETRY_MULTIPLIER;
  const cacheableContextTokens = options.cacheableContextTokens ?? DEFAULT_CACHEABLE_CONTEXT;

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

    const { provider, modelId, billingMode, uncachedInput, cacheCreation, cacheRead, output, costUsd, fits } = result;

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

  // Subscription impact rough estimate (Claude Max only)
  const subscriptionImpact: SprintCostEstimate['subscriptionImpact'] = {};
  for (const [provider, breakdown] of Object.entries(perProvider)) {
    if (breakdown.billingMode === 'subscription') {
      // Rough heuristic: Claude Max ~= 250 messages/day equivalent
      // Every 50K tokens ~= 1 message equivalent (very rough)
      const totalTokens =
        totalUncachedInputTokens + totalCacheCreationTokens + totalCacheReadTokens + totalOutputTokens;
      const msgEquivalent = totalTokens / 50000;
      const dailyPercent = (msgEquivalent / 250) * 100;
      subscriptionImpact[provider] = { dailyPercent };
      breakdown.subscriptionQuotaPercent = dailyPercent;
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
      lines.push(`  ${providerName}/${modelId.padEnd(25)} ${String(mm.taskCount).padStart(3)} task (${billing})`);
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
      const pct = pp.subscriptionQuotaPercent?.toFixed(1) ?? '0.0';
      lines.push(`  ${providerName.padEnd(20)} $0 (subscription, ~${pct}% daily quota)`);
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
      lines.push(`  ${prov} daily: ${impact.dailyPercent.toFixed(1)}%`);
    }
  }

  lines.push(`\nBudget check:`);
  lines.push(`  Sprint budget:       $${est.budgetUsd.toFixed(2)} (config: cost_limits.sprint_max_usd)`);
  lines.push(`  Used:                ${est.percentOfBudget.toFixed(1)}%`);
  const statusIcon = est.withinBudget ? '✅' : '❌';
  lines.push(`  Status:              ${statusIcon} ${est.withinBudget ? 'Within budget' : 'EXCEEDS BUDGET'}`);

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
