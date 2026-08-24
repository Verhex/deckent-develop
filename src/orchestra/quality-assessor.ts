// ─── Quality Assessor ───────────────────────────────────────────────────────
// Multi-dimensional quality scoring beyond GO/NO_GO.
// Feeds into the learning engine for better routing decisions.

import type { Task, TaskResult } from '../core/task-types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QualityScore {
  overall: number; // 0-100
  dimensions: {
    correctness: number;    // 0-100: tests pass, no tsc errors
    coverage: number;       // 0-100: test coverage percentage
    scopeAdherence: number; // 0-100: stayed within scope boundaries
    completeness: number;   // 0-100: all acceptance criteria met
  };
  skillRelevance: Map<string, number>; // skillId → 0-1 relevance score
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Sprint 180 W4-1: Coverage "escape hatch" — doc-only scopes and pure
 * audit/review agents cannot produce real test coverage, so the Quality
 * Scorer must not treat their `coverage=0/null` reports as a defect.
 *
 * @see assessQuality — applies a 90/100 overall ceiling when this returns true
 * @see Sprint 179 retrospective — 9 doc/audit tasks were demoted to TECH_DEBT
 *      solely because vitest never ran on a non-source scope.
 */
const COVERAGE_ESCAPE_AGENTS = new Set([
  'doc-writer',
  'security-auditor',
  'accessibility-auditor',
  'code-reviewer',
  'architect',
  'architecture-planner',
]);

const COVERAGE_ESCAPE_SOURCE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];
const COVERAGE_ESCAPE_SOURCE_EXACT = new Set(['src', 'tests', 'lib']);

function isSourceScopeDir(dir: string): boolean {
  if (COVERAGE_ESCAPE_SOURCE_EXACT.has(dir)) return true;
  return COVERAGE_ESCAPE_SOURCE_PREFIXES.some(p => dir.startsWith(p));
}

/**
 * Returns true when a task cannot reasonably produce coverage data — either
 * its scope omits source/test directories entirely (pure docs/config) or it
 * is routed to an audit/review agent whose deliverable is not executable code.
 *
 * Workers running under this regime are allowed to record `coverage: null` (or
 * `0`) in their `.result` without triggering the Sprint 179 demotion path.
 */
export function isCoverageEscapeHatchTask(task: Task): boolean {
  if (task.assignedAgent && COVERAGE_ESCAPE_AGENTS.has(task.assignedAgent)) {
    return true;
  }
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceScopeDir(d));
}

/** Overall-score ceiling applied when coverage is unmeasured but excused. */
export const COVERAGE_UNMEASURED_OVERALL_CEILING = 90;
/** Partial-credit coverage dimension for excused (escape-hatch) unmeasured runs. */
export const COVERAGE_UNMEASURED_PARTIAL_CREDIT = 70;

/**
 * Assess multi-dimensional quality of a task result.
 */
export function assessQuality(
  task: Task,
  result: TaskResult,
  evaluation: string, // 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'
): QualityScore {
  const isEscape = isCoverageEscapeHatchTask(task);
  const correctness = assessCorrectness(result, evaluation);
  const coverage = assessCoverage(result, isEscape);
  const scopeAdherence = assessScopeAdherence(task, result);
  const completeness = assessCompleteness(evaluation);

  let overall = Math.round(
    correctness * 0.35 +
    coverage * 0.25 +
    scopeAdherence * 0.2 +
    completeness * 0.2,
  );

  // Sprint 180 W4-1: When coverage is unmeasured under the escape hatch, cap
  // the overall score so we never claim full confidence without real data.
  // For non-NO_GO evaluations this also lifts the dimension above the Sprint
  // 179 ~75 demotion threshold.
  if (isEscape && !isCoverageMeasured(result) && evaluation !== 'NO_GO') {
    overall = Math.min(COVERAGE_UNMEASURED_OVERALL_CEILING, overall);
  }

  const skillRelevance = assessSkillRelevance(task, result);

  return {
    overall,
    dimensions: { correctness, coverage, scopeAdherence, completeness },
    skillRelevance,
  };
}

// ─── Dimension Assessors ────────────────────────────────────────────────────

