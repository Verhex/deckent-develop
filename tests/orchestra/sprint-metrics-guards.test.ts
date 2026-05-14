/**
 * tests/orchestra/sprint-metrics-guards.test.ts — Sprint Metrics Math Guards (BUG-FF)
 *
 * Sprint 168 Cluster C0d — cosmetic fix for Sprint 167 finalize output:
 *   | Duration | -1dk -1sn |   ← negative arithmetic (start null, end real)
 *   | Coverage | NaN%      |   ← 0/0 division (read-only audit, no source change)
 *
 * Guards:
 *   - durationMs = Math.max(0, endMs - startMs)   → never negative
 *   - coverageRatio = totalLines > 0 ? coveredLines/totalLines : null   → never NaN
 *
 * Display layer contract (consumer responsibility):
 *   - coverageRatio === null  → render "N/A"
 *   - durationMs === 0        → render "0s" (or "<1s")
 *
 * @see docs/superpowers/specs/2026-05-14-sprint-168-design.md §C0d
 * @see .audit/sprint-167/T5-brain-debug-phase1.md §1.8 BUG-FF
 * @see .audit/sprint-167/T5-brain-debug-phase2.md §Cluster D
 */

import { describe, it, expect } from 'vitest';
import { computeSprintMetrics } from '../../src/orchestra/sprint-reporter.js';

describe('sprint metrics math guards (BUG-FF)', () => {
  it('returns durationMs=0 when end < start (negative arithmetic guarded)', () => {
    // Sprint 167 reproduction: SPAWN crash → start null defaulted to a later "Date.now()"
    // path while end timestamp was earlier than the defaulted start. The raw subtraction
    // produced a negative duration which the renderer formatted as "-1dk -1sn".
    const m = computeSprintMetrics({
      startMs: 1000,
      endMs: 500,
      totalLines: 100,
      coveredLines: 50,
    });
    expect(m.durationMs).toBe(0);
  });

  it('returns coverageRatio=null when totalLines=0 (NaN division guarded)', () => {
    // Sprint 167 reproduction: read-only audit sprint, 0 source-line changes →
    // coveragePercent = 0/0 = NaN → CLAUDE.md rendered "NaN%".
    const m = computeSprintMetrics({
      startMs: 0,
      endMs: 100,
      totalLines: 0,
      coveredLines: 0,
    });
    expect(m.coverageRatio).toBeNull();
  });

  it('returns correct coverage ratio for normal case (totalLines > 0)', () => {
    const m = computeSprintMetrics({
      startMs: 0,
      endMs: 100,
      totalLines: 100,
      coveredLines: 75,
    });
    expect(m.coverageRatio).toBeCloseTo(0.75);
    expect(m.durationMs).toBe(100);
  });
});
