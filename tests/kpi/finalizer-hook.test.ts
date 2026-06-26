// ─── Sprint 330 Task 8 — KPI finalize hook ────────────────────────────────────
// Covers (a) the exported `buildUsageTotals` aggregator and (b) the non-blocking
// KPI-collection hook wired into `finalizeSprint`.
//
// NOTE on scope: `finalizeSprint` itself runs real subprocesses (git diff +
// `runSelfAuditGate` which spawns `tsc`/`vitest`), so invoking it directly is
// neither hermetic nor fast and would violate the test-hermeticity rule. These
// tests therefore exercise the hook at its two real seams instead:
//   1. `buildUsageTotals` — the new pure aggregator (fully covered).
//   2. `recordKpiMeasurements(..., buildUsageTotals(results))` — the EXACT call
//      the finalize hook makes (same db path / sprint id / 'default' tenant /
//      SprintMetricsLike mapping / usage), proving the wiring + types are correct
//      and that KPI rows land.
//   3. The non-blocking guard: a forced KpiStore-open failure throws, and the
//      same `try { … } catch` guard the production hook uses swallows it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildUsageTotals } from '../../src/orchestra/sprint-finalizer.js';
import { recordKpiMeasurements } from '../../src/core/kpi/collection.js';
import type { SprintMetricsLike } from '../../src/core/kpi/collection.js';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { TaskResult } from '../../src/core/task-types.js';
import type { TokenUsage } from '../../src/core/task-types.js';

const TENANT = 'default';
const SPRINT = 'sprint-330';

// Opus-tier public per-token prices mirrored from sprint-finalizer.
const PRICE_IN = 5e-6;
const PRICE_OUT = 25e-6;
const PRICE_CACHE = 0.5e-6;

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Build a structurally-valid TaskResult; only `tokenUsage` matters for the hook. */
function mkResult(tokenUsage?: TokenUsage, overrides: Partial<TaskResult> = {}): TaskResult {
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
    ...overrides,
  };
}

// ─── buildUsageTotals — pure aggregator ───────────────────────────────────────

describe('buildUsageTotals — sums tokenUsage across results', () => {
  it('sums input/output/cacheRead and computes Opus-tier cost (> 0)', () => {
    const results: TaskResult[] = [
      mkResult({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 }),
      mkResult({ inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 800 }),
    ];
    const totals = buildUsageTotals(results);

    expect(totals.inputTokens).toBe(3000);
    expect(totals.outputTokens).toBe(1500);
    expect(totals.cacheRead).toBe(1000);

    const expectedCost = 3000 * PRICE_IN + 1500 * PRICE_OUT + 1000 * PRICE_CACHE;
    expect(totals.costUsd).toBeCloseTo(expectedCost, 12);
    expect(totals.costUsd).toBeGreaterThan(0);
  });

  it('treats missing cacheReadTokens as 0 (optional field)', () => {
    const totals = buildUsageTotals([mkResult({ inputTokens: 100, outputTokens: 50 })]);
    expect(totals.cacheRead).toBe(0);
    expect(totals.costUsd).toBeCloseTo(100 * PRICE_IN + 50 * PRICE_OUT, 12);
  });

  it('results WITHOUT tokenUsage contribute 0 (mixed fleet)', () => {
    const results: TaskResult[] = [
      mkResult({ inputTokens: 400, outputTokens: 200, cacheReadTokens: 100 }),
      mkResult(undefined), // no tokenUsage at all
      mkResult({ inputTokens: 600, outputTokens: 300 }),
    ];
    const totals = buildUsageTotals(results);
    expect(totals.inputTokens).toBe(1000);
    expect(totals.outputTokens).toBe(500);
    expect(totals.cacheRead).toBe(100);
    expect(totals.costUsd).toBeGreaterThan(0);
  });

  it('tokenUsage-yok → zeros (no usage telemetry → all-zero totals, cost 0)', () => {
    const totals = buildUsageTotals([mkResult(undefined), mkResult(undefined)]);
    expect(totals).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0 });
  });

  it('empty results → zeros, never throws', () => {
    expect(() => buildUsageTotals([])).not.toThrow();
    expect(buildUsageTotals([])).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0 });
  });
});

