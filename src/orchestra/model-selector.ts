// ─── Model Selection Logic ─────────────────────────────────────────
// Extracted from brain.ts — score-based and layered model selection
import type { TaskScope, ModelType, ResolvedConfig, PatternEntry, ProviderName } from '../core/types.js';
import { getModelTier } from '../core/types.js';
import { getEquivalentModel, isModelAvailable } from '../core/model-equivalence.js';
import type { ModelTier } from '../core/model-equivalence.js';
import { getDefaultProviderName } from './sprint-utils.js';

// ─── Tier Helpers ───────────────────────────────────────────────────

/** Numeric tier rank for comparison: economy=0, standard=1, premium=2, premium_plus=3 */
const TIER_RANK: Record<ModelTier, number> = {
  economy: 0,
  standard: 1,
  premium: 2,
  premium_plus: 3,
};

/** Claude model for each tier — used as canonical reference for cross-provider mapping */
const TIER_CLAUDE_MODEL: Record<string, ModelType> = {
  economy: 'haiku',
  standard: 'sonnet',
  premium: 'opus',
  premium_plus: 'opus', // Falls back to premium until premium_plus models are added
};

/**
 * Resolve a tier name to a concrete model for the configured provider.
 * Uses config's worker_provider (fallback: brain_provider, then 'claude').
 * Maps the tier to its Claude reference model, then converts to target provider via equivalence.
 */
function resolveTierToModel(tier: ModelTier, config: ResolvedConfig): ModelType {
  // Sprint 202 Task 202-003: resolve via registry default before the absolute
  // 'claude' floor so pure-Ollama configs don't silently map tiers through the
  // Claude reference model when Claude isn't registered.
  const provider: ProviderName =
    config.worker_provider
    ?? config.brain_provider
    ?? getDefaultProviderName();
  const claudeModel: ModelType = TIER_CLAUDE_MODEL[tier] ?? 'sonnet';
  if (provider === 'claude') return claudeModel;
  return getEquivalentModel(claudeModel, provider);
}

/**
 * Calculate a numeric complexity score for a task based on its title, description, and scope.
 * Higher scores indicate more complex tasks that benefit from stronger models.
 * Scoring factors: cross-module scope (+3), architectural keywords (+2), file count (+1..+3),
 * doc/config-only scope (-2), single directory (-1), test-only (-1).
 * @param title - Task title text
 * @param description - Task description text
 * @param scope - Task scope defining directories and files
 * @returns Numeric score; higher = more complex
 */
export function calculateModelScore(title: string, description: string, scope: TaskScope): number {
  const text = `${title}\n${description}`.toLowerCase();
  let score = 0;

  // ─── Cross-module scope: +3 (2+ directories)
  if (scope.directories.length >= 2) {
    score += 3;
  }

  // ─── Architectural keywords: +2
  const architectPatterns = /\b(mimari|architect|refactor|redesign|migrate|breaking|cross.?cutting|orchestrat)\b/;
  if (architectPatterns.test(text)) {
    score += 2;
  }

  // ─── File count: filesWrite.length
  const fileWriteCount = scope.filesWrite.length;
  if (fileWriteCount > 15) {
    score += 3;
  } else if (fileWriteCount > 10) {
    score += 2;
  } else if (fileWriteCount > 5) {
    score += 1;
  }

  // ─── docs/ or config scope: -2 (all directories are docs or config)
  const isAllDocOrConfig = scope.directories.every(d =>
    d === 'docs' || d.startsWith('docs/') ||
    d === 'config' || d.startsWith('config/')
  );
  if (isAllDocOrConfig) {
    score -= 2;
  }

  // ─── Single directory scope: -1
  if (scope.directories.length === 1) {
    score -= 1;
  }

  // ─── Test-only task: -1
  const isTestOnly = /\btest\b|\b(unit|integration|e2e)\b/i.test(text) &&
    scope.filesWrite.every(f => f.includes('.test.') || f.includes('.spec.'));
  if (isTestOnly) {
    score -= 1;
  }

  return score;
}

