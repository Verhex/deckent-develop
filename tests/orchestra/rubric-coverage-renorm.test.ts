/**
 * tests/orchestra/rubric-coverage-renorm.test.ts
 *
 * Sprint 227 227-001 — Rubric total diagnostic fix.
 *
 * Verifies that `evaluateWithRubric` reweights/renormalizes the rubric when
 * `result.coverage` is structurally absent (null / undefined / NaN), so a
 * coverage-less perfect task scores ~100 instead of being pinned at 78.75.
 * Numeric coverage (including 0) is still treated as measured and uses the
 * pre-existing weighted formula.
 */

import { describe, it, expect } from 'vitest';
import { evaluateWithRubric, DEFAULT_RUBRIC } from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult, EvaluationRubric } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '227-test',
    title: 'Coverage renorm test',
    description: 'Test rubric renormalization on absent coverage',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'unit test',
    // assignedAgent=refactorer puts the task on the coverageOptional path
    // (rubric-registry COVERAGE_OPTIONAL_AGENTS), so `coverage:null` does
    // not trip the schema validator. This mirrors the real population
    // affected by Sprint 218/224/226 — refactorer/bug-fixer tasks pinned
    // at 78.75 because the rubric weight loop did not reweight.
    assignedAgent: 'refactorer',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/result-evaluator.ts'],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'tests pass',
      noGoCriteria: 'tests fail',
      techDebtAcceptable: '',
    },
    status: 'DONE',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '227-test',
    workerId: 'w-227-test',
    filesChanged: ['src/orchestra/result-evaluator.ts'],
    linesAdded: 30,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    // 7097-B3 unevidenced-claim ceiling: a bare testsPassed:true with no
    // run trace caps DONE at GO_WITH_TECH_DEBT, so the "all-good" fixture
    // now carries the evidence a real worker reports (a vitest run trace) —
    // this suite pins the renormalization math, not the evidence ceiling.
    notes: 'A reasonably detailed note that explains the change and references the rubric reweight behavior to satisfy the documentation criterion threshold for testing purposes. Verified with vitest run: 12/12 tests passed (exit 0).',
    ...overrides,
  };
}

// ═══ Tests ════════════════════════════════════════════════════════════

