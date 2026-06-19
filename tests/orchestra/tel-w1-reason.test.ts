// ═══ TEL-W1 — telemetry reason = deciding-mechanism ════════════════════════
// Sprint 303 Task 303-001
//
// Verifies that `buildBrainEvaluationReason` includes the concrete veto cause
// when NO_GO is driven by a boundary/concrete-veto, and falls back to the
// rubric-score-only format for rubric-only NO_GO decisions.

import { describe, it, expect } from 'vitest';

import { buildBrainEvaluationReason } from '../../src/orchestra/sprint-phases.js';
import { TaskEvaluation } from '../../src/core/types.js';

describe('buildBrainEvaluationReason', () => {
  // ─── Boundary-veto path ────────────────────────────────────────────────

  it('boundary-veto NO_GO → reason includes (cause: BOUNDARY_VIOLATION)', () => {
    const reason = buildBrainEvaluationReason(
      72,
      TaskEvaluation.NO_GO,
      'NO_GO',
      { honest: false, violation: 'BOUNDARY_VIOLATION' },
      { testsPassed: true, selfAssessment: 'DONE' },
    );
    expect(reason).toContain('(cause: BOUNDARY_VIOLATION)');
    expect(reason).toContain('rubric total 72');
    expect(reason).toContain('NO_GO');
  });

  it('dishonest stub NO_GO → reason includes (cause: DISHONEST_DONE_STUB)', () => {
    const reason = buildBrainEvaluationReason(
      55,
      TaskEvaluation.NO_GO,
      'NO_GO',
      { honest: false, violation: 'DISHONEST_DONE_STUB' },
      { testsPassed: false, selfAssessment: 'DONE' },
    );
    expect(reason).toContain('(cause: DISHONEST_DONE_STUB)');
  });

  // ─── Concrete-test-failure path ────────────────────────────────────────

  it('concrete_test_failed NO_GO → reason includes (cause: concrete_test_failed)', () => {
    const reason = buildBrainEvaluationReason(
      60,
      TaskEvaluation.NO_GO,
      'NO_GO',
      { honest: true },
      { testsPassed: false, selfAssessment: 'DONE' },
    );
    expect(reason).toContain('(cause: concrete_test_failed)');
    expect(reason).toContain('rubric total 60');
  });

  it('worker_self_no_go → reason includes (cause: worker_self_no_go)', () => {
    const reason = buildBrainEvaluationReason(
      80,
      TaskEvaluation.NO_GO,
      'NO_GO',
      { honest: true },
      { testsPassed: true, selfAssessment: 'NO_GO' },
    );
    expect(reason).toContain('(cause: worker_self_no_go)');
  });

  // ─── Rubric-only NO_GO → old format (no cause) ────────────────────────

  it('rubric-only NO_GO (no concrete veto) → old format without cause', () => {
    const reason = buildBrainEvaluationReason(
      45,
      TaskEvaluation.NO_GO,
      'NO_GO',
      { honest: true },
      { testsPassed: true, selfAssessment: 'DONE' },
    );
    expect(reason).toBe('rubric total 45 → NO_GO');
    expect(reason).not.toContain('(cause:');
  });

  // ─── Non-NO_GO verdicts → old format always ───────────────────────────

  it('DONE verdict → old format, no cause suffix', () => {
    const reason = buildBrainEvaluationReason(
      95,
      TaskEvaluation.DONE,
      'DONE',
      { honest: true },
      { testsPassed: true, selfAssessment: 'DONE' },
    );
    expect(reason).toBe('rubric total 95 → DONE');
    expect(reason).not.toContain('(cause:');
  });

  it('GO_WITH_TECH_DEBT verdict → old format, no cause suffix', () => {
    const reason = buildBrainEvaluationReason(
      78,
      TaskEvaluation.GO_WITH_TECH_DEBT,
      'GO_WITH_TECH_DEBT',
      { honest: true },
      { testsPassed: true, selfAssessment: 'GO_WITH_TECH_DEBT' },
    );
    expect(reason).toBe('rubric total 78 → GO_WITH_TECH_DEBT');
    expect(reason).not.toContain('(cause:');
  });

  // ─── Honest-gate priority over testsPassed ────────────────────────────

  it('honest-gate veto takes priority over testsPassed=false cause', () => {
    // Both conditions true — honest-gate violation should win
    const reason = buildBrainEvaluationReason(
      50,
      TaskEvaluation.NO_GO,
      'NO_GO',
      { honest: false, violation: 'BOUNDARY_VIOLATION' },
      { testsPassed: false, selfAssessment: 'DONE' },
    );
    expect(reason).toContain('(cause: BOUNDARY_VIOLATION)');
    // Should not show the secondary cause
    expect(reason).not.toContain('concrete_test_failed');
  });
});
