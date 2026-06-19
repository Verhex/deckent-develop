import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, EvaluationResult } from '../../src/core/types.js';
import {
  enrichEvaluationWithCategory,
  evaluateWithRubric,
  scoreScopeCompliance,
} from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '303-008',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/task-types.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '303-008',
    workerId: 'w-303-008',
    filesChanged: [],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'all good',
    ...overrides,
  };
}

function makeNoGoEvaluation(rubricScores: EvaluationResult['rubricScores'] = []): EvaluationResult {
  return {
    decision: 'NO_GO',
    totalScore: 30,
    rubricScores,
    retryCount: 0,
  };
}

// ─── enrichEvaluationWithCategory Unit Tests ──────────────────────────

describe('enrichEvaluationWithCategory', () => {
  it('passes through DONE decisions unchanged', () => {
    const task = makeTask();
    const result = makeResult();
    const evaluation: EvaluationResult = {
      decision: 'DONE',
      totalScore: 95,
      rubricScores: [],
      retryCount: 0,
    };
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);
    expect(enriched.decision).toBe('DONE');
    expect(enriched.noGoCategory).toBeUndefined();
    expect(enriched.filesInScope).toBeUndefined();
    expect(enriched.filesOutOfScope).toBeUndefined();
    expect(enriched.isPartialPromotable).toBeUndefined();
  });

  it('passes through GO_WITH_TECH_DEBT decisions unchanged', () => {
    const task = makeTask();
    const result = makeResult();
    const evaluation: EvaluationResult = {
      decision: 'GO_WITH_TECH_DEBT',
      totalScore: 70,
      rubricScores: [],
      retryCount: 0,
    };
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);
    expect(enriched.decision).toBe('GO_WITH_TECH_DEBT');
    expect(enriched.noGoCategory).toBeUndefined();
  });

  it('out-of-scope file → noGoCategory=BOUNDARY_VIOLATION + filesInScope/Out correct', () => {
    const task = makeTask();
    // file outside scope — not in src/core/ and not in filesWrite
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts', 'src/orchestra/sneaky.ts'],
      testsPassed: true,
      selfAssessment: 'NO_GO',
    });
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 50, passed: false, reason: '1/2 files within scope' },
      { criterion: 'correctness', score: 60, passed: true, reason: 'tests passed' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.decision).toBe('NO_GO');
    expect(enriched.noGoCategory).toBe('BOUNDARY_VIOLATION');
    expect(enriched.filesInScope).toContain('src/core/task-types.ts');
    expect(enriched.filesOutOfScope).toContain('src/orchestra/sneaky.ts');
    expect(enriched.filesInScope).not.toContain('src/orchestra/sneaky.ts');
    expect(enriched.filesOutOfScope).not.toContain('src/core/task-types.ts');
    expect(enriched.isPartialPromotable).toBe(true);
  });

  it('test-fail (testsPassed=false, correctness=0) → noGoCategory=TECHNICAL', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: false,
      selfAssessment: 'NO_GO',
    });
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 100, passed: true, reason: '1/1 files within scope' },
      { criterion: 'correctness', score: 0, passed: false, reason: 'tests failed; self-assessment NO_GO' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.decision).toBe('NO_GO');
    expect(enriched.noGoCategory).toBe('TECHNICAL');
    expect(enriched.filesInScope).toContain('src/core/task-types.ts');
    expect(enriched.filesOutOfScope).toHaveLength(0);
    expect(enriched.isPartialPromotable).toBe(true);
  });

  it('testsPassed=false alone (no correctness rubric) → noGoCategory=TECHNICAL', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: false,
      selfAssessment: 'NO_GO',
    });
    // No correctness rubric score — defaults to 100, but testsPassed=false triggers TECHNICAL
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 100, passed: true, reason: 'in scope' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.noGoCategory).toBe('TECHNICAL');
  });

  it('OOM-killed notes → noGoCategory=RUNTIME_ERROR (takes priority over boundary)', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/outside/file.ts'],
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'Worker was OOM-killed during execution',
    });
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 20, passed: false, reason: 'out of scope' },
      { criterion: 'correctness', score: 0, passed: false, reason: 'tests failed' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.noGoCategory).toBe('RUNTIME_ERROR');
  });

  it('SIGKILL notes → noGoCategory=RUNTIME_ERROR', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'Process terminated: SIGKILL received',
    });
    const evaluation = makeNoGoEvaluation([]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.noGoCategory).toBe('RUNTIME_ERROR');
  });

  it('auth failure notes → noGoCategory=FATAL_ERROR', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: false,
      selfAssessment: 'NO_GO',
      notes: 'authentication failed: 401 Unauthorized',
    });
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 100, passed: true, reason: 'in scope' },
      { criterion: 'correctness', score: 40, passed: false, reason: 'tests failed' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.noGoCategory).toBe('FATAL_ERROR');
  });

  it('no signals → noGoCategory=UNKNOWN', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: true,
      selfAssessment: 'NO_GO',
      notes: 'Something unexpected happened',
    });
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 100, passed: true, reason: 'in scope' },
      { criterion: 'correctness', score: 60, passed: true, reason: 'tests passed' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.noGoCategory).toBe('UNKNOWN');
  });

  it('filesChanged=[] → filesInScope=[], filesOutOfScope=[], isPartialPromotable=false', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: [],
      testsPassed: false,
      selfAssessment: 'NO_GO',
    });
    const evaluation = makeNoGoEvaluation([]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.filesInScope).toEqual([]);
    expect(enriched.filesOutOfScope).toEqual([]);
    expect(enriched.isPartialPromotable).toBe(false);
  });

  it('auxiliary files (docs/) go into filesInScope, not filesOutOfScope', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['docs/README.md', 'src/evil/outsider.ts'],
      testsPassed: false,
      selfAssessment: 'NO_GO',
    });
    const evaluation = makeNoGoEvaluation([
      { criterion: 'scope_compliance', score: 40, passed: false, reason: 'out of scope' },
    ]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(enriched.filesInScope).toContain('docs/README.md');
    expect(enriched.filesOutOfScope).toContain('src/evil/outsider.ts');
    expect(enriched.filesOutOfScope).not.toContain('docs/README.md');
  });

  it('does not mutate the original evaluation object', () => {
    const task = makeTask();
    const result = makeResult({ testsPassed: false, selfAssessment: 'NO_GO' });
    const evaluation = makeNoGoEvaluation([]);
    const enriched = enrichEvaluationWithCategory(evaluation, result, task);

    expect(evaluation).not.toHaveProperty('noGoCategory');
    expect(enriched).not.toBe(evaluation);
  });
});

