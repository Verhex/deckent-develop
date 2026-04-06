// ─── Model Selection Logic ─────────────────────────────────────────
// Extracted from brain.ts — score-based and layered model selection
import type { TaskScope, ModelType, ResolvedConfig, PatternEntry, ProviderName } from '../core/types.js';
import { getModelTier } from '../core/types.js';
import { getEquivalentModel, isModelAvailable } from '../core/model-equivalence.js';

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
 * Infer the appropriate AI model based on task complexity score.
 * Score >= 4 maps to opus, score <= -1 maps to haiku, otherwise sonnet.
 * @param title - Task title text
 * @param description - Task description text
 * @param scope - Task scope defining directories and files
 * @returns The recommended model type
 */
export function inferModelFromDirective(title: string, description: string, scope: TaskScope): ModelType {
  const score = calculateModelScore(title, description, scope);

  if (score >= 4) return 'opus';
  if (score <= -1) return 'haiku';
  return 'sonnet';
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
 * Suggest model upgrade based on detected patterns.
 * Returns 'opus' if patterns indicate boundary violations or circular deps in src/tests scope.
 * Returns null otherwise.
 */
export function suggestModelFromPatterns(scope: TaskScope, patterns: PatternEntry[]): ModelType | null {
  // Only upgrade for src/ or tests/ scopes
  const hasSrcOrTest = scope.directories.some(d =>
    d.startsWith('src/') || d.startsWith('tests/') || d === 'src' || d === 'tests',
  );
  if (!hasSrcOrTest) return null;

  for (const p of patterns) {
    if (p.resolved) continue;
    if (p.pattern === 'file_outside_scope' && p.occurrences >= 2) return 'opus';
    if (p.pattern === 'circular_dependency' && p.occurrences >= 1) return 'opus';
  }
  return null;
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
  const targetProvider: ProviderName = provider ?? 'claude';

  // Layer 0: user override from DIRECTIVES.md — bypasses all auto-selection
  if (forceModel) {
    // Validate forceModel against target provider; if mismatch, map to equivalent
    if (!isModelAvailable(forceModel, targetProvider)) {
      return getEquivalentModel(forceModel, targetProvider);
    }
    return forceModel;
  }

  // Layer 4: base model from score system (always Claude-centric internally)
  let model: ModelType = inferModelFromDirective(title, description, scope);

  // Layer 4b: pattern-based upgrade
  if (patterns && patterns.length > 0) {
    const suggestion = suggestModelFromPatterns(scope, patterns);
    if (suggestion === 'opus') {
      model = 'opus';
    }
  }

  // Layer 4d: skill model preference (highest model among skills wins)
  if (skillModels && skillModels.length > 0) {
    const highest = skillModels.reduce<ModelType>((best, m) => getModelTier(m) > getModelTier(best) ? m : best, model);
    if (getModelTier(highest) > getModelTier(model)) model = highest;
  }

  // Layer 2: task type filter — docs or test-only → cap at sonnet
  const isDocScope = scope.directories.length > 0 && scope.directories.every(d =>
    d === 'docs' || d.startsWith('docs/') ||
    d === 'tmp-test' || d.startsWith('tmp-test/') ||
    d === 'scripts' || d.startsWith('scripts/'),
  );
  const isTestOnly = scope.filesWrite.length > 0 &&
    scope.filesWrite.every(f => f.includes('.test.') || f.includes('.spec.'));

  if (isDocScope || isTestOnly) {
    // Downgrade tier-2 models to tier-1 equivalent for doc/test scope
    if (getModelTier(model) >= 2) model = 'sonnet';
  }

  // Layer 1: plan access filter (highest priority)
  const mode = config.mode;
  const isProPlan = mode === 'economic' || mode === 'pro_plan';
  if (isProPlan && getModelTier(model) >= 2) {
    model = 'sonnet';
  }

  const haikuAllowed = config.activeModeConfig.haiku_allowed;
  if (!haikuAllowed && getModelTier(model) === 0) {
    model = 'sonnet';
  }

  // Layer 5: provider mapping — convert Claude model to target provider equivalent
  if (targetProvider !== 'claude') {
    model = getEquivalentModel(model, targetProvider);
  }

  return model;
}
