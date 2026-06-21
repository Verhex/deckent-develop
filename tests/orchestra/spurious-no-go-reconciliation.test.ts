// ─── Sprint 163 T-001: Brain Spurious NO_GO Reconciliation Wire Restore ────
// Decision matrix (from DIRECTIVES.md Task 1):
//   1. Worker selfAssessment=DONE ∧ testsPassed ∧ rubric avg≥85 ∧ coverage≥80
//      → DONE (worker wins, Brain heuristic NO_GO overridden)
//   2. Worker DONE ∧ scope_compliance<90  → NO_GO (concrete scope_violation)
//   3. Worker NO_GO                       → NO_GO (worker priority)
//   4. Brain NO_GO sebebi "test_failed"   → NO_GO (concrete)
//   5. Rubric avg<85 or coverage<80       → NO_GO (threshold respect)

import { describe, it, expect } from 'vitest';
import {
  reconcileRubricNoGo,
  RUBRIC_RECONCILIATION_THRESHOLDS,
} from '../../src/orchestra/mid-sprint-adapter.js';
import { evaluateWithRubric } from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult, EvaluationResult, RubricScore } from '../../src/core/task-types.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '163-001',
    title: 'Reconciliation test task',
    description: 'Test task for spurious NO_GO reconciliation',
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
    status: 'EXECUTING',
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '163-001',
    workerId: 'w-163-001',
    filesChanged: ['src/orchestra/result-evaluator.ts'],
    linesAdded: 50,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'Implementation complete with tests',
    ...overrides,
  };
}

function makeRubricResult(
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  scores: Record<string, number>,
  totalScore = 70,
): EvaluationResult {
  const rubricScores: RubricScore[] = Object.entries(scores).map(([criterion, score]) => ({
    criterion,
    score,
    passed: score >= 50,
    reason: `${criterion}=${score}`,
  }));
  return {
    decision,
    totalScore,
    rubricScores,
    retryCount: 0,
  };
}

// ─── Test 1: Sprint 162 162-003 reproduction ────────────────────────────────
//   Worker selfAssessment=DONE, rubric {correctness:95, test_coverage:95,
//   scope_compliance:100, documentation:85} → avg 93.75, coverage 95.
//   Brain heuristic NO_GO must be overridden to DONE.

describe('reconcileRubricNoGo — Sprint 162 162-003 regression class', () => {
  it('1. heuristic NO_GO salvaged to GO_WITH_TECH_DEBT (NOT clean DONE) when worker DONE + rubric avg≥85 + coverage≥80', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      coverage: 95,
    });
    // 162-003 exact rubric profile
    const rubricResult = makeRubricResult(
      'NO_GO',
      {
        correctness: 95,
        test_coverage: 95,
        scope_compliance: 100,
        documentation: 85,
      },
      // Brain totalScore came out under passingScore (heuristic NO_GO)
      65,
    );

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    // A13/R2: the gating signals (worker selfAssessment, testsPassed, coverage 95)
    // are all worker-self-reported and fabricatable, so a heuristic NO_GO salvage
    // caps at GO_WITH_TECH_DEBT — never a clean DONE. Pre-fix this minted DONE on
    // the unverified worker coverage (the false-DONE the audit flagged).
    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.decision).not.toBe('DONE');
    expect(reconciled.reconciled).toBe(true);
    expect(reconciled.reason).toBe('heuristic_no_go_overridden');
    expect(reconciled.rubricAverage).toBe(93.75);
    expect(reconciled.coverage).toBe(95);
    expect(reconciled.notes).toContain('Spurious NO_GO salvaged');
    expect(reconciled.notes).toContain('tech-debt');
  });

  it('1b. evaluateWithRubric end-to-end: 162-003 scenario yields GO_WITH_TECH_DEBT not NO_GO', () => {
    // Build a result that would normally trip the rubric NO_GO path:
    // - scoreCorrectness: testsPassed=true (60) + selfAssessment DONE (40) = 100
    // - scoreTestCoverage: coverage 95 + no new tests = 95
    // - scoreScopeCompliance: 1/1 file in scope = 100
    // - scoreDocumentation: notes 60-99 chars → 70
    // weighted total: 100*0.4 + 95*0.25 + 100*0.2 + 70*0.15 = 40+23.75+20+10.5 = 94.25
    // That's actually a passing score, so to reproduce 162-003 we need to coerce
    // the rubric NO_GO via a custom rubric with high passingScore.
    const task = makeTask();
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      coverage: 95,
      notes: 'Worker completed task with all tests passing and high coverage. Verification done.',
    });

    // Force NO_GO via an artificially high passingScore
    const evaluation = evaluateWithRubric(result, task, { passingScore: 99 });

    // Without reconciliation this would be NO_GO (totalScore < 99*0.7=69.3 is false,
    // so it'd be GO_WITH_TECH_DEBT). Use even higher floor to force NO_GO:
    const forcedNoGo = evaluateWithRubric(result, task, { passingScore: 200 });
    // totalScore ~= 94.25 ; passingScore 200 → 200*0.7=140; 94.25 < 140 → NO_GO
    // With reconciliation: worker DONE + rubric avg≈91 + coverage 95 → GO_WITH_TECH_DEBT salvage.

    // Without salvage the rubric would say NO_GO; reconciliation lifts it to
    // GO_WITH_TECH_DEBT (not a clean DONE — worker signals are unverified, A13/R2).
    expect(forcedNoGo.decision).toBe('GO_WITH_TECH_DEBT');
    // Confirm threshold-only path still passes (sanity)
    expect(evaluation.decision).toBe('GO_WITH_TECH_DEBT');
  });
});

