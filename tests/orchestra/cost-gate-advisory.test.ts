// ─── Sprint 333 333-005 — B6: cost-gate daily/monthly WARN-ONLY finalize wire ──
//
// Drives the extracted, fail-safe finalize hook `emitFinalizeSpendAdvisory` directly.
// finalizeSprint itself spawns subprocesses (git diff + tsc/vitest in runSelfAuditGate)
// so it cannot be driven hermetically — this drives the hook seam, the same approach
// proven for recordSprintKpis (see kpi-forward-collection.test.ts).
//
// Two layers:
//   1. tmpdir state — REAL readSpendWindow (resource-log.jsonl) + loadCostConfig
//      (cost-config.json) over a fresh os.tmpdir() sandbox, torn down per-test.
//   2. injected seams — read→check→emit wiring + the NON-BLOCKING guarantee
//      (an injected throw in the hook must NOT fail finalize).
//
// Contract under test (DECKENT-TRIAGE-PLAN B6): warn-only, never blocks; the HARD
// spend gate (enforce_spend_gate as a real block) stays default-off / post-beta.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  emitFinalizeSpendAdvisory,
  type FinalizeSpendAdvisoryOptions,
} from '../../src/orchestra/sprint-finalizer.js';
import type { CostLimitWarnEvent } from '../../src/core/cost-gate.js';
import type { CostConfig } from '../../src/core/cost-config-loader.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SPRINT = 'sprint-333';
/** Fixed reference timestamp (2026-06-27T10:00:00Z) → day prefix 2026-06-27, month 2026-06. */
const FIXED_NOW = '2026-06-27T10:00:00.000Z';
const DAY = '2026-06-27';
const MONTH_OTHER_DAY = '2026-06-10'; // same month, different day → month-only spend

/** A valid CostConfig (passes validateCostConfig) with spend-gate settings. */
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

/** JSONL resource-log line carrying a costUsd entry on a given timestamp. */
function costLine(ts: string, costUsd: number): string {
  return JSON.stringify({ ts, taskId: 'test', costUsd });
}

// ═══ Layer 1 — tmpdir: REAL readSpendWindow + loadCostConfig ══════════════════

describe('emitFinalizeSpendAdvisory — tmpdir (real ledger + cost-config)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cost-adv-'));
    mkdirSync(join(root, '.deckent', 'settings'), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Seed `.deckent/cost-config.json` + `.deckent/settings/resource-log.jsonl`. */
  function seed(config: CostConfig, ledgerLines: string[]): void {
    writeFileSync(join(root, '.deckent', 'cost-config.json'), JSON.stringify(config), 'utf-8');
    writeFileSync(
      join(root, '.deckent', 'settings', 'resource-log.jsonl'),
      ledgerLines.join('\n') + '\n',
      'utf-8',
    );
  }

  it('EMITS a daily COST_LIMIT_WARN when cumulative spend EXCEEDS daily_max_usd (flag-on)', () => {
    // Ledger: $40 spent today; sprint adds $20 → projected $60 > $50 daily cap.
    seed(makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true }), [
      costLine(`${DAY}T08:00:00.000Z`, 25),
      costLine(`${DAY}T09:00:00.000Z`, 15),
    ]);

    const captured: CostLimitWarnEvent[] = [];
    const result = emitFinalizeSpendAdvisory(root, SPRINT, 20, {
      now: FIXED_NOW,
      emit: (e) => captured.push(e),
    });

    expect(captured).toHaveLength(1);
    const warn = captured[0]!;
    expect(warn.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(warn.window).toBe('day');
    // content carries the cap + the actual:
    expect(warn.limitUsd).toBe(50); // configured cap
    expect(warn.spentUsd).toBeCloseTo(40, 10); // actual already-logged spend
    expect(warn.sprintEstimateUsd).toBe(20);
    expect(warn.projectedUsd).toBeCloseTo(60, 10); // actual projected total
    expect(warn.message).toContain('60');
    expect(warn.message).toContain('50');
    // returns the same advisory it emitted
    expect(result).toEqual(warn);
  });

  it('spend UNDER the cap → no warn (emitter not called, returns null)', () => {
    seed(makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true }), [
      costLine(`${DAY}T08:00:00.000Z`, 10),
    ]);

    const emit = vi.fn();
    const result = emitFinalizeSpendAdvisory(root, SPRINT, 5, { now: FIXED_NOW, emit });

    expect(emit).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('enforce_spend_gate OFF (default) → no warn even when over cap (never blocked)', () => {
    // Same over-cap numbers as the breach test, but the flag is omitted (default off).
    seed(makeCostConfig({ dailyMaxUsd: 50 /* enforceSpendGate omitted */ }), [
      costLine(`${DAY}T08:00:00.000Z`, 25),
      costLine(`${DAY}T09:00:00.000Z`, 15),
    ]);

    const emit = vi.fn();
    const result = emitFinalizeSpendAdvisory(root, SPRINT, 20, { now: FIXED_NOW, emit });

    expect(emit).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('EMITS a monthly COST_LIMIT_WARN when daily is within but monthly exceeds', () => {
    // $90 spent earlier THIS month (not today) → day window = 0, month window = 90.
    // Sprint adds $20: day 0+20=20 < 1000 (ok), month 90+20=110 > 100 cap → monthly warn.
    seed(
      makeCostConfig({ dailyMaxUsd: 1000, monthlyMaxUsd: 100, enforceSpendGate: true }),
      [
        costLine(`${MONTH_OTHER_DAY}T08:00:00.000Z`, 50),
        costLine(`${MONTH_OTHER_DAY}T12:00:00.000Z`, 40),
      ],
    );

    const captured: CostLimitWarnEvent[] = [];
    const result = emitFinalizeSpendAdvisory(root, SPRINT, 20, {
      now: FIXED_NOW,
      emit: (e) => captured.push(e),
    });

    expect(captured).toHaveLength(1);
    const warn = captured[0]!;
    expect(warn.window).toBe('month');
    expect(warn.limitUsd).toBe(100);
    expect(warn.spentUsd).toBeCloseTo(90, 10);
    expect(warn.projectedUsd).toBeCloseTo(110, 10);
    expect(result).toEqual(warn);
  });

  it('default emitter (no inject) on a breach: writes the event + console.warn, never throws', () => {
    seed(makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true }), [
      costLine(`${DAY}T08:00:00.000Z`, 40),
    ]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let result: CostLimitWarnEvent | null = null;
      expect(() => {
        result = emitFinalizeSpendAdvisory(root, SPRINT, 20, { now: FIXED_NOW });
      }).not.toThrow();
      expect(result).not.toBeNull();
      expect(result!.window).toBe('day');
      // default emitter surfaced the advisory to the operator
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]![0])).toContain('cost-advisory');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('missing ledger + missing config → no throw, returns null (fail-safe)', () => {
    // Fresh tmpdir with neither file; loadCostConfig falls back to the bundled
    // baseline (enforce_spend_gate off) → null, and readSpendWindow tolerates the
    // absent log. Must never throw or block finalize.
    let result: CostLimitWarnEvent | null = null;
    expect(() => {
      result = emitFinalizeSpendAdvisory(root, SPRINT, 999, { now: FIXED_NOW });
    }).not.toThrow();
    expect(result).toBeNull();
  });
});

