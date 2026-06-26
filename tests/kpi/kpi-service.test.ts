import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput } from '../../src/core/kpi/kpi-store.js';
import { loadKpiDefinitions } from '../../src/core/kpi/kpi-definitions.js';
import { computeSprintKpis } from '../../src/core/kpi/rollup-engine.js';
import { KpiService } from '../../src/core/kpi/kpi-service.js';
import type { KpiView } from '../../src/core/kpi/kpi-service.js';

const TENANT = 'default';
const SPRINT_A = 'sprint-330';
const SPRINT_B = 'sprint-331';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function meas(
  sprintId: string,
  measureId: string,
  value: number,
  kind: MeasurementInput['kind'] = 'counter',
  unit = 'count',
): MeasurementInput {
  return { tenantId: TENANT, measureId, value, kind, unit, sprintId };
}

/**
 * Seed a complete set of 11 base measurements for a sprint.
 * costUsd controls the value of cost_per_sprint (= costUsd / 1 sprint).
 */
function seedSprint(store: KpiStore, sprintId: string, costUsd: number): void {
  store.recordMeasurements([
    meas(sprintId, 'sprint_count',        1,        'counter', 'count'),
    meas(sprintId, 'cost_usd',            costUsd,  'gauge',   'USD'),
    meas(sprintId, 'tasks_total',         4,        'counter', 'count'),
    meas(sprintId, 'tasks_done',          4,        'counter', 'count'),
    meas(sprintId, 'no_go',               0,        'counter', 'count'),
    meas(sprintId, 'boundary_violations', 0,        'counter', 'count'),
    meas(sprintId, 'retries',             2,        'counter', 'count'),
    meas(sprintId, 'lines_added',         1000,     'counter', 'lines'),
    meas(sprintId, 'tokens_input',        500,      'gauge',   'tokens'),
    meas(sprintId, 'tokens_output',       300,      'gauge',   'tokens'),
    meas(sprintId, 'cache_read',          200,      'gauge',   'tokens'),
  ]);
}

// ─── listSprintViews — rollup path ───────────────────────────────────────────

describe('listSprintViews — rollup path (pre-computed results)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-svc-rollup-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('goCriteria: definition+değer+status returned; title.tr === Sprint Başına Maliyet', () => {
    // Seed measurements and pre-compute rollup results.
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const views = svc.listSprintViews(SPRINT_A);
      const cost = views.find((v: KpiView) => v.definition.id === 'cost_per_sprint');
      expect(cost).toBeDefined();
      expect(cost!.definition.title.tr).toBe('Sprint Başına Maliyet');
      expect(cost!.result).not.toBeNull();
      expect(cost!.result!.value).toBeCloseTo(7, 10);
      expect(cost!.result!.status).toBe('critical'); // 7 ≥ 3.5 threshold
    } finally {
      svc.close();
    }
  });

  it('returns a KpiView for every enabled sprint-grain definition', () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 2.5);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const views = svc.listSprintViews(SPRINT_A);
      const defs = loadKpiDefinitions().filter(d => d.enabled && d.grain === 'sprint');
      expect(views).toHaveLength(defs.length);
      // Every view has a definition and a non-null result (all measures were seeded).
      for (const v of views) {
        expect(v.definition).toBeDefined();
        expect(v.definition.title.en).toBeTruthy();
        expect(v.definition.title.tr).toBeTruthy();
      }
    } finally {
      svc.close();
    }
  });

  it('cost_per_sprint status healthy when cost < warn threshold (2.5 < 3.0)', () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 2.5);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const views = svc.listSprintViews(SPRINT_A);
      const cost = views.find((v: KpiView) => v.definition.id === 'cost_per_sprint');
      expect(cost!.result!.status).toBe('healthy');
    } finally {
      svc.close();
    }
  });
});

// ─── listSprintViews — live path ─────────────────────────────────────────────

describe('listSprintViews — live path (measurements without pre-computed results)', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-svc-live-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('goCriteria: no rollup results + measurements exist → canlı-hesap (live fallback)', () => {
    // Seed ONLY raw measurements — no computeSprintKpis / pre-computed results.
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const views = svc.listSprintViews(SPRINT_A);
      const cost = views.find((v: KpiView) => v.definition.id === 'cost_per_sprint');
      expect(cost).toBeDefined();
      // Live fallback must produce the same value as the rollup path (SSOT evaluator).
      expect(cost!.result).not.toBeNull();
      expect(cost!.result!.value).toBeCloseTo(7, 10);
      expect(cost!.result!.status).toBe('critical');
    } finally {
      svc.close();
    }
  });

  it('live path yields same result as rollup path (no formula-engine drift)', () => {
    const dbPathRollup = join(tmpDir, 'rollup.db');
    const dbPathLive   = join(tmpDir, 'live.db');

    // Rollup path: seed + pre-compute.
    const storeR = new KpiStore(dbPathRollup);
    seedSprint(storeR, SPRINT_A, 4.0);
    computeSprintKpis(storeR, loadKpiDefinitions(), TENANT, SPRINT_A);
    storeR.close();

    // Live path: seed only, let KpiService compute on-the-fly.
    const storeL = new KpiStore(dbPathLive);
    seedSprint(storeL, SPRINT_A, 4.0);
    storeL.close();

    const svcR = new KpiService(dbPathRollup);
    const svcL = new KpiService(dbPathLive);
    try {
      const rollupViews = svcR.listSprintViews(SPRINT_A);
      const liveViews   = svcL.listSprintViews(SPRINT_A);

      // Every KPI value must be identical between paths.
      for (const rv of rollupViews) {
        const lv = liveViews.find(v => v.definition.id === rv.definition.id);
        expect(lv).toBeDefined();
        if (rv.result !== null && lv!.result !== null) {
          expect(lv!.result!.value).toBeCloseTo(rv.result.value, 10);
          expect(lv!.result!.status).toBe(rv.result.status);
        }
      }
    } finally {
      svcR.close();
      svcL.close();
    }
  });

  it('sprint with no measurements at all → all views have result: null', () => {
    const svc = new KpiService(dbPath);
    try {
      const views = svc.listSprintViews('sprint-no-data');
      expect(views.length).toBeGreaterThan(0); // builtins always returned
      for (const v of views) {
        expect(v.result).toBeNull();
      }
    } finally {
      svc.close();
    }
  });
});

