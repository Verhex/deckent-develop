import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput, ResultInput } from '../../src/core/kpi/kpi-store.js';

let store: KpiStore;
let tmpDir: string;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SPRINT = 'sprint-330';

function meas(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    tenantId: overrides.tenantId ?? TENANT_A,
    measureId: overrides.measureId ?? 'cost_usd',
    value: overrides.value ?? 1,
    kind: overrides.kind ?? 'gauge',
    unit: overrides.unit ?? 'USD',
    sprintId: overrides.sprintId ?? SPRINT,
    taskId: overrides.taskId,
    ts: overrides.ts,
    tags: overrides.tags,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'kpistore-test-'));
  store = new KpiStore(join(tmpDir, 'memory.db'));
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('KpiStore — schema & lifecycle', () => {
  it('initSchema is idempotent (re-opening the same DB does not throw)', () => {
    const dbPath = join(tmpDir, 'reopen.db');
    const s1 = new KpiStore(dbPath);
    s1.recordMeasurements([meas({ value: 5 })]);
    s1.close();
    const s2 = new KpiStore(dbPath); // re-init over existing tables
    expect(s2.getSprintMeasurements(TENANT_A, SPRINT)).toHaveLength(1);
    s2.close();
  });

  it('recordMeasurements / upsertResults are no-ops on empty input', () => {
    expect(() => store.recordMeasurements([])).not.toThrow();
    expect(() => store.upsertResults([])).not.toThrow();
    expect(store.getSprintMeasurements(TENANT_A, SPRINT)).toEqual([]);
  });
});

describe('KpiStore — measurements', () => {
  it('persists and reads back rows ordered by ts, with tags round-tripped', () => {
    store.recordMeasurements([
      meas({ measureId: 'tasks_total', value: 6, kind: 'counter', unit: 'count', ts: '2026-06-26T10:00:02.000Z', tags: { phase: 'retro' } }),
      meas({ measureId: 'tasks_total', value: 3, kind: 'counter', unit: 'count', ts: '2026-06-26T10:00:01.000Z' }),
    ]);
    const rows = store.getSprintMeasurements(TENANT_A, SPRINT);
    expect(rows.map((r) => r.value)).toEqual([3, 6]); // ts-ordered
    expect(rows[0].id).toBeTruthy(); // auto UUID
    expect(rows[1].tags).toEqual({ phase: 'retro' });
    expect(rows[0].tags).toEqual({});
  });
});

describe('KpiStore — foldSprintRollups', () => {
  it('record+fold produces correct count/sum/min/max/last per measure', () => {
    store.recordMeasurements([
      meas({ measureId: 'cost_usd', value: 1.5, ts: '2026-06-26T10:00:01.000Z' }),
      meas({ measureId: 'cost_usd', value: 2.5, ts: '2026-06-26T10:00:02.000Z' }),
      meas({ measureId: 'cost_usd', value: 0.5, ts: '2026-06-26T10:00:03.000Z' }),
      meas({ measureId: 'tasks_done', value: 4, kind: 'counter', unit: 'count', ts: '2026-06-26T10:00:01.000Z' }),
    ]);
    store.foldSprintRollups(TENANT_A, SPRINT);

    const rollups = store.getRollupValues(TENANT_A, 'sprint', SPRINT);
    const cost = rollups.find((r) => r.measureId === 'cost_usd');
    expect(cost).toBeDefined();
    expect(cost!.count).toBe(3);
    expect(cost!.sum).toBeCloseTo(4.5, 10);
    expect(cost!.min).toBeCloseTo(0.5, 10);
    expect(cost!.max).toBeCloseTo(2.5, 10);
    expect(cost!.last).toBeCloseTo(0.5, 10); // latest ts

    const done = rollups.find((r) => r.measureId === 'tasks_done');
    expect(done!.count).toBe(1);
    expect(done!.sum).toBe(4);
  });

  it('is idempotent — folding twice yields identical rollup values', () => {
    store.recordMeasurements([
      meas({ measureId: 'cost_usd', value: 1 }),
      meas({ measureId: 'cost_usd', value: 2 }),
    ]);
    store.foldSprintRollups(TENANT_A, SPRINT);
    const first = store.getRollupValues(TENANT_A, 'sprint', SPRINT);
    store.foldSprintRollups(TENANT_A, SPRINT); // second fold must not accumulate
    const second = store.getRollupValues(TENANT_A, 'sprint', SPRINT);

    expect(second).toHaveLength(1);
    expect(second[0].count).toBe(first[0].count);
    expect(second[0].sum).toBe(first[0].sum);
    expect(second[0].sum).toBe(3); // NOT 6 — replace, not accumulate
  });

  it('fold on a sprint with no measurements is a no-op', () => {
    store.foldSprintRollups(TENANT_A, 'sprint-empty');
    expect(store.getRollupValues(TENANT_A, 'sprint', 'sprint-empty')).toEqual([]);
  });
});

