/**
 * Tests for the PRE-SPAWN cumulative-spend warn-gate: evaluateSpendWarnAtSpawn.
 *
 * Sprint 343 Task 343-003 — B6 pre-spawn spend warn (flag-gated, warn-only).
 *
 * The pre-spawn cost gate (`evaluateCostGate`) checks only the per-sprint
 * estimate; this helper additionally projects the estimate on top of the
 * already-logged daily/monthly spend (read through an INJECTED reader) and
 * returns a non-blocking COST_LIMIT_WARN when a rolling limit is breached.
 *
 * All tests are hermetic — the spend-window reader is injected, so no real
 * resource-log.jsonl is ever touched (no disk, no process.cwd()).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateSpendWarnAtSpawn,
  type SpendWarnAtSpawnInput,
} from '../../src/core/cost-gate.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal CostConfig with spend-gate settings. */
function makeCostConfig(opts?: {
  dailyMaxUsd?: number;
  monthlyMaxUsd?: number;
  enforceSpendGate?: boolean;
}): CostConfig {
  return {
    _version: '1.0',
    providers: {},
    cost_limits: {
      sprint_max_usd: 10,
      daily_max_usd: opts?.dailyMaxUsd ?? 50,
      monthly_max_usd: opts?.monthlyMaxUsd,
      enforce_spend_gate: opts?.enforceSpendGate,
    },
    update_config: { sources_priority: ['bundled'] },
  };
}

/** Injectable readSpendWindow that returns fixed per-window spend totals. */
function fixedReader(perWindow: { day?: number; month?: number }): (
  root: string,
  window: 'day' | 'month',
) => number {
  return (_root, window) => (window === 'day' ? perWindow.day ?? 0 : perWindow.month ?? 0);
}

function makeInput(
  overrides: Partial<SpendWarnAtSpawnInput> & { costConfig: CostConfig },
): SpendWarnAtSpawnInput {
  return {
    root: '/fake/root',
    sprintEstimateUsd: 1,
    readSpendWindow: fixedReader({}),
    ...overrides,
  };
}

// ─── evaluateSpendWarnAtSpawn ─────────────────────────────────────────────────

describe('evaluateSpendWarnAtSpawn', () => {
  it('returns a COST_LIMIT_WARN when flag-on AND already-logged daily spend + estimate exceeds daily_max_usd', () => {
    // Spend already PAST the daily limit before this sprint's estimate is added.
    const result = evaluateSpendWarnAtSpawn(
      makeInput({
        costConfig: makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true }),
        sprintEstimateUsd: 5,
        readSpendWindow: fixedReader({ day: 60, month: 60 }),
      }),
    );
    expect(result).not.toBeNull();
    const warn = result!;
    expect(warn.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(warn.window).toBe('day');
    expect(warn.spentUsd).toBe(60);
    expect(warn.sprintEstimateUsd).toBe(5);
    expect(warn.projectedUsd).toBe(65);
    expect(warn.limitUsd).toBe(50);
  });

  it('returns null when the flag is OFF — even with spend far past the limit (default-off path)', () => {
    const reader = vi.fn(fixedReader({ day: 9999, month: 9999 }));
    const result = evaluateSpendWarnAtSpawn(
      makeInput({
        costConfig: makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: false }),
        sprintEstimateUsd: 100,
        readSpendWindow: reader,
      }),
    );
    expect(result).toBeNull();
    // Zero I/O on the flag-off path — the ledger is never read.
    expect(reader).not.toHaveBeenCalled();
  });

  it('returns null when the flag is UNSET (undefined) — same default-off no-read behavior', () => {
    const reader = vi.fn(fixedReader({ day: 9999 }));
    const result = evaluateSpendWarnAtSpawn(
      makeInput({
        // enforceSpendGate omitted → enforce_spend_gate: undefined
        costConfig: makeCostConfig({ dailyMaxUsd: 50 }),
        sprintEstimateUsd: 100,
        readSpendWindow: reader,
      }),
    );
    expect(result).toBeNull();
    expect(reader).not.toHaveBeenCalled();
  });

  it('returns null when flag-on but projected spend is UNDER the daily limit', () => {
    const result = evaluateSpendWarnAtSpawn(
      makeInput({
        costConfig: makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true }),
        sprintEstimateUsd: 2,
        readSpendWindow: fixedReader({ day: 10, month: 10 }),
      }),
    );
    expect(result).toBeNull();
  });

  it('returns a monthly COST_LIMIT_WARN when daily is within limit but monthly is exceeded', () => {
    const result = evaluateSpendWarnAtSpawn(
      makeInput({
        costConfig: makeCostConfig({
          dailyMaxUsd: 1000, // daily generous → not tripped
          monthlyMaxUsd: 200,
          enforceSpendGate: true,
        }),
        sprintEstimateUsd: 50,
        readSpendWindow: fixedReader({ day: 100, month: 180 }),
      }),
    );
    expect(result).not.toBeNull();
    const warn = result!;
    expect(warn.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(warn.window).toBe('month');
    expect(warn.spentUsd).toBe(180);
    expect(warn.projectedUsd).toBe(230);
    expect(warn.limitUsd).toBe(200);
  });

  it('reads BOTH windows through the injected reader when the flag is on (no real ledger)', () => {
    const reader = vi.fn(fixedReader({ day: 5, month: 5 }));
    evaluateSpendWarnAtSpawn(
      makeInput({
        costConfig: makeCostConfig({
          dailyMaxUsd: 50,
          monthlyMaxUsd: 500,
          enforceSpendGate: true,
        }),
        sprintEstimateUsd: 1,
        readSpendWindow: reader,
      }),
    );
    expect(reader).toHaveBeenCalledWith('/fake/root', 'day');
    expect(reader).toHaveBeenCalledWith('/fake/root', 'month');
  });

  it('never blocks — only ever returns a warn payload or null (warn-only contract)', () => {
    // Massive overshoot still yields a (non-throwing) warn, never an exception
    // or a blocking result shape.
    const result = evaluateSpendWarnAtSpawn(
      makeInput({
        costConfig: makeCostConfig({ dailyMaxUsd: 1, enforceSpendGate: true }),
        sprintEstimateUsd: 1000,
        readSpendWindow: fixedReader({ day: 1000, month: 1000 }),
      }),
    );
    expect(result?.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    // No `ok`/`blocked`-style field exists on the warn event — it is advisory only.
    expect(result).not.toHaveProperty('ok');
  });
});
