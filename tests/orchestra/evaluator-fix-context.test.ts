import { describe, it, expect } from 'vitest';
import type { TaskResult, EvaluationResult } from '../../src/core/types.js';
import {
  buildEnrichedFixReason,
} from '../../src/orchestra/result-evaluator.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001-001',
    workerId: 'w-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'Tests failed after 3 attempts.',
    ...overrides,
  };
}

// ─── D-3: FIX Context Enrichment ────────────────────────────────────

describe('buildEnrichedFixReason()', () => {
  it('includes task ID in reason', () => {
    const result = makeResult();
    const reason = buildEnrichedFixReason('001-001', result);
    expect(reason).toContain('Task 001-001 evaluated as NO_GO');
  });

  it('includes "tests failed" when testsPassed is false', () => {
    const result = makeResult({ testsPassed: false });
    const reason = buildEnrichedFixReason('001-001', result);
    expect(reason).toContain('tests failed');
  });

  it('includes "no files changed" when filesChanged is empty', () => {
    const result = makeResult({ filesChanged: [] });
    const reason = buildEnrichedFixReason('001-001', result);
    expect(reason).toContain('no files changed');
  });

  it('includes rubric scores when rubricResult provided', () => {
    const result = makeResult();
    const rubricResult: EvaluationResult = {
      decision: 'NO_GO',
      totalScore: 35,
      rubricScores: [
        { criterion: 'correctness', score: 0, passed: false, reason: 'tests failed' },
        { criterion: 'scope_compliance', score: 0, passed: false, reason: '0/3 files within scope' },
        { criterion: 'test_coverage', score: 80, passed: true, reason: 'coverage 80%' },
        { criterion: 'documentation', score: 70, passed: true, reason: 'moderate notes' },
      ],
      retryCount: 0,
    };

    const reason = buildEnrichedFixReason('001-001', result, rubricResult);
    expect(reason).toContain('totalScore=35');
    expect(reason).toContain('correctness=0 (FAILED');
    expect(reason).toContain('scope_compliance=0 (FAILED');
    // Passed criteria should NOT appear as FAILED
    expect(reason).not.toContain('test_coverage=80 (FAILED');
  });

  it('includes truncated worker notes', () => {
    const longNotes = 'A'.repeat(300);
    const result = makeResult({ notes: longNotes });
    const reason = buildEnrichedFixReason('001-001', result);
    expect(reason).toContain('worker notes:');
    // Should be truncated to 200 chars
    expect(reason.length).toBeLessThan(longNotes.length + 200);
  });

  it('handles result with no notes gracefully', () => {
    const result = makeResult({ notes: '' });
    const reason = buildEnrichedFixReason('001-001', result);
    expect(reason).not.toContain('worker notes:');
  });
});
