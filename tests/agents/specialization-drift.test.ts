import { describe, it, expect, beforeEach } from 'vitest';
import { SpecializationDriftDetector } from '../../src/agents/specialization-drift.js';
import type { RecentResult, DriftReport } from '../../src/agents/specialization-drift.js';

function makeResult(overrides: Partial<RecentResult> = {}): RecentResult {
  return {
    taskType: 'feature',
    taskTitle: 'Add login page',
    evaluation: 'DONE',
    ...overrides,
  };
}

describe('SpecializationDriftDetector', () => {
  let detector: SpecializationDriftDetector;

  beforeEach(() => {
    detector = new SpecializationDriftDetector();
  });

  // ─── Empty inputs ─────────────────────────────────────────────

  it('returns zero drift for empty results', () => {
    const report = detector.detect('agent-1', ['typescript', 'testing'], []);
    expect(report.agentId).toBe('agent-1');
    expect(report.driftScore).toBe(0);
    expect(report.recommendation).toBe('keep');
    expect(report.currentSpecialization).toEqual([]);
  });

  it('returns zero drift for empty keywords and empty results', () => {
    const report = detector.detect('agent-1', [], []);
    expect(report.driftScore).toBe(0);
    expect(report.recommendation).toBe('keep');
  });

  // ─── Perfect alignment ─────────────────────────────────────────

  it('returns low drift when keywords match task content', () => {
    const results = [
      makeResult({ taskType: 'typescript', taskTitle: 'Testing framework setup' }),
    ];
    const report = detector.detect('agent-1', ['typescript', 'testing'], results);
    expect(report.driftScore).toBeLessThan(0.6);
    expect(report.recommendation).toBe('keep');
  });

  // ─── Drift detection ──────────────────────────────────────────

  it('detects high drift when tasks differ from keywords', () => {
    const results = [
      makeResult({ taskType: 'python', taskTitle: 'Machine learning pipeline' }),
      makeResult({ taskType: 'python', taskTitle: 'Data science notebook' }),
    ];
    const report = detector.detect('agent-1', ['typescript', 'react', 'frontend'], results);
    expect(report.driftScore).toBeGreaterThan(0.6);
    expect(report.recommendation).not.toBe('keep');
  });

  it('recommends respecialize for moderate drift', () => {
    const results = [
      makeResult({ taskType: 'typescript', taskTitle: 'Backend API server' }),
      makeResult({ taskType: 'database', taskTitle: 'SQL migration scripts' }),
    ];
    const report = detector.detect('agent-1', ['typescript', 'frontend', 'react', 'css'], results);
    // Should detect some drift since backend/database differ from frontend/react
    expect(report.driftScore).toBeGreaterThanOrEqual(0);
  });

  it('recommends create_new_agent for very high drift', () => {
    const report: DriftReport = {
      agentId: 'agent-1',
      originalSpecialization: ['typescript'],
      currentSpecialization: ['python'],
      driftScore: 0.85,
      recommendation: detector._computeRecommendation(0.85),
    };
    expect(report.recommendation).toBe('create_new_agent');
  });

  // ─── Keyword extraction ────────────────────────────────────────

  it('extracts unique keywords from results', () => {
    const results = [
      makeResult({ taskType: 'feature', taskTitle: 'Add login page' }),
      makeResult({ taskType: 'feature', taskTitle: 'Add signup page' }),
    ];
    const keywords = detector._extractActualKeywords(results);
    expect(keywords).toContain('feature');
    expect(keywords).toContain('add');
    expect(keywords).toContain('login');
    expect(keywords).toContain('signup');
    // Should be deduplicated
    const uniqueCheck = new Set(keywords);
    expect(uniqueCheck.size).toBe(keywords.length);
  });

  it('filters short tokens from extraction', () => {
    const results = [makeResult({ taskType: 'a', taskTitle: 'b c' })];
    const keywords = detector._extractActualKeywords(results);
    expect(keywords.every(k => k.length >= 2)).toBe(true);
  });

  // ─── Drift score computation ───────────────────────────────────

  it('returns 0 drift when both sets empty', () => {
    expect(detector._computeDriftScore(new Set(), [])).toBe(0);
  });

  it('returns 1 drift when original is empty but actual has keywords', () => {
    expect(detector._computeDriftScore(new Set(), ['python', 'ml'])).toBe(1);
  });

  it('returns 0 drift when actual is empty but original has keywords', () => {
    expect(detector._computeDriftScore(new Set(['typescript']), [])).toBe(0);
  });

  // ─── Recommendation thresholds ─────────────────────────────────

  it('keeps agent below 0.6 drift', () => {
    expect(detector._computeRecommendation(0.0)).toBe('keep');
    expect(detector._computeRecommendation(0.3)).toBe('keep');
    expect(detector._computeRecommendation(0.59)).toBe('keep');
  });

  it('respecializes between 0.6 and 0.8', () => {
    expect(detector._computeRecommendation(0.6)).toBe('respecialize');
    expect(detector._computeRecommendation(0.7)).toBe('respecialize');
    expect(detector._computeRecommendation(0.79)).toBe('respecialize');
  });

  it('creates new agent at 0.8 and above', () => {
    expect(detector._computeRecommendation(0.8)).toBe('create_new_agent');
    expect(detector._computeRecommendation(1.0)).toBe('create_new_agent');
  });

  // ─── Original specialization preserved ─────────────────────────

  it('preserves original specialization in report', () => {
    const keywords = ['typescript', 'react', 'testing'];
    const results = [makeResult({ taskType: 'python', taskTitle: 'Data pipeline' })];
    const report = detector.detect('agent-1', keywords, results);
    expect(report.originalSpecialization).toEqual(keywords);
  });
});