function assessCorrectness(result: TaskResult, evaluation: string): number {
  if (evaluation === 'NO_GO') return 0;
  if (!result.testsPassed) return 20;
  if (evaluation === 'GO_WITH_TECH_DEBT') return 70;
  return 100;
}

function isCoverageMeasured(result: TaskResult): boolean {
  const cov = result.coverage;
  return typeof cov === 'number' && Number.isFinite(cov) && cov > 0;
}

function assessCoverage(result: TaskResult, isEscape = false): number {
  if (!isCoverageMeasured(result)) {
    return isEscape ? COVERAGE_UNMEASURED_PARTIAL_CREDIT : 0;
  }
  const cov = result.coverage as number;
  return Math.min(100, Math.round(cov));
}

/**
 * Auxiliary directory prefixes — files here get partial credit (80/100)
 * instead of 0 when outside the declared task scope.
 * Sprint 151 D-5: Mirrors AUXILIARY_DIR_PREFIXES in result-evaluator.ts.
 */
const QA_AUXILIARY_PREFIXES = ['docs/', '.deckent/', '.tasks/', '.brain/', 'CHANGELOG', 'README'];

function assessScopeAdherence(task: Task, result: TaskResult): number {
  if (!result.filesChanged || result.filesChanged.length === 0) return 100;

  const allowedDirs = task.scope.directories;
  const allowedFiles = task.scope.filesWrite;

  let inScope = 0;
  let auxiliary = 0;
  for (const entry of result.filesChanged) {
    // Canonical TaskResultV1 carries FileChange OBJECTS; legacy results carried
    // plain strings. Both shapes reach evaluation — treating the object as a
    // string killed EVALUATE for the whole run (live sprint-664:
    // "file.startsWith is not a function", 0/5 evaluations).
    const file = typeof entry === 'string'
      ? entry
      : String((entry as { path?: unknown })?.path ?? '');
    if (file.length === 0) continue;
    const isAllowed =
      allowedFiles.includes(file) ||
      allowedDirs.some(d => file.startsWith(d)) ||
      file.startsWith('.tasks/'); // heartbeat/result files always allowed
    if (isAllowed) {
      inScope++;
    } else if (QA_AUXILIARY_PREFIXES.some(p => file.startsWith(p))) {
      auxiliary++;
    }
  }

  // D-5: Auxiliary files get 80 points instead of 0
  const total = inScope * 100 + auxiliary * 80;
  const max = result.filesChanged.length * 100;
  return max > 0 ? Math.round((total / max) * 100) : 100;
}

function assessCompleteness(evaluation: string): number {
  switch (evaluation) {
    case 'DONE': return 100;
    case 'GO_WITH_TECH_DEBT': return 75;
    case 'NO_GO': return 0;
    default: return 50;
  }
}

// ─── Skill Relevance ────────────────────────────────────────────────────────

/**
 * Assess how relevant each assigned skill was to the task outcome.
 * Returns a map of skillId → relevance (0-1).
 */
export function assessSkillRelevance(
  task: Task,
  result: TaskResult,
): Map<string, number> {
  const relevance = new Map<string, number>();
  const assignedSkills = task.assignedSkills ?? [];

  if (assignedSkills.length === 0) return relevance;

  // Basic heuristic: if the task succeeded with these skills, they were somewhat relevant.
  // More sophisticated analysis would check if skill content was actually used.
  const baseRelevance = result.selfAssessment === 'NO_GO' ? 0.2 :
                        result.selfAssessment === 'GO_WITH_TECH_DEBT' ? 0.6 : 0.8;

  for (const skillId of assignedSkills) {
    // Boost relevance if skill domain matches task domain
    let score = baseRelevance;

    // Language skills in same-language projects are always relevant
    if (skillId.includes('typescript') && task.scope.filesWrite.some(f => f.endsWith('.ts'))) {
      score = Math.min(1, score + 0.15);
    }

    // Testing skills for tasks that wrote tests
    if (skillId.includes('testing') && result.filesChanged?.some(f => f.includes('.test.'))) {
      score = Math.min(1, score + 0.15);
    }

    relevance.set(skillId, Math.round(score * 100) / 100);
  }

  return relevance;
}
