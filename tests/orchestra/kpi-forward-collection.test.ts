// ─── Sprint 332 332-002 — KPI forward-collection at finalize + REAL per-task cost ──
//
// Covers the two fixes for the forward-collection regression (disk-verified root
// cause: every kpi_measurements row in the live DB was backfill-origin with
// cost=0 — the forward hook had never persisted real numbers for any sprint):
//
//   FIX #3 — buildUsageTotals captures REAL provider-reported `result.cost.usd`
//            (provider-agnostic ground truth) and only estimates from Opus-tier
//            token prices for results that report no `cost`.
//   FIX #2 — the inline finalize hook is extracted into `recordSprintKpis`, an
//            independently unit-testable, NON-BLOCKING seam. finalizeSprint itself
//            spawns subprocesses (git diff + tsc/vitest in runSelfAuditGate) so it
//            cannot be driven hermetically — this drives the extracted hook directly.
//
// Hermetic: all I/O under a fresh os.tmpdir() sandbox, torn down per-test. No
// spawnSync, no project-root / gitignored-state reads.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildUsageTotals, recordSprintKpis } from '../../src/orchestra/sprint-finalizer.js';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { TaskResult, TokenUsage } from '../../src/core/task-types.js';
import type { SprintMetrics } from '../../src/core/sprint-types.js';
import type { Task } from '../../src/core/types.js';

const TENANT = 'default';
const SPRINT = 'sprint-332';

// Opus-tier fallback prices, mirrored from sprint-finalizer (estimate path only).
const PRICE_IN = 5e-6;
const PRICE_OUT = 25e-6;
const PRICE_CACHE = 0.5e-6;

// ─── Fixtures ────────────────────────────────────────────────────────────────

type ResultCost = NonNullable<TaskResult['cost']>;

/** A structurally-valid TaskResult; only tokenUsage + cost matter for the hook. */
function mkResult(
  tokenUsage?: TokenUsage,
  cost?: ResultCost,
  overrides: Partial<TaskResult> = {},
): TaskResult {
  return {
    taskId: 't-1',
    workerId: 'w-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: '',
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(cost ? { cost } : {}),
    ...overrides,
  };
}

function mkCost(usd: number, isLocal = false): ResultCost {
  return { usd, currency: 'USD', pricingSource: 'test', isLocal };
}

/** Minimal SprintMetrics-shaped object (only the 4 consumed fields are read). */
function mkMetrics(over: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 4,
    completedTasks: 4,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 0,
    coveragePercent: 0,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...over,
  };
}

// ═══ FIX #3 — buildUsageTotals: REAL cost wins over Opus estimate ════════════

