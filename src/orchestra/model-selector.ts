// ─── Model Selection Logic ─────────────────────────────────────────
// Extracted from brain.ts — score-based and layered model selection
import type { TaskScope, ModelType, ResolvedConfig, UsageMetrics, PatternEntry } from '../core/types.js';

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
 *   2. Usage pressure: 80%+ usage downgrades opus to sonnet
 *   3. Task type filter: doc/test-only scope caps at sonnet
 *   4. Score system: inferModelFromDirective as base
 *   5. Pattern-based upgrade and skill model preferences
 * @param title - Task title text
 * @param description - Task description text
 * @param scope - Task scope defining directories and files
 * @param config - Resolved project configuration
 * @param usage - Current usage metrics (percentage-based)
 * @param patterns - Optional pattern entries for model upgrade suggestions
 * @param forceModel - Optional user override that bypasses all auto-selection
 * @param skillModels - Optional model preferences from assigned skills
 * @returns The final resolved model type
 */
export function resolveTaskModel(
  title: string,
  description: string,
  scope: TaskScope,
  config: ResolvedConfig,
  usage: UsageMetrics,
  patterns?: PatternEntry[],
  forceModel?: ModelType,
  skillModels?: ModelType[],
): ModelType {
  // Layer 0: user override from DIRECTIVES.md — bypasses all auto-selection
  if (forceModel) return forceModel;

  // Layer 4: base model from score system
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
    const modelRank: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2 };
    const highest = skillModels.reduce<ModelType>((best, m) => (modelRank[m] ?? 0) > (modelRank[best] ?? 0) ? m : best, model);
    if ((modelRank[highest] ?? 0) > (modelRank[model] ?? 0)) model = highest;
  }

  // Layer 3: task type filter — docs or test-only → cap at sonnet
  const isDocScope = scope.directories.length > 0 && scope.directories.every(d =>
    d === 'docs' || d.startsWith('docs/') ||
    d === 'tmp-test' || d.startsWith('tmp-test/') ||
    d === 'scripts' || d.startsWith('scripts/'),
  );
  const isTestOnly = scope.filesWrite.length > 0 &&
    scope.filesWrite.every(f => f.includes('.test.') || f.includes('.spec.'));

  if (isDocScope || isTestOnly) {
    if (model === 'opus') model = 'sonnet';
  }

  // Layer 2: usage pressure — 80%+ → downgrade opus to sonnet
  const usageHigh = usage.fiveHourPercent >= 80 || usage.weeklyPercent >= 80;
  if (usageHigh && model === 'opus') {
    model = 'sonnet';
  }

  // Layer 1: plan access filter (highest priority)
  const mode = config.mode;
  const isProPlan = mode === 'pro_plan';
  if (isProPlan && model === 'opus') {
    model = 'sonnet';
  }

  const haikuAllowed = config.activeModeConfig.haiku_allowed;
  if (!haikuAllowed && model === 'haiku') {
    model = 'sonnet';
  }

  return model;
}
