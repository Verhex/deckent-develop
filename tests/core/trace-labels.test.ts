// tests/core/trace-labels.test.ts
//
// Sprint 357, Task 357-012 TRN-LABEL — run-outcome label taxonomy + the two
// mappers (task-evaluation -> label, sprint-summary -> label). Exhaustive:
// every TaskEvaluationLike value and every RunOutcomeLabel value is covered.
// Hermetic: no gitignored state, no spawnSync, pure functions only.

import { describe, it, expect } from 'vitest';
import {
  RunOutcomeLabelSchema,
  RUN_OUTCOME_LABELS,
  mapTaskEvaluationToLabel,
  mapSprintSummaryToLabel,
  DEFAULT_SPRINT_LABEL_THRESHOLDS,
  RunOutcomeLabelCountsSchema,
  type RunOutcomeLabel,
  type TaskEvaluationLike,
} from '../../src/core/trace-labels.js';

// ─── RunOutcomeLabelSchema ───────────────────────────────────────────────────

describe('RunOutcomeLabelSchema', () => {
  it('parses all 5 canonical labels', () => {
    const labels = ['success', 'partial', 'cancelled', 'failed', 'not_dispatched'];
    for (const label of labels) {
      expect(RunOutcomeLabelSchema.parse(label)).toBe(label);
    }
  });

  it('RUN_OUTCOME_LABELS exposes exactly the 5 values, in schema order', () => {
    expect(RUN_OUTCOME_LABELS).toEqual(['success', 'partial', 'cancelled', 'failed', 'not_dispatched']);
  });

  it('rejects an unknown string', () => {
    expect(() => RunOutcomeLabelSchema.parse('unknown_label')).toThrow();
  });

  it('rejects non-string input', () => {
    expect(() => RunOutcomeLabelSchema.parse(42)).toThrow();
  });
});

// ─── mapTaskEvaluationToLabel — exhaustive per-value coverage ───────────────

describe('mapTaskEvaluationToLabel', () => {
  const cases: Array<[TaskEvaluationLike, RunOutcomeLabel]> = [
    ['DONE', 'success'],
    ['GO_WITH_TECH_DEBT', 'partial'],
    ['NO_GO', 'failed'],
    ['DEFERRED', 'cancelled'],
    ['NOT_DISPATCHED', 'not_dispatched'],
  ];

  it.each(cases)('maps %s -> %s', (evaluation, expected) => {
    expect(mapTaskEvaluationToLabel(evaluation)).toBe(expected);
  });

  it('covers every TaskEvaluationLike value exactly once (exhaustive-mapping proof)', () => {
    const inputs = cases.map(([evaluation]) => evaluation);
    expect(new Set(inputs).size).toBe(cases.length);
    expect(inputs.sort()).toEqual(
      ['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO', 'DEFERRED', 'NOT_DISPATCHED'].sort(),
    );
  });

  it('produces a value that is always a valid RunOutcomeLabel', () => {
    for (const [evaluation] of cases) {
      expect(() => RunOutcomeLabelSchema.parse(mapTaskEvaluationToLabel(evaluation))).not.toThrow();
    }
  });
});

// ─── mapSprintSummaryToLabel — ratio-threshold rollup ───────────────────────

function counts(partial: Partial<Record<RunOutcomeLabel, number>>): Record<RunOutcomeLabel, number> {
  return {
    success: 0,
    partial: 0,
    failed: 0,
    cancelled: 0,
    not_dispatched: 0,
    ...partial,
  };
}

describe('mapSprintSummaryToLabel', () => {
  it('empty sprint (no tasks at all) -> not_dispatched', () => {
    expect(mapSprintSummaryToLabel(counts({}))).toBe('not_dispatched');
  });

  it('every task not_dispatched -> not_dispatched', () => {
    expect(mapSprintSummaryToLabel(counts({ not_dispatched: 4 }))).toBe('not_dispatched');
  });

  it('every task success -> success', () => {
    expect(mapSprintSummaryToLabel(counts({ success: 5 }))).toBe('success');
  });

  it('every task cancelled -> cancelled', () => {
    expect(mapSprintSummaryToLabel(counts({ cancelled: 3 }))).toBe('cancelled');
  });

  it('every task failed -> failed', () => {
    expect(mapSprintSummaryToLabel(counts({ failed: 3 }))).toBe('failed');
  });

  it('cancelled-rate at default threshold (0.5) -> cancelled, checked before failed', () => {
    expect(mapSprintSummaryToLabel(counts({ cancelled: 2, failed: 2 }))).toBe('cancelled');
  });

  it('failed-rate at default threshold (0.5), no cancellations -> failed', () => {
    expect(mapSprintSummaryToLabel(counts({ failed: 2, success: 2 }))).toBe('failed');
  });

  it('mixed outcome below both thresholds -> partial', () => {
    // 1/4 failed, 1/4 cancelled, 2/4 success — neither rate reaches 0.5.
    expect(mapSprintSummaryToLabel(counts({ success: 2, failed: 1, cancelled: 1 }))).toBe('partial');
  });

  it('tech-debt-only sprint (all partial) -> partial', () => {
    expect(mapSprintSummaryToLabel(counts({ partial: 4 }))).toBe('partial');
  });

  it('mostly success with a little tech debt -> partial (not success, since not all succeeded)', () => {
    expect(mapSprintSummaryToLabel(counts({ success: 3, partial: 1 }))).toBe('partial');
  });

  it('respects custom thresholds', () => {
    const strict = { majorityCancelledRate: 0.9, majorityFailedRate: 0.9 };
    // 50% failed no longer reaches the stricter 0.9 threshold -> falls through to partial.
    expect(mapSprintSummaryToLabel(counts({ failed: 2, success: 2 }), strict)).toBe('partial');
    expect(DEFAULT_SPRINT_LABEL_THRESHOLDS.majorityFailedRate).toBe(0.5);
  });
});

// ─── RunOutcomeLabelCountsSchema ─────────────────────────────────────────────

describe('RunOutcomeLabelCountsSchema', () => {
  it('parses a valid nonnegative-integer count record', () => {
    const valid = { success: 3, partial: 1, failed: 0, cancelled: 0, not_dispatched: 2 };
    expect(RunOutcomeLabelCountsSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a negative count', () => {
    expect(() => RunOutcomeLabelCountsSchema.parse({ success: -1 })).toThrow();
  });

  it('rejects a non-integer count', () => {
    expect(() => RunOutcomeLabelCountsSchema.parse({ success: 1.5 })).toThrow();
  });

  it('rejects an unknown label key', () => {
    expect(() => RunOutcomeLabelCountsSchema.parse({ bogus_label: 1 })).toThrow();
  });
});