/**
 * Infer the appropriate tier based on task complexity score.
 * Score >= 4 → premium, score <= -1 → economy, otherwise standard.
 * Internal helper used by both inferModelFromDirective and resolveTaskModel.
 */
function inferTierFromScore(title: string, description: string, scope: TaskScope): ModelTier {
  const score = calculateModelScore(title, description, scope);

  if (score >= 4) return 'premium';
  if (score <= -1) return 'economy';
  return 'standard';
}

/**
 * Infer the appropriate AI model based on task complexity score.
 * Score >= 4 maps to premium tier, score <= -1 maps to economy tier, otherwise standard.
 * Returns Claude-centric model names for backward compatibility.
 * @param title - Task title text
 * @param description - Task description text
 * @param scope - Task scope defining directories and files
 * @returns The recommended model type (Claude-centric: opus/sonnet/haiku)
 */
export function inferModelFromDirective(title: string, description: string, scope: TaskScope): ModelType {
  const tier = inferTierFromScore(title, description, scope);
  // Return Claude-centric defaults for backward compat (no config available here)
  return TIER_CLAUDE_MODEL[tier] ?? 'sonnet';
}

// ─── Pattern Utilities ──────────────────────────────────────────────

/** Parse a JSON string into PatternEntry[]. Returns [] on invalid input. */
export function parsePatterns(raw: string): PatternEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PatternEntry[];
  } catch {
    return [];
  }
}

/** Deduplicate pattern entries by name, keeping the one with highest occurrences. */
export function deduplicatePatterns(patterns: PatternEntry[]): PatternEntry[] {
  const map = new Map<string, PatternEntry>();
  for (const p of patterns) {
    const existing = map.get(p.pattern);
    if (!existing || p.occurrences > existing.occurrences) {
      map.set(p.pattern, p);
    }
  }
  return [...map.values()];
}

/**
 * Suggest a tier upgrade based on detected patterns.
 * Returns 'premium' if patterns indicate boundary violations or circular deps in src/tests scope.
 * Returns null otherwise. Internal helper for resolveTaskModel.
 */
function suggestTierFromPatterns(scope: TaskScope, patterns: PatternEntry[]): ModelTier | null {
  // Only upgrade for src/ or tests/ scopes
  const hasSrcOrTest = scope.directories.some(d =>
    d.startsWith('src/') || d.startsWith('tests/') || d === 'src' || d === 'tests',
  );
  if (!hasSrcOrTest) return null;

  for (const p of patterns) {
    if (p.resolved) continue;
    if (p.pattern === 'file_outside_scope' && p.occurrences >= 2) return 'premium';
    if (p.pattern === 'circular_dependency' && p.occurrences >= 1) return 'premium';
  }
  return null;
}

/**
 * Suggest model upgrade based on detected patterns.
 * Returns 'opus' if patterns indicate boundary violations or circular deps in src/tests scope.
 * Returns null otherwise.
 * Returns Claude-centric model names for backward compatibility.
 */
export function suggestModelFromPatterns(scope: TaskScope, patterns: PatternEntry[]): ModelType | null {
  const tier = suggestTierFromPatterns(scope, patterns);
  if (!tier) return null;
  // Return Claude-centric default for backward compat (no config available here)
  return TIER_CLAUDE_MODEL[tier] ?? 'opus';
}

/**
 * Top-level model selector that applies layered filtering rules.
 * Layer order (highest priority first):
 *   1. Plan access filter: pro_plan disallows opus; haiku_allowed=false disallows haiku
 *   2. Task type filter: doc/test-only scope caps at sonnet
 *   3. Score system: inferModelFromDirective as base
 *   4. Pattern-based upgrade and skill model preferences
 *   5. Provider mapping: map final model to target provider via tier equivalence
 * @param title - Task title text
 * @param description - Task description text
 * @param scope - Task scope defining directories and files
 * @param config - Resolved project configuration
 * @param patterns - Optional pattern entries for model upgrade suggestions
 * @param forceModel - Optional user override that bypasses all auto-selection
 * @param skillModels - Optional model preferences from assigned skills
 * @param provider - Optional target provider; defaults to 'claude' for backward compat
 * @returns The final resolved model type for the target provider
 */
