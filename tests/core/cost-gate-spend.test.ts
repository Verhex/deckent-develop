/**
 * Tests for cumulative spend-gate: readSpendWindow + checkSpendGate.
 *
 * Sprint 325 Task 325-004 — cost-gate cumulative spend warn (flag-gated).
 * All tests are hermetic — file I/O is injected, never reads real disk.
 */
import { describe, it, expect } from 'vitest';
import { readSpendWindow } from '../../src/core/cost-config-loader.js';
import {
  checkSpendGate,
  type SpendGateCheckInput,
  type CostLimitWarnEvent,
} from '../../src/core/cost-gate.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fixed reference timestamp used across tests (2026-06-26T10:00:00Z). */
const FIXED_NOW = '2026-06-26T10:00:00.000Z';
const FIXED_DAY_PREFIX = '2026-06-26';
const FIXED_MONTH_PREFIX = '2026-06';

/** Build a JSONL line with a costUsd entry on the given timestamp. */
function makeCostLine(ts: string, costUsd: number): string {
  return JSON.stringify({ ts, taskId: 'test', costUsd });
}

/** Build a Docker-stats JSONL line (no costUsd field). */
function makeStatsLine(ts: string): string {
  return JSON.stringify({ ts, container: 'deckent-w-123', memUsageBytes: 1000, cpuPerc: 2.0 });
}

/** Injectable readLines that returns provided content lines. */
function injectedLines(lines: string[]): (filePath: string) => string[] {
  return () => lines;
}

/** Minimal CostConfig with spend-gate settings. */
function makeCostConfig(opts?: {
  dailyMaxUsd?: number;
  monthlyMaxUsd?: number;
  enforceSpendGate?: boolean;
}): CostConfig {
  return {
    _version: '1.0',
    providers: {
      anthropic: {
        enabled: true,
        billing_modes_supported: ['api'],
        models: {
          'claude-sonnet-4-6': {
            input_cost_per_token: 0.000003,
            output_cost_per_token: 0.000015,
            max_input_tokens: 200_000,
            enabled: true,
          },
        },
      },
    },
    cost_limits: {
      sprint_max_usd: 10,
      daily_max_usd: opts?.dailyMaxUsd ?? 50,
      monthly_max_usd: opts?.monthlyMaxUsd,
      enforce_spend_gate: opts?.enforceSpendGate,
    },
    update_config: { sources_priority: ['bundled'] },
  };
}

function makeSpendInput(
  overrides: Partial<SpendGateCheckInput> & { costConfig: CostConfig },
): SpendGateCheckInput {
  return {
    spentDayUsd: 0,
    spentMonthUsd: 0,
    sprintEstimateUsd: 1,
    ...overrides,
  };
}

// ─── readSpendWindow tests ───────────────────────────────────────────────────

