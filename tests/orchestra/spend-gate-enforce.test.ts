// ─── Row 4091 — enforce_spend_gate as a real typed pre-spawn admission gate ───
//
// Contract under test:
//   1. enforce_spend_gate ON  + projected day/month spend over the ceiling
//      + unacknowledged  → typed COST_GATE_EXCEEDED refusal (no new run admitted).
//   2. enforce_spend_gate ON  + acknowledged (CLI --force / MCP acknowledgeCost)
//      → the PREVIOUS warn-only behaviour, byte-identical CostLimitWarnEvent.
//   3. enforce_spend_gate OFF (the default) → strict no-op: zero ledger I/O, no
//      event, admission allowed — today's start path unchanged.
//   4. MID-FLIGHT NON-INTERRUPTION: with the flag ON and a window breached, the
//      finalize hook still only WARNS. An ACTIVE sprint is never cut or failed;
//      it lands gracefully and only the next admission is refused.
//
// The gate owns no spend math and no spend source — layer 2 below drives it over a
// REAL tmpdir resource-log.jsonl to pin that it reads the canonical cost/usage
// authority (readSpendWindow) and nothing else.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  evaluateSpendAdmissionGate,
  emitFinalizeSpendAdvisory,
} from '../../src/orchestra/sprint-finalizer.js';
import { checkSpendGate, type CostLimitWarnEvent } from '../../src/core/cost-gate.js';
import {
  readSpendWindow as realReadSpendWindow,
  type CostConfig,
} from '../../src/core/cost-config-loader.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Fixed reference timestamp → day prefix 2026-08-05, month prefix 2026-08. */
const FIXED_NOW = '2026-08-05T10:00:00.000Z';
const DAY = '2026-08-05';
const MONTH_OTHER_DAY = '2026-08-01'; // same month, different day → month-only spend

/** A valid CostConfig with spend-gate settings (mirrors cost-gate-advisory.test.ts). */
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
          'claude-sonnet-5': {
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
    estimator: {
      default_input_tokens: 20_000,
      output_tokens_by_effort: { low: 2_000, normal: 4_000, high: 8_000 },
      budget_headroom_factor: 1.5,
    },
  };
}

/** JSONL resource-log line carrying a costUsd entry on a given timestamp. */
function costLine(ts: string, costUsd: number): string {
  return JSON.stringify({ ts, taskId: 'test', costUsd });
}

/** Spend reader stub returning fixed per-window values, recording every call. */
function stubSpend(day: number, month: number): {
  read: (root: string, window: 'day' | 'month') => number;
  calls: Array<'day' | 'month'>;
} {
  const calls: Array<'day' | 'month'> = [];
  return {
    calls,
    read: (_root: string, window: 'day' | 'month'): number => {
      calls.push(window);
      return window === 'day' ? day : month;
    },
  };
}

const ROOT = '/nonexistent-root-never-touched';

// ═══ Layer 1 — the typed admission decision (injected spend reader) ═══════════

describe('evaluateSpendAdmissionGate — flag OFF (default) is a strict no-op', () => {
  it('allows admission, reports no breach, and never touches the spend ledger', () => {
    const spend = stubSpend(10_000, 10_000); // wildly over any ceiling
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: makeCostConfig({ dailyMaxUsd: 50, monthlyMaxUsd: 100 }), // flag unset
      sprintEstimateUsd: 5,
      readSpend: spend.read,
    });

    expect(decision.ok).toBe(true);
    expect(decision.breach).toBeNull();
    if (decision.ok) expect(decision.overrideApplied).toBe(false);
    // Zero I/O: the flag-off short-circuit precedes any window read.
    expect(spend.calls).toEqual([]);
  });

  it('stays a no-op even when explicitly set to false', () => {
    const spend = stubSpend(10_000, 10_000);
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: makeCostConfig({ enforceSpendGate: false, dailyMaxUsd: 1 }),
      sprintEstimateUsd: 500,
      readSpend: spend.read,
    });

    expect(decision.ok).toBe(true);
    expect(decision.breach).toBeNull();
    expect(spend.calls).toEqual([]);
  });
});

