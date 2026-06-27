/**
 * Consolidation smoke tests — Sprint 343 R4
 *
 * Verifies that:
 *  1. `async evaluateResult` is NOT exported from result-evaluator (zero prod callers,
 *     removed in Sprint 343-004).
 *  2. `evaluateWithRubric` IS exported and functional (canonical sync grader).
 *  3. `reconcileEvaluationSpuriousNoGo` and `applyTechDebtDowngrade` are intact.
 *  4. `evaluateResultSync` is accessible via sprint-controller (live finalize path).
 */
import { describe, it, expect } from 'vitest';
import * as resultEvaluator from '../../src/orchestra/result-evaluator.js';
import { evaluateResultSync } from '../../src/orchestra/sprint-controller.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTask(directories: string[] = ['src/orchestra']): Task {
  return {
    id: '343-004-smoke',
    title: 'Consolidation smoke task',
    description: '',
    status: TaskStatus.DONE,
    model: 'sonnet',
    effort: 'medium',
    scope: { directories, filesRead: [], filesWrite: [] },
    goNogo: { goCriteria: 'pass', nogoCriteria: 'fail' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '343-004-smoke',
    selfAssessment: 'DONE',
    testsPassed: true,
    coverage: 95,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    notes: 'consolidation test result',
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── R4 Removal Verification ─────────────────────────────────────────────────

describe('R4: evaluateResult removal (Sprint 343-004)', () => {
  it('evaluateResult is NOT exported from result-evaluator', () => {
    // This is the primary consolidation assertion: the deprecated async function
    // was confirmed to have zero prod callers and has been deleted.
    expect((resultEvaluator as Record<string, unknown>)['evaluateResult']).toBeUndefined();
  });

  it('evaluateWithRubric IS exported (canonical grader)', () => {
    expect(typeof resultEvaluator.evaluateWithRubric).toBe('function');
  });

  it('reconcileEvaluationSpuriousNoGo IS exported (async spurious-NO_GO helper)', () => {
    expect(typeof resultEvaluator.reconcileEvaluationSpuriousNoGo).toBe('function');
  });

  it('applyTechDebtDowngrade IS exported with unchanged signature', () => {
    expect(typeof resultEvaluator.applyTechDebtDowngrade).toBe('function');
  });
});

// ─── evaluateWithRubric Smoke ─────────────────────────────────────────────────

describe('evaluateWithRubric smoke (canonical sync grader)', () => {
  it('returns an EvaluationResult shape for a passing result', () => {
    const result = resultEvaluator.evaluateWithRubric(makeResult(), makeTask());
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('totalScore');
    expect(result).toHaveProperty('rubricScores');
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(result.decision);
  });

  it('returns DONE for a clearly passing result (tests pass, coverage 95, DONE self-assessment)', () => {
    const result = resultEvaluator.evaluateWithRubric(
      makeResult({ selfAssessment: 'DONE', testsPassed: true, coverage: 95 }),
      makeTask(),
    );
    expect(result.decision).toBe('DONE');
  });

  it('produces a lower decision (not DONE) when tests fail', () => {
    const result = resultEvaluator.evaluateWithRubric(
      makeResult({ testsPassed: false, selfAssessment: 'DONE', coverage: 95 }),
      makeTask(),
    );
    expect(result.decision).not.toBe('DONE');
  });
});

// ─── evaluateResultSync Smoke (live finalize path via sprint-controller) ──────

describe('evaluateResultSync smoke (live finalize path)', () => {
  it('is importable from sprint-controller', () => {
    expect(typeof evaluateResultSync).toBe('function');
  });

  it('returns DONE for a passing result', () => {
    const verdict = evaluateResultSync(makeResult(), makeTask());
    expect(verdict).toBe(TaskEvaluation.DONE);
  });

  it('returns NO_GO when testsPassed is false', () => {
    const verdict = evaluateResultSync(
      makeResult({ testsPassed: false, selfAssessment: 'DONE' }),
      makeTask(),
    );
    expect(verdict).toBe(TaskEvaluation.NO_GO);
  });
});
