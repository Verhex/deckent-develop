import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import {
  deriveMeasurements,
  recordKpiMeasurements,
  recordTerminalSprintKpiMeasurements,
} from '../../src/core/kpi/collection.js';
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

  it('preserves the legacy raw append contract when called twice', () => {
    const dbPath = join(tmpDir, 'memory.db');
    recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
    recordKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);

    const store = new KpiStore(dbPath);
    try {
      expect(store.getSprintMeasurements(TENANT, SPRINT)).toHaveLength(22);
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

describe('recordTerminalSprintKpiMeasurements — terminal snapshot replay', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'terminal-kpi-collection-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts the complete vector once and replays different capture metadata without appending', () => {
    const dbPath = join(tmpDir, 'memory.db');
    recordTerminalSprintKpiMeasurements(dbPath, SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);

    const before = (() => {
      const store = new KpiStore(dbPath);
      try { return store.getSprintMeasurements(TENANT, SPRINT); } finally { store.close(); }
    })();
    recordTerminalSprintKpiMeasurements(
      dbPath,
      SPRINT,
      TENANT,
      METRICS,
      RESULTS,
      { ...USAGE, unknownBillingTaskCount: 0 },
      '2026-06-27T01:00:00.000Z',
    );

    const store = new KpiStore(dbPath);
    try {
      const after = store.getSprintMeasurements(TENANT, SPRINT);
      expect(after).toHaveLength(11);
      expect(after.map(row => row.id)).toEqual(before.map(row => row.id));
      expect(after.map(row => row.ts)).toEqual(before.map(row => row.ts));
      expect(store.getResults(TENANT, 'sprint', SPRINT)
        .find(row => row.kpiId === 'cost_per_sprint')?.value).toBeCloseTo(7, 10);
    } finally {
      store.close();
    }
  });

  it('accepts a matching legacy vector with caller ids and timestamps', () => {
    const dbPath = join(tmpDir, 'memory.db');
    const legacy = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS)
      .map((row, index) => ({
        ...row,
        id: `legacy-kpi-${index}`,
        ts: `2025-01-01T00:00:${String(index).padStart(2, '0')}.000Z`,
      }));
    const seed = new KpiStore(dbPath);
    try { seed.recordMeasurements(legacy); } finally { seed.close(); }

    expect(() => recordTerminalSprintKpiMeasurements(
      dbPath,
      SPRINT,
      TENANT,
      METRICS,
      RESULTS,
      USAGE,
      '2026-09-05T19:50:45.000Z',
    )).not.toThrow();

    const store = new KpiStore(dbPath);
    try {
      const rows = store.getSprintMeasurements(TENANT, SPRINT);
      expect(rows).toHaveLength(11);
      expect(rows.map(row => row.id)).toEqual(legacy.map(row => row.id));
      expect(store.getResults(TENANT, 'sprint', SPRINT)
        .find(row => row.kpiId === 'cost_per_sprint')?.value).toBeCloseTo(7, 10);
    } finally {
      store.close();
    }
  });

  it('holds divergent, partial, and duplicate existing history without changing any rows', () => {
    const cases = [
      {
        name: 'divergent',
        seed: deriveMeasurements(SPRINT, TENANT, { ...METRICS, tasksDone: 5 }, RESULTS, USAGE, TS),
      },
      {
        name: 'partial',
        seed: deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS).slice(0, -1),
      },
      {
        name: 'duplicate',
        seed: (() => {
          const rows = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS);
          return [...rows, { ...rows[0]!, id: 'duplicate-history-row' }];
        })(),
      },
    ];

    for (const fixture of cases) {
      const dbPath = join(tmpDir, `${fixture.name}.db`);
      const seed = new KpiStore(dbPath);
      try { seed.recordMeasurements(fixture.seed); } finally { seed.close(); }
      const before = (() => {
        const reader = new KpiStore(dbPath);
        try { return reader.getSprintMeasurements(TENANT, SPRINT); } finally { reader.close(); }
      })();

      expect(() => recordTerminalSprintKpiMeasurements(
        dbPath,
        SPRINT,
        TENANT,
        METRICS,
        RESULTS,
        USAGE,
        TS,
      )).toThrow(expect.objectContaining({ code: 'KPI_TERMINAL_SNAPSHOT_HOLD' }));

      const reader = new KpiStore(dbPath);
      try {
        expect(reader.getSprintMeasurements(TENANT, SPRINT)).toEqual(before);
      } finally {
        reader.close();
      }
    }
  });

  it('preserves the original typed KPI HOLD reason from the transactional store', () => {
    const dbPath = join(tmpDir, 'typed-hold.db');
    const partial = deriveMeasurements(SPRINT, TENANT, METRICS, RESULTS, USAGE, TS).slice(0, -1);
    const seed = new KpiStore(dbPath);
    try { seed.recordMeasurements(partial); } finally { seed.close(); }

    expect(() => recordTerminalSprintKpiMeasurements(
      dbPath,
      SPRINT,
      TENANT,
      METRICS,
      RESULTS,
      USAGE,
      TS,
    )).toThrow(expect.objectContaining({
      code: 'KPI_TERMINAL_SNAPSHOT_HOLD',
      message: 'KPI_TERMINAL_SNAPSHOT_HOLD:existing-vector-cardinality-mismatch',
    }));
  });

  it('wraps DB-open failure as a typed storage HOLD without creating a snapshot', () => {
    const dbPath = join(tmpDir, 'missing-parent', 'memory.db');
    let observed: unknown;
    try {
      recordTerminalSprintKpiMeasurements(
        dbPath,
        SPRINT,
        TENANT,
        METRICS,
        RESULTS,
        USAGE,
        TS,
      );
    } catch (error: unknown) {
      observed = error;
    }

    expect(observed).toMatchObject({
      code: 'KPI_TERMINAL_SNAPSHOT_HOLD',
      message: 'KPI_TERMINAL_SNAPSHOT_HOLD:storage-unavailable',
    });
    expect((observed as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(existsSync(dbPath)).toBe(false);
  });

  it('wraps invalid database storage and preserves its bytes without appending', () => {
    const dbPath = join(tmpDir, 'invalid-storage.db');
    const original = Buffer.from('not-a-sqlite-database', 'utf8');
    writeFileSync(dbPath, original);
    let observed: unknown;
    try {
      recordTerminalSprintKpiMeasurements(
        dbPath,
        SPRINT,
        TENANT,
        METRICS,
        RESULTS,
        USAGE,
        TS,
      );
    } catch (error: unknown) {
      observed = error;
    }

    expect(observed).toMatchObject({
      code: 'KPI_TERMINAL_SNAPSHOT_HOLD',
      message: 'KPI_TERMINAL_SNAPSHOT_HOLD:storage-unavailable',
    });
    expect((observed as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(readFileSync(dbPath)).toEqual(original);
  });

  it('isolates identical sprint ids by explicit tenant and rejects non-finite derived values', () => {
    const dbPath = join(tmpDir, 'memory.db');
    recordTerminalSprintKpiMeasurements(dbPath, SPRINT, 'tenant-a', METRICS, RESULTS, USAGE, TS);
    recordTerminalSprintKpiMeasurements(dbPath, SPRINT, 'tenant-b', METRICS, RESULTS, USAGE, TS);

    expect(() => recordTerminalSprintKpiMeasurements(
      dbPath,
      'sprint-non-finite',
      'tenant-a',
      { ...METRICS, tasksTotal: Number.NaN },
      RESULTS,
      USAGE,
      TS,
    )).toThrow(expect.objectContaining({ code: 'KPI_TERMINAL_SNAPSHOT_HOLD' }));

    const store = new KpiStore(dbPath);
    try {
      expect(store.getSprintMeasurements('tenant-a', SPRINT)).toHaveLength(11);
      expect(store.getSprintMeasurements('tenant-b', SPRINT)).toHaveLength(11);
      expect(store.getSprintMeasurements('tenant-a', 'sprint-non-finite')).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('holds missing authoritative terminal usage without minting a zero-valued snapshot', () => {
    const dbPath = join(tmpDir, 'memory.db');
    expect(() => recordTerminalSprintKpiMeasurements(
      dbPath,
      SPRINT,
      TENANT,
      METRICS,
      RESULTS,
      null,
      TS,
    )).toThrow(expect.objectContaining({
      code: 'KPI_TERMINAL_SNAPSHOT_HOLD',
      message: 'KPI_TERMINAL_SNAPSHOT_HOLD:authoritative-usage-unavailable',
    }));

    const store = new KpiStore(dbPath);
    try {
      expect(store.getSprintMeasurements(TENANT, SPRINT)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('rejects incomplete, non-finite, negative, and unknown-billing usage before opening the DB', () => {
    const invalidUsage: unknown[] = [
      { costUsd: 7, inputTokens: 1000, outputTokens: 500 },
      { ...USAGE, costUsd: Number.NaN },
      { ...USAGE, inputTokens: Number.POSITIVE_INFINITY },
      { ...USAGE, outputTokens: -1 },
      { ...USAGE, unknownBillingTaskCount: 1 },
      { ...USAGE, unknownBillingTaskCount: Number.NaN },
    ];

    for (const [index, usage] of invalidUsage.entries()) {
      const dbPath = join(tmpDir, `invalid-usage-${index}.db`);
      expect(() => recordTerminalSprintKpiMeasurements(
        dbPath,
        SPRINT,
        TENANT,
        METRICS,
        RESULTS,
        usage as UsageTotals,
        TS,
      )).toThrow(expect.objectContaining({
        code: 'KPI_TERMINAL_SNAPSHOT_HOLD',
        message: 'KPI_TERMINAL_SNAPSHOT_HOLD:authoritative-usage-invalid',
      }));
      expect(existsSync(dbPath)).toBe(false);
    }
  });
});