describe('buildUsageTotals — REAL provider cost wins over the Opus estimate', () => {
  it('uses result.cost.usd verbatim (NOT the token estimate) when present', () => {
    // tokenUsage would estimate to 0.0175, but the real reported cost is 0.42.
    const usage: TokenUsage = { inputTokens: 1000, outputTokens: 500 };
    const realUsd = 0.42;
    const totals = buildUsageTotals([mkResult(usage, mkCost(realUsd))]);

    const estimate = 1000 * PRICE_IN + 500 * PRICE_OUT;
    expect(estimate).toBeCloseTo(0.0175, 12);
    // Real cost is taken, NOT the estimate — proves cost.usd is no longer ignored.
    expect(totals.costUsd).toBeCloseTo(realUsd, 12);
    expect(totals.costUsd).not.toBeCloseTo(estimate, 6);
    // Tokens are still summed regardless of the cost source.
    expect(totals.inputTokens).toBe(1000);
    expect(totals.outputTokens).toBe(500);
  });

  it('is provider-agnostic: sums each result real cost (Claude + Codex + Gemini)', () => {
    const results: TaskResult[] = [
      mkResult({ inputTokens: 100, outputTokens: 50 }, mkCost(1.5)),
      mkResult({ inputTokens: 200, outputTokens: 80 }, mkCost(0.25)),
      mkResult({ inputTokens: 300, outputTokens: 90 }, mkCost(0.75)),
    ];
    const totals = buildUsageTotals(results);
    expect(totals.costUsd).toBeCloseTo(1.5 + 0.25 + 0.75, 12);
    expect(totals.inputTokens).toBe(600);
    expect(totals.outputTokens).toBe(220);
  });

  it('mixes real cost + estimate fallback per result (only the no-cost result is estimated)', () => {
    const withCost = mkResult({ inputTokens: 1000, outputTokens: 500 }, mkCost(2.0));
    const noCost = mkResult({ inputTokens: 400, outputTokens: 200 }); // no cost → estimate
    const totals = buildUsageTotals([withCost, noCost]);

    const estimateForNoCost = 400 * PRICE_IN + 200 * PRICE_OUT;
    expect(totals.costUsd).toBeCloseTo(2.0 + estimateForNoCost, 12);
    expect(totals.inputTokens).toBe(1400);
    expect(totals.outputTokens).toBe(700);
  });

  it('honors cost.usd === 0 (local/ollama) as authoritative — never re-estimates', () => {
    // A local model reports real zero cost even though it burned tokens.
    const local = mkResult({ inputTokens: 5000, outputTokens: 4000 }, mkCost(0, true));
    const totals = buildUsageTotals([local]);
    expect(totals.costUsd).toBe(0); // estimate would have been > 0 — but real wins
    expect(totals.inputTokens).toBe(5000);
    expect(totals.outputTokens).toBe(4000);
  });

  it('separates subscription reference value from billed/API spend', () => {
    const result = mkResult(
      { inputTokens: 5_000, outputTokens: 1_000 },
      mkCost(1.93),
    );
    const task = {
      id: result.taskId,
      provider: 'claude',
      authMode: 'subscription',
    } as unknown as Task;

    const totals = buildUsageTotals([result], [task], 'subscription');

    expect(totals.costUsd).toBe(0);
    expect(totals.referenceCostUsd).toBe(1.93);
    expect(totals.unknownBillingTaskCount).toBe(0);
  });

  it('uses the settled billed field for API spend and the separate reference field for comparison', () => {
    const result = mkResult(
      { inputTokens: 5_000, outputTokens: 1_000 },
      {
        ...mkCost(0),
        referenceUsd: 1.93,
        billingMode: 'subscription',
      },
    );
    const task = {
      id: result.taskId,
      provider: 'claude',
      authMode: 'subscription',
    } as unknown as Task;

    const totals = buildUsageTotals([result], [task], 'subscription');

    expect(totals.costUsd).toBe(0);
    expect(totals.referenceCostUsd).toBe(1.93);
  });

  it('marks API billing unknown when only an unverified catalog reference exists', () => {
    const result = mkResult(
      { inputTokens: 5_000, outputTokens: 1_000 },
      {
        ...mkCost(0),
        referenceUsd: 1.93,
        billingMode: 'api',
        pricingSource: 'unverified-api-reference:cost-config:openai/gpt',
      },
    );
    const task = {
      id: result.taskId,
      provider: 'openai',
      authMode: 'api',
    } as unknown as Task;

    const totals = buildUsageTotals([result], [task], 'api');

    expect(totals.costUsd).toBe(0);
    expect(totals.referenceCostUsd).toBe(1.93);
    expect(totals.unknownBillingTaskCount).toBe(1);
  });

  it('falls back to the Opus estimate when NO result carries cost (legacy behavior)', () => {
    const results: TaskResult[] = [
      mkResult({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 }),
      mkResult({ inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 800 }),
    ];
    const totals = buildUsageTotals(results);
    const expected = 3000 * PRICE_IN + 1500 * PRICE_OUT + 1000 * PRICE_CACHE;
    expect(totals.costUsd).toBeCloseTo(expected, 12);
    expect(totals.cacheRead).toBe(1000);
  });

  it('null-safe: a result with neither tokenUsage nor cost contributes 0', () => {
    const totals = buildUsageTotals([mkResult(undefined), mkResult(undefined)]);
    expect(totals).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0 });
  });

  it('empty results → zeros, never throws', () => {
    expect(() => buildUsageTotals([])).not.toThrow();
    expect(buildUsageTotals([])).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0 });
  });

  it('cost present but tokenUsage absent → real cost counted, tokens 0', () => {
    const totals = buildUsageTotals([mkResult(undefined, mkCost(0.9))]);
    expect(totals.costUsd).toBeCloseTo(0.9, 12);
    expect(totals.inputTokens).toBe(0);
    expect(totals.outputTokens).toBe(0);
  });
});

// ═══ FIX #2 — recordSprintKpis persists REAL non-zero cost at finalize ═══════