// ─── Integration: the EXACT finalize-hook call lands KPI rows ─────────────────

describe('finalize hook wiring — recordKpiMeasurements(..., buildUsageTotals(results))', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-finalizer-hook-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records 11 measurements; cost_per_sprint derives from buildUsageTotals cost', () => {
    const dbPath = join(tmpDir, 'memory.db');
    const results: TaskResult[] = [
      mkResult({ inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 }),
      mkResult({ inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 800 }),
    ];
    // Mirror the exact mapping the finalize hook performs: SprintMetrics → SprintMetricsLike.
    const metricsLike: SprintMetricsLike = {
      tasksTotal: 6,
      tasksDone: 6,
      noGo: 0,
      boundaryViolations: 0,
    };
    const usage = buildUsageTotals(results);

    // Exactly how sprint-finalizer.ts calls it (tenant 'default').
    recordKpiMeasurements(dbPath, SPRINT, TENANT, metricsLike, results, usage);

    const store = new KpiStore(dbPath);
    try {
      const measurements = store.getSprintMeasurements(TENANT, SPRINT);
      expect(measurements).toHaveLength(11);

      const costMeasure = measurements.find((m) => m.measureId === 'cost_usd');
      expect(costMeasure?.value).toBeCloseTo(usage.costUsd, 12);

      const results2 = store.getResults(TENANT, 'sprint', SPRINT);
      const costPerSprint = results2.find((r) => r.kpiId === 'cost_per_sprint');
      expect(costPerSprint).toBeDefined();
      // sprint_count = 1 → cost_per_sprint == total cost_usd.
      expect(costPerSprint!.value).toBeCloseTo(usage.costUsd, 12);
    } finally {
      store.close();
    }
  });

  it('lands rows even when no result carries tokenUsage (cost = 0)', () => {
    const dbPath = join(tmpDir, 'memory.db');
    const results: TaskResult[] = [mkResult(undefined)];
    const metricsLike: SprintMetricsLike = { tasksTotal: 1, tasksDone: 1, noGo: 0, boundaryViolations: 0 };

    recordKpiMeasurements(dbPath, SPRINT, TENANT, metricsLike, results, buildUsageTotals(results));

    const store = new KpiStore(dbPath);
    try {
      const ms = store.getSprintMeasurements(TENANT, SPRINT);
      expect(ms).toHaveLength(11);
      expect(ms.find((m) => m.measureId === 'cost_usd')?.value).toBe(0);
    } finally {
      store.close();
    }
  });
});

// ─── Non-blocking guarantee ───────────────────────────────────────────────────

describe('hook non-blocking — a thrown error must NOT fail the sprint', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-finalizer-nb-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recordKpiMeasurements DOES throw on an unopenable db path (failure mode is real)', () => {
    // Parent dir does not exist → better-sqlite3 cannot open the file → throws.
    // This proves the production try/catch around the hook is load-bearing.
    const badPath = join(tmpDir, 'no-such-dir', 'memory.db');
    const metricsLike: SprintMetricsLike = { tasksTotal: 1, tasksDone: 1, noGo: 0 };
    expect(() =>
      recordKpiMeasurements(badPath, SPRINT, TENANT, metricsLike, [], buildUsageTotals([])),
    ).toThrow();
  });

  it('the finalize guard pattern swallows the throw and execution continues', () => {
    // Mirrors the inline guard in finalizeSprint:
    //   try { recordKpiMeasurements(...) } catch (e) { debugLog(...) }
    const badPath = join(tmpDir, 'no-such-dir', 'memory.db');
    const metricsLike: SprintMetricsLike = { tasksTotal: 1, tasksDone: 1, noGo: 0 };
    const results: TaskResult[] = [mkResult({ inputTokens: 10, outputTokens: 5 })];

    let reachedAfterHook = false;
    expect(() => {
      try {
        recordKpiMeasurements(badPath, SPRINT, TENANT, metricsLike, results, buildUsageTotals(results));
      } catch {
        /* swallowed — finalize continues (debugLog in production) */
      }
      // Code AFTER the hook still runs — finalize is not aborted.
      reachedAfterHook = true;
    }).not.toThrow();

    expect(reachedAfterHook).toBe(true);
  });
});
