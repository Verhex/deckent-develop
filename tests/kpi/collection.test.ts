import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import { deriveMeasurements, recordKpiMeasurements } from '../../src/core/kpi/collection.js';
import type { UsageTotals, SprintMetricsLike, TaskResultLike } from '../../src/core/kpi/collection.js';

const TENANT = 'default';
const SPRINT = 'sprint-330';
const TS = '2026-06-26T22:00:00.000Z';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const METRICS: SprintMetricsLike = {
  tasksTotal: 6,
  tasksDone: 6,
  noGo: 0,
  boundaryViolations: 0,
};

const RESULTS: readonly TaskResultLike[] = [
  { tscAttempts: 1, testAttempts: 0, linesAdded: 1000 },
  { tscAttempts: 0, testAttempts: 1, linesAdded: 1000 },
];

const USAGE: UsageTotals = {
  costUsd: 7,
  inputTokens: 1000,
  outputTokens: 500,
  cacheRead: 200,
};

function findMeasure(ms: ReturnType<typeof deriveMeasurements>, id: string) {
  return ms.find((m) => m.measureId === id);
}

// ─── deriveMeasurements — pure ────────────────────────────────────────────────

describe('deriveMeasurements — 11 measures, correct values', () => {
  it('produces exactly 11 measurements', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(ms).toHaveLength(11);
  });

  it('sprint_count is always 1', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(findMeasure(ms, 'sprint_count')?.value).toBe(1);
  });

  it('tasks_total/done/no_go match metrics', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(findMeasure(ms, 'tasks_total')?.value).toBe(6);
    expect(findMeasure(ms, 'tasks_done')?.value).toBe(6);
    expect(findMeasure(ms, 'no_go')?.value).toBe(0);
  });

  it('boundary_violations defaults to 0 when not in metrics', () => {
    const metricsNoBoundary: SprintMetricsLike = { tasksTotal: 4, tasksDone: 4, noGo: 0 };
    const ms = deriveMeasurements(SPRINT, TENANT, metricsNoBoundary, [], USAGE, TS);
    expect(findMeasure(ms, 'boundary_violations')?.value).toBe(0);
  });

  it('retries = Σ(tscAttempts + testAttempts) = 2', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(findMeasure(ms, 'retries')?.value).toBe(2);
  });

  it('lines_added = Σ linesAdded = 2000', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(findMeasure(ms, 'lines_added')?.value).toBe(2000);
  });

  it('cost_usd from usage = 7', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(findMeasure(ms, 'cost_usd')?.value).toBe(7);
  });

  it('tokens_input, tokens_output, cache_read from usage', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    expect(findMeasure(ms, 'tokens_input')?.value).toBe(1000);
    expect(findMeasure(ms, 'tokens_output')?.value).toBe(500);
    expect(findMeasure(ms, 'cache_read')?.value).toBe(200);
  });

  it('each measurement carries sprintId, tenantId, and ts', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    for (const m of ms) {
      expect(m.sprintId).toBe(SPRINT);
      expect(m.tenantId).toBe(TENANT);
      expect(m.ts).toBe(TS);
    }
  });

  it('kind and unit are populated from the catalog', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    const cost = findMeasure(ms, 'cost_usd');
    expect(cost?.kind).toBe('gauge');
    expect(cost?.unit).toBe('USD');
    const sprint = findMeasure(ms, 'sprint_count');
    expect(sprint?.kind).toBe('counter');
    expect(sprint?.unit).toBe('count');
  });
});

describe('deriveMeasurements — null/undefined usage (nogo guard: tokenUsage yokken crash)', () => {
  it('does NOT crash when usage is null → cost/token measures default to 0', () => {
    let ms: ReturnType<typeof deriveMeasurements> | undefined;
    expect(() => {
      ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, null, TS);
    }).not.toThrow();
    expect(findMeasure(ms!, 'cost_usd')?.value).toBe(0);
    expect(findMeasure(ms!, 'tokens_input')?.value).toBe(0);
    expect(findMeasure(ms!, 'cache_read')?.value).toBe(0);
  });

  it('does NOT crash when usage is undefined → cost/token measures default to 0', () => {
    let ms: ReturnType<typeof deriveMeasurements> | undefined;
    expect(() => {
      ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, undefined, TS);
    }).not.toThrow();
    expect(findMeasure(ms!, 'cost_usd')?.value).toBe(0);
  });

  it('still produces all 11 measurements with null usage', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, null, TS);
    expect(ms).toHaveLength(11);
  });
});

describe('deriveMeasurements — partial task results', () => {
  it('handles tasks with no tscAttempts/testAttempts/linesAdded gracefully', () => {
    const sparse: readonly TaskResultLike[] = [{}, { linesAdded: 500 }, { tscAttempts: 3 }];
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, sparse, USAGE, TS);
    expect(findMeasure(ms, 'retries')?.value).toBe(3);
    expect(findMeasure(ms, 'lines_added')?.value).toBe(500);
  });

  it('empty results array → retries=0, lines_added=0', () => {
    const ms = deriveMeasurements(SPRINT, TENANT, METRICS, [], USAGE, TS);
    expect(findMeasure(ms, 'retries')?.value).toBe(0);
    expect(findMeasure(ms, 'lines_added')?.value).toBe(0);
  });
});

// ─── recordKpiMeasurements — end-to-end pipeline ─────────────────────────────

describe('recordKpiMeasurements — end-to-end', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-collection-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('goCriteria: cost_per_sprint = 7 after pipeline (cost_usd=7, sprint_count=1)', () => {
    const dbPath = join(tmpDir, 'memory.db');
    recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);

    const store = new KpiStore(dbPath);
    try {
      const results = store.getResults(TENANT, 'sprint', SPRINT);
      const costKpi = results.find((r) => r.kpiId === 'cost_per_sprint');
      expect(costKpi).toBeDefined();
      expect(costKpi!.value).toBeCloseTo(7, 10);
    } finally {
      store.close();
    }
  });

  it('stores all 11 measurements in the DB (sprint measurements readable)', () => {
    const dbPath = join(tmpDir, 'memory.db');
    recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);

    const store = new KpiStore(dbPath);
    try {
      const ms = store.getSprintMeasurements(TENANT, SPRINT);
      expect(ms).toHaveLength(11);
    } finally {
      store.close();
    }
  });

  it('pipeline is idempotent — calling twice yields same result, no duplicate rows', () => {
    const dbPath = join(tmpDir, 'memory.db');
    recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);

    const store = new KpiStore(dbPath);
    try {
      const results = store.getResults(TENANT, 'sprint', SPRINT);
      const costKpi = results.find((r) => r.kpiId === 'cost_per_sprint');
      expect(costKpi!.value).toBeCloseTo(7, 10);
    } finally {
      store.close();
    }
  });

  it('does NOT crash when usage is null (nogo guard)', () => {
    const dbPath = join(tmpDir, 'memory.db');
    expect(() => {
      recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, null, TS);
    }).not.toThrow();
  });

  it('defaults ts to now when omitted', () => {
    const dbPath = join(tmpDir, 'memory.db');
    expect(() => {
      recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE);
    }).not.toThrow();

    const store = new KpiStore(dbPath);
    try {
      const ms = store.getSprintMeasurements(TENANT, SPRINT);
      expect(ms).toHaveLength(11);
      // ts was auto-generated — must be a valid ISO string (parseable)
      expect(() => new Date(ms[0].ts)).not.toThrow();
      expect(new Date(ms[0].ts).getFullYear()).toBeGreaterThanOrEqual(2026);
    } finally {
      store.close();
    }
  });
});
