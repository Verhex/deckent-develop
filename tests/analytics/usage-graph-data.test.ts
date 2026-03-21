import { describe, it, expect } from 'vitest';
import {
  UsageGraphData,
} from '../../src/dashboard/analytics/usage-graph-data.js';
import type {
  UsageEntry,
  TaskTypeEntry,
} from '../../src/dashboard/analytics/usage-graph-data.js';

describe('UsageGraphData', () => {
  const graph = new UsageGraphData();

  // ─── prepareBarData ────────────────────────────────────────────────────────

  describe('prepareBarData', () => {
    it('returns empty array for no entries', () => {
      expect(graph.prepareBarData([])).toEqual([]);
    });

    it('aggregates tokens by model', () => {
      const entries: UsageEntry[] = [
        { model: 'opus', tokenEstimate: 1000, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
        { model: 'opus', tokenEstimate: 500, taskId: 't2', timestamp: '2025-01-01T00:01:00Z' },
        { model: 'sonnet', tokenEstimate: 300, taskId: 't3', timestamp: '2025-01-01T00:02:00Z' },
      ];
      const result = graph.prepareBarData(entries);
      expect(result).toHaveLength(2);
      const opusEntry = result.find((r) => r.label === 'opus');
      expect(opusEntry!.value).toBe(1500);
    });

    it('sorts by value descending', () => {
      const entries: UsageEntry[] = [
        { model: 'haiku', tokenEstimate: 100, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
        { model: 'opus', tokenEstimate: 5000, taskId: 't2', timestamp: '2025-01-01T00:01:00Z' },
      ];
      const result = graph.prepareBarData(entries);
      expect(result[0]!.label).toBe('opus');
      expect(result[1]!.label).toBe('haiku');
    });

    it('assigns correct color for opus', () => {
      const entries: UsageEntry[] = [
        { model: 'opus', tokenEstimate: 1000, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
      ];
      const result = graph.prepareBarData(entries);
      expect(result[0]!.color).toBe('#6366f1');
    });

    it('assigns correct color for sonnet', () => {
      const entries: UsageEntry[] = [
        { model: 'sonnet', tokenEstimate: 500, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
      ];
      const result = graph.prepareBarData(entries);
      expect(result[0]!.color).toBe('#22c55e');
    });

    it('assigns default color for unknown model', () => {
      const entries: UsageEntry[] = [
        { model: 'unknown-model', tokenEstimate: 100, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
      ];
      const result = graph.prepareBarData(entries);
      expect(result[0]!.color).toBe('#94a3b8');
    });
  });

  // ─── prepareModelDistribution ──────────────────────────────────────────────

  describe('prepareModelDistribution', () => {
    it('returns empty array for no entries', () => {
      expect(graph.prepareModelDistribution([])).toEqual([]);
    });

    it('calculates percentage distribution', () => {
      const entries: UsageEntry[] = [
        { model: 'opus', tokenEstimate: 1000, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
        { model: 'opus', tokenEstimate: 500, taskId: 't2', timestamp: '2025-01-01T00:01:00Z' },
        { model: 'sonnet', tokenEstimate: 300, taskId: 't3', timestamp: '2025-01-01T00:02:00Z' },
        { model: 'sonnet', tokenEstimate: 200, taskId: 't4', timestamp: '2025-01-01T00:03:00Z' },
      ];
      const result = graph.prepareModelDistribution(entries);
      expect(result).toHaveLength(2);
      // opus: 2/4 = 50%, sonnet: 2/4 = 50%
      const opusEntry = result.find((r) => r.label === 'opus');
      expect(opusEntry!.value).toBe(50);
    });

    it('sorts by percentage descending', () => {
      const entries: UsageEntry[] = [
        { model: 'haiku', tokenEstimate: 100, taskId: 't1', timestamp: '2025-01-01T00:00:00Z' },
        { model: 'opus', tokenEstimate: 1000, taskId: 't2', timestamp: '2025-01-01T00:01:00Z' },
        { model: 'opus', tokenEstimate: 1000, taskId: 't3', timestamp: '2025-01-01T00:02:00Z' },
        { model: 'opus', tokenEstimate: 1000, taskId: 't4', timestamp: '2025-01-01T00:03:00Z' },
      ];
      const result = graph.prepareModelDistribution(entries);
      expect(result[0]!.label).toBe('opus');
    });
  });

  // ─── prepareTaskTypeDistribution ───────────────────────────────────────────

  describe('prepareTaskTypeDistribution', () => {
    it('returns empty for no task types', () => {
      expect(graph.prepareTaskTypeDistribution([])).toEqual([]);
    });

    it('calculates percentage per task type', () => {
      const types: TaskTypeEntry[] = [
        { type: 'feature', count: 5 },
        { type: 'bugfix', count: 3 },
        { type: 'test', count: 2 },
      ];
      const result = graph.prepareTaskTypeDistribution(types);
      expect(result).toHaveLength(3);
      const featureEntry = result.find((r) => r.label === 'feature');
      expect(featureEntry!.value).toBe(50); // 5/10 * 100
    });

    it('assigns correct color for feature', () => {
      const types: TaskTypeEntry[] = [{ type: 'feature', count: 1 }];
      const result = graph.prepareTaskTypeDistribution(types);
      expect(result[0]!.color).toBe('#3b82f6');
    });

    it('assigns default color for unknown type', () => {
      const types: TaskTypeEntry[] = [{ type: 'custom', count: 1 }];
      const result = graph.prepareTaskTypeDistribution(types);
      expect(result[0]!.color).toBe('#94a3b8');
    });

    it('returns empty when total count is zero', () => {
      const types: TaskTypeEntry[] = [{ type: 'feature', count: 0 }];
      const result = graph.prepareTaskTypeDistribution(types);
      expect(result).toEqual([]);
    });
  });

  // ─── Color helpers ─────────────────────────────────────────────────────────

  describe('getModelColor', () => {
    it('returns opus color', () => {
      expect(graph.getModelColor('opus')).toBe('#6366f1');
    });

    it('returns haiku color', () => {
      expect(graph.getModelColor('haiku')).toBe('#f59e0b');
    });

    it('returns default for unknown', () => {
      expect(graph.getModelColor('gpt4')).toBe('#94a3b8');
    });
  });

  describe('getTaskTypeColor', () => {
    it('returns bugfix color', () => {
      expect(graph.getTaskTypeColor('bugfix')).toBe('#ef4444');
    });

    it('returns default for unknown type', () => {
      expect(graph.getTaskTypeColor('deployment')).toBe('#94a3b8');
    });
  });
});
