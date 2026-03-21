import { describe, it, expect } from 'vitest';
import { PromptMetrics } from '../../src/agents/prompt-metrics.js';
import type { PromptMetricsReport } from '../../src/agents/prompt-metrics.js';
import type { PromptVersion } from '../../src/agents/prompt-version.js';
import type { Experiment } from '../../src/agents/prompt-ab-test.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeVersion(overrides: Partial<PromptVersion> = {}): PromptVersion {
  return {
    version: 1,
    content: 'prompt content',
    reason: 'test',
    createdAt: '2026-03-22T00:00:00.000Z',
    stats: { uses: 5, successRate: 0.8 },
    ...overrides,
  };
}

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp-1',
    agentId: 'agent-1',
    variantA: 'A',
    variantB: 'B',
    results: [],
    status: 'active',
    createdAt: '2026-03-22T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('PromptMetrics', () => {
  const metrics = new PromptMetrics();

  // ─── collectMetrics ────────────────────────────────────────────

  describe('collectMetrics', () => {
    it('handles empty versions array', () => {
      const report = metrics.collectMetrics('agent-1', []);
      expect(report.agentId).toBe('agent-1');
      expect(report.currentVersion).toBe(0);
      expect(report.totalVersions).toBe(0);
      expect(report.currentSuccessRate).toBe(0);
      expect(report.experimentStatus).toBe('none');
      expect(report.trend).toBe('stable');
    });

    it('reports current version as highest version number', () => {
      const versions = [
        makeVersion({ version: 1 }),
        makeVersion({ version: 3 }),
        makeVersion({ version: 2 }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.currentVersion).toBe(3);
    });

    it('reports total versions', () => {
      const versions = [
        makeVersion({ version: 1 }),
        makeVersion({ version: 2 }),
        makeVersion({ version: 3 }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.totalVersions).toBe(3);
    });

    it('reports current success rate from highest version', () => {
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.6 } }),
        makeVersion({ version: 2, stats: { uses: 3, successRate: 0.9 } }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.currentSuccessRate).toBe(0.9);
    });

    it('identifies best version', () => {
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.6 } }),
        makeVersion({ version: 2, stats: { uses: 3, successRate: 0.95 } }),
        makeVersion({ version: 3, stats: { uses: 2, successRate: 0.7 } }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.bestVersion.version).toBe(2);
      expect(report.bestVersion.successRate).toBe(0.95);
    });

    it('identifies worst version', () => {
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.6 } }),
        makeVersion({ version: 2, stats: { uses: 3, successRate: 0.3 } }),
        makeVersion({ version: 3, stats: { uses: 2, successRate: 0.7 } }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.worstVersion.version).toBe(2);
      expect(report.worstVersion.successRate).toBe(0.3);
    });

    it('reports experiment status as none when no experiment', () => {
      const report = metrics.collectMetrics('agent-1', [makeVersion()]);
      expect(report.experimentStatus).toBe('none');
    });

    it('reports experiment status as active', () => {
      const report = metrics.collectMetrics(
        'agent-1',
        [makeVersion()],
        makeExperiment({ status: 'active' }),
      );
      expect(report.experimentStatus).toBe('active');
    });

    it('reports experiment status as completed', () => {
      const report = metrics.collectMetrics(
        'agent-1',
        [makeVersion()],
        makeExperiment({ status: 'completed' }),
      );
      expect(report.experimentStatus).toBe('completed');
    });

    it('detects improving trend', () => {
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.5 } }),
        makeVersion({ version: 2, stats: { uses: 5, successRate: 0.7 } }),
        makeVersion({ version: 3, stats: { uses: 5, successRate: 0.9 } }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.trend).toBe('improving');
    });

    it('detects declining trend', () => {
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.9 } }),
        makeVersion({ version: 2, stats: { uses: 5, successRate: 0.7 } }),
        makeVersion({ version: 3, stats: { uses: 5, successRate: 0.5 } }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.trend).toBe('declining');
    });

    it('detects stable trend', () => {
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.8 } }),
        makeVersion({ version: 2, stats: { uses: 5, successRate: 0.81 } }),
        makeVersion({ version: 3, stats: { uses: 5, successRate: 0.82 } }),
      ];
      const report = metrics.collectMetrics('agent-1', versions);
      expect(report.trend).toBe('stable');
    });

    it('returns stable for single version', () => {
      const report = metrics.collectMetrics('agent-1', [makeVersion()]);
      expect(report.trend).toBe('stable');
    });
  });

  // ─── formatMetricsReport ───────────────────────────────────────

  describe('formatMetricsReport', () => {
    it('formats a complete report', () => {
      const report: PromptMetricsReport = {
        agentId: 'test-agent',
        currentVersion: 3,
        totalVersions: 5,
        currentSuccessRate: 0.85,
        bestVersion: { version: 2, successRate: 0.95 },
        worstVersion: { version: 1, successRate: 0.4 },
        experimentStatus: 'active',
        trend: 'improving',
      };
      const formatted = metrics.formatMetricsReport(report);
      expect(formatted).toContain('test-agent');
      expect(formatted).toContain('v3');
      expect(formatted).toContain('5');
      expect(formatted).toContain('85.0%');
      expect(formatted).toContain('v2');
      expect(formatted).toContain('95.0%');
      expect(formatted).toContain('v1');
      expect(formatted).toContain('40.0%');
      expect(formatted).toContain('active');
      expect(formatted).toContain('improving');
    });

    it('formats report with zero values', () => {
      const report: PromptMetricsReport = {
        agentId: 'empty-agent',
        currentVersion: 0,
        totalVersions: 0,
        currentSuccessRate: 0,
        bestVersion: { version: 0, successRate: 0 },
        worstVersion: { version: 0, successRate: 0 },
        experimentStatus: 'none',
        trend: 'stable',
      };
      const formatted = metrics.formatMetricsReport(report);
      expect(formatted).toContain('empty-agent');
      expect(formatted).toContain('0.0%');
      expect(formatted).toContain('none');
      expect(formatted).toContain('stable');
    });

    it('includes all required fields', () => {
      const report: PromptMetricsReport = {
        agentId: 'a',
        currentVersion: 1,
        totalVersions: 1,
        currentSuccessRate: 1,
        bestVersion: { version: 1, successRate: 1 },
        worstVersion: { version: 1, successRate: 1 },
        experimentStatus: 'completed',
        trend: 'declining',
      };
      const formatted = metrics.formatMetricsReport(report);
      expect(formatted).toContain('Current version');
      expect(formatted).toContain('Total versions');
      expect(formatted).toContain('Current success rate');
      expect(formatted).toContain('Best version');
      expect(formatted).toContain('Worst version');
      expect(formatted).toContain('Experiment');
      expect(formatted).toContain('Trend');
    });
  });
});
