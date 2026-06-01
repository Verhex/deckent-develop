import { describe, it, expect } from 'vitest';
import { ciGuard, computeDistribution } from '../../scripts/routing-distribution.mjs';

// ─── ciGuard ─────────────────────────────────────────────────────────────────

describe('ciGuard', () => {
  it('passes when distribution is balanced (no agent exceeds 80%)', () => {
    const entries = [
      { id: 'refactorer', tasks: 5, pct: 50 },
      { id: 'api-builder', tasks: 3, pct: 30 },
      { id: 'doc-writer', tasks: 2, pct: 20 },
    ];
    const result = ciGuard(entries);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails when a single agent exceeds the 80% default threshold', () => {
    const entries = [
      { id: 'refactorer', tasks: 9, pct: 90 },
      { id: 'doc-writer', tasks: 1, pct: 10 },
    ];
    const result = ciGuard(entries);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toContain('refactorer');
    expect(result.violations[0]).toContain('90%');
  });

  it('respects a custom threshold (e.g. 60%)', () => {
    const entries = [
      { id: 'refactorer', tasks: 7, pct: 70 },
      { id: 'api-builder', tasks: 3, pct: 30 },
    ];
    // With default 80% threshold: passes
    expect(ciGuard(entries).passed).toBe(true);
    // With custom 60% threshold: fails
    const result = ciGuard(entries, 60);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('threshold of 60%');
  });

  it('passes with empty distribution (no agents = no imbalance)', () => {
    const result = ciGuard([]);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('does not fail at exactly the threshold (only strictly above)', () => {
    const entries = [{ id: 'refactorer', tasks: 8, pct: 80 }];
    const result = ciGuard(entries, 80);
    expect(result.passed).toBe(true);
  });

  it('reports all violating agents, not just the first', () => {
    const entries = [
      { id: 'agent-a', tasks: 90, pct: 90 },
      { id: 'agent-b', tasks: 85, pct: 85 },
      { id: 'agent-c', tasks: 5, pct: 5 },
    ];
    const result = ciGuard(entries, 80);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(2);
  });
});

// ─── Integration: ciGuard with computeDistribution ───────────────────────────

describe('ciGuard integration with computeDistribution', () => {
  it('balanced performance map passes CI guard', () => {
    const perf = {
      'refactorer':  { totalTasks: 5, successCount: 5, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'api-builder': { totalTasks: 3, successCount: 3, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'doc-writer':  { totalTasks: 2, successCount: 2, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
    };
    const { entries } = computeDistribution(perf);
    const result = ciGuard(entries);
    expect(result.passed).toBe(true);
  });

  it('heavily skewed performance map fails CI guard', () => {
    const perf = {
      'refactorer': { totalTasks: 15, successCount: 15, failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
      'doc-writer':  { totalTasks: 1,  successCount: 1,  failCount: 0, successRate: 1, avgQualityScore: 0, qualityTaskCount: 0, byIntent: {} },
    };
    const { entries } = computeDistribution(perf);
    const result = ciGuard(entries);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('refactorer');
  });
});
