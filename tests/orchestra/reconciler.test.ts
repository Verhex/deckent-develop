import { describe, it, expect } from 'vitest';
import {
  reconcileSprint,
  suggestCheaperModel,
  formatReconciliation,
  type ReconcileEstimate,
  type ReconcileResult,
} from '../../src/orchestra/reconciler.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────
// Pure, hermetic — no fs, no env, no clock. Every input is constructed inline.

function estimate(
  taskDetails: Array<{ id: string; model: string; provider?: string; costUsd: number }>,
): ReconcileEstimate {
  const totalApiCostUsd = taskDetails.reduce((s, d) => s + d.costUsd, 0);
  return { totalApiCostUsd, taskDetails };
}

function result(
  taskId: string,
  model: string,
  usd: number,
  provider = 'claude',
): ReconcileResult {
  return { taskId, model, provider, cost: { usd } };
}

// ─── goNogo core: actualUsd === Σ, variancePct correct ─────────────────────────

describe('reconcileSprint — sprint totals (goNogo)', () => {
  it('actualUsd is the EXACT sum of results[].cost.usd, and variancePct is correct', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', costUsd: 1.0 },
      { id: 'B', model: 'claude-sonnet-5', costUsd: 2.0 },
      { id: 'C', model: 'claude-haiku-4-5-20251001', costUsd: 1.0 }, // estimated total = 4.0
    ]);
    const results = [
      result('A', 'claude-opus-4-8', 1.5),
      result('B', 'claude-sonnet-5', 2.5),
      result('C', 'claude-haiku-4-5-20251001', 1.0), // actual total = 5.0
    ];

    const rec = reconcileSprint(est, results);

    // Exact equality with the independent Σ — no rounding drift.
    const expectedSum = results.reduce((s, r) => s + r.cost.usd, 0);
    expect(rec.actualUsd).toBe(expectedSum);
    expect(rec.actualUsd).toBe(5.0);

    expect(rec.estimatedUsd).toBe(4.0);
    expect(rec.varianceUsd).toBeCloseTo(1.0, 10);
    // (5 − 4) / 4 × 100 = 25%
    expect(rec.variancePct).toBeCloseTo(25.0, 10);

    expect(rec.matchedCount).toBe(3);
    expect(rec.unestimatedCount).toBe(0);
    expect(rec.unmatchedEstimateCount).toBe(0);
    expect(rec.perTask).toHaveLength(3);
  });

  it('reports a negative variance for an under-run sprint', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', costUsd: 10 },
      { id: 'B', model: 'claude-sonnet-5', costUsd: 10 },
    ]);
    const rec = reconcileSprint(est, [result('A', 'claude-opus-4-8', 4), result('B', 'claude-sonnet-5', 6)]);
    expect(rec.actualUsd).toBe(10);
    expect(rec.estimatedUsd).toBe(20);
    expect(rec.varianceUsd).toBe(-10);
    expect(rec.variancePct).toBeCloseTo(-50, 10);
    expect(rec.optimizationSignals).toHaveLength(0);
  });

  it('does not drift on float sums (0.1 + 0.2 style)', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', costUsd: 0.1 },
      { id: 'B', model: 'claude-sonnet-5', costUsd: 0.2 },
    ]);
    const results = [result('A', 'claude-opus-4-8', 0.1), result('B', 'claude-sonnet-5', 0.2)];
    const rec = reconcileSprint(est, results);
    expect(rec.actualUsd).toBe(results.reduce((s, r) => s + r.cost.usd, 0));
  });
});

// ─── over-run → optimizationSignals ────────────────────────────────────────────