// ─── Test 2: Concrete failure — testsPassed=false ────────────────────────────

describe('reconcileRubricNoGo — concrete test_failed preserves NO_GO', () => {
  it('2. testsPassed=false + worker DONE → NO_GO preserved (concrete test_failed)', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: false, // concrete signal
      coverage: 90,
    });
    const rubricResult = makeRubricResult('NO_GO', {
      correctness: 90,
      test_coverage: 90,
      scope_compliance: 100,
      documentation: 90,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('concrete_test_failed');
    expect(reconciled.notes).toContain('testsPassed=false');
  });
});

// ─── Test 3: Concrete failure — scope_compliance<90 ─────────────────────────

describe('reconcileRubricNoGo — scope_violation preserves NO_GO', () => {
  it('3. scope_compliance=70 + worker DONE + tests pass → NO_GO preserved (scope_violation)', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      coverage: 90,
    });
    const rubricResult = makeRubricResult('NO_GO', {
      correctness: 95,
      test_coverage: 90,
      scope_compliance: 70, // RBAC violation, never overridden
      documentation: 85,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('concrete_scope_violation');
    expect(reconciled.notes).toContain('scope_compliance=70');
    expect(reconciled.notes).toContain('ADR-037');
  });
});

// ─── Test 4: Worker self NO_GO is priority ──────────────────────────────────

describe('reconcileRubricNoGo — worker self NO_GO preserved', () => {
  it('4. Worker selfAssessment=NO_GO + high rubric avg → NO_GO preserved (worker priority)', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO', // worker says NO_GO
      testsPassed: true,
      coverage: 95,
    });
    const rubricResult = makeRubricResult('NO_GO', {
      correctness: 95,
      test_coverage: 95,
      scope_compliance: 100,
      documentation: 90,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('worker_self_no_go');
    expect(reconciled.notes).toContain('worker priority');
  });
});

// ─── Test 5: Rubric threshold respect ───────────────────────────────────────

describe('reconcileRubricNoGo — threshold respect', () => {
  it('5a. Worker DONE but rubric avg=70 (<85) → NO_GO preserved (threshold)', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      coverage: 90,
    });
    // avg = (70+70+90+50)/4 = 70 — below 85 threshold
    const rubricResult = makeRubricResult('NO_GO', {
      correctness: 70,
      test_coverage: 70,
      scope_compliance: 90,
      documentation: 50,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('rubric_threshold_not_met');
    expect(reconciled.rubricAverage).toBe(70);
  });

  it('5b. Worker DONE + rubric avg>=85 but coverage=50 (<80) → NO_GO preserved (coverage threshold)', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      coverage: 50, // below coverage threshold
    });
    const rubricResult = makeRubricResult('NO_GO', {
      correctness: 95,
      test_coverage: 90,
      scope_compliance: 100,
      documentation: 85,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('NO_GO');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('rubric_threshold_not_met');
    expect(reconciled.coverage).toBe(50);
  });
});

// ─── Sanity tests for pass-through cases ────────────────────────────────────

describe('reconcileRubricNoGo — pass-through (non-NO_GO inputs)', () => {
  it('DONE rubric decision passes through unchanged', () => {
    const result = makeResult();
    const rubricResult = makeRubricResult('DONE', {
      correctness: 100,
      test_coverage: 100,
      scope_compliance: 100,
      documentation: 100,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('DONE');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('not_no_go');
  });

  it('GO_WITH_TECH_DEBT rubric decision passes through unchanged', () => {
    const result = makeResult();
    const rubricResult = makeRubricResult('GO_WITH_TECH_DEBT', {
      correctness: 70,
      test_coverage: 60,
      scope_compliance: 80,
      documentation: 60,
    });

    const reconciled = reconcileRubricNoGo(result, rubricResult);

    expect(reconciled.decision).toBe('GO_WITH_TECH_DEBT');
    expect(reconciled.reconciled).toBe(false);
    expect(reconciled.reason).toBe('not_no_go');
  });
});

// ─── Thresholds export sanity ───────────────────────────────────────────────

describe('RUBRIC_RECONCILIATION_THRESHOLDS', () => {
  it('exposes the canonical threshold values', () => {
    expect(RUBRIC_RECONCILIATION_THRESHOLDS.rubricAverage).toBe(85);
    expect(RUBRIC_RECONCILIATION_THRESHOLDS.coverage).toBe(80);
    expect(RUBRIC_RECONCILIATION_THRESHOLDS.scopeCompliance).toBe(90);
  });
});
