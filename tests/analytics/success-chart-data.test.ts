import { describe, it, expect } from 'vitest';
import {
  SuccessChartData,
} from '../../src/dashboard/analytics/success-chart-data.js';
import type {
  SprintDataPoint,
  TimelineEntry,
} from '../../src/dashboard/analytics/success-chart-data.js';

describe('SuccessChartData', () => {
  const chart = new SuccessChartData();

  // ─── prepareTimelineData ───────────────────────────────────────────────────

  describe('prepareTimelineData', () => {
    it('returns empty array for no sprints', () => {
      expect(chart.prepareTimelineData([])).toEqual([]);
    });

    it('calculates success rate correctly', () => {
      const sprints: SprintDataPoint[] = [
        { sprintId: 's1', totalTasks: 10, completedTasks: 7, techDebtTasks: 2, noGoTasks: 1, coverage: 80 },
      ];
      const result = chart.prepareTimelineData(sprints);
      expect(result[0]!.successRate).toBe(90); // (7+2)/10 * 100
    });

    it('handles zero total tasks', () => {
      const sprints: SprintDataPoint[] = [
        { sprintId: 's1', totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0, coverage: 0 },
      ];
      const result = chart.prepareTimelineData(sprints);
      expect(result[0]!.successRate).toBe(0);
    });

    it('preserves coverage rate', () => {
      const sprints: SprintDataPoint[] = [
        { sprintId: 's1', totalTasks: 5, completedTasks: 5, techDebtTasks: 0, noGoTasks: 0, coverage: 85.5 },
      ];
      const result = chart.prepareTimelineData(sprints);
      expect(result[0]!.coverageRate).toBe(85.5);
    });

    it('preserves task count', () => {
      const sprints: SprintDataPoint[] = [
        { sprintId: 's1', totalTasks: 12, completedTasks: 10, techDebtTasks: 2, noGoTasks: 0, coverage: 90 },
      ];
      const result = chart.prepareTimelineData(sprints);
      expect(result[0]!.taskCount).toBe(12);
    });

    it('handles multiple sprints', () => {
      const sprints: SprintDataPoint[] = [
        { sprintId: 's1', totalTasks: 10, completedTasks: 8, techDebtTasks: 1, noGoTasks: 1, coverage: 70 },
        { sprintId: 's2', totalTasks: 5, completedTasks: 5, techDebtTasks: 0, noGoTasks: 0, coverage: 90 },
      ];
      const result = chart.prepareTimelineData(sprints);
      expect(result).toHaveLength(2);
      expect(result[0]!.sprintId).toBe('s1');
      expect(result[1]!.sprintId).toBe('s2');
    });
  });

  // ─── calculateTrend ────────────────────────────────────────────────────────

  describe('calculateTrend', () => {
    it('returns stable for single data point', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 80, coverageRate: 70, taskCount: 5 },
      ];
      expect(chart.calculateTrend(data)).toBe('stable');
    });

    it('returns improving for upward trend', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 60, coverageRate: 50, taskCount: 5 },
        { sprintId: 's2', successRate: 70, coverageRate: 60, taskCount: 5 },
        { sprintId: 's3', successRate: 80, coverageRate: 70, taskCount: 5 },
        { sprintId: 's4', successRate: 90, coverageRate: 80, taskCount: 5 },
        { sprintId: 's5', successRate: 95, coverageRate: 90, taskCount: 5 },
      ];
      expect(chart.calculateTrend(data)).toBe('improving');
    });

    it('returns declining for downward trend', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 95, coverageRate: 90, taskCount: 5 },
        { sprintId: 's2', successRate: 85, coverageRate: 80, taskCount: 5 },
        { sprintId: 's3', successRate: 70, coverageRate: 70, taskCount: 5 },
        { sprintId: 's4', successRate: 60, coverageRate: 60, taskCount: 5 },
        { sprintId: 's5', successRate: 50, coverageRate: 50, taskCount: 5 },
      ];
      expect(chart.calculateTrend(data)).toBe('declining');
    });

    it('returns stable for flat data', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 80, coverageRate: 70, taskCount: 5 },
        { sprintId: 's2', successRate: 80, coverageRate: 70, taskCount: 5 },
        { sprintId: 's3', successRate: 80, coverageRate: 70, taskCount: 5 },
      ];
      expect(chart.calculateTrend(data)).toBe('stable');
    });

    it('returns stable for empty data', () => {
      expect(chart.calculateTrend([])).toBe('stable');
    });
  });

  // ─── findPeakSprint ────────────────────────────────────────────────────────

  describe('findPeakSprint', () => {
    it('returns null for empty data', () => {
      expect(chart.findPeakSprint([])).toBeNull();
    });

    it('finds sprint with highest success rate', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 70, coverageRate: 60, taskCount: 5 },
        { sprintId: 's2', successRate: 95, coverageRate: 80, taskCount: 5 },
        { sprintId: 's3', successRate: 85, coverageRate: 70, taskCount: 5 },
      ];
      const peak = chart.findPeakSprint(data);
      expect(peak!.sprintId).toBe('s2');
      expect(peak!.successRate).toBe(95);
    });

    it('returns first sprint when single entry', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 80, coverageRate: 70, taskCount: 5 },
      ];
      const peak = chart.findPeakSprint(data);
      expect(peak!.sprintId).toBe('s1');
    });
  });

  // ─── findValleySprint ──────────────────────────────────────────────────────

  describe('findValleySprint', () => {
    it('returns null for empty data', () => {
      expect(chart.findValleySprint([])).toBeNull();
    });

    it('finds sprint with lowest success rate', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 70, coverageRate: 60, taskCount: 5 },
        { sprintId: 's2', successRate: 95, coverageRate: 80, taskCount: 5 },
        { sprintId: 's3', successRate: 40, coverageRate: 30, taskCount: 5 },
      ];
      const valley = chart.findValleySprint(data);
      expect(valley!.sprintId).toBe('s3');
      expect(valley!.successRate).toBe(40);
    });
  });

  // ─── calculateMovingAverage ────────────────────────────────────────────────

  describe('calculateMovingAverage', () => {
    it('returns empty for empty data', () => {
      expect(chart.calculateMovingAverage([], 3)).toEqual([]);
    });

    it('returns empty for zero window size', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 80, coverageRate: 70, taskCount: 5 },
      ];
      expect(chart.calculateMovingAverage(data, 0)).toEqual([]);
    });

    it('calculates moving average with window 3', () => {
      const data: TimelineEntry[] = [
        { sprintId: 's1', successRate: 60, coverageRate: 50, taskCount: 5 },
        { sprintId: 's2', successRate: 80, coverageRate: 70, taskCount: 5 },
        { sprintId: 's3', successRate: 100, coverageRate: 90, taskCount: 5 },
      ];
      const result = chart.calculateMovingAverage(data, 3);
      expect(result).toHaveLength(3);
      // s1: avg(60) = 60
      expect(result[0]).toBe(60);
      // s2: avg(60, 80) = 70
      expect(result[1]).toBe(70);
      // s3: avg(60, 80, 100) = 80
      expect(result[2]).toBe(80);
    });
  });
});
