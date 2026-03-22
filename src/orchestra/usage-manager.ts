// ═══ Usage Manager — Usage/Quota Logic ═══════════════════════════════
// Extracted from brain.ts. Handles usage checking, provider-based
// usage queries, and sprint size adjustment based on quota thresholds.
// Extended with multi-provider quota tracking and balancing.

import { spawnSync } from 'node:child_process';

import type {
  ResolvedConfig,
  DeckentConfig,
  UsageMetrics,
  SystemProfile,
  SprintSizeRecommendation,
} from '../core/types.js';

import type { ProviderName } from '../core/task-types.js';
import type { ModelTier } from '../core/model-equivalence.js';

import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

import { getSystemProfile } from '../core/system-profile.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/** Resolve max_workers to a number, handling 'auto' */
function resolveMaxWorkersNumeric(config: ResolvedConfig, systemProfile?: SystemProfile): number {
  const maxWorkers = config.activeModeConfig.max_workers;
  if (maxWorkers === 'auto') {
    const profile = systemProfile ?? getSystemProfile();
    return profile.recommendedMaxWorkers;
  }
  return maxWorkers;
}

/**
 * Check current API usage by invoking the claude CLI synchronously.
 * Parses 5-hour and weekly usage percentages from the output.
 * Returns safe defaults (50% / 30%) if the CLI call fails.
 * @param _config - Resolved config (reserved for future use)
 * @returns Current usage metrics with percentage values
 */
export function checkUsage(_config: ResolvedConfig): UsageMetrics {
  const SAFE_DEFAULT: UsageMetrics = { fiveHourPercent: 50, weeklyPercent: 30, measuredAt: now() };
  try {
    const result = spawnSync('claude', ['-p', '/usage'], { encoding: 'utf-8', timeout: 10_000 });
    if (result.status !== 0 || !result.stdout) return SAFE_DEFAULT;

    const output = result.stdout;
    const fiveHrMatch = output.match(/5[- ]?h(?:r|our(?:ly)?)?[:\s]+(\d+(?:\.\d+)?)\s*%/i)
      ?? output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*5[- ]?h/i);
    const weeklyMatch = output.match(/week(?:ly)?[:\s]+(\d+(?:\.\d+)?)\s*%/i)
      ?? output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*week/i);

    const fiveHourPercent = fiveHrMatch?.[1] ? parseFloat(fiveHrMatch[1]) : SAFE_DEFAULT.fiveHourPercent;
    const weeklyPercent = weeklyMatch?.[1] ? parseFloat(weeklyMatch[1]) : SAFE_DEFAULT.weeklyPercent;
    return { fiveHourPercent, weeklyPercent, measuredAt: now() };
  } catch {
    return SAFE_DEFAULT;
  }
}

// ─── checkUsageWithProvider — async, delegates to ProviderAdapter ────

/**
 * @internal Used only within orchestra/ — provider-based async usage check.
 * External callers should use checkUsage() from brain.js.
 */
export async function checkUsageWithProvider(provider: ProviderAdapter): Promise<UsageMetrics> {
  return provider.checkUsage();
}

// ─── getDefaultProvider — returns the default registered provider ────

/**
 * @internal Used only within orchestra/ — resolves the default ProviderAdapter.
 * Not part of the public API surface.
 */
export function getDefaultProvider(): ProviderAdapter | null {
  try {
    return providerRegistry.getDefault();
  } catch {
    return null;
  }
}

/**
 * Recommend sprint size based on current usage vs configured thresholds.
 * Returns 'minimal' (1 worker) when both thresholds exceeded, 'reduced' (half workers)
 * when one exceeded, or 'full' when usage is within limits.
 * @param config - Resolved project configuration
 * @param usage - Current usage metrics
 * @param systemProfile - Optional system profile for 'auto' worker resolution
 * @returns Sprint size recommendation with worker count and model constraint
 */