export function resolveTaskModel(
  title: string,
  description: string,
  scope: TaskScope,
  config: ResolvedConfig,
  patterns?: PatternEntry[],
  forceModel?: ModelType,
  skillModels?: ModelType[],
  provider?: ProviderName,
): ModelType {
  // Sprint 202 Task 202-003: registry default before the absolute 'claude' floor.
  const targetProvider: ProviderName = provider ?? getDefaultProviderName();

  // Layer 0: user override from DIRECTIVES.md — bypasses all auto-selection
  if (forceModel) {
    // Validate forceModel against target provider; if mismatch, map to equivalent
    if (!isModelAvailable(forceModel, targetProvider)) {
      return getEquivalentModel(forceModel, targetProvider);
    }
    return forceModel;
  }

  // Layer 4: base tier from score system (provider-agnostic)
  let currentTier: ModelTier = inferTierFromScore(title, description, scope);

  // Layer 4b: pattern-based tier upgrade
  if (patterns && patterns.length > 0) {
    const suggestedTier = suggestTierFromPatterns(scope, patterns);
    if (suggestedTier && TIER_RANK[suggestedTier] > TIER_RANK[currentTier]) {
      currentTier = suggestedTier;
    }
  }

  // Layer 4d: skill model preference (highest tier among skills wins)
  if (skillModels && skillModels.length > 0) {
    const highest = skillModels.reduce<ModelType>((best, m) => getModelTier(m) > getModelTier(best) ? m : best,
      resolveTierToModel(currentTier, config));
    if (getModelTier(highest) > TIER_RANK[currentTier]) {
      // Upgrade currentTier to match the skill's tier
      const skillTierNum = getModelTier(highest);
      currentTier = skillTierNum >= 2 ? 'premium' : skillTierNum >= 1 ? 'standard' : 'economy';
    }
  }

  // Layer 2: task type filter — docs or test-only → cap at standard tier
  const isDocScope = scope.directories.length > 0 && scope.directories.every(d =>
    d === 'docs' || d.startsWith('docs/') ||
    d === 'tmp-test' || d.startsWith('tmp-test/') ||
    d === 'scripts' || d.startsWith('scripts/'),
  );
  const isTestOnly = scope.filesWrite.length > 0 &&
    scope.filesWrite.every(f => f.includes('.test.') || f.includes('.spec.'));

  if (isDocScope || isTestOnly) {
    if (TIER_RANK[currentTier] >= TIER_RANK.premium) {
      currentTier = 'standard';
    }
  }

  // Layer 1: plan access filter (highest priority)
  const mode = config.mode;
  const isRestrictedPlan = mode === 'economic' || mode === 'pro_plan';
  if (isRestrictedPlan && TIER_RANK[currentTier] >= TIER_RANK.premium) {
    currentTier = 'standard';
  }

  // Layer 1b: minimum tier enforcement (haiku_allowed backward compat)
  const minTier: ModelTier = config.activeModeConfig.haiku_allowed === false ? 'standard' : 'economy';
  if (TIER_RANK[currentTier] < TIER_RANK[minTier]) {
    currentTier = minTier;
  }

  // Resolve tier to concrete model for target provider
  const model: ModelType = resolveTierToModel(currentTier, { ...config, worker_provider: targetProvider === 'claude' ? config.worker_provider : targetProvider } as ResolvedConfig);

  // Layer 5: provider mapping — ensure final model belongs to target provider
  if (targetProvider !== 'claude' && !isModelAvailable(model, targetProvider)) {
    return getEquivalentModel(model, targetProvider);
  }

  return model;
}