// ═══ Layer 2 — injected seams: wiring + NON-BLOCKING guarantee ════════════════

describe('emitFinalizeSpendAdvisory — injected seams (read→check→emit wiring)', () => {
  /** Build options that force a deterministic breach via injected spend + config. */
  function breachOpts(
    over: Partial<FinalizeSpendAdvisoryOptions> = {},
  ): FinalizeSpendAdvisoryOptions {
    return {
      readSpend: (_root, window) => (window === 'day' ? 40 : 40),
      loadConfig: () => makeCostConfig({ dailyMaxUsd: 50, enforceSpendGate: true }),
      ...over,
    };
  }

  it('reads spend + config and emits the checkSpendGate advisory (no disk touched)', () => {
    const captured: CostLimitWarnEvent[] = [];
    const result = emitFinalizeSpendAdvisory('/nonexistent', SPRINT, 20, {
      ...breachOpts(),
      emit: (e) => captured.push(e),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]!.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(captured[0]!.limitUsd).toBe(50);
    expect(captured[0]!.projectedUsd).toBeCloseTo(60, 10);
    expect(result).toEqual(captured[0]);
  });

  it('NON-BLOCKING: an injected emitter throw is swallowed — does NOT fail finalize', () => {
    let result: CostLimitWarnEvent | null = null;
    expect(() => {
      result = emitFinalizeSpendAdvisory('/nonexistent', SPRINT, 20, {
        ...breachOpts(),
        emit: () => {
          throw new Error('emitter boom');
        },
      });
    }).not.toThrow();
    // throw happened after the warn was computed → swallowed → null returned.
    expect(result).toBeNull();
  });

  it('NON-BLOCKING: a loadConfig throw is swallowed — null, emit never called', () => {
    const emit = vi.fn();
    let result: CostLimitWarnEvent | null = null;
    expect(() => {
      result = emitFinalizeSpendAdvisory('/nonexistent', SPRINT, 20, {
        readSpend: () => 40,
        loadConfig: () => {
          throw new Error('config boom');
        },
        emit,
      });
    }).not.toThrow();
    expect(emit).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('execution continues after the hook (finalize is not aborted)', () => {
    let reachedAfterHook = false;
    expect(() => {
      emitFinalizeSpendAdvisory('/nonexistent', SPRINT, 20, {
        ...breachOpts(),
        emit: () => {
          throw new Error('boom');
        },
      });
      reachedAfterHook = true; // code after the hook still runs
    }).not.toThrow();
    expect(reachedAfterHook).toBe(true);
  });
});