describe('evaluateSpendAdmissionGate — flag ON, under the ceiling', () => {
  it('allows admission with no breach when the projection stays within limits', () => {
    const spend = stubSpend(10, 20);
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: makeCostConfig({
        enforceSpendGate: true,
        dailyMaxUsd: 50,
        monthlyMaxUsd: 100,
      }),
      sprintEstimateUsd: 5, // day 15/50, month 25/100
      readSpend: spend.read,
    });

    expect(decision.ok).toBe(true);
    expect(decision.breach).toBeNull();
    expect(spend.calls).toEqual(['day', 'month']);
  });
});

describe('evaluateSpendAdmissionGate — flag ON, over the ceiling → HARD BLOCK', () => {
  it('refuses admission with a typed COST_GATE_EXCEEDED on a daily breach', () => {
    const spend = stubSpend(48, 48);
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: makeCostConfig({ enforceSpendGate: true, dailyMaxUsd: 50 }),
      sprintEstimateUsd: 5, // projected 53 > 50
      readSpend: spend.read,
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error('expected a blocked decision');

    expect(decision.reason).toBe('COST_GATE_EXCEEDED');
    expect(decision.breach.window).toBe('day');
    expect(decision.breach.spentUsd).toBe(48);
    expect(decision.breach.projectedUsd).toBe(53);
    expect(decision.breach.limitUsd).toBe(50);
    // The refusal carries the breach detail plus override guidance.
    expect(decision.message).toContain(decision.breach.message);
    expect(decision.message).toContain('--force');
    expect(decision.message).toContain('daily_max_usd');
  });

  it('refuses admission on a monthly breach when the day window is clean', () => {
    const spend = stubSpend(1, 95);
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: makeCostConfig({
        enforceSpendGate: true,
        dailyMaxUsd: 50,
        monthlyMaxUsd: 100,
      }),
      sprintEstimateUsd: 10, // day 11/50 ok, month 105 > 100
      readSpend: spend.read,
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error('expected a blocked decision');
    expect(decision.reason).toBe('COST_GATE_EXCEEDED');
    expect(decision.breach.window).toBe('month');
    expect(decision.breach.projectedUsd).toBe(105);
    expect(decision.message).toContain('monthly_max_usd');
  });

  it('never signals a kill/pause — the refusal only withholds admission', () => {
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: makeCostConfig({ enforceSpendGate: true, dailyMaxUsd: 1 }),
      sprintEstimateUsd: 99,
      readSpend: stubSpend(0, 0).read,
    });

    expect(decision.ok).toBe(false);
    // The decision surface is admission-only: no abort/kill/pause channel exists.
    expect(Object.keys(decision).sort()).toEqual(['breach', 'message', 'ok', 'reason']);
    expect(decision.message).toContain('already-running');
  });
});

describe('evaluateSpendAdmissionGate — acknowledged breach keeps the old warn behaviour', () => {
  it('allows admission and returns the byte-identical COST_LIMIT_WARN event', () => {
    const costConfig = makeCostConfig({ enforceSpendGate: true, dailyMaxUsd: 50 });
    const decision = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig,
      sprintEstimateUsd: 5,
      acknowledged: true,
      readSpend: stubSpend(48, 48).read,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) throw new Error('expected an allowed decision');
    expect(decision.overrideApplied).toBe(true);
    expect(decision.breach).not.toBeNull();

    // Identical to what the pre-existing warn path produced for the same inputs.
    const previousWarn = checkSpendGate({
      spentDayUsd: 48,
      spentMonthUsd: 48,
      sprintEstimateUsd: 5,
      costConfig,
    });
    expect(decision.breach).toEqual(previousWarn);
    expect(decision.breach?.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
  });
});

// ═══ Layer 2 — real readSpendWindow over a tmpdir resource ledger ═════════════

