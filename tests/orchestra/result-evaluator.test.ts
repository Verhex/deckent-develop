import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  evaluateResult,
  isDocTask,
  isBashUnavailable,
  scoreCorrectness,
  scoreTestCoverage,
  scoreScopeCompliance,
  scoreDocumentation,
  evaluateWithRubric,
  DEFAULT_RUBRIC,
  applyTechDebtDowngrade,
  TECH_DEBT_DOWNGRADE_DONE_THRESHOLD,
  TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD,
  validateTokenUsage,
  classifyFailure,
  decideCascadeAction,
  reconstructFromDurableEvidence,
} from '../../src/orchestra/result-evaluator.js';
import type {
  FailureContext,
} from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(directories: string[], overrides: Partial<Task> = {}): Task {
  return {
    id: '001-001',
    title: 'Test task',
    description: 'desc',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories, filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    workerId: 'w-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// ─── isDocTask() ─────────────────────────────────────────────────────

describe('isDocTask (result-evaluator)', () => {
  it('returns true for docs/ directory', () => {
    expect(isDocTask(makeTask(['docs']))).toBe(true);
  });

  it('returns true for docs subdirectory', () => {
    expect(isDocTask(makeTask(['docs/guides']))).toBe(true);
  });

  it('returns true when all directories are doc-only', () => {
    expect(isDocTask(makeTask(['docs/api', 'docs/guides', '.brain']))).toBe(true);
  });

  it('returns false for src/ directory', () => {
    expect(isDocTask(makeTask(['src/orchestra']))).toBe(false);
  });

  it('returns false for tests/ directory', () => {
    expect(isDocTask(makeTask(['tests/core']))).toBe(false);
  });

  it('returns false for lib/ directory', () => {
    expect(isDocTask(makeTask(['lib/utils']))).toBe(false);
  });

  it('returns false for mixed scope (docs/ + src/)', () => {
    expect(isDocTask(makeTask(['docs', 'src/orchestra']))).toBe(false);
  });

  it('returns false for empty directories', () => {
    expect(isDocTask(makeTask([]))).toBe(false);
  });

  it('returns false for bare "src" directory', () => {
    expect(isDocTask(makeTask(['src']))).toBe(false);
  });

  it('returns false for bare "tests" directory', () => {
    expect(isDocTask(makeTask(['tests']))).toBe(false);
  });

  it('returns false for bare "lib" directory', () => {
    expect(isDocTask(makeTask(['lib']))).toBe(false);
  });

  it('returns true for config-only directories', () => {
    expect(isDocTask(makeTask(['.deckent', '.brain']))).toBe(true);
  });

  it('handles task with no scope gracefully', () => {
    const task = makeTask([]);
    // @ts-expect-error — testing runtime safety
    task.scope = undefined;
    expect(isDocTask(task)).toBe(false);
  });
});

// ─── evaluateResult() ────────────────────────────────────────────────

describe('evaluateResult (result-evaluator)', () => {
  // ── Step 1: Hard failures ──────────────────────────────────────

  it('returns NO_GO when selfAssessment is NO_GO (highest priority)', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ selfAssessment: 'NO_GO', coverage: 100, testsPassed: true });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when selfAssessment is NO_GO even with new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'NO_GO', coverage: 100, testsPassed: true,
      filesChanged: ['src/foo.test.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when tests failed (worker says DONE)', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'DONE', coverage: 100 });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when tests failed (worker says GO_WITH_TECH_DEBT)', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'GO_WITH_TECH_DEBT', coverage: 100 });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO for doc task when tests failed', async () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: false, selfAssessment: 'DONE' });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  // ── Step 2: Doc tasks ──────────────────────────────────────────

  it('returns DONE for doc task with passing tests (skips coverage)', async () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE' });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE for doc task even with zero coverage', async () => {
    const task = makeTask(['docs/api']);
    const result = makeResult({ coverage: 0, selfAssessment: 'DONE' });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('skips vitest validation for doc tasks', async () => {
    const task = makeTask(['docs']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE' });
    const vitestJson = JSON.stringify({
      lines: { pct: 50, total: 100, covered: 50 },
      statements: { pct: 50, total: 100, covered: 50 },
      functions: { pct: 50, total: 100, covered: 50 },
      branches: { pct: 50, total: 100, covered: 50 },
    });
    expect(await evaluateResult(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  // ── KEY CHANGE: Brain overrides worker self-assessment ─────────

  it('EVAL-DEBT-CEILING (born-450): honest GO_WITH_TECH_DEBT is a ceiling — new tests do NOT upgrade to DONE', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      coverage: 95,
      filesChanged: ['src/orchestra/foo.ts', 'tests/orchestra/foo.test.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('EVAL-DEBT-CEILING: coverage>=90 + new tests still cannot upgrade past a declared debt', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      coverage: 92,
      filesChanged: ['src/core/utils.ts', 'tests/core/utils.spec.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('EVAL-DEBT-CEILING: coverage>=90 alone cannot upgrade past a declared debt', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      coverage: 95,
      filesChanged: ['src/core/utils.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  // ── hasNewTests detection ──────────────────────────────────────

  it('detects .test.ts files as new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.test.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('detects .spec.ts files as new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.spec.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('detects .test.js files as new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.test.js'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('detects .spec.js files as new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'tests/foo.spec.js'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('no test files detected when filesChanged has no test/spec files', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/foo.ts', 'src/bar.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('handles undefined filesChanged gracefully (no new tests)', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
    });
    // filesChanged defaults to [] in makeResult, but test with explicit undefined
    result.filesChanged = undefined as unknown as string[];
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('handles empty filesChanged (no new tests)', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: [],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  // ── Coverage thresholds ────────────────────────────────────────

  it('returns DONE for coverage >= 90 with no new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 90, filesChanged: ['src/foo.ts'] });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns DONE for coverage exactly 90', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: true, coverage: 90, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('returns GO_WITH_TECH_DEBT for coverage 89.9 with no new tests', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({ testsPassed: true, coverage: 89.9, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns GO_WITH_TECH_DEBT for coverage 0 with no new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({ testsPassed: true, coverage: 0, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE for coverage 50 when worker wrote new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  // ── Mixed scope ────────────────────────────────────────────────

  it('treats mixed scope (docs + src) as normal task — low coverage, no tests', async () => {
    const task = makeTask(['docs', 'src/core']);
    const result = makeResult({ testsPassed: true, coverage: 50, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('mixed scope with high coverage returns DONE', async () => {
    const task = makeTask(['docs', 'src/core']);
    const result = makeResult({ testsPassed: true, coverage: 95, selfAssessment: 'DONE', filesChanged: ['src/a.ts'] });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  it('mixed scope with new tests returns DONE', async () => {
    const task = makeTask(['docs', 'src/core']);
    const result = makeResult({
      testsPassed: true, coverage: 50, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.DONE);
  });

  // ── vitest JSON coverage validation ────────────────────────────

  it('returns GO_WITH_TECH_DEBT when vitest JSON shows coverage mismatch', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      testsPassed: true, coverage: 95, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    const vitestJson = JSON.stringify({
      lines: { pct: 50, total: 100, covered: 50 },
      statements: { pct: 50, total: 100, covered: 50 },
      functions: { pct: 50, total: 100, covered: 50 },
      branches: { pct: 50, total: 100, covered: 50 },
    });
    expect(await evaluateResult(result, task, vitestJson)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE when vitest JSON confirms coverage and has new tests', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      testsPassed: true, coverage: 95, selfAssessment: 'DONE',
      filesChanged: ['src/a.ts', 'tests/a.test.ts'],
    });
    const vitestJson = JSON.stringify({
      lines: { pct: 94, total: 100, covered: 94 },
      statements: { pct: 94, total: 100, covered: 94 },
      functions: { pct: 94, total: 100, covered: 94 },
      branches: { pct: 94, total: 100, covered: 94 },
    });
    expect(await evaluateResult(result, task, vitestJson)).toBe(TaskEvaluation.DONE);
  });

  // ── Fallback: worker hint for edge cases ───────────────────────

  it('respects GO_WITH_TECH_DEBT hint as fallback when coverage < 90 and no new tests', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true, coverage: 50,
      filesChanged: ['src/a.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns DONE as default when worker says DONE, coverage < 90 but not caught by other rules', async () => {
    // Edge case: coverage exactly at boundary conditions
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true, coverage: 50,
      filesChanged: ['src/a.ts'],
    });
    // No new tests + coverage < 90 → GO_WITH_TECH_DEBT
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

// ─── Rubric-Based Evaluation ────────────────────────────────────────

describe('scoreCorrectness', () => {
  it('returns 100 when tests pass and selfAssessment is DONE', () => {
    const result = makeResult({ testsPassed: true, selfAssessment: 'DONE' });
    const score = scoreCorrectness(result);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
    expect(score.criterion).toBe('correctness');
  });

  it('returns 80 when tests pass but selfAssessment is GO_WITH_TECH_DEBT', () => {
    const result = makeResult({ testsPassed: true, selfAssessment: 'GO_WITH_TECH_DEBT' });
    const score = scoreCorrectness(result);
    expect(score.score).toBe(80);
    expect(score.passed).toBe(true);
  });

  it('returns 0 when tests fail and selfAssessment is NO_GO', () => {
    const result = makeResult({ testsPassed: false, selfAssessment: 'NO_GO' });
    const score = scoreCorrectness(result);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });
});

describe('scoreTestCoverage', () => {
  it('returns coverage value boosted by new test files', () => {
    const result = makeResult({
      coverage: 70,
      filesChanged: ['src/foo.ts', 'tests/foo.test.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(85); // 70 + 15
    expect(score.passed).toBe(true);
  });

  it('returns raw coverage when no test files', () => {
    const result = makeResult({ coverage: 40, filesChanged: ['src/foo.ts'] });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(40);
    expect(score.passed).toBe(false);
  });

  it('caps score at 100', () => {
    const result = makeResult({
      coverage: 95,
      filesChanged: ['tests/foo.test.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(100); // 95 + 15 capped at 100
  });
});

describe('scoreScopeCompliance', () => {
  it('returns 100 when all files are within scope', () => {
    const task = makeTask(['src/core/'], {
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    });
    const result = makeResult({ filesChanged: ['src/core/config.ts', 'src/core/types.ts'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });

  it('returns partial score when auxiliary files are out of scope (D-5 relaxation)', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ filesChanged: ['docs/README.md', 'package.json'] });
    const score = scoreScopeCompliance(result, task);
    // D-5: docs/README.md gets 80 (auxiliary), package.json gets 0 → (80+0)/(200)*100 = 40
    expect(score.score).toBe(40);
    expect(score.passed).toBe(false);
  });

  it('returns 0 when all files are fully out of scope (no auxiliary)', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ filesChanged: ['src/agents/worker.ts', 'package.json'] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });

  it('returns 100 for empty filesChanged', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ filesChanged: [] });
    const score = scoreScopeCompliance(result, task);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });
});

describe('scoreDocumentation', () => {
  it('returns 100 for detailed notes (>=100 chars)', () => {
    const result = makeResult({ notes: 'A'.repeat(100) });
    const score = scoreDocumentation(result);
    expect(score.score).toBe(100);
    expect(score.passed).toBe(true);
  });

  it('returns 10 for minimal notes (<20 chars)', () => {
    const result = makeResult({ notes: 'ok' });
    const score = scoreDocumentation(result);
    expect(score.score).toBe(10);
    expect(score.passed).toBe(false);
  });
});

describe('evaluateWithRubric', () => {
  it('does not schema-NO_GO a passing direct-test task when coverage is structurally absent', () => {
    const task = makeTask(['src/core/'], {
      description: 'Implement the smoke module.\n\n**Test:** `node src/core/foo.ts`',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/foo.ts'],
      },
    });
    const result = makeResult({
      testsPassed: true,
      coverage: undefined as unknown as number,
      filesChanged: ['src/core/foo.ts'],
      selfAssessment: 'DONE',
      notes: 'The declared direct test passed.',
    });

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).not.toBe('NO_GO');
    expect(evaluation.rubricScores[0]?.criterion).not.toBe('schema_validation');
  });

  it('treats the result-contract coverage=0 sentinel as unmeasured for a direct-test task', () => {
    const task = makeTask(['src/core/'], {
      description: 'Implement the smoke module.\n\n**Test:** `node src/core/foo.ts`',
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/foo.ts'],
      },
    });
    const result = makeResult({
      testsPassed: true,
      coverage: 0,
      filesChanged: ['src/core/foo.ts'],
      selfAssessment: 'DONE',
      notes: 'The declared direct test passed.',
    });

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(DEFAULT_RUBRIC.passingScore);
  });

  it('returns DONE with default rubric for perfect result', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
      coverage: 95,
      filesChanged: ['src/core/foo.ts', 'tests/core/foo.test.ts'],
      notes: 'Implemented the feature with full test coverage and documentation.',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
    expect(evaluation.rubricScores).toHaveLength(4);
  });

  it('EVAL-DEBT-CEILING (born-459, 357-016 live case): honest worker GO_WITH_TECH_DEBT is never raised to DONE by a passing rubric score', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      coverage: 95,
      filesChanged: ['src/core/foo.ts', 'tests/core/foo.test.ts'],
      notes: 'Core criteria met, but 7 call-site files remain outside my write scope — follow-up task needed.',
    });
    const evaluation = evaluateWithRubric(result, task);
    // A passing score must NOT discard the worker's own debt declaration.
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(70);
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('EVAL-DEBT-CEILING (born-482): verification-task fast-path also respects honest DEBT', () => {
    const task = makeTask(['src/core/'], { description: 'Verify the existing implementation works' });
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      filesChanged: [],
      notes: 'verified existing work; one gap remains outside scope',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).not.toBe('DONE');
  });

  it('returns DONE with custom rubric', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
      coverage: 80,
      filesChanged: ['src/core/foo.ts'],
      notes: 'Brief notes for the change.',
    });
    const evaluation = evaluateWithRubric(result, task, {
      passingScore: 50,
    });
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.totalScore).toBeGreaterThanOrEqual(50);
  });

  it('returns NO_GO for failing result', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: false,
      selfAssessment: 'NO_GO',
      coverage: 0,
      filesChanged: [],
      notes: '',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.totalScore).toBeLessThan(DEFAULT_RUBRIC.passingScore * 0.7);
  });

  it('returns GO_WITH_TECH_DEBT for mediocre result', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      coverage: 30,
      filesChanged: ['src/core/foo.ts'],
      notes: 'Some notes about what was done here.',
    });
    const evaluation = evaluateWithRubric(result, task);
    // 80*0.4 + 30*0.25 + 100*0.2 + 40*0.15 = 32 + 7.5 + 20 + 6 = 65.5
    // 65.5 < 70 (passingScore) but >= 49 (70*0.7) → GO_WITH_TECH_DEBT
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('caps maxRetries at 3', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult();
    const evaluation = evaluateWithRubric(result, task, { maxRetries: 10 });
    expect(evaluation.retryCount).toBe(3);
  });

  it('handles unknown criterion gracefully', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({ testsPassed: true, selfAssessment: 'DONE' });
    const evaluation = evaluateWithRubric(result, task, {
      criteria: [
        { name: 'unknown_criterion', weight: 1.0, threshold: 50, evaluator: 'auto' },
      ],
    });
    expect(evaluation.rubricScores[0].score).toBe(0);
    expect(evaluation.rubricScores[0].reason).toContain('unknown');
  });

  it('respects per-criterion threshold', () => {
    const task = makeTask(['src/core/']);
    const result = makeResult({
      testsPassed: true,
      selfAssessment: 'DONE',
      coverage: 30,
      notes: 'x',
    });
    const evaluation = evaluateWithRubric(result, task, {
      criteria: [
        { name: 'test_coverage', weight: 1.0, threshold: 90, evaluator: 'metric' },
      ],
    });
    // coverage 30 → score 30 < threshold 90 → passed = false
    expect(evaluation.rubricScores[0].passed).toBe(false);
  });
});

// ─── isBashUnavailable() ────────────────────────────────────────────

describe('isBashUnavailable', () => {
  it('detects "Bash tool unavailable" in notes', () => {
    const result = makeResult({ notes: 'Bash tool unavailable — session-env ENOENT' });
    expect(isBashUnavailable(result)).toBe(true);
  });

  it('detects "session-env ENOENT" pattern', () => {
    const result = makeResult({ notes: 'session-env ENOENT prevented running tsc' });
    expect(isBashUnavailable(result)).toBe(true);
  });

  it('returns false for normal notes', () => {
    const result = makeResult({ notes: 'All tests passed, coverage 95%' });
    expect(isBashUnavailable(result)).toBe(false);
  });

  it('returns false for empty notes', () => {
    const result = makeResult({ notes: '' });
    expect(isBashUnavailable(result)).toBe(false);
  });
});

// ─── evaluateResult() — Bash Unavailable Tolerance ─────────────────

describe('evaluateResult — Bash unavailable tolerance', () => {
  it('returns GO_WITH_TECH_DEBT when Bash unavailable and testsPassed=false (DONE self)', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Bash tool unavailable — session-env ENOENT prevented running tsc --noEmit',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns GO_WITH_TECH_DEBT when Bash unavailable and testsPassed=false (TECH_DEBT self)', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Bash tool is unavailable due to session-env ENOENT',
      filesChanged: ['src/orchestra/foo.ts'],
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns NO_GO when Bash unavailable but selfAssessment is NO_GO', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'NO_GO',
      notes: 'Bash tool unavailable — session-env ENOENT',
    });
    // selfAssessment NO_GO is checked BEFORE Bash tolerance
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('returns NO_GO when tests fail without Bash unavailable signal', async () => {
    const task = makeTask(['src/core']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Tests failed due to type error in config.ts',
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.NO_GO);
  });

  it('detects "cannot run tsc" pattern as Bash unavailable', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Cannot run tsc due to environment constraint',
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('detects "ENOENT session-env" reversed pattern', async () => {
    const task = makeTask(['src/orchestra']);
    const result = makeResult({
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'ENOENT: no such file or directory, session-env path not found',
    });
    expect(await evaluateResult(result, task)).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });
});

// ─── scoreTestCoverage() — Bash Unavailable Tolerance ──────────────

describe('scoreTestCoverage — Bash unavailable tolerance', () => {
  it('returns neutral score 50 when Bash unavailable and coverage=0', () => {
    const result = makeResult({
      coverage: 0,
      notes: 'Bash tool unavailable — session-env ENOENT',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(50);
    expect(score.passed).toBe(true);
    expect(score.reason).toContain('Bash unavailable');
  });

  it('returns normal score when Bash unavailable but coverage > 0', () => {
    const result = makeResult({
      coverage: 80,
      notes: 'Bash tool unavailable — session-env ENOENT',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    // coverage > 0 means tests DID run somehow — use normal scoring
    expect(score.score).toBe(80);
  });

  it('returns normal score when coverage=0 without Bash unavailable', () => {
    const result = makeResult({
      coverage: 0,
      notes: 'No tests written',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(0);
    expect(score.passed).toBe(false);
  });

  it('returns neutral score with "cannot run vitest" notes', () => {
    const result = makeResult({
      coverage: 0,
      notes: 'Cannot run vitest — environment unavailable',
      filesChanged: ['src/foo.ts'],
    });
    const score = scoreTestCoverage(result);
    expect(score.score).toBe(50);
    expect(score.passed).toBe(true);
  });
});

// ─── evaluateWithRubric() — Bash Unavailable Integration ───────────

describe('evaluateWithRubric — Bash unavailable integration', () => {
  it('returns GO_WITH_TECH_DEBT (not NO_GO) for Bash unavailable result with rubric', () => {
    const task = makeTask(['src/orchestra/']);
    const result = makeResult({
      testsPassed: false,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      coverage: 0,
      notes: 'Bash tool unavailable — session-env ENOENT prevented running tsc --noEmit and vitest. Code changes applied correctly.',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
    });
    const evaluation = evaluateWithRubric(result, task);
    // correctness: tests failed (0) + GO_WITH_TECH_DEBT (20) = 20
    // test_coverage: Bash unavailable + coverage 0 → neutral 50
    // scope_compliance: 1/1 in scope → 100
    // documentation: long notes → 100
    // weighted: 20*0.4 + 50*0.25 + 100*0.2 + 100*0.15 = 8 + 12.5 + 20 + 15 = 55.5
    // 55.5 >= 70*0.7=49 → GO_WITH_TECH_DEBT (not NO_GO)
    expect(evaluation.decision).not.toBe('NO_GO');
  });
});

// ─── tryCodeVerifiedDone (Sprint 136 — Code-Aware Reconciliation) ───

import {
  tryCodeVerifiedDone,
  parseEvidenceCommand,
  CODE_VERIFIED_DONE,
  writeCodeVerifiedResult,
} from '../../src/orchestra/result-evaluator.js';
import type { CodeVerifyOptions } from '../../src/orchestra/result-evaluator.js';

describe('tryCodeVerifiedDone', () => {
  const DOCKER_NO_RESULT_NOTE = 'Docker worker exited without writing result file';

  /**
   * Helper: build CodeVerifyOptions with full DI overrides.
   * By default: result file does NOT exist, task has filesWrite, git shows modified.
   */
  function makeVerifyOptions(overrides: Partial<{
    resultExists: boolean;
    resultJson: TaskResult | null;
    taskJson: Task | null;
    gitModified: Record<string, boolean>;
    gitError: string | undefined;
    grepHit: boolean;
    grepError: string | undefined;
    fileExistsOverride: (p: string) => boolean;
  }> = {}): CodeVerifyOptions {
    const resultExists = overrides.resultExists ?? false;
    const resultJson = overrides.resultJson ?? null;
    const taskJson = overrides.taskJson !== undefined ? overrides.taskJson : makeTask(['src/orchestra/'], {
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/sprint-finalizer.ts', 'src/orchestra/result-evaluator.ts'],
      },
      description: '**Kanıt:** `grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts` → hit.',
    });
    const gitModified = overrides.gitModified ?? {
      'src/orchestra/sprint-finalizer.ts': true,
      'src/orchestra/result-evaluator.ts': true,
    };

    return {
      fileExists: overrides.fileExistsOverride ?? ((p: string) => {
        if (p.endsWith('.result')) return resultExists;
        return true;
      }),
      readTaskJson: () => taskJson,
      readResultJson: () => resultJson,
      runGitStatus: (filePath: string) => ({
        modified: gitModified[filePath] ?? false,
        error: overrides.gitError,
      }),
      runGrepEvidence: () => ({
        hit: overrides.grepHit ?? true,
        error: overrides.grepError,
      }),
    };
  }

  it('returns CODE_VERIFIED_DONE when result missing + code modified + evidence grep hit', async () => {
    const opts = makeVerifyOptions({
      resultExists: false,
      grepHit: true,
    });

    const result = await tryCodeVerifiedDone('135-001', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.verifiedFiles).toContain('src/orchestra/sprint-finalizer.ts');
    expect(result.verifiedFiles).toContain('src/orchestra/result-evaluator.ts');
    expect(result.evidenceMatched).toBe(true);
    expect(result.reason).toContain('Code physically verified');
  });

  it('returns honest NO_GO when result is NO_GO + no files modified', async () => {
    const opts = makeVerifyOptions({
      resultExists: true,
      resultJson: makeResult({
        selfAssessment: 'NO_GO',
        notes: DOCKER_NO_RESULT_NOTE,
      }),
      gitModified: {
        'src/orchestra/sprint-finalizer.ts': false,
        'src/orchestra/result-evaluator.ts': false,
      },
    });

    const result = await tryCodeVerifiedDone('135-004', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('No files were modified');
  });

  it('returns honest NO_GO when files modified but evidence grep misses', async () => {
    const opts = makeVerifyOptions({
      resultExists: false,
      grepHit: false,
    });

    const result = await tryCodeVerifiedDone('135-012', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('evidence check failed');
    expect(result.evidenceMatched).toBe(false);
  });

  it('skips reconciliation when result is already DONE', async () => {
    const opts = makeVerifyOptions({
      resultExists: true,
      resultJson: makeResult({
        selfAssessment: 'DONE',
        notes: 'Completed successfully',
      }),
    });

    const result = await tryCodeVerifiedDone('136-001', '/tmp/project', opts);

    expect(result.triggered).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('already DONE');
  });

  it('returns fail-safe honest NO_GO on git status error', async () => {
    const opts = makeVerifyOptions({
      resultExists: false,
      gitError: 'fatal: not a git repository',
      gitModified: {},
    });

    // Override runGitStatus to return error for all files
    opts.runGitStatus = () => ({
      modified: false,
      error: 'fatal: not a git repository',
    });

    const result = await tryCodeVerifiedDone('135-001', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('No files were modified');
  });

  it('skips reconciliation when NO_GO is not Docker auto-generated', async () => {
    const opts = makeVerifyOptions({
      resultExists: true,
      resultJson: makeResult({
        selfAssessment: 'NO_GO',
        notes: 'tsc --noEmit failed with 5 errors',
      }),
    });

    const result = await tryCodeVerifiedDone('136-002', '/tmp/project', opts);

    expect(result.triggered).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('not Docker auto-generated');
  });

  it('handles missing task JSON gracefully', async () => {
    const opts = makeVerifyOptions({
      resultExists: false,
      taskJson: null,
    });

    const result = await tryCodeVerifiedDone('999-999', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('Task JSON not found');
  });

  it('handles empty filesWrite array gracefully', async () => {
    const opts = makeVerifyOptions({
      resultExists: false,
      taskJson: makeTask(['src/'], {
        scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      }),
    });

    const result = await tryCodeVerifiedDone('136-005', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('No filesWrite');
  });

  it('verifies CODE_VERIFIED_DONE when no evidence command in description (files-only)', async () => {
    const opts = makeVerifyOptions({
      resultExists: false,
      taskJson: makeTask(['src/orchestra/'], {
        scope: {
          directories: ['src/orchestra/'],
          filesRead: [],
          filesWrite: ['src/orchestra/foo.ts'],
        },
        description: 'Simple task without evidence section.',
      }),
      gitModified: { 'src/orchestra/foo.ts': true },
    });

    const result = await tryCodeVerifiedDone('136-006', '/tmp/project', opts);

    expect(result.triggered).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.evidenceMatched).toBe(true); // no evidence → treated as matched
  });
});

describe('parseEvidenceCommand', () => {
  it('extracts grep command from Kanıt pattern', () => {
    const desc = '**Kanıt:** `grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts` → hit.';
    expect(parseEvidenceCommand(desc)).toBe('grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts');
  });

  it('returns null for non-grep commands (safety)', () => {
    const desc = '**Kanıt:** `rm -rf /` → gone.';
    expect(parseEvidenceCommand(desc)).toBeNull();
  });

  it('returns null when no Kanıt section present', () => {
    const desc = 'This task has no evidence section.';
    expect(parseEvidenceCommand(desc)).toBeNull();
  });

  it('handles wc command', () => {
    const desc = '**Kanıt:** `wc -l src/file.ts` → ≥100';
    expect(parseEvidenceCommand(desc)).toBe('wc -l src/file.ts');
  });

  it('handles ls command', () => {
    const desc = '**Kanıt:** `ls docs/file.md` → exists';
    expect(parseEvidenceCommand(desc)).toBe('ls docs/file.md');
  });
});

// ─── applyTechDebtDowngrade ────────────────────────────────────────────

describe('applyTechDebtDowngrade', () => {
  const baseResult = { selfAssessment: 'DONE', filesChanged: ['src/a.ts'], notes: 'done' };

  it('returns DONE unchanged when no verify-delta ratio provided', () => {
    const result = applyTechDebtDowngrade('DONE', baseResult, undefined);
    expect(result.decision).toBe('DONE');
    expect(result.downgraded).toBe(false);
    expect(result.completionRatio).toBeNull();
  });

  it('returns GO_WITH_TECH_DEBT unchanged when no verify-delta ratio provided', () => {
    const result = applyTechDebtDowngrade('GO_WITH_TECH_DEBT', baseResult, undefined);
    expect(result.decision).toBe('GO_WITH_TECH_DEBT');
    expect(result.downgraded).toBe(false);
  });

  it('never downgrades NO_GO (always respected)', () => {
    const result = applyTechDebtDowngrade('NO_GO', baseResult, 0.95);
    expect(result.decision).toBe('NO_GO');
    expect(result.downgraded).toBe(false);
  });

  it('preserves DONE when completion >= DONE threshold', () => {
    const result = applyTechDebtDowngrade('DONE', baseResult, TECH_DEBT_DOWNGRADE_DONE_THRESHOLD);
    expect(result.decision).toBe('DONE');
    expect(result.downgraded).toBe(false);
  });

  it('downgrades DONE → GO_WITH_TECH_DEBT when completion 50-79%', () => {
    // Sprint 137 scenario: worker reported DONE but ~60% completion
    const result = applyTechDebtDowngrade('DONE', baseResult, 0.6);
    expect(result.decision).toBe('GO_WITH_TECH_DEBT');
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain('verify-delta');
    expect(result.completionRatio).toBe(0.6);
  });

  it('downgrades DONE → NO_GO when completion < 50% (Sprint 137 regression catch)', () => {
    // Sprint 137: 39% functional completion should have been NO_GO
    const result = applyTechDebtDowngrade('DONE', baseResult, 0.39);
    expect(result.decision).toBe('NO_GO');
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain(String(TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD * 100));
  });

  it('escalates GO_WITH_TECH_DEBT → NO_GO when completion < 50%', () => {
    const result = applyTechDebtDowngrade('GO_WITH_TECH_DEBT', baseResult, 0.3);
    expect(result.decision).toBe('NO_GO');
    expect(result.downgraded).toBe(true);
    expect(result.reason).toContain('escalated to NO_GO');
  });

  it('preserves GO_WITH_TECH_DEBT when completion >= 50%', () => {
    const result = applyTechDebtDowngrade('GO_WITH_TECH_DEBT', baseResult, 0.65);
    expect(result.decision).toBe('GO_WITH_TECH_DEBT');
    expect(result.downgraded).toBe(false);
  });

  it('includes completionRatio in result when provided', () => {
    const result = applyTechDebtDowngrade('DONE', baseResult, 0.75);
    expect(result.completionRatio).toBe(0.75);
  });

  it('exports threshold constants with expected values', () => {
    expect(TECH_DEBT_DOWNGRADE_DONE_THRESHOLD).toBe(0.8);
    expect(TECH_DEBT_DOWNGRADE_NO_GO_THRESHOLD).toBe(0.5);
  });
});

// ─── validateTokenUsage() ─────────────────────────────────────────────

describe('validateTokenUsage', () => {
  it('returns isComplete=true and no warnings for a fully populated tokenUsage', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 1500, outputTokens: 300, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(true);
    expect(validation.warnings).toHaveLength(0);
    expect(validation.tokenUsageMissing).toBe(false);
  });

  it('warns when tokenUsage is entirely absent', () => {
    const result = makeResult({ tokenUsage: undefined });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(false);
    expect(validation.tokenUsageMissing).toBe(true);
    expect(validation.warnings).toHaveLength(1);
    expect(validation.warnings[0]).toMatch(/missing/i);
  });

  it('warns when inputTokens is missing', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: undefined as unknown as number, outputTokens: 300, provider: 'claude', model: 'sonnet' },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(false);
    expect(validation.warnings.some(w => w.includes('inputTokens'))).toBe(true);
  });

  it('warns when outputTokens is missing', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 1500, outputTokens: undefined as unknown as number, provider: 'claude', model: 'sonnet' },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(false);
    expect(validation.warnings.some(w => w.includes('outputTokens'))).toBe(true);
  });

  it('warns when provider is missing', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 1500, outputTokens: 300, provider: undefined, model: 'sonnet' },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(false);
    expect(validation.warnings.some(w => w.includes('provider'))).toBe(true);
  });

  it('warns when model is missing', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 1500, outputTokens: 300, provider: 'claude', model: undefined },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(false);
    expect(validation.warnings.some(w => w.includes('model'))).toBe(true);
  });

  it('accumulates multiple warnings when several fields are missing', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 1500, outputTokens: 300 },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(false);
    expect(validation.warnings.length).toBeGreaterThanOrEqual(2);
    expect(validation.tokenUsageMissing).toBe(false);
  });

  it('accepts cacheReadTokens as optional — complete even without it', () => {
    const result = makeResult({
      tokenUsage: { inputTokens: 1500, outputTokens: 300, provider: 'claude', model: 'opus' },
    });
    const validation = validateTokenUsage(result);
    expect(validation.isComplete).toBe(true);
    expect(validation.warnings).toHaveLength(0);
  });

  it('does not affect evaluation decision — soft warning only', () => {
    // validateTokenUsage is informational only; the result with missing tokenUsage
    // still evaluates to DONE if other criteria pass (Sprint 139 soft mode)
    const result = makeResult({ tokenUsage: undefined });
    const task = makeTask(['src/']);
    const evalResult = evaluateWithRubric(result, task);
    const validation = validateTokenUsage(result);
    // Both can co-exist: evaluation DONE but tokenUsage has warnings
    expect(validation.tokenUsageMissing).toBe(true);
    expect(['DONE', 'GO_WITH_TECH_DEBT']).toContain(evalResult.decision);
  });
});

// ─── classifyFailure() — Runtime vs Code Discriminator ─────────────

describe('classifyFailure (runtime-vs-code discriminator)', () => {
  it('classifies exitCode 137 as RUNTIME', () => {
    const ctx: FailureContext = { exitCode: 137 };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('RUNTIME');
    expect(result.signals).toContain('exitCode=137 (SIGKILL)');
  });

  it('classifies Docker HB shutdown note as RUNTIME', () => {
    const ctx: FailureContext = {
      notes: 'Docker worker exited without writing result file',
      resultFilePresent: false,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('RUNTIME');
    expect(result.signals.some(s => s.includes('no result file written'))).toBe(true);
  });

  it('classifies tsc error notes as CODE', () => {
    const ctx: FailureContext = {
      notes: 'tsc error: Type string is not assignable to type number',
      selfAssessment: 'NO_GO',
      resultFilePresent: true,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('CODE');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('classifies test failure output as CODE', () => {
    const ctx: FailureContext = {
      notes: '15 tests failed in result-evaluator.test.ts',
      errorOutput: 'vitest found 15 fail',
      resultFilePresent: true,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('CODE');
  });

  it('classifies mixed runtime+code signals as AMBIGUOUS', () => {
    const ctx: FailureContext = {
      exitCode: 137,
      notes: 'tsc error found, but also container exited',
      resultFilePresent: false,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('AMBIGUOUS');
  });

  it('returns AMBIGUOUS when no signals detected', () => {
    const ctx: FailureContext = {
      notes: 'Worker finished with unknown issue',
      resultFilePresent: true,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('AMBIGUOUS');
    expect(result.reason).toContain('No identifiable failure signals');
  });

  it('classifies "no such container" as RUNTIME', () => {
    const ctx: FailureContext = {
      errorOutput: 'Error: No such container: deckent-w-139-005',
      resultFilePresent: false,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('RUNTIME');
  });

  it('classifies scope violation notes as CODE', () => {
    const ctx: FailureContext = {
      notes: 'Auditor detected scope violation: files outside scope.directories',
      resultFilePresent: true,
    };
    const result = classifyFailure(ctx);
    expect(result.category).toBe('CODE');
  });
});

// ─── decideCascadeAction() ───────────────────────────────────────────

describe('decideCascadeAction (cross-dep cascade logic)', () => {
  it('RUNTIME → retry=true, cascade=false, no fix worker', () => {
    const ctx: FailureContext = { exitCode: 137, resultFilePresent: false };
    const decision = decideCascadeAction('139-005', ctx);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.shouldCascade).toBe(false);
    expect(decision.spawnFixWorker).toBe(false);
    expect(decision.category).toBe('RUNTIME');
  });

  it('CODE → retry=false, cascade=true, spawn fix worker', () => {
    const ctx: FailureContext = {
      notes: '5 tests failed, tsc error: Type error in worker.ts',
      resultFilePresent: true,
    };
    const decision = decideCascadeAction('139-010', ctx);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.shouldCascade).toBe(true);
    expect(decision.spawnFixWorker).toBe(true);
    expect(decision.category).toBe('CODE');
  });

  it('AMBIGUOUS → retry=true, cascade=false, no fix worker', () => {
    const ctx: FailureContext = {
      notes: 'Something went wrong but unclear what',
      resultFilePresent: true,
    };
    const decision = decideCascadeAction('139-015', ctx);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.shouldCascade).toBe(false);
    expect(decision.spawnFixWorker).toBe(false);
    expect(decision.category).toBe('AMBIGUOUS');
  });

  it('includes taskId in reason string', () => {
    const ctx: FailureContext = { exitCode: 137 };
    const decision = decideCascadeAction('task-xyz', ctx);
    expect(decision.reason).toContain('task-xyz');
  });
});

// ─── reconstructFromDurableEvidence() (455-002) ──────────────────────
// safeRubricReconcile's fault-fallback used to collapse ANY evaluateWithRubric
// fault into a hardcoded totalScore:0 capped at GO_WITH_TECH_DEBT/NO_GO,
// discarding a genuinely honest worker DONE+tests result. This reconstructs
// a real score from the durable criteria instead — see result-evaluator.ts
// for the full rationale.

describe('reconstructFromDurableEvidence (455-002 — recovered-result durable-evidence reconstruction)', () => {
  const richNotes =
    'Implemented the change end-to-end, ran the targeted test suite, and confirmed ' +
    'tsc --noEmit is clean. Coverage instrumented via vitest; all scoped files touched ' +
    'are within the declared write list.';

  function codeTask(overrides: Partial<Task> = {}): Task {
    return {
      id: '455-002-durable',
      title: 'Durable evidence fixture',
      description: 'desc',
      model: 'sonnet',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'test',
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/result-evaluator.ts'],
      },
      dependencies: [],
      goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
      status: TaskStatus.EXECUTING,
      ...overrides,
    };
  }

  function codeResult(overrides: Partial<TaskResult> = {}): TaskResult {
    return {
      taskId: '455-002-durable',
      workerId: 'w-455-002-durable',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
      linesAdded: 30,
      linesRemoved: 4,
      testsPassed: true,
      coverage: 92,
      selfAssessment: 'DONE',
      notes: richNotes,
      ...overrides,
    };
  }

  it('never returns a fabricated numeric-zero score — totalScore is a real weighted grade', () => {
    const evaluation = reconstructFromDurableEvidence(codeResult(), codeTask(), 'rubric registry threw');
    expect(evaluation.totalScore).toBeGreaterThan(0);
    expect(Number.isFinite(evaluation.totalScore)).toBe(true);
  });

  it('rich durable evidence (DONE claim + tests passed + in-scope + detailed notes) → DONE, not capped at tech-debt', () => {
    // This is the exact bug: a valid worker DONE+tests result used to be
    // downgraded to GO_WITH_TECH_DEBT (or worse) purely because the rubric
    // computation was unavailable. With SUFFICIENT durable acceptance
    // evidence, DONE must be reachable again.
    const evaluation = reconstructFromDurableEvidence(codeResult(), codeTask(), 'rubric registry threw');
    expect(evaluation.decision).toBe('DONE');
  });

  it('thin/absent notes → GO_WITH_TECH_DEBT (insufficient durable evidence for a clean DONE, never NO_GO)', () => {
    const evaluation = reconstructFromDurableEvidence(
      codeResult({ notes: '' }),
      codeTask(),
      'rubric registry threw',
    );
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
    expect(evaluation.totalScore).toBeGreaterThan(0);
  });

  it('concrete test failure vetoes NO_GO — never salvaged by a good score elsewhere', () => {
    const evaluation = reconstructFromDurableEvidence(
      codeResult({ testsPassed: false }),
      codeTask(),
      'rubric registry threw',
    );
    expect(evaluation.decision).toBe('NO_GO');
    const provenance = evaluation.rubricScores.find(s => s.criterion === 'recovery_provenance');
    expect(provenance?.reason).toContain('veto=concrete_test_failed');
  });

  it('worker self-NO_GO is preserved — worker priority over any reconstructed score', () => {
    const evaluation = reconstructFromDurableEvidence(
      codeResult({ selfAssessment: 'NO_GO' }),
      codeTask(),
      'rubric registry threw',
    );
    expect(evaluation.decision).toBe('NO_GO');
    const provenance = evaluation.rubricScores.find(s => s.criterion === 'recovery_provenance');
    expect(provenance?.reason).toContain('veto=worker_self_no_go');
  });

  it('a scope violation (files outside task.scope) is a concrete veto → NO_GO', () => {
    const evaluation = reconstructFromDurableEvidence(
      codeResult({ filesChanged: ['src/some-other-dir/unexpected.ts'] }),
      codeTask(),
      'rubric registry threw',
    );
    expect(evaluation.decision).toBe('NO_GO');
    const provenance = evaluation.rubricScores.find(s => s.criterion === 'recovery_provenance');
    expect(provenance?.reason).toContain('veto=concrete_scope_violation');
  });

  it('a schema-invalid recovered result (missing selfAssessment) is NO_GO, not a fabricated pass', () => {
    const evaluation = reconstructFromDurableEvidence(
      codeResult({ selfAssessment: undefined as unknown as TaskResult['selfAssessment'] }),
      codeTask(),
      'rubric registry threw',
    );
    expect(evaluation.decision).toBe('NO_GO');
    const provenance = evaluation.rubricScores.find(s => s.criterion === 'recovery_provenance');
    expect(provenance?.reason).toContain('schema_violation');
  });

  it('writes explicit decision provenance: worker claim, recovered evidence, rubric availability, veto, reconciliation, final verdict', () => {
    const evaluation = reconstructFromDurableEvidence(codeResult(), codeTask(), 'getRubric threw: boom');
    const provenance = evaluation.rubricScores.find(s => s.criterion === 'recovery_provenance');
    expect(provenance).toBeDefined();
    expect(provenance?.reason).toContain('worker claim=DONE');
    expect(provenance?.reason).toContain('recovered evidence=testsPassed:true');
    expect(provenance?.reason).toContain('rubric availability=unavailable (getRubric threw: boom)');
    expect(provenance?.reason).toContain('veto=none');
    expect(provenance?.reason).toContain('reconciliation=durable-evidence-reconstruction');
    expect(provenance?.reason).toContain('final verdict=DONE');
  });

  it('is deterministic — the same (result, task) reconstructs to the same decision and totalScore', () => {
    const result = codeResult();
    const task = codeTask();
    const first = reconstructFromDurableEvidence(result, task, 'boom');
    const second = reconstructFromDurableEvidence(result, task, 'boom');
    expect(second.decision).toBe(first.decision);
    expect(second.totalScore).toBe(first.totalScore);
  });

  it('a GO_WITH_TECH_DEBT worker self-claim is never upgraded to DONE even with strong durable evidence (EVAL-DEBT-CEILING parity)', () => {
    const evaluation = reconstructFromDurableEvidence(
      codeResult({ selfAssessment: 'GO_WITH_TECH_DEBT' }),
      codeTask(),
      'rubric registry threw',
    );
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });
});