describe('KpiStore — results round-trip', () => {
  it('upsertResults then getResults returns the persisted snapshot', () => {
    const input: ResultInput = {
      tenantId: TENANT_A,
      kpiId: 'cost_per_sprint',
      grain: 'sprint',
      periodKey: SPRINT,
      value: 2.4,
      target: 2.5,
      status: 'healthy',
    };
    store.upsertResults([input]);
    const results = store.getResults(TENANT_A, 'sprint', SPRINT);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kpiId: 'cost_per_sprint',
      value: 2.4,
      target: 2.5,
      status: 'healthy',
    });
  });

  it('upsert is idempotent on PK conflict — same key replaces, no duplicate row', () => {
    const base: ResultInput = {
      tenantId: TENANT_A, kpiId: 'no_go_rate', grain: 'sprint', periodKey: SPRINT,
      value: 0.1, target: null, status: 'healthy',
    };
    store.upsertResults([base]);
    store.upsertResults([{ ...base, value: 0.4, status: 'critical' }]);
    const results = store.getResults(TENANT_A, 'sprint', SPRINT);
    expect(results).toHaveLength(1);
    expect(results[0].value).toBeCloseTo(0.4, 10);
    expect(results[0].status).toBe('critical');
  });
});

describe('KpiStore — tenant isolation (security)', () => {
  it('getSprintMeasurements never returns another tenant rows', () => {
    store.recordMeasurements([
      meas({ tenantId: TENANT_A, measureId: 'cost_usd', value: 10 }),
      meas({ tenantId: TENANT_B, measureId: 'cost_usd', value: 99 }),
    ]);
    const a = store.getSprintMeasurements(TENANT_A, SPRINT);
    expect(a).toHaveLength(1);
    expect(a[0].value).toBe(10);
    expect(a.every((r) => r.tenantId === TENANT_A)).toBe(true);
  });

  it('foldSprintRollups folds only the queried tenant; rollups are tenant-isolated', () => {
    store.recordMeasurements([
      meas({ tenantId: TENANT_A, measureId: 'cost_usd', value: 10 }),
      meas({ tenantId: TENANT_B, measureId: 'cost_usd', value: 99 }),
    ]);
    store.foldSprintRollups(TENANT_A, SPRINT);
    store.foldSprintRollups(TENANT_B, SPRINT);

    const a = store.getRollupValues(TENANT_A, 'sprint', SPRINT);
    const b = store.getRollupValues(TENANT_B, 'sprint', SPRINT);
    expect(a.find((r) => r.measureId === 'cost_usd')!.sum).toBe(10);
    expect(b.find((r) => r.measureId === 'cost_usd')!.sum).toBe(99);
    // tenant-a query must not see tenant-b's value
    expect(a.some((r) => r.sum === 99)).toBe(false);
  });

  it('getResults never returns another tenant snapshot', () => {
    store.upsertResults([
      { tenantId: TENANT_A, kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: SPRINT, value: 1, status: 'healthy' },
      { tenantId: TENANT_B, kpiId: 'cost_per_sprint', grain: 'sprint', periodKey: SPRINT, value: 2, status: 'critical' },
    ]);
    const a = store.getResults(TENANT_A, 'sprint', SPRINT);
    expect(a).toHaveLength(1);
    expect(a[0].tenantId).toBe(TENANT_A);
    expect(a[0].value).toBe(1);
  });
});

describe('KpiStore — tenant guard (no tenant-less path)', () => {
  it('throws on empty/blank tenant id across read and write paths', () => {
    expect(() => store.recordMeasurements([meas({ tenantId: '' })])).toThrow(/tenant/i);
    expect(() => store.getSprintMeasurements('', SPRINT)).toThrow(/tenant/i);
    expect(() => store.foldSprintRollups('   ', SPRINT)).toThrow(/tenant/i);
    expect(() => store.getRollupValues('', 'sprint', SPRINT)).toThrow(/tenant/i);
    expect(() => store.getResults('', 'sprint', SPRINT)).toThrow(/tenant/i);
    expect(() => store.upsertResults([
      { tenantId: '', kpiId: 'x', grain: 'sprint', periodKey: SPRINT, value: 1, status: 'healthy' },
    ])).toThrow(/tenant/i);
  });
});
