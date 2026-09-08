import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput, ResultInput } from '../../src/core/kpi/kpi-store.js';

let store: KpiStore;
let tmpDir: string;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SPRINT = 'sprint-330';

function meas(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    id: overrides.id,
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

describe('KpiStore — terminal sprint measurement snapshot', () => {
  const terminalVector = (): MeasurementInput[] => [
    meas({
      id: 'terminal-cost',
      measureId: 'cost_usd',
      value: 7,
      ts: '2026-06-26T10:00:01.000Z',
      tags: { authority: { version: 1, source: 'terminal' }, settled: true },
    }),
    meas({
      id: 'terminal-tasks',
      measureId: 'tasks_total',
      value: 6,
      kind: 'counter',
      unit: 'count',
      ts: '2026-06-26T10:00:01.000Z',
    }),
  ];

  it('inserts once and accepts a semantic replay while preserving original ids and timestamps', () => {
    const first = terminalVector();
    store.recordTerminalSprintMeasurements(TENANT_A, SPRINT, first);
    store.recordTerminalSprintMeasurements(TENANT_A, SPRINT, [
      {
        ...first[0]!,
        id: 'ignored-replay-id',
        ts: '2026-09-05T19:50:45.000Z',
        tags: { settled: true, authority: { source: 'terminal', version: 1 } },
      },
      { ...first[1]!, id: 'ignored-replay-task-id', ts: '2026-09-05T19:50:45.000Z' },
    ]);

    const rows = store.getSprintMeasurements(TENANT_A, SPRINT);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.id)).toEqual(['terminal-cost', 'terminal-tasks']);
    expect(rows.every(row => row.ts === '2026-06-26T10:00:01.000Z')).toBe(true);
  });

  it('rejects mixed scope, duplicate input, and non-finite values before publication', () => {
    const valid = terminalVector();
    const attempts: MeasurementInput[][] = [
      [valid[0]!, { ...valid[1]!, tenantId: TENANT_B }],
      [valid[0]!, { ...valid[0]!, id: 'duplicate-measure-id' }],
      [{ ...valid[0]!, value: Number.POSITIVE_INFINITY }, valid[1]!],
    ];

    for (const rows of attempts) {
      expect(() => store.recordTerminalSprintMeasurements(TENANT_A, SPRINT, rows))
        .toThrow(expect.objectContaining({ code: 'KPI_TERMINAL_SNAPSHOT_HOLD' }));
      expect(store.getSprintMeasurements(TENANT_A, SPRINT)).toEqual([]);
      expect(store.getSprintMeasurements(TENANT_B, SPRINT)).toEqual([]);
    }
  });

  it.each([
    ['measure identity', (row: MeasurementInput) => ({ ...row, measureId: 'cost_reference_usd' })],
    ['value', (row: MeasurementInput) => ({ ...row, value: row.value + 1 })],
    ['kind', (row: MeasurementInput) => ({ ...row, kind: 'counter' as const })],
    ['unit', (row: MeasurementInput) => ({ ...row, unit: 'cents' })],
    ['task identity', (row: MeasurementInput) => ({ ...row, taskId: 'task-foreign' })],
    ['tags', (row: MeasurementInput) => ({ ...row, tags: { authority: { version: 2 } } })],
  ])('holds a replay with divergent %s and preserves the published vector', (_field, mutate) => {
    const first = terminalVector();
    store.recordTerminalSprintMeasurements(TENANT_A, SPRINT, first);
    const before = store.getSprintMeasurements(TENANT_A, SPRINT);
    const replay = [mutate(first[0]!), first[1]!];

    expect(() => store.recordTerminalSprintMeasurements(TENANT_A, SPRINT, replay))
      .toThrow(expect.objectContaining({ code: 'KPI_TERMINAL_SNAPSHOT_HOLD' }));
    expect(store.getSprintMeasurements(TENANT_A, SPRINT)).toEqual(before);
  });

  it('keeps tenant scopes independent for the same sprint identity', () => {
    const tenantA = terminalVector();
    const tenantB = terminalVector().map(row => ({
      ...row,
      id: `tenant-b-${row.id}`,
      tenantId: TENANT_B,
      value: row.value + 10,
    }));
    store.recordTerminalSprintMeasurements(TENANT_A, SPRINT, tenantA);
    store.recordTerminalSprintMeasurements(TENANT_B, SPRINT, tenantB);

    expect(store.getSprintMeasurements(TENANT_A, SPRINT).map(row => row.value)).toEqual([7, 6]);
    expect(store.getSprintMeasurements(TENANT_B, SPRINT).map(row => row.value)).toEqual([17, 16]);
  });

  it('serializes concurrent first writers so a matching loser replays without overwrite', async () => {
    const dbPath = join(tmpDir, 'concurrent-terminal.db');
    const concurrentStore = new KpiStore(dbPath);
    const rows = terminalVector();
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const Database = require('better-sqlite3');
      const db = new Database(workerData.dbPath);
      db.pragma('journal_mode = WAL');
      const insert = db.prepare(\`
        INSERT INTO kpi_measurements (
          id, tenant_id, measure_id, value, kind, unit, sprint_id, task_id, ts, tags
        ) VALUES (
          @id, @tenant_id, @measure_id, @value, @kind, @unit, @sprint_id, @task_id, @ts, @tags
        )
      \`);
      db.exec('BEGIN EXCLUSIVE');
      for (const row of workerData.rows) insert.run(row);
      parentPort.postMessage('locked');
      setTimeout(() => {
        db.exec('COMMIT');
        db.close();
        parentPort.postMessage('committed');
      }, 150);
    `, {
      eval: true,
      workerData: {
        dbPath,
        rows: rows.map(row => ({
          id: row.id,
          tenant_id: row.tenantId,
          measure_id: row.measureId,
          value: row.value,
          kind: row.kind,
          unit: row.unit,
          sprint_id: row.sprintId,
          task_id: row.taskId ?? null,
          ts: row.ts,
          tags: JSON.stringify(row.tags ?? {}),
        })),
      },
    });
    const locked = new Promise<void>((resolve, reject) => {
      worker.on('message', message => { if (message === 'locked') resolve(); });
      worker.once('error', reject);
    });
    const committed = new Promise<void>((resolve, reject) => {
      worker.on('message', message => { if (message === 'committed') resolve(); });
      worker.once('error', reject);
    });

    try {
      await locked;
      concurrentStore.recordTerminalSprintMeasurements(TENANT_A, SPRINT, rows);
      await committed;
      const persisted = concurrentStore.getSprintMeasurements(TENANT_A, SPRINT);
      expect(persisted).toHaveLength(2);
      expect(persisted.map(row => row.id)).toEqual(['terminal-cost', 'terminal-tasks']);
    } finally {
      await worker.terminate();
      concurrentStore.close();
    }
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
    expect(() => store.recordTerminalSprintMeasurements('', SPRINT, [meas({ tenantId: '' })]))
      .toThrow(expect.objectContaining({ code: 'KPI_TENANT_REQUIRED' }));
    expect(() => store.getSprintMeasurements('', SPRINT)).toThrow(/tenant/i);
    expect(() => store.foldSprintRollups('   ', SPRINT)).toThrow(/tenant/i);
    expect(() => store.getRollupValues('', 'sprint', SPRINT)).toThrow(/tenant/i);
    expect(() => store.getResults('', 'sprint', SPRINT)).toThrow(/tenant/i);
    expect(() => store.upsertResults([
      { tenantId: '', kpiId: 'x', grain: 'sprint', periodKey: SPRINT, value: 1, status: 'healthy' },
    ])).toThrow(/tenant/i);
  });
});
