import { describe, it, expect } from 'vitest';
import { computeDistribution, detectImbalance, loadLearnings } from '../../scripts/routing-distribution.mjs';
import { resolve } from 'node:path';

// ─── computeDistribution ─────────────────────────────────────────────────────

describe('computeDistribution', () => {
  it('calculates percentage correctly for multiple agents', () => {
    const perf = {
      'refactorer':  { totalTasks: 10, successCount: 9, failCount: 1, successRate: 0.9, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'doc-writer':  { totalTasks: 10, successCount: 10, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'api-builder': { totalTasks: 5,  successCount: 4, failCount: 1, successRate: 0.8, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
    };
    const { entries, total } = computeDistribution(perf);
    expect(total).toBe(25);
    const refactorer = entries.find(e => e.id === 'refactorer');
    const docWriter  = entries.find(e => e.id === 'doc-writer');
    const apiBuilder = entries.find(e => e.id === 'api-builder');
    expect(refactorer?.pct).toBe(40);
    expect(docWriter?.pct).toBe(40);
    expect(apiBuilder?.pct).toBe(20);
  });

  it('returns empty entries for empty performance map', () => {
    const { entries, total } = computeDistribution({});
    expect(entries).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('returns zero percentages when total is zero', () => {
    const perf = {
      'agent-a': { totalTasks: 0, successCount: 0, failCount: 0, successRate: 0, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
    };
    const { entries, total } = computeDistribution(perf);
    expect(total).toBe(0);
    expect(entries[0].pct).toBe(0);
  });

  it('sorts entries by task count descending', () => {
    const perf = {
      'low-agent':  { totalTasks: 2, successCount: 2, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'high-agent': { totalTasks: 8, successCount: 8, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'mid-agent':  { totalTasks: 5, successCount: 5, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
    };
    const { entries } = computeDistribution(perf);
    expect(entries[0].id).toBe('high-agent');
    expect(entries[1].id).toBe('mid-agent');
    expect(entries[2].id).toBe('low-agent');
  });
});

// ─── detectImbalance ─────────────────────────────────────────────────────────

describe('detectImbalance', () => {
  it('warns when a single agent exceeds the threshold', () => {
    const entries = [
      { id: 'refactorer', tasks: 15, pct: 75 },
      { id: 'doc-writer', tasks: 5, pct: 25 },
    ];
    const warnings = detectImbalance(entries, 70);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('refactorer');
    expect(warnings[0]).toContain('75%');
  });

  it('returns no warnings when all agents are below threshold', () => {
    const entries = [
      { id: 'refactorer', tasks: 6, pct: 60 },
      { id: 'doc-writer', tasks: 4, pct: 40 },
    ];
    const warnings = detectImbalance(entries, 70);
    expect(warnings).toHaveLength(0);
  });

  it('returns no warnings for empty distribution', () => {
    const warnings = detectImbalance([], 70);
    expect(warnings).toHaveLength(0);
  });

  it('uses default threshold of 70%', () => {
    const entries = [
      { id: 'heavy-agent', tasks: 71, pct: 71 },
    ];
    const warnings = detectImbalance(entries);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('threshold: 70%');
  });

  it('does not warn at exactly the threshold (only strictly above)', () => {
    const entries = [
      { id: 'agent', tasks: 70, pct: 70 },
    ];
    const warnings = detectImbalance(entries, 70);
    expect(warnings).toHaveLength(0);
  });
});

// ─── loadLearnings ───────────────────────────────────────────────────────────

describe('loadLearnings', () => {
  it('returns null for a directory without learnings.json', () => {
    const result = loadLearnings('/tmp/nonexistent-routing-test-dir-12345');
    expect(result).toBeNull();
  });

  it('loads real learnings.json from project root', () => {
    const projectRoot = resolve(__dirname, '../../');
    const learnings = loadLearnings(projectRoot);
    // If learnings.json doesn't exist in test environment, skip gracefully
    if (learnings === null) return;
    expect(learnings).toHaveProperty('agentPerformance');
    expect(learnings).toHaveProperty('skillPerformance');
    expect(typeof learnings.totalOutcomes).toBe('number');
  });
});

// ─── Integration: percentage sum ─────────────────────────────────────────────

describe('percentage accuracy', () => {
  it('all percentage values sum to approximately 100', () => {
    const perf = {
      'a': { totalTasks: 33, successCount: 33, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'b': { totalTasks: 33, successCount: 33, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'c': { totalTasks: 34, successCount: 34, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
    };
    const { entries } = computeDistribution(perf);
    const sum = entries.reduce((s, e) => s + e.pct, 0);
    // Allow ±1% due to rounding
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});