describe('reconcileSprint — optimization signals', () => {
  it('flags a task that ran 3× over estimate on opus and suggests sonnet (goNogo)', () => {
    const est = estimate([{ id: 'X', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [result('X', 'claude-opus-4-8', 3.0)]);

    expect(rec.optimizationSignals).toHaveLength(1);
    const sig = rec.optimizationSignals[0]!;
    expect(sig.taskId).toBe('X');
    expect(sig.model).toBe('claude-opus-4-8');
    expect(sig.ratio).toBeCloseTo(3.0, 10);
    expect(sig.suggestedModel).toBe('claude-sonnet-5');
    expect(sig.severity).toBe('warn'); // ratio ≥ warn threshold (3.0)
    expect(sig.message).toContain('3.0× over estimate');
    expect(sig.message).toContain('consider claude-sonnet-5');
  });

  it('emits an info (not warn) signal for a moderate 2× over-run', () => {
    const est = estimate([{ id: 'X', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [result('X', 'claude-opus-4-8', 2.0)]);
    expect(rec.optimizationSignals).toHaveLength(1);
    expect(rec.optimizationSignals[0]!.severity).toBe('info');
  });

  it('does NOT signal a task within tolerance', () => {
    const est = estimate([{ id: 'X', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    // 1.05 / 1.0 = 1.05× — under the 2× signal threshold
    const rec = reconcileSprint(est, [result('X', 'claude-opus-4-8', 1.05)]);
    expect(rec.optimizationSignals).toHaveLength(0);
  });

  it('suppresses sub-cent noise even on a large ratio', () => {
    const est = estimate([{ id: 'X', model: 'claude-opus-4-8', costUsd: 0.0001 }]);
    // 0.005 / 0.0001 = 50× over, but actual ($0.005) is below the $0.01 floor
    const rec = reconcileSprint(est, [result('X', 'claude-opus-4-8', 0.005)]);
    expect(rec.optimizationSignals).toHaveLength(0);
  });

  it('respects custom signal thresholds', () => {
    const est = estimate([{ id: 'X', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [result('X', 'claude-opus-4-8', 1.5)], {
      signalRatioThreshold: 1.4,
      warnRatioThreshold: 1.4,
    });
    expect(rec.optimizationSignals).toHaveLength(1);
    expect(rec.optimizationSignals[0]!.severity).toBe('warn');
  });
});

// ─── per-task join ─────────────────────────────────────────────────────────────

describe('reconcileSprint — per-task reconciliation', () => {
  it('computes per-task estimate, actual, ratio, variance, and overRun', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', provider: 'claude', costUsd: 2.0 },
      { id: 'B', model: 'claude-sonnet-5', provider: 'claude', costUsd: 4.0 },
    ]);
    const rec = reconcileSprint(est, [
      result('A', 'claude-opus-4-8', 5.0), // over-run
      result('B', 'claude-sonnet-5', 3.0), // under-run
    ]);

    const a = rec.perTask.find((t) => t.taskId === 'A')!;
    expect(a.estimatedUsd).toBe(2.0);
    expect(a.actualUsd).toBe(5.0);
    expect(a.varianceUsd).toBe(3.0);
    expect(a.variancePct).toBeCloseTo(150, 10);
    expect(a.ratio).toBeCloseTo(2.5, 10);
    expect(a.overRun).toBe(true);
    expect(a.unestimated).toBe(false);
    expect(a.provider).toBe('claude');

    const b = rec.perTask.find((t) => t.taskId === 'B')!;
    expect(b.varianceUsd).toBe(-1.0);
    expect(b.ratio).toBeCloseTo(0.75, 10);
    expect(b.overRun).toBe(false);
  });

  it('preserves results order in perTask', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', costUsd: 1 },
      { id: 'B', model: 'claude-opus-4-8', costUsd: 1 },
    ]);
    const rec = reconcileSprint(est, [result('B', 'claude-opus-4-8', 1), result('A', 'claude-opus-4-8', 1)]);
    expect(rec.perTask.map((t) => t.taskId)).toEqual(['B', 'A']);
  });
});

// ─── estimate/result gaps ───────────────────────────────────────────────────────

describe('reconcileSprint — join gaps', () => {
  it('counts an unestimated result (no matching estimate) with a null ratio', () => {
    const est = estimate([{ id: 'A', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [
      result('A', 'claude-opus-4-8', 1.0),
      result('Z', 'claude-opus-4-8', 2.0), // no estimate for Z
    ]);

    expect(rec.unestimatedCount).toBe(1);
    expect(rec.matchedCount).toBe(1);
    const z = rec.perTask.find((t) => t.taskId === 'Z')!;
    expect(z.unestimated).toBe(true);
    expect(z.estimatedUsd).toBe(0);
    expect(z.ratio).toBeNull();
    expect(z.variancePct).toBeNull();
    expect(z.overRun).toBe(true); // spent > 0 with no baseline

    // unestimated spend still surfaces as a signal (≥ min usd)
    const zsig = rec.optimizationSignals.find((s) => s.taskId === 'Z')!;
    expect(zsig).toBeDefined();
    expect(zsig.ratio).toBeNull();
    expect(zsig.message).toContain('no estimate baseline');

    // estimatedUsd stays apples-to-apples (only matched A counts)
    expect(rec.estimatedUsd).toBe(1.0);
    expect(rec.actualUsd).toBe(3.0);
  });

  it('counts an estimated task that produced no result (unmatchedEstimateCount)', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', costUsd: 1.0 },
      { id: 'B', model: 'claude-sonnet-5', costUsd: 5.0 }, // never ran
    ]);
    const rec = reconcileSprint(est, [result('A', 'claude-opus-4-8', 1.0)]);
    expect(rec.unmatchedEstimateCount).toBe(1);
    expect(rec.matchedCount).toBe(1);
    // B excluded from estimate total (apples-to-apples with actual)
    expect(rec.estimatedUsd).toBe(1.0);
    expect(rec.actualUsd).toBe(1.0);
    expect(rec.variancePct).toBeCloseTo(0, 10);
  });
});

// ─── edge cases / robustness ────────────────────────────────────────────────────

describe('reconcileSprint — edge cases', () => {
  it('handles empty results without throwing', () => {
    const est = estimate([{ id: 'A', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, []);
    expect(rec.actualUsd).toBe(0);
    expect(rec.perTask).toEqual([]);
    expect(rec.optimizationSignals).toEqual([]);
    expect(rec.matchedCount).toBe(0);
    expect(rec.unmatchedEstimateCount).toBe(1);
  });

  it('falls back to totalApiCostUsd when no taskDetails are present', () => {
    const rec = reconcileSprint({ totalApiCostUsd: 8.0 }, [result('A', 'claude-opus-4-8', 10.0)]);
    expect(rec.estimatedUsd).toBe(8.0);
    expect(rec.actualUsd).toBe(10.0);
    expect(rec.variancePct).toBeCloseTo(25, 10);
    // no per-task estimate baseline → per-task ratio null
    expect(rec.perTask[0]!.ratio).toBeNull();
  });

  it('clamps NaN / negative costs to 0 (honest, never silently propagated)', () => {
    const est = estimate([{ id: 'A', model: 'claude-opus-4-8', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [
      { taskId: 'A', model: 'claude-opus-4-8', cost: { usd: Number.NaN } },
      { taskId: 'B', model: 'claude-opus-4-8', cost: { usd: -5 } },
    ]);
    expect(rec.actualUsd).toBe(0);
    expect(rec.perTask[0]!.actualUsd).toBe(0);
    expect(rec.perTask[1]!.actualUsd).toBe(0);
  });

  it('returns variancePct null when the total estimate is zero', () => {
    const est = estimate([{ id: 'A', model: 'claude-opus-4-8', costUsd: 0 }]);
    const rec = reconcileSprint(est, [result('A', 'claude-opus-4-8', 0)]);
    expect(rec.estimatedUsd).toBe(0);
    expect(rec.variancePct).toBeNull();
  });

  it('reads provider as null when a result omits it', () => {
    const est = estimate([{ id: 'A', model: 'claude-opus-4-8', costUsd: 1 }]);
    const rec = reconcileSprint(est, [{ taskId: 'A', model: 'claude-opus-4-8', cost: { usd: 1 } }]);
    expect(rec.perTask[0]!.provider).toBeNull();
  });
});

// ─── suggestCheaperModel ────────────────────────────────────────────────────────

describe('suggestCheaperModel', () => {
  it('maps known tiers down one step', () => {
    expect(suggestCheaperModel('claude-opus-4-8')).toBe('claude-sonnet-5');
    expect(suggestCheaperModel('claude-sonnet-5')).toBe('claude-haiku-4-5-20251001');
  });

  it('resolves a concrete apiId through its tier keyword', () => {
    expect(suggestCheaperModel('claude-opus-4-8')).toBe('claude-sonnet-5');
    expect(suggestCheaperModel('claude-sonnet-5')).toBe('claude-haiku-4-5-20251001');
  });

  it('is case-insensitive', () => {
    expect(suggestCheaperModel('CLAUDE-OPUS-4-8')).toBe('claude-sonnet-5');
  });

  it('returns null for an unknown model (no false suggestion)', () => {
    expect(suggestCheaperModel('claude-haiku-4-5-20251001')).toBeNull();
    expect(suggestCheaperModel('gpt-5.5')).toBeNull();
    expect(suggestCheaperModel('llama3')).toBeNull();
  });

  it('honors a custom ladder', () => {
    const ladder = { 'gpt-5.5': 'gpt-5-mini', opus: 'claude-sonnet-5', sonnet: 'claude-haiku-4-5-20251001' };
    expect(suggestCheaperModel('gpt-5.5', ladder)).toBe('gpt-5-mini');
  });
});

describe('reconcileSprint — custom downgradeLadder', () => {
  it('uses a provider-extended ladder for non-Claude over-runs', () => {
    const est = estimate([{ id: 'X', model: 'gpt-5.5', provider: 'codex', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [result('X', 'gpt-5.5', 3.0, 'codex')], {
      downgradeLadder: { 'gpt-5.5': 'gpt-5-mini' },
    });
    expect(rec.optimizationSignals[0]!.suggestedModel).toBe('gpt-5-mini');
  });

  it('still signals an over-run for an unknown model, with no suggestion', () => {
    const est = estimate([{ id: 'X', model: 'mystery-model', costUsd: 1.0 }]);
    const rec = reconcileSprint(est, [result('X', 'mystery-model', 3.0, 'other')]);
    expect(rec.optimizationSignals).toHaveLength(1);
    expect(rec.optimizationSignals[0]!.suggestedModel).toBeNull();
    expect(rec.optimizationSignals[0]!.message).not.toContain('consider');
  });
});

// ─── formatReconciliation ───────────────────────────────────────────────────────

describe('formatReconciliation', () => {
  it('renders totals, variance, task counts, and signals', () => {
    const est = estimate([
      { id: 'A', model: 'claude-opus-4-8', costUsd: 1.0 },
      { id: 'B', model: 'claude-sonnet-5', costUsd: 1.0 },
    ]);
    const rec = reconcileSprint(est, [result('A', 'claude-opus-4-8', 3.0), result('B', 'claude-sonnet-5', 1.0)]);
    const out = formatReconciliation(rec);

    expect(out).toContain('Estimate vs Actual');
    expect(out).toContain('Estimated:');
    expect(out).toContain('Actual:');
    expect(out).toContain('Variance:');
    expect(out).toContain('Optimization signals:');
    expect(out).toContain('consider claude-sonnet-5');
  });

  it('shows n/a variance and no signals block when there is no baseline', () => {
    const rec = reconcileSprint({ totalApiCostUsd: 0 }, []);
    const out = formatReconciliation(rec);
    expect(out).toContain('n/a');
    expect(out).not.toContain('Optimization signals:');
  });
});