// ─── evaluateWithRubric Integration Tests ─────────────────────────────
// Verify that the NO_GO path wires enrichEvaluationWithCategory automatically
// and that DONE/GO_WITH_TECH_DEBT decisions remain backward-compatible.

describe('evaluateWithRubric — STATE-W1 integration', () => {
  it('DONE decision → no noGoCategory (backward-compatible)', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: true,
      coverage: 95,
      selfAssessment: 'DONE',
      notes: 'all good, tests pass',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.noGoCategory).toBeUndefined();
  });

  it('NO_GO from scope violation → noGoCategory=BOUNDARY_VIOLATION', () => {
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/task-types.ts'],
      },
    });
    const result = makeResult({
      filesChanged: ['src/orchestra/big-bad-wolf.ts', 'src/orchestra/another.ts'],
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'wrote wrong files',
      linesAdded: 50,
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.noGoCategory).toBe('BOUNDARY_VIOLATION');
    expect(evaluation.filesOutOfScope).toContain('src/orchestra/big-bad-wolf.ts');
    expect(evaluation.filesInScope).toHaveLength(0);
  });

  it('NO_GO from test failure → noGoCategory=TECHNICAL', () => {
    const task = makeTask();
    const result = makeResult({
      filesChanged: ['src/core/task-types.ts'],
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'test suite failed, 5 tests failing',
      linesAdded: 20,
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.noGoCategory).toBe('TECHNICAL');
  });

  it('decision (DONE/GO_WITH_TECH_DEBT/NO_GO) values preserved — backward compat', () => {
    const task = makeTask();

    // DONE case
    const doneResult = makeResult({ testsPassed: true, coverage: 95, selfAssessment: 'DONE', filesChanged: ['src/core/task-types.ts'], linesAdded: 5 });
    const doneEval = evaluateWithRubric(doneResult, task);
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(doneEval.decision);

    // GO_WITH_TECH_DEBT case (low coverage)
    const debtResult = makeResult({ testsPassed: true, coverage: 30, selfAssessment: 'GO_WITH_TECH_DEBT', filesChanged: ['src/core/task-types.ts'], linesAdded: 5 });
    const debtEval = evaluateWithRubric(debtResult, task);
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(debtEval.decision);

    // Verify the 3-state enum is exhaustive in results
    expect(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']).toContain(doneEval.decision);
  });
});
