import { describe, it, expect } from 'vitest';
import { SprintComparison } from '../../../src/cli/helpers/sprint-comparison.js';
import type { SprintMetrics } from '../../../src/core/types.js';

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 0,
    durationMs: 120000,
    coveragePercent: 85,
    noGoRate: 0,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 3,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 100,
    ...overrides,
  };
}

describe('SprintComparison', () => {
  const comparison = new SprintComparison();

  // ─── compare ──────────────────────────────────────────────────────

  describe('compare', () => {
    it('returns isFirst=true when no previous sprint', () => {
      const delta = comparison.compare(makeMetrics(), null);
      expect(delta.isFirst).toBe(true);
    });

    it('returns isFirst=false with previous sprint', () => {
      const delta = comparison.compare(makeMetrics(), makeMetrics());
      expect(delta.isFirst).toBe(false);
    });

    it('calculates coverage delta', () => {
      const current = makeMetrics({ coveragePercent: 90 });
      const previous = makeMetrics({ coveragePercent: 85 });
      const delta = comparison.compare(current, previous);
      expect(delta.coverageDelta).toBe(5);
    });

    it('calculates negative coverage delta', () => {
      const current = makeMetrics({ coveragePercent: 80 });
      const previous = makeMetrics({ coveragePercent: 85 });
      const delta = comparison.compare(current, previous);
      expect(delta.coverageDelta).toBe(-5);
    });

    it('calculates duration delta', () => {
      const current = makeMetrics({ durationMs: 150000 });
      const previous = makeMetrics({ durationMs: 120000 });
      const delta = comparison.compare(current, previous);
      expect(delta.durationDelta).toBe(30000);
    });

    it('calculates noGoRate delta', () => {
      const current = makeMetrics({ noGoRate: 0.2 });
      const previous = makeMetrics({ noGoRate: 0.1 });
      const delta = comparison.compare(current, previous);
      expect(delta.noGoRateDelta).toBeCloseTo(0.1);
    });

    it('calculates task count delta', () => {
      const current = makeMetrics({ totalTasks: 8 });
      const previous = makeMetrics({ totalTasks: 5 });
      const delta = comparison.compare(current, previous);
      expect(delta.taskCountDelta).toBe(3);
    });

    it('calculates debt delta', () => {
      const current = makeMetrics({ totalOpenDebt: 5 });
      const previous = makeMetrics({ totalOpenDebt: 3 });
      const delta = comparison.compare(current, previous);
      expect(delta.debtDelta).toBe(2);
    });

    it('returns all zeros for first sprint deltas', () => {
      const delta = comparison.compare(makeMetrics(), null);
      expect(delta.coverageDelta).toBe(0);
      expect(delta.durationDelta).toBe(0);
      expect(delta.noGoRateDelta).toBe(0);
      expect(delta.taskCountDelta).toBe(0);
      expect(delta.debtDelta).toBe(0);
    });
  });

  // ─── formatDelta ──────────────────────────────────────────────────

  describe('formatDelta', () => {
    it('returns first sprint message when isFirst', () => {
      const delta = comparison.compare(makeMetrics(), null);
      const output = comparison.formatDelta(delta);
      expect(output).toBe('First sprint - no comparison available');
    });

    it('shows coverage change with +/- sign', () => {
      const delta = comparison.compare(
        makeMetrics({ coveragePercent: 90 }),
        makeMetrics({ coveragePercent: 85 }),
      );
      const output = comparison.formatDelta(delta);
      expect(output).toContain('+5.0%');
    });

    it('shows negative coverage change', () => {
      const delta = comparison.compare(
        makeMetrics({ coveragePercent: 80 }),
        makeMetrics({ coveragePercent: 85 }),
      );
      const output = comparison.formatDelta(delta);
      expect(output).toContain('-5.0%');
    });

    it('shows duration change in seconds', () => {
      const delta = comparison.compare(
        makeMetrics({ durationMs: 132000 }),
        makeMetrics({ durationMs: 120000 }),
      );
      const output = comparison.formatDelta(delta);
      expect(output).toContain('+12s');
    });

    it('shows negative duration change', () => {
      const delta = comparison.compare(
        makeMetrics({ durationMs: 108000 }),
        makeMetrics({ durationMs: 120000 }),
      );
      const output = comparison.formatDelta(delta);
      expect(output).toContain('-12s');
    });

    it('shows "no change" for zero deltas', () => {
      const delta = comparison.compare(makeMetrics(), makeMetrics());
      const output = comparison.formatDelta(delta);
      expect(output).toContain('no change');
    });

    it('contains Sprint Comparison header', () => {
      const delta = comparison.compare(makeMetrics(), makeMetrics());
      const output = comparison.formatDelta(delta);
      expect(output).toContain('Sprint Comparison:');
    });

    it('shows task count change', () => {
      const delta = comparison.compare(
        makeMetrics({ totalTasks: 8 }),
        makeMetrics({ totalTasks: 5 }),
      );
      const output = comparison.formatDelta(delta);
      expect(output).toContain('+3');
    });

    it('shows debt change', () => {
      const delta = comparison.compare(
        makeMetrics({ totalOpenDebt: 5 }),
        makeMetrics({ totalOpenDebt: 3 }),
      );
      const output = comparison.formatDelta(delta);
      expect(output).toContain('+2');
    });
  });
});
