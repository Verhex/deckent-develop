// Tests for inferFixMode (Sprint 196 WP-2 — FIX worker idempotency mode flag)
import { describe, it, expect } from 'vitest';
import { inferFixMode } from '../../src/orchestra/task-builder.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<TaskResult>): TaskResult {
  return {
    taskId: 'test-001',
    workerId: 'w-test-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  };
}

// ─── inferFixMode ─────────────────────────────────────────────────────────────

describe('inferFixMode', () => {
  // (a) Previous DONE + high rubric scores → verify-only
  it('(a) DONE + rubric all ≥90 → verify-only', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      rubricScores: { correctness: 95, test_coverage: 90, scope_compliance: 100 },
      notes: '',
    });
    expect(inferFixMode(result)).toBe('verify-only');
  });

  // (b) Previous DONE + boundary violation in notes → amend
  it('(b) DONE + boundary violation in notes → amend', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      rubricScores: { correctness: 95, test_coverage: 92, scope_compliance: 100 },
      notes: 'BOUNDARY_VIOLATION: wrote to tests/core/types.test.ts outside scope',
    });
    expect(inferFixMode(result)).toBe('amend');
  });

  // (c) Previous NO_GO + tests failed → re-implement
  it('(c) NO_GO + testsPassed=false → re-implement', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      rubricScores: { correctness: 40, test_coverage: 20, scope_compliance: 80 },
      notes: 'tsc error: type incompatibility in src/core/config.ts line 42',
    });
    expect(inferFixMode(result)).toBe('re-implement');
  });

  // (d) Ambiguous (NO_GO but tests passed, or GO_WITH_TECH_DEBT) → amend
  it('(d) NO_GO + testsPassed=true → amend (safest default)', () => {
    const result = makeResult({
      selfAssessment: 'NO_GO',
      testsPassed: true,
      notes: 'Task incomplete — ran out of context',
    });
    expect(inferFixMode(result)).toBe('amend');
  });

  // bonus: GO_WITH_TECH_DEBT → amend
  it('GO_WITH_TECH_DEBT → amend', () => {
    const result = makeResult({
      selfAssessment: 'GO_WITH_TECH_DEBT',
      testsPassed: true,
      rubricScores: { correctness: 80, test_coverage: 70, scope_compliance: 100 },
      notes: 'Missing 2 edge case tests',
    });
    expect(inferFixMode(result)).toBe('amend');
  });

  // DONE + partial rubric (one score below 90) → amend
  it('DONE + rubric partially below 90 → amend (not high enough for verify-only)', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      rubricScores: { correctness: 95, test_coverage: 70, scope_compliance: 100 },
      notes: '',
    });
    expect(inferFixMode(result)).toBe('amend');
  });

  // boundary violation pattern variant: "scope violation"
  it('DONE + scope_violation in notes → amend (boundary detection via "scope.?violation")', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      rubricScores: { correctness: 98, test_coverage: 95, scope_compliance: 100 },
      notes: 'scope violation: modified file outside scope.filesWrite',
    });
    expect(inferFixMode(result)).toBe('amend');
  });

  // DONE + no rubricScores → amend (cannot confirm all-high without data)
  it('DONE + no rubricScores → amend (cannot verify scores)', () => {
    const result = makeResult({
      selfAssessment: 'DONE',
      testsPassed: true,
      rubricScores: undefined,
      notes: '',
    });
    expect(inferFixMode(result)).toBe('amend');
  });
});
