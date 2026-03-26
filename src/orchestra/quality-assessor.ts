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
 * Assess multi-dimensional quality of a task result.
 */
export function assessQuality(
  task: Task,
  result: TaskResult,
  evaluation: string, // 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'
): QualityScore {
  const correctness = assessCorrectness(result, evaluation);
  const coverage = assessCoverage(result);
  const scopeAdherence = assessScopeAdherence(task, result);
  const completeness = assessCompleteness(evaluation);

  const overall = Math.round(
    correctness * 0.35 +
    coverage * 0.25 +
    scopeAdherence * 0.2 +
    completeness * 0.2,
  );

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

function assessCoverage(result: TaskResult): number {
  const cov = result.coverage ?? 0;
  return Math.min(100, Math.round(cov));
}

function assessScopeAdherence(task: Task, result: TaskResult): number {
  if (!result.filesChanged || result.filesChanged.length === 0) return 100;

  const allowedDirs = task.scope.directories;
  const allowedFiles = task.scope.filesWrite;

  let inScope = 0;
  for (const file of result.filesChanged) {
    const isAllowed =
      allowedFiles.includes(file) ||
      allowedDirs.some(d => file.startsWith(d)) ||
      file.startsWith('.tasks/'); // heartbeat/result files always allowed
    if (isAllowed) inScope++;
  }

  return result.filesChanged.length > 0
    ? Math.round((inScope / result.filesChanged.length) * 100)
    : 100;
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
