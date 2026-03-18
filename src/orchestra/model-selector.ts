// ─── Model Selection Logic ─────────────────────────────────────────
// Extracted from brain.ts — score-based and layered model selection
import type { TaskScope, ModelType, ResolvedConfig, UsageMetrics } from '../core/types.js';

// 4c1. calculateModelScore — score-based heuristic for model selection
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

// 4c. inferModelFromDirective — score-based model selection for structured mode
export function inferModelFromDirective(title: string, description: string, scope: TaskScope): ModelType {
  const score = calculateModelScore(title, description, scope);

  if (score >= 4) return 'opus';
  if (score <= -1) return 'haiku';
  return 'sonnet';
}

// 4c2. resolveTaskModel — layered model selection (top-level selector)
// Layer order (highest priority first):
//   1. Plan access filter: pro_plan → no opus; haiku_allowed=false → no haiku
//   2. Usage pressure: 80%+ → downgrade opus to sonnet
//   3. Task type filter: docs/test-only scope → max sonnet
//   4. Score system: inferModelFromDirective as base
export function resolveTaskModel(
  title: string,
  description: string,
  scope: TaskScope,
  config: ResolvedConfig,
  usage: UsageMetrics,
): ModelType {
  // Layer 4: base model from score system
  let model: ModelType = inferModelFromDirective(title, description, scope);

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
