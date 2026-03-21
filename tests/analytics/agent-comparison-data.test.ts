import { describe, it, expect } from 'vitest';
import {
  AgentComparisonData,
} from '../../src/dashboard/analytics/agent-comparison-data.js';
import type {
  AgentPerformance,
  AgentComparisonEntry,
} from '../../src/dashboard/analytics/agent-comparison-data.js';

describe('AgentComparisonData', () => {
  const comparison = new AgentComparisonData();

  const sampleAgents: AgentPerformance[] = [
    { agentId: 'security-auditor', tasksCompleted: 8, tasksFailed: 2, techDebtTasks: 1, avgDurationMs: 50000, avgCoverage: 85 },
    { agentId: 'test-writer', tasksCompleted: 15, tasksFailed: 1, techDebtTasks: 3, avgDurationMs: 30000, avgCoverage: 92 },
    { agentId: 'doc-writer', tasksCompleted: 10, tasksFailed: 5, techDebtTasks: 2, avgDurationMs: 20000, avgCoverage: 70 },
  ];

  // ─── prepareComparisonTable ────────────────────────────────────────────────

  describe('prepareComparisonTable', () => {
    it('returns empty array for no agents', () => {
      expect(comparison.prepareComparisonTable([])).toEqual([]);
    });

    it('calculates success rate correctly', () => {
      const result = comparison.prepareComparisonTable(sampleAgents);
      // test-writer: (15+3) / (15+1+3) = 18/19 * 100 = 94.74%
      const testWriter = result.find((r) => r.agentId === 'test-writer')!;
      expect(testWriter.successRate).toBe(94.74);
    });

    it('calculates totalTasks correctly', () => {
      const result = comparison.prepareComparisonTable(sampleAgents);
      const securityAuditor = result.find((r) => r.agentId === 'security-auditor')!;
      expect(securityAuditor.totalTasks).toBe(11); // 8+2+1
    });

    it('preserves agent fields', () => {
      const result = comparison.prepareComparisonTable(sampleAgents);
      const docWriter = result.find((r) => r.agentId === 'doc-writer')!;
      expect(docWriter.tasksCompleted).toBe(10);
      expect(docWriter.tasksFailed).toBe(5);
      expect(docWriter.techDebtTasks).toBe(2);
      expect(docWriter.avgDurationMs).toBe(20000);
      expect(docWriter.avgCoverage).toBe(70);
    });

    it('handles zero total tasks', () => {
      const agents: AgentPerformance[] = [
        { agentId: 'empty', tasksCompleted: 0, tasksFailed: 0, techDebtTasks: 0, avgDurationMs: 0, avgCoverage: 0 },
      ];
      const result = comparison.prepareComparisonTable(agents);
      expect(result[0]!.successRate).toBe(0);
    });
  });

  // ─── sortByColumn ──────────────────────────────────────────────────────────

  describe('sortByColumn', () => {
    it('sorts by successRate descending', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const sorted = comparison.sortByColumn(table, 'successRate', 'desc');
      expect(sorted[0]!.agentId).toBe('test-writer');
    });

    it('sorts by successRate ascending', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const sorted = comparison.sortByColumn(table, 'successRate', 'asc');
      expect(sorted[0]!.agentId).toBe('doc-writer');
    });

    it('sorts by agentId alphabetically', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const sorted = comparison.sortByColumn(table, 'agentId', 'asc');
      expect(sorted[0]!.agentId).toBe('doc-writer');
      expect(sorted[1]!.agentId).toBe('security-auditor');
      expect(sorted[2]!.agentId).toBe('test-writer');
    });

    it('sorts by avgDurationMs', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const sorted = comparison.sortByColumn(table, 'avgDurationMs', 'asc');
      expect(sorted[0]!.agentId).toBe('doc-writer');
    });

    it('does not mutate original array', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const original0 = table[0]!.agentId;
      comparison.sortByColumn(table, 'successRate', 'desc');
      expect(table[0]!.agentId).toBe(original0);
    });
  });

  // ─── getBestPerformer ──────────────────────────────────────────────────────

  describe('getBestPerformer', () => {
    it('returns null for empty array', () => {
      expect(comparison.getBestPerformer([])).toBeNull();
    });

    it('returns agent with highest success rate', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const best = comparison.getBestPerformer(table)!;
      expect(best.agentId).toBe('test-writer');
    });

    it('breaks tie by totalTasks', () => {
      const tiedAgents: AgentPerformance[] = [
        { agentId: 'a1', tasksCompleted: 5, tasksFailed: 0, techDebtTasks: 0, avgDurationMs: 1000, avgCoverage: 90 },
        { agentId: 'a2', tasksCompleted: 10, tasksFailed: 0, techDebtTasks: 0, avgDurationMs: 1000, avgCoverage: 90 },
      ];
      const table = comparison.prepareComparisonTable(tiedAgents);
      const best = comparison.getBestPerformer(table)!;
      expect(best.agentId).toBe('a2');
    });
  });

  // ─── getWorstPerformer ─────────────────────────────────────────────────────

  describe('getWorstPerformer', () => {
    it('returns null for empty array', () => {
      expect(comparison.getWorstPerformer([])).toBeNull();
    });

    it('returns agent with lowest success rate', () => {
      const table = comparison.prepareComparisonTable(sampleAgents);
      const worst = comparison.getWorstPerformer(table)!;
      expect(worst.agentId).toBe('doc-writer');
    });

    it('breaks tie by totalTasks (more tasks = more notable)', () => {
      const tiedAgents: AgentPerformance[] = [
        { agentId: 'a1', tasksCompleted: 1, tasksFailed: 1, techDebtTasks: 0, avgDurationMs: 1000, avgCoverage: 50 },
        { agentId: 'a2', tasksCompleted: 5, tasksFailed: 5, techDebtTasks: 0, avgDurationMs: 1000, avgCoverage: 50 },
      ];
      const table = comparison.prepareComparisonTable(tiedAgents);
      const worst = comparison.getWorstPerformer(table)!;
      expect(worst.agentId).toBe('a2');
    });
  });

  // ─── formatDuration ────────────────────────────────────────────────────────

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(comparison.formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(comparison.formatDuration(5000)).toBe('5.0s');
    });

    it('formats minutes', () => {
      expect(comparison.formatDuration(120000)).toBe('2.0m');
    });

    it('formats sub-second correctly', () => {
      expect(comparison.formatDuration(999)).toBe('999ms');
    });
  });
});
