// ─── Mode Presets & Model Strategy ──────────────────────────────────────────
// Tier-based model strategy definitions for each plan mode.
// Replaces hard-coded model names with provider-agnostic tier selection.

import type { ModelTier } from './model-equivalence.js';

// ─── Model Strategy ────────────────────────────────────────────────────────

/**
 * Tier-based model selection strategy for a plan mode.
 * Instead of hard-coding model names (opus, sonnet, haiku), we define
 * tiers that are resolved to concrete models based on the active provider.
 */
export interface ModelStrategy {
  /** Tier for Brain orchestrator */
  brain_tier: ModelTier;
  /** Default tier for worker tasks */
  worker_tier: ModelTier;
  /** Minimum allowed tier (tasks cannot go below this) */
  min_tier: ModelTier;
  /** Maximum allowed tier (tasks cannot exceed this) */
  max_tier: ModelTier;
  /** Auto-upgrade tier when task complexity is high */
  auto_upgrade: boolean;
  /** Auto-downgrade tier for doc/test tasks */
  auto_downgrade: boolean;
}

// ─── Mode Presets ──────────────────────────────────────────────────────────

/**
 * Preset configurations for each plan mode.
 * Each preset defines a model_strategy (tier-based) and max_workers.
 */
export const MODE_PRESETS: Readonly<Record<string, { model_strategy: ModelStrategy; max_workers: number }>> = {
  performance: {
    model_strategy: {
      brain_tier: 'premium',
      worker_tier: 'premium',
      min_tier: 'economy',
      max_tier: 'premium_plus',
      auto_upgrade: true,
      auto_downgrade: false,
    },
    max_workers: 8,
  },
  balanced: {
    model_strategy: {
      brain_tier: 'standard',
      worker_tier: 'premium',
      min_tier: 'economy',
      max_tier: 'premium',
      auto_upgrade: true,
      auto_downgrade: true,
    },
    max_workers: 5,
  },
  economic: {
    model_strategy: {
      brain_tier: 'standard',
      worker_tier: 'standard',
      min_tier: 'economy',
      max_tier: 'standard',
      auto_upgrade: false,
      auto_downgrade: true,
    },
    max_workers: 3,
  },
  api: {
    model_strategy: {
      brain_tier: 'premium',
      worker_tier: 'standard',
      min_tier: 'economy',
      max_tier: 'premium_plus',
      auto_upgrade: true,
      auto_downgrade: true,
    },
    max_workers: 10,
  },
} as const;

// ─── Tier Ordering ─────────────────────────────────────────────────────────

/** Numeric ordering for tier comparison. Higher = more capable. */
export const TIER_ORDER: Readonly<Record<ModelTier, number>> = {
  economy: 0,
  standard: 1,
  premium: 2,
  premium_plus: 3,
} as const;

/**
 * Compare two tiers. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareTiers(a: ModelTier, b: ModelTier): number {
  return TIER_ORDER[a] - TIER_ORDER[b];
}

/**
 * Check if a model tier meets a minimum tier requirement.
 */
export function isAtLeastTier(tier: ModelTier, minTier: ModelTier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[minTier];
}

/**
 * Get the ModelStrategy preset for a given mode name.
 * Returns undefined if the mode has no preset.
 */
export function getModePreset(mode: string): { model_strategy: ModelStrategy; max_workers: number } | undefined {
  return MODE_PRESETS[mode];
}