// ─── getTrend ─────────────────────────────────────────────────────────────────

describe('getTrend', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-svc-trend-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('goCriteria: 2-sprint series [7, 5] returned in old→new order', () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7); // sprint-330 → cost = 7
    seedSprint(store, SPRINT_B, 5); // sprint-331 → cost = 5
    const defs = loadKpiDefinitions();
    computeSprintKpis(store, defs, TENANT, SPRINT_A);
    computeSprintKpis(store, defs, TENANT, SPRINT_B);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const trend = svc.getTrend('cost_per_sprint', 2);
      expect(trend).toHaveLength(2);
      // Old sprint (330, cost=7) comes first in old→new ordering.
      expect(trend[0].periodKey).toBe(SPRINT_A);
      expect(trend[0].value).toBeCloseTo(7, 10);
      // Newer sprint (331, cost=5) comes second.
      expect(trend[1].periodKey).toBe(SPRINT_B);
      expect(trend[1].value).toBeCloseTo(5, 10);
    } finally {
      svc.close();
    }
  });

  it('getTrend n=1 returns only the most recent sprint', () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    seedSprint(store, SPRINT_B, 5);
    const defs = loadKpiDefinitions();
    computeSprintKpis(store, defs, TENANT, SPRINT_A);
    computeSprintKpis(store, defs, TENANT, SPRINT_B);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const trend = svc.getTrend('cost_per_sprint', 1);
      expect(trend).toHaveLength(1);
      // n=1 → most recent sprint only (sprint-331 since 331 > 330 period_key).
      expect(trend[0].periodKey).toBe(SPRINT_B);
      expect(trend[0].value).toBeCloseTo(5, 10);
    } finally {
      svc.close();
    }
  });

  it('getTrend for an unknown kpiId returns empty array', () => {
    const svc = new KpiService(dbPath);
    try {
      const trend = svc.getTrend('nonexistent_kpi', 5);
      expect(trend).toHaveLength(0);
    } finally {
      svc.close();
    }
  });

  it('getTrend ResultRow shape: kpiId, grain, periodKey, value, status, computedAt', () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const svc = new KpiService(dbPath);
    try {
      const trend = svc.getTrend('cost_per_sprint', 5);
      expect(trend).toHaveLength(1);
      const row = trend[0];
      expect(row.kpiId).toBe('cost_per_sprint');
      expect(row.grain).toBe('sprint');
      expect(row.periodKey).toBe(SPRINT_A);
      expect(typeof row.value).toBe('number');
      expect(row.status).toBe('critical');
      expect(row.computedAt).toBeTruthy();
    } finally {
      svc.close();
    }
  });
});

// ─── customDefs ───────────────────────────────────────────────────────────────

describe('KpiService — customDefs constructor option', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-svc-custom-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('custom KPI definition is included in listSprintViews output', () => {
    const customDef = {
      id: 'my_custom_kpi',
      title: { en: 'My Custom', tr: 'Özel KPI' },
      formula: 'sprint_count',
      unit: 'count',
      format: 'number',
      direction: 'down',
      grain: 'sprint',
      tier: 'custom',
      scope: 'tenant-123',
      enabled: true,
    };

    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 2.0);
    store.close();

    const svc = new KpiService(dbPath, { customDefs: [customDef] });
    try {
      const views = svc.listSprintViews(SPRINT_A);
      const custom = views.find(v => v.definition.id === 'my_custom_kpi');
      expect(custom).toBeDefined();
      expect(custom!.definition.title.tr).toBe('Özel KPI');
      expect(custom!.result).not.toBeNull();
      expect(custom!.result!.value).toBe(1); // sprint_count = 1
    } finally {
      svc.close();
    }
  });
});

// ─── close() lifecycle ────────────────────────────────────────────────────────

describe('KpiService — close() lifecycle', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-svc-close-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('close() can be called without throwing', () => {
    const svc = new KpiService(join(tmpDir, 'memory.db'));
    expect(() => svc.close()).not.toThrow();
  });
});