export function adjustSprintSize(
  config: ResolvedConfig,
  usage: UsageMetrics,
  systemProfile?: SystemProfile,
): SprintSizeRecommendation {
  const thresholds = config.activeModeConfig.usage_thresholds;
  const fiveHrExceeded = usage.fiveHourPercent / 100 >= thresholds['5hr'];
  const weeklyExceeded = usage.weeklyPercent / 100 >= thresholds.weekly;

  // Resolve numeric max_workers (handles 'auto')
  const baseMaxWorkers = resolveMaxWorkersNumeric(config, systemProfile);

  if (fiveHrExceeded && weeklyExceeded) {
    return {
      size: 'minimal',
      maxWorkers: 1,
      modelConstraint: config.activeModeConfig.haiku_allowed ? 'haiku' : 'sonnet',
      reason: 'Both usage thresholds exceeded',
    };
  }
  if (fiveHrExceeded || weeklyExceeded) {
    return {
      size: 'reduced',
      maxWorkers: Math.max(1, Math.floor(baseMaxWorkers / 2)),
      modelConstraint: 'sonnet',
      reason: `${fiveHrExceeded ? '5hr' : 'Weekly'} usage threshold exceeded`,
    };
  }
  return {
    size: 'full',
    maxWorkers: baseMaxWorkers,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
}

// ─── Provider Usage Metrics (per-provider) ────────────────────────────

/** Per-provider usage metrics with remaining quota info */
export interface ProviderUsageMetrics {
  percent: number;
  remaining?: number;
  provider: ProviderName;
}

/** Threshold above which a provider is considered high-usage (80%) */
const HIGH_USAGE_THRESHOLD = 80;

/** Safe default usage when a provider check fails */
const SAFE_DEFAULT_PERCENT = 50;

// ─── Multi-Provider Usage Tracking ────────────────────────────────────

/**
 * Extract unique configured provider names from DeckentConfig.
 * Includes brain_provider, worker_provider, and fallback_provider.
 * Defaults to ['claude'] if no providers are configured.
 */
export function getConfiguredProviders(fullConfig: DeckentConfig): ProviderName[] {
  const providers = new Set<ProviderName>();
  if (fullConfig.brain_provider) providers.add(fullConfig.brain_provider);
  if (fullConfig.worker_provider) providers.add(fullConfig.worker_provider);
  if (fullConfig.fallback_provider) providers.add(fullConfig.fallback_provider);
  // Default: at least claude
  if (providers.size === 0) providers.add('claude');
  return Array.from(providers);
}

/**
 * Check usage for all configured providers.
 * For each provider, attempts to get usage via its registered ProviderAdapter.
 * Falls back to safe defaults (50%) if the provider is not registered or check fails.
 *
 * @param _projectRoot - Project root path (reserved for future file-based caching)
 * @param fullConfig - Full DeckentConfig with provider fields
 * @returns Map of provider name to ProviderUsageMetrics
 */
export async function checkAllProviderUsage(
  _projectRoot: string,
  fullConfig: DeckentConfig,
): Promise<Map<ProviderName, ProviderUsageMetrics>> {
  const providers = getConfiguredProviders(fullConfig);
  const result = new Map<ProviderName, ProviderUsageMetrics>();

  for (const providerName of providers) {
    try {
      if (providerRegistry.hasProvider(providerName)) {
        const adapter = providerRegistry.getProvider(providerName);
        const usage = await adapter.checkUsage();
        // Use the higher of 5hr/weekly as the overall percent
        const percent = Math.max(usage.fiveHourPercent, usage.weeklyPercent);
        result.set(providerName, { percent, provider: providerName });
      } else {
        // No adapter registered — safe default
        result.set(providerName, { percent: SAFE_DEFAULT_PERCENT, provider: providerName });
      }
    } catch {
      result.set(providerName, { percent: SAFE_DEFAULT_PERCENT, provider: providerName });
    }
  }

  return result;
}

/**
 * Select the optimal provider for a given task tier based on quota availability.
 * Picks the provider with the lowest current usage (most remaining quota).
 * Only considers providers that have models for the requested tier.
 *
 * @param taskTier - The model tier required for the task ('premium' | 'standard' | 'economy')
 * @param providerUsage - Current usage map from checkAllProviderUsage
 * @returns The provider name with the most remaining quota, or 'claude' as fallback
 */
export function selectOptimalProvider(
  taskTier: ModelTier,
  providerUsage: Map<ProviderName, ProviderUsageMetrics>,
): ProviderName {
  // Map of tier to providers that support it
  const TIER_PROVIDERS: Record<ModelTier, ProviderName[]> = {
    premium: ['claude', 'codex', 'gemini'],
    standard: ['claude', 'codex', 'gemini'],
    economy: ['claude', 'codex'], // gemini has no economy tier
  };

  const eligibleProviders = TIER_PROVIDERS[taskTier];
  let bestProvider: ProviderName = 'claude';
  let lowestUsage = Infinity;

  for (const [provider, metrics] of providerUsage) {
    if (!eligibleProviders.includes(provider)) continue;
    if (metrics.percent < lowestUsage) {
      lowestUsage = metrics.percent;
      bestProvider = provider;
    }
  }

  return bestProvider;
}

/**
 * Check if the primary provider has high usage and suggest a fallback.
 * Returns the fallback provider name if the primary is above 80% usage,
 * or null if no switch is needed.
 *
 * @param primaryProvider - The current primary provider name
 * @param providerUsage - Current usage map from checkAllProviderUsage
 * @param fallbackProvider - Configured fallback provider (optional)
 * @returns Fallback provider name if switch is recommended, null otherwise
 */
export function suggestFallbackProvider(
  primaryProvider: ProviderName,
  providerUsage: Map<ProviderName, ProviderUsageMetrics>,
  fallbackProvider?: ProviderName,
): ProviderName | null {
  const primaryUsage = providerUsage.get(primaryProvider);
  if (!primaryUsage || primaryUsage.percent <= HIGH_USAGE_THRESHOLD) {
    return null;
  }

  // Primary is above threshold — check fallback
  if (fallbackProvider) {
    const fallbackUsage = providerUsage.get(fallbackProvider);
    // Suggest fallback if it has lower usage than the primary
    if (fallbackUsage && fallbackUsage.percent < primaryUsage.percent) {
      return fallbackProvider;
    }
  }

  // No explicit fallback or fallback is also high — find lowest usage provider
  let bestProvider: ProviderName | null = null;
  let lowestUsage = primaryUsage.percent;

  for (const [provider, metrics] of providerUsage) {
    if (provider === primaryProvider) continue;
    if (metrics.percent < lowestUsage) {
      lowestUsage = metrics.percent;
      bestProvider = provider;
    }
  }

  return bestProvider;
}

/**
 * Enhanced adjustSprintSize that considers multi-provider usage.
 * When all configured providers have high usage, reduces sprint size more aggressively.
 * Falls back to standard adjustSprintSize for single-provider setups.
 *
 * @param config - Resolved project configuration
 * @param providerUsage - Per-provider usage metrics
 * @param systemProfile - Optional system profile for 'auto' worker resolution
 * @returns Sprint size recommendation
 */
export function adjustSprintSizeMultiProvider(
  config: ResolvedConfig,
  providerUsage: Map<ProviderName, ProviderUsageMetrics>,
  systemProfile?: SystemProfile,
): SprintSizeRecommendation {
  // If only one provider or empty map, delegate to primary provider usage
  if (providerUsage.size <= 1) {
    const entry = providerUsage.values().next();
    const percent = entry.done ? SAFE_DEFAULT_PERCENT : entry.value.percent;
    const usage: UsageMetrics = {
      fiveHourPercent: percent,
      weeklyPercent: percent,
      measuredAt: now(),
    };
    return adjustSprintSize(config, usage, systemProfile);
  }

  // Check how many providers are above threshold
  let highUsageCount = 0;
  let lowestPercent = Infinity;
  for (const metrics of providerUsage.values()) {
    if (metrics.percent >= HIGH_USAGE_THRESHOLD) {
      highUsageCount++;
    }
    if (metrics.percent < lowestPercent) {
      lowestPercent = metrics.percent;
    }
  }

  const allHigh = highUsageCount === providerUsage.size;

  if (allHigh) {
    // All providers are high — minimal sprint
    return {
      size: 'minimal',
      maxWorkers: 1,
      modelConstraint: config.activeModeConfig.haiku_allowed ? 'haiku' : 'sonnet',
      reason: 'All providers above usage threshold',
    };
  }

  // At least one provider has available quota — use the best one's usage
  const usage: UsageMetrics = {
    fiveHourPercent: lowestPercent,
    weeklyPercent: lowestPercent,
    measuredAt: now(),
  };
  return adjustSprintSize(config, usage, systemProfile);
}