describe('evaluateSpendAdmissionGate — canonical spend authority (real ledger)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'spend-gate-enforce-'));
    mkdirSync(join(root, '.deckent', 'settings'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeLedger(lines: string[]): void {
    writeFileSync(
      join(root, '.deckent', 'settings', 'resource-log.jsonl'),
      lines.join('\n') + '\n',
      'utf-8',
    );
  }

  it('blocks on spend summed from .deckent/settings/resource-log.jsonl', () => {
    writeLedger([costLine(DAY, 30), costLine(DAY, 18), costLine(MONTH_OTHER_DAY, 5)]);

    const decision = evaluateSpendAdmissionGate({
      root,
      costConfig: makeCostConfig({ enforceSpendGate: true, dailyMaxUsd: 50 }),
      sprintEstimateUsd: 5,
      // Real reader, fixed reference time so the window prefixes are deterministic.
      readSpend: (r, w) => readSpendWindowFixed(r, w),
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) throw new Error('expected a blocked decision');
    expect(decision.breach.spentUsd).toBe(48); // day-window entries only
    expect(decision.breach.projectedUsd).toBe(53);
  });

  it('allows admission when the ledger is absent (no spend recorded yet)', () => {
    const decision = evaluateSpendAdmissionGate({
      root,
      costConfig: makeCostConfig({ enforceSpendGate: true, dailyMaxUsd: 50 }),
      sprintEstimateUsd: 5,
      readSpend: (r, w) => readSpendWindowFixed(r, w),
    });

    expect(decision.ok).toBe(true);
    expect(decision.breach).toBeNull();
  });
});

/** Real readSpendWindow pinned to FIXED_NOW so window prefixes are deterministic. */
function readSpendWindowFixed(root: string, window: 'day' | 'month'): number {
  return realReadSpendWindow(root, window, { now: FIXED_NOW });
}

// ═══ Layer 3 — mid-flight non-interruption (finalize stays advisory) ══════════

describe('mid-flight non-interruption — an ACTIVE sprint is never cut on breach', () => {
  const overCeiling = makeCostConfig({
    enforceSpendGate: true,
    dailyMaxUsd: 50,
    monthlyMaxUsd: 100,
  });

  it('finalize still only WARNS when the flag is ON and the ceiling is crossed', () => {
    const emitted: CostLimitWarnEvent[] = [];

    const result = emitFinalizeSpendAdvisory('/root', 'sprint-510', 20, {
      loadConfig: () => overCeiling,
      readSpend: (_r, w) => (w === 'day' ? 45 : 45),
      emit: (e) => emitted.push(e),
    });

    // A warning — NOT a block. There is no failure/abort return channel here.
    expect(result).not.toBeNull();
    expect(result?.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(result?.window).toBe('day');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual(result);
    // Crucially: no COST_GATE_EXCEEDED shape leaks into the finalize path.
    expect(result).not.toHaveProperty('reason');
    expect(result).not.toHaveProperty('ok');
  });

  it('stays fail-safe with the flag ON — an emitter throw cannot fail finalize', () => {
    expect(() =>
      emitFinalizeSpendAdvisory('/root', 'sprint-510', 20, {
        loadConfig: () => overCeiling,
        readSpend: () => 45,
        emit: () => {
          throw new Error('emitter exploded');
        },
      }),
    ).not.toThrow();
  });

  it('does not block a breaching in-flight sprint even though admission would refuse', () => {
    // Same numbers on both sides of the boundary: admission refuses …
    const admission = evaluateSpendAdmissionGate({
      root: ROOT,
      costConfig: overCeiling,
      sprintEstimateUsd: 20,
      readSpend: () => 45,
    });
    expect(admission.ok).toBe(false);

    // … while the already-running sprint's finalize only advises.
    const finalizeSpy = vi.fn();
    const advisory = emitFinalizeSpendAdvisory('/root', 'sprint-510', 20, {
      loadConfig: () => overCeiling,
      readSpend: () => 45,
      emit: finalizeSpy,
    });
    expect(advisory?.type).toBe('BRAIN→USER:COST_LIMIT_WARN');
    expect(finalizeSpy).toHaveBeenCalledTimes(1);
  });
});
