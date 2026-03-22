// ═══ Usage Manager — Usage/Quota Logic ═══════════════════════════════
// Extracted from brain.ts. Handles usage checking, provider-based
// usage queries, and sprint size adjustment based on quota thresholds.

import { spawnSync } from 'node:child_process';

import type {
  ResolvedConfig,
  UsageMetrics,
  SystemProfile,
  SprintSizeRecommendation,
} from '../core/types.js';

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

// ─── checkUsage — real integration (synchronous, direct claude CLI) ──

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

// ─── adjustSprintSize (pure) ────────────────────────────────────────

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