describe('recordSprintKpis — forward collection persists REAL non-zero cost', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'kpi-fwd-'));
    // The hook writes to <root>/.brain/memory.db — better-sqlite3 needs the dir.
    mkdirSync(join(projectRoot, '.brain'), { recursive: true });
  });
  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function openStore(): KpiStore {
    return new KpiStore(join(projectRoot, '.brain', 'memory.db'));
  }

  it('records 11 measurements with NON-ZERO cost sourced from result.cost.usd', () => {
    const results: TaskResult[] = [
      mkResult({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 }, mkCost(1.25)),
      mkResult({ inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 800 }, mkCost(2.75)),
    ];
    const metrics = mkMetrics({ totalTasks: 2, completedTasks: 2 });

    const ok = recordSprintKpis(projectRoot, SPRINT, metrics, results);
    expect(ok).toBe(true);

    const store = openStore();
    try {
      const measurements = store.getSprintMeasurements(TENANT, SPRINT);
      expect(measurements).toHaveLength(11);

      const cost = measurements.find((m) => m.measureId === 'cost_usd');
      // REAL cost = 1.25 + 2.75 = 4.0 — non-zero, from result.cost.usd (NOT estimate).
      expect(cost?.value).toBeCloseTo(4.0, 12);
      expect(cost?.value).toBeGreaterThan(0);

      const tokensIn = measurements.find((m) => m.measureId === 'tokens_input');
      expect(tokensIn?.value).toBe(3000);

      // computeSprintKpis ran: cost_per_sprint = cost_usd / sprint_count(1) = 4.0.
      const kpiRows = store.getResults(TENANT, 'sprint', SPRINT);
      const costPerSprint = kpiRows.find((r) => r.kpiId === 'cost_per_sprint');
      expect(costPerSprint).toBeDefined();
      expect(costPerSprint!.value).toBeCloseTo(4.0, 12);
      expect(costPerSprint!.value).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it('a result with NO cost falls back to the estimate and still persists (no crash)', () => {
    const results: TaskResult[] = [mkResult({ inputTokens: 1000, outputTokens: 500 })];
    const metrics = mkMetrics({ totalTasks: 1, completedTasks: 1 });

    const ok = recordSprintKpis(projectRoot, SPRINT, metrics, results);
    expect(ok).toBe(true);

    const store = openStore();
    try {
      const ms = store.getSprintMeasurements(TENANT, SPRINT);
      expect(ms).toHaveLength(11);
      const cost = ms.find((m) => m.measureId === 'cost_usd');
      expect(cost?.value).toBeCloseTo(1000 * PRICE_IN + 500 * PRICE_OUT, 12);
    } finally {
      store.close();
    }
  });

  it('maps SprintMetrics → measures (tasks_total / tasks_done / no_go / boundary_violations)', () => {
    const metrics = mkMetrics({ totalTasks: 7, completedTasks: 5, noGoTasks: 2, boundaryViolations: 1 });
    expect(recordSprintKpis(projectRoot, SPRINT, metrics, [])).toBe(true);

    const store = openStore();
    try {
      const ms = store.getSprintMeasurements(TENANT, SPRINT);
      const val = (id: string) => ms.find((m) => m.measureId === id)?.value;
      expect(val('tasks_total')).toBe(7);
      expect(val('tasks_done')).toBe(5);
      expect(val('no_go')).toBe(2);
      expect(val('boundary_violations')).toBe(1);
    } finally {
      store.close();
    }
  });
});

// ═══ NON-BLOCKING guarantee — an injected throw must not fail finalize ═══════

describe('recordSprintKpis — non-blocking: a swallowed throw never fails finalize', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'kpi-fwd-nb-'));
    // Intentionally DO NOT create <root>/.brain → KpiStore open throws (parent missing).
  });
  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns false and does NOT throw when the DB cannot be opened', () => {
    const results: TaskResult[] = [mkResult({ inputTokens: 10, outputTokens: 5 }, mkCost(0.1))];
    let returned: boolean | undefined;
    expect(() => {
      returned = recordSprintKpis(projectRoot, SPRINT, mkMetrics(), results);
    }).not.toThrow();
    expect(returned).toBe(false);
  });

  it('execution continues after the hook (finalize is not aborted)', () => {
    let reachedAfterHook = false;
    expect(() => {
      recordSprintKpis(projectRoot, SPRINT, mkMetrics(), []);
      reachedAfterHook = true; // code after the hook still runs
    }).not.toThrow();
    expect(reachedAfterHook).toBe(true);
  });
});