describe('evaluateWithRubric — coverage:null renormalize (Sprint 227 227-001)', () => {
  it('renormalizes coverage=0 for a typed direct verification command', () => {
    const task = makeTask({
      description: 'Read-only acceptance without a legacy Test clause.',
      verification: {
        version: 1,
        source: 'directive',
        commands: ['VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/example.test.ts'],
      },
      scope: {
        directories: ['src/orchestra/', 'tests/orchestra/'],
        filesRead: ['src/orchestra/result-evaluator.ts', 'tests/orchestra/example.test.ts'],
        filesWrite: [],
      },
    });
    const result = makeResult({
      filesChanged: [],
      coverage: 0,
      testVerification: {
        applicability: 'REQUIRED',
        outcome: 'PASSED',
        commands: ['VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/example.test.ts'],
      },
      notes: 'The declared operation completed successfully; coverage was not measured because the command did not authorize instrumentation.',
    });

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.totalScore).toBe(100);
    expect(evaluation.decision).toBe('DONE');
    expect(evaluation.rubricScores).toContainEqual(expect.objectContaining({
      criterion: 'applicability:coverage',
      reason: 'applicability=OPTIONAL',
    }));
  });

  it('coverage:null + all-good produces totalScore ≥ 90 (NOT 78.75) and decision DONE', () => {
    const task = makeTask();
    const result = makeResult({
      coverage: null as unknown as number,
      // The file under "filesChanged" lives inside scope.filesWrite, so
      // scope_compliance = 100. testsPassed=true + selfAssessment=DONE →
      // correctness = 100. notes length ≥ 100 → documentation = 100.
      // Without renormalization, the weighted total would be
      // 0.4×100 + 0.25×0 (coverage absent) + 0.2×100 + 0.15×100 = 75
      // (or 78.75 with hasNewTests bonus). With renormalization, the
      // remaining 0.75 weight scales to 1.0 → ~100.
    });

    const evaluation = evaluateWithRubric(result, task);

    expect(evaluation.totalScore).toBeGreaterThanOrEqual(90);
    // Critical regression guard: must NOT be pinned at the historical 78.75
    // (or 75 if hasNewTests=false). Allow at most 1 point of slack either way.
    expect(Math.abs(evaluation.totalScore - 78.75)).toBeGreaterThan(1);
    expect(Math.abs(evaluation.totalScore - 75)).toBeGreaterThan(1);
    expect(evaluation.decision).toBe('DONE');
  });

  it('coverage:null + testsFail + selfAssessment NO_GO drives low score (NO_GO or TECH_DEBT)', () => {
    const task = makeTask();
    const result = makeResult({
      coverage: null as unknown as number,
      testsPassed: false,
      selfAssessment: 'NO_GO',
      // Source-only edit (no .test. file) keeps coverageOptional() from
      // exempting the schema check; we explicitly provide tests-fail + NO_GO
      // self-assessment so correctness drops to 0. Renormalization should NOT
      // mask this — scope/docs are good but correctness has 0.4 weight, so
      // renormalized total = (0×0.4 + 100×0.2 + 100×0.15) / 0.75 ≈ 46.67.
      filesChanged: ['src/orchestra/result-evaluator.ts'],
    });

    const evaluation = evaluateWithRubric(result, task);

    // Decision should NOT be DONE — renormalization must not paper over a
    // genuine quality failure on correctness.
    expect(evaluation.decision).not.toBe('DONE');
    expect(['NO_GO', 'GO_WITH_TECH_DEBT']).toContain(evaluation.decision);
    expect(evaluation.totalScore).toBeLessThan(DEFAULT_RUBRIC.passingScore);
  });

  it('coverage=85 numeric uses the existing weighted formula (no renormalization)', () => {
    const task = makeTask();
    const result = makeResult({
      coverage: 85,
      // Numeric coverage is measured — renormalization must not engage.
      // No .test. file → hasNewTests=false → coverage score = 85.
      filesChanged: ['src/orchestra/result-evaluator.ts'],
    });

    const evaluation = evaluateWithRubric(result, task);

    // Expected: 0.4×100 (correctness) + 0.25×85 (coverage) + 0.2×100 (scope) + 0.15×100 (docs)
    //        =  40 + 21.25 + 20 + 15 = 96.25
    expect(evaluation.totalScore).toBeCloseTo(96.25, 2);
    expect(evaluation.decision).toBe('DONE');
  });

  it('passingScore threshold is preserved after renormalization (custom rubric high bar still gates)', () => {
    const task = makeTask();
    // Force correctness = 60 (tests passed but selfAssessment GO_WITH_TECH_DEBT
    // → score = 60 + 20 = 80 → wait — let me reset: testsPassed=true gives 60,
    // selfAssessment=GO_WITH_TECH_DEBT gives +20 → correctness = 80).
    // scope = 100, docs = 100. Without renorm: 0.4×80 + 0 + 0.2×100 + 0.15×100
    //   = 32 + 20 + 15 = 67. With renorm: 67 / 0.75 ≈ 89.33.
    // Custom passingScore = 95 should reject this as NOT DONE.
    const customRubric: Partial<EvaluationRubric> = { passingScore: 95 };
    const result = makeResult({
      coverage: null as unknown as number,
      selfAssessment: 'GO_WITH_TECH_DEBT',
    });

    const evaluation = evaluateWithRubric(result, task, customRubric);

    // Renormalized total is ~89, BELOW the custom passingScore of 95.
    expect(evaluation.totalScore).toBeLessThan(95);
    expect(evaluation.decision).not.toBe('DONE');
    // But 89.33 is well above 95 * 0.7 = 66.5 → GO_WITH_TECH_DEBT, not NO_GO.
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('coverage:undefined behaves identically to coverage:null (structural absence)', () => {
    const task = makeTask();
    const resultUndef = makeResult({ coverage: undefined as unknown as number });
    const resultNull = makeResult({ coverage: null as unknown as number });

    const evalUndef = evaluateWithRubric(resultUndef, task);
    const evalNull = evaluateWithRubric(resultNull, task);

    // Both should renormalize to the same total — coverage absence is the
    // semantic invariant, not the specific sentinel value.
    expect(evalUndef.totalScore).toBe(evalNull.totalScore);
    expect(evalUndef.totalScore).toBeGreaterThanOrEqual(90);
    expect(evalUndef.decision).toBe('DONE');
  });
});