describe('readSpendWindow', () => {
  it('returns 0 when the log is empty', () => {
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines([]),
      now: FIXED_NOW,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when file contains only Docker-stats lines (no costUsd field)', () => {
    const lines = [
      makeStatsLine(`${FIXED_DAY_PREFIX}T09:00:00.000Z`),
      makeStatsLine(`${FIXED_DAY_PREFIX}T09:30:00.000Z`),
    ];
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBe(0);
  });

  it('sums costUsd entries within the day window', () => {
    const lines = [
      makeCostLine(`${FIXED_DAY_PREFIX}T08:00:00.000Z`, 1.5),
      makeCostLine(`${FIXED_DAY_PREFIX}T09:00:00.000Z`, 2.25),
    ];
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBeCloseTo(3.75);
  });

  it('excludes entries from previous days when window=day', () => {
    const lines = [
      makeCostLine('2026-06-25T23:59:59.000Z', 10), // yesterday
      makeCostLine(`${FIXED_DAY_PREFIX}T01:00:00.000Z`, 3), // today
    ];
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBeCloseTo(3);
  });

  it('sums all entries in the current month when window=month', () => {
    const lines = [
      makeCostLine(`${FIXED_MONTH_PREFIX}-01T00:00:00.000Z`, 5),
      makeCostLine(`${FIXED_MONTH_PREFIX}-15T12:00:00.000Z`, 8),
      makeCostLine('2026-05-31T23:00:00.000Z', 100), // previous month — excluded
    ];
    const result = readSpendWindow('/fake/root', 'month', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBeCloseTo(13);
  });

  it('ignores entries with non-numeric or zero costUsd', () => {
    const lines = [
      JSON.stringify({ ts: `${FIXED_DAY_PREFIX}T10:00:00.000Z`, costUsd: 0 }),
      JSON.stringify({ ts: `${FIXED_DAY_PREFIX}T10:01:00.000Z`, costUsd: 'bad' }),
      JSON.stringify({ ts: `${FIXED_DAY_PREFIX}T10:02:00.000Z`, costUsd: -1 }),
      makeCostLine(`${FIXED_DAY_PREFIX}T10:03:00.000Z`, 2),
    ];
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBeCloseTo(2);
  });

  it('skips malformed JSON lines without throwing', () => {
    const lines = [
      '{not valid json',
      makeCostLine(`${FIXED_DAY_PREFIX}T10:00:00.000Z`, 4),
    ];
    expect(() =>
      readSpendWindow('/fake/root', 'day', {
        readLines: injectedLines(lines),
        now: FIXED_NOW,
      }),
    ).not.toThrow();
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBeCloseTo(4);
  });

  it('skips blank lines', () => {
    const lines = ['', '  ', makeCostLine(`${FIXED_DAY_PREFIX}T10:00:00.000Z`, 1.1)];
    const result = readSpendWindow('/fake/root', 'day', {
      readLines: injectedLines(lines),
      now: FIXED_NOW,
    });
    expect(result).toBeCloseTo(1.1);
  });
});

// ─── checkSpendGate tests ────────────────────────────────────────────────────

describe('checkSpendGate', () => {
  it('returns null when enforce_spend_gate is false (default-off)', () => {
    const costConfig = makeCostConfig({ enforceSpendGate: false });
    const result = checkSpendGate(
      makeSpendInput({
        costConfig,
        spentDayUsd: 999,
        sprintEstimateUsd: 999,
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when enforce_spend_gate is not set (default-off)', () => {
    const costConfig = makeCostConfig(); // enforce_spend_gate undefined → falsy
    const result = checkSpendGate(
      makeSpendInput({ costConfig, spentDayUsd: 999, sprintEstimateUsd: 999 }),
    );
    expect(result).toBeNull();
  });

  it('returns null when projected spend is within daily limit (flag-on, under threshold)', () => {
    const costConfig = makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true });
    const result = checkSpendGate(
      makeSpendInput({ costConfig, spentDayUsd: 20, sprintEstimateUsd: 10 }),
    );
    // projected = 30, limit = 50 → no warn
    expect(result).toBeNull();
  });

  it('returns COST_LIMIT_WARN when projected daily spend exceeds daily_max_usd (flag-on)', () => {
    const costConfig = makeCostConfig({ dailyMaxUsd: 30, enforceSpendGate: true });
    const result = checkSpendGate(
      makeSpendInput({ costConfig, spentDayUsd: 25, sprintEstimateUsd: 10 }),
    );
    // projected = 35, limit = 30 → warn
    expect(result).not.toBeNull();
    const warn = result as CostLimitWarnEvent;
    expect(warn.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(warn.window).toBe('day');
    expect(warn.spentUsd).toBe(25);
    expect(warn.sprintEstimateUsd).toBe(10);
    expect(warn.projectedUsd).toBeCloseTo(35);
    expect(warn.limitUsd).toBe(30);
    expect(warn.message).toMatch(/daily/i);
    expect(warn.message).toMatch(/35\.00/);
    expect(warn.message).toMatch(/30\.00/);
  });

  it('returns null when monthly_max_usd is not set (no monthly check)', () => {
    const costConfig = makeCostConfig({ dailyMaxUsd: 100, enforceSpendGate: true });
    // no monthly_max_usd → monthly check skipped
    const result = checkSpendGate(
      makeSpendInput({ costConfig, spentDayUsd: 5, spentMonthUsd: 999, sprintEstimateUsd: 5 }),
    );
    expect(result).toBeNull();
  });

  it('returns COST_LIMIT_WARN for monthly window when daily is within limit but monthly exceeds', () => {
    const costConfig = makeCostConfig({
      dailyMaxUsd: 100,
      monthlyMaxUsd: 200,
      enforceSpendGate: true,
    });
    const result = checkSpendGate(
      makeSpendInput({
        costConfig,
        spentDayUsd: 10,     // daily: 10 + 50 = 60 < 100 → ok
        spentMonthUsd: 180,  // monthly: 180 + 50 = 230 > 200 → warn
        sprintEstimateUsd: 50,
      }),
    );
    expect(result).not.toBeNull();
    const warn = result as CostLimitWarnEvent;
    expect(warn.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(warn.window).toBe('month');
    expect(warn.limitUsd).toBe(200);
    expect(warn.projectedUsd).toBeCloseTo(230);
    expect(warn.message).toMatch(/monthly/i);
  });

  it('returns daily warn (not monthly) when both windows exceed limits', () => {
    const costConfig = makeCostConfig({
      dailyMaxUsd: 30,
      monthlyMaxUsd: 200,
      enforceSpendGate: true,
    });
    const result = checkSpendGate(
      makeSpendInput({
        costConfig,
        spentDayUsd: 25,
        spentMonthUsd: 195,
        sprintEstimateUsd: 20, // daily: 45 > 30, monthly: 215 > 200 → daily wins
      }),
    );
    expect(result).not.toBeNull();
    const warn = result as CostLimitWarnEvent;
    expect(warn.window).toBe('day');
  });

  it('sprint is never blocked — checkSpendGate only returns a warn, never throws or returns ok=false', () => {
    const costConfig = makeCostConfig({
      dailyMaxUsd: 0.001,
      monthlyMaxUsd: 0.001,
      enforceSpendGate: true,
    });
    // Even with massive overage, result is a warn object (truthy), not an exception
    expect(() =>
      checkSpendGate(
        makeSpendInput({ costConfig, spentDayUsd: 10000, sprintEstimateUsd: 10000 }),
      ),
    ).not.toThrow();

    const result = checkSpendGate(
      makeSpendInput({ costConfig, spentDayUsd: 10000, sprintEstimateUsd: 10000 }),
    );
    // The result is a warn event, not a blocking error structure
    expect(result).not.toBeNull();
    expect(result?.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    // No 'ok: false' or 'reason: COST_GATE_EXCEEDED' — this is warn-only
    expect((result as Record<string, unknown>)['ok']).toBeUndefined();
    expect((result as Record<string, unknown>)['reason']).toBeUndefined();
  });
});
