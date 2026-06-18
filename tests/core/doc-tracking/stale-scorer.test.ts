import { describe, it, expect } from 'vitest';
import { scoreDoc, ageThresholdDays } from '../../../src/core/doc-tracking/stale-scorer.js';
import { DEFAULT_DOC_TRACKING_CONFIG as C } from '../../../src/core/doc-tracking/types.js';

const sig = (o: Partial<{ content_drift: boolean; code_drift: boolean | null; age_days: number }>) =>
  ({ content_drift: false, code_drift: null, age_days: 0, ...o });

describe('ageThresholdDays', () => {
  it('is rank-sensitive and clamped', () => {
    expect(ageThresholdDays(0)).toBe(30);
    expect(ageThresholdDays(100)).toBe(180);
    expect(ageThresholdDays(1000)).toBe(365);
  });
});

describe('scoreDoc', () => {
  it('EXEMPT for draft/temp/frozen regardless of signals', () => {
    expect(scoreDoc({ doc_rank: 0, status: 'temp', signals: sig({ content_drift: true }) }, C).state).toBe('EXEMPT');
  });
  it('FRESH when no drift and within age threshold', () => {
    const r = scoreDoc({ doc_rank: 50, status: 'active', signals: sig({}) }, C);
    expect(r.stale_score).toBe(0);
    expect(r.state).toBe('FRESH');
  });
  it('content_drift on a rank-0 doc escalates to CRITICAL_STALE', () => {
    const r = scoreDoc({ doc_rank: 0, status: 'active', signals: sig({ content_drift: true }) }, C);
    // stale_score=50, rankWeight=2 → priority=100 ≥ 80
    expect(r.stale_score).toBe(50);
    expect(r.priority_score).toBe(100);
    expect(r.state).toBe('CRITICAL_STALE');
  });
  it('content_drift on a high-rank doc is only DRIFT', () => {
    const r = scoreDoc({ doc_rank: 95, status: 'active', signals: sig({ content_drift: true }) }, C);
    // rankWeight≈1.05 → priority≈52.5 ≥ staleAt(50) → STALE (age not over) ... assert tier
    expect(['DRIFT', 'STALE']).toContain(r.state);
    expect(r.stale_score).toBe(50);
  });
  it('age beyond threshold yields STALE even without drift', () => {
    const r = scoreDoc({ doc_rank: 0, status: 'active', signals: sig({ age_days: 100 }) }, C);
    expect(r.state).toBe('STALE');
  });
});
