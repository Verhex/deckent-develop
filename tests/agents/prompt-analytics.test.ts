// ─── Prompt Analytics Tests ──────────────────────────────────────────────────
// Tests for the unified PromptAnalytics class combining A/B testing and metrics.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptAnalytics } from '../../src/agents/prompt-analytics.js';
import type { PromptMetricsReport } from '../../src/agents/prompt-analytics.js';
import type { PromptVersion } from '../../src/agents/prompt-version.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

// ─── Helpers ────────────────────────────────────────────────────────

let tmpDir: string;

function setup(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-analytics-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

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

// ─── Tests ──────────────────────────────────────────────────────────

describe('PromptAnalytics', () => {
  beforeEach(() => {
    tmpDir = setup();
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  // ─── Constructor ───────────────────────────────────────────────

  describe('constructor', () => {
    it('creates an instance with projectRoot', () => {
      const analytics = new PromptAnalytics(tmpDir);
      expect(analytics).toBeInstanceOf(PromptAnalytics);
    });
  });

  // ─── A/B Testing: createExperiment ─────────────────────────────

  describe('createExperiment', () => {
    it('creates a new experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'Prompt A', 'Prompt B');
      expect(exp.id).toBeTruthy();
      expect(exp.agentId).toBe('agent-1');
      expect(exp.variantA).toBe('Prompt A');
      expect(exp.variantB).toBe('Prompt B');
      expect(exp.status).toBe('active');
      expect(exp.results).toEqual([]);
    });

    it('throws when agent already has active experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      analytics.createExperiment('agent-1', 'A', 'B');
      expect(() => analytics.createExperiment('agent-1', 'C', 'D')).toThrow('already has an active experiment');
    });

    it('allows different agents to have experiments simultaneously', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp1 = analytics.createExperiment('agent-1', 'A', 'B');
      const exp2 = analytics.createExperiment('agent-2', 'C', 'D');
      expect(exp1.agentId).toBe('agent-1');
      expect(exp2.agentId).toBe('agent-2');
    });

    it('persists experiment to disk', () => {
      const analytics = new PromptAnalytics(tmpDir);
      analytics.createExperiment('agent-1', 'A', 'B');
      const dir = path.join(tmpDir, '.deckent', 'experiments', 'agent-1');
      expect(fs.existsSync(dir)).toBe(true);
      const files = fs.readdirSync(dir);
      expect(files.length).toBe(1);
    });
  });

  // ─── A/B Testing: getActiveExperiment ──────────────────────────

  describe('getActiveExperiment', () => {
    it('returns null when no experiments exist', () => {
      const analytics = new PromptAnalytics(tmpDir);
      expect(analytics.getActiveExperiment('agent-1')).toBeNull();
    });

    it('returns active experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      const active = analytics.getActiveExperiment('agent-1');
      expect(active).not.toBeNull();
      expect(active!.id).toBe(exp.id);
    });

    it('returns null after experiment is completed', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      analytics.completeExperiment(exp.id);
      expect(analytics.getActiveExperiment('agent-1')).toBeNull();
    });
  });

  // ─── A/B Testing: getExperiment ────────────────────────────────

  describe('getExperiment', () => {
    it('returns null for non-existent experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      expect(analytics.getExperiment('fake-id')).toBeNull();
    });

    it('returns experiment by id', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      const found = analytics.getExperiment(exp.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(exp.id);
    });
  });

  // ─── A/B Testing: assignVariant ────────────────────────────────

  describe('assignVariant', () => {
    it('returns A or B', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      const variant = analytics.assignVariant(exp.id);
      expect(['A', 'B']).toContain(variant);
    });

    it('deterministically returns B when experiment has 3 A-results and 0 B-results', () => {
      // PRE-FIX: this test FAILS on pure-random implementation because it ignores experimentId
      // POST-FIX: balanced assignment reads results and returns under-represented variant
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'PromptA', 'PromptB');
      analytics.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      analytics.recordResult(exp.id, 'A', 'DONE', 85, 'sprint-002');
      analytics.recordResult(exp.id, 'A', 'NO_GO', 50, 'sprint-003');
      // 3 A-results, 0 B-results → B is under-represented → must return 'B'
      const variant = analytics.assignVariant(exp.id);
      expect(variant).toBe('B');
    });

    it('falls back to A or B without throwing when experiment is not found', () => {
      const analytics = new PromptAnalytics(tmpDir);
      // Non-existent experimentId must not throw — should return 'A' or 'B'
      expect(() => {
        const variant = analytics.assignVariant('non-existent-experiment-id');
        expect(['A', 'B']).toContain(variant);
      }).not.toThrow();
    });

    it('returns A when B has more results (A is under-represented)', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'PromptA', 'PromptB');
      analytics.recordResult(exp.id, 'B', 'DONE', 80, 'sprint-001');
      analytics.recordResult(exp.id, 'B', 'DONE', 75, 'sprint-002');
      // 0 A-results, 2 B-results → A is under-represented → must return 'A'
      const variant = analytics.assignVariant(exp.id);
      expect(variant).toBe('A');
    });

    it('returns A or B (random) when counts are equal', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'PromptA', 'PromptB');
      analytics.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      analytics.recordResult(exp.id, 'B', 'DONE', 80, 'sprint-001');
      // Equal counts → random fallback
      const variant = analytics.assignVariant(exp.id);
      expect(['A', 'B']).toContain(variant);
    });
  });

  // ─── A/B Testing: recordResult ─────────────────────────────────

  describe('recordResult', () => {
    it('records a result and persists it', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      analytics.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      const updated = analytics.getExperiment(exp.id);
      expect(updated!.results.length).toBe(1);
      expect(updated!.results[0]!.variant).toBe('A');
    });

    it('throws for non-existent experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      expect(() => analytics.recordResult('fake-id', 'A', 'DONE', 90, 'sprint-001')).toThrow('not found');
    });

    it('throws for completed experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      analytics.completeExperiment(exp.id);
      expect(() => analytics.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001')).toThrow('not active');
    });
  });

  // ─── A/B Testing: analyzeExperiment ────────────────────────────

  describe('analyzeExperiment', () => {
    it('returns inconclusive with no results', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      const analysis = analytics.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('inconclusive');
      expect(analysis.sampleSize).toBe(0);
    });

    it('declares winner A when A is significantly better', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      analytics.recordResult(exp.id, 'A', 'DONE', 95, 'sprint-001');
      analytics.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      analytics.recordResult(exp.id, 'B', 'NO_GO', 20, 'sprint-002');
      analytics.recordResult(exp.id, 'B', 'NO_GO', 15, 'sprint-002');
      const analysis = analytics.analyzeExperiment(exp.id);
      expect(analysis.winner).toBe('A');
      expect(analysis.aStats.successRate).toBe(1);
      expect(analysis.bStats.successRate).toBe(0);
    });

    it('throws for non-existent experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      expect(() => analytics.analyzeExperiment('fake-id')).toThrow('not found');
    });
  });

  // ─── A/B Testing: completeExperiment ───────────────────────────

  describe('completeExperiment', () => {
    it('marks experiment as completed', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      analytics.completeExperiment(exp.id);
      const updated = analytics.getExperiment(exp.id);
      expect(updated!.status).toBe('completed');
    });

    it('throws for non-existent experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      expect(() => analytics.completeExperiment('fake-id')).toThrow('not found');
    });
  });

  // ─── Metrics: collectMetrics ────────────────────────────────────

  describe('collectMetrics', () => {
    it('handles empty versions array', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const report = analytics.collectMetrics('agent-1', []);
      expect(report.agentId).toBe('agent-1');
      expect(report.currentVersion).toBe(0);
      expect(report.totalVersions).toBe(0);
      expect(report.currentSuccessRate).toBe(0);
      expect(report.experimentStatus).toBe('none');
      expect(report.trend).toBe('stable');
    });

    it('identifies best and worst versions', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.6 } }),
        makeVersion({ version: 2, stats: { uses: 3, successRate: 0.95 } }),
        makeVersion({ version: 3, stats: { uses: 2, successRate: 0.7 } }),
      ];
      const report = analytics.collectMetrics('agent-1', versions);
      expect(report.bestVersion.version).toBe(2);
      expect(report.worstVersion.version).toBe(1);
    });

    it('detects improving trend', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.5 } }),
        makeVersion({ version: 2, stats: { uses: 5, successRate: 0.7 } }),
        makeVersion({ version: 3, stats: { uses: 5, successRate: 0.9 } }),
      ];
      const report = analytics.collectMetrics('agent-1', versions);
      expect(report.trend).toBe('improving');
    });

    it('detects declining trend', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const versions = [
        makeVersion({ version: 1, stats: { uses: 5, successRate: 0.9 } }),
        makeVersion({ version: 2, stats: { uses: 5, successRate: 0.7 } }),
        makeVersion({ version: 3, stats: { uses: 5, successRate: 0.5 } }),
      ];
      const report = analytics.collectMetrics('agent-1', versions);
      expect(report.trend).toBe('declining');
    });

    it('reports experiment status from passed experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      const report = analytics.collectMetrics('agent-1', [makeVersion()], exp);
      expect(report.experimentStatus).toBe('active');
    });
  });

  // ─── Metrics: formatMetricsReport ──────────────────────────────

  describe('formatMetricsReport', () => {
    it('formats a complete report with all fields', () => {
      const analytics = new PromptAnalytics(tmpDir);
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
      const formatted = analytics.formatMetricsReport(report);
      expect(formatted).toContain('test-agent');
      expect(formatted).toContain('v3');
      expect(formatted).toContain('85.0%');
      expect(formatted).toContain('active');
      expect(formatted).toContain('improving');
    });
  });

  // ─── Unified: collectMetricsWithExperiment ─────────────────────

  describe('collectMetricsWithExperiment', () => {
    it('collects metrics with no active experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const versions = [makeVersion({ version: 1 })];
      const report = analytics.collectMetricsWithExperiment('agent-1', versions);
      expect(report.agentId).toBe('agent-1');
      expect(report.experimentStatus).toBe('none');
    });

    it('collects metrics and automatically fetches active experiment', () => {
      const analytics = new PromptAnalytics(tmpDir);
      analytics.createExperiment('agent-1', 'Variant A', 'Variant B');
      const versions = [makeVersion({ version: 1 })];
      const report = analytics.collectMetricsWithExperiment('agent-1', versions);
      expect(report.experimentStatus).toBe('active');
    });

    it('reports none after experiment is completed', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'A', 'B');
      analytics.completeExperiment(exp.id);
      const versions = [makeVersion({ version: 1 })];
      const report = analytics.collectMetricsWithExperiment('agent-1', versions);
      expect(report.experimentStatus).toBe('none');
    });

    it('integrates AB test results into metrics report', () => {
      const analytics = new PromptAnalytics(tmpDir);
      const exp = analytics.createExperiment('agent-1', 'Variant A', 'Variant B');
      analytics.recordResult(exp.id, 'A', 'DONE', 90, 'sprint-001');
      analytics.recordResult(exp.id, 'B', 'DONE', 80, 'sprint-001');
      const versions = [
        makeVersion({ version: 1, stats: { uses: 10, successRate: 0.9 } }),
      ];
      const report = analytics.collectMetricsWithExperiment('agent-1', versions);
      expect(report.currentSuccessRate).toBe(0.9);
      expect(report.experimentStatus).toBe('active');
    });
  });
});
