// ─── Sprint 331 Task 15 — `kpi --trend <kpiId>` CLI unit tests ────────────────
// Tests the runKpiCommand({ trend: kpiId }) branch introduced in Faz-2.
//
// Hermetic (ADR + karpathy-discipline hermetic rule):
//   - All file I/O under os.tmpdir() — no project-root state.
//   - Pure module import, no subprocess (spawn-free).
//   - afterEach cleans up tmpdir.
//   - dbPathFn dep injection bypasses resolveProjectRoot() → no cwd dependency.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput } from '../../src/core/kpi/kpi-store.js';
import { loadKpiDefinitions } from '../../src/core/kpi/kpi-definitions.js';
import { computeSprintKpis } from '../../src/core/kpi/rollup-engine.js';
import { runKpiCommand } from '../../src/cli/commands/kpi.js';
import type { KpiCommandOptions, KpiDeps } from '../../src/cli/commands/kpi.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT = 'default';
const SPRINT_A = 'sprint-330';
const SPRINT_B = 'sprint-331';

function meas(
  sprintId: string,
  measureId: string,
  value: number,
  kind: MeasurementInput['kind'] = 'counter',
  unit = 'count',
): MeasurementInput {
  return { tenantId: TENANT, measureId, value, kind, unit, sprintId };
}

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

interface RunResult {
  output: string;
  parsed: unknown | null;
}

/**
 * Run kpi --trend using dep-injection (dbPathFn + configFn) so the command
 * operates against the sandbox DB, not the real project root.
 */
async function runTrend(
  dbPath: string,
  opts: Omit<KpiCommandOptions, 'sprint'> & { trend: string },
  lang: 'en' | 'tr' = 'en',
): Promise<RunResult> {
  const chunks: string[] = [];

  const origWrite = process.stdout.write.bind(process.stdout);
  // Cast to satisfy the overloaded write signature — test-only spy.
  (process.stdout as { write: unknown }).write = (chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(chunk);
    return true;
  };

  const deps: KpiDeps = {
    configFn: async () => ({ language: lang }),
    currentSprintFn: () => null,
    dbPathFn: () => dbPath,
  };

  try {
    await runKpiCommand(opts, deps);
  } finally {
    process.stdout.write = origWrite;
  }

  const output = chunks.join('');
  let parsed: unknown | null = null;
  try {
    parsed = JSON.parse(output.trim());
  } catch { /* not JSON */ }

  return { output, parsed };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'kpi-trend-cli-'));
  mkdirSync(join(tmpDir, '.brain'), { recursive: true });
  dbPath = join(tmpDir, '.brain', 'memory.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── JSON mode — structure ────────────────────────────────────────────────────

describe('kpi --trend --json', () => {
  it('goCriteria: emits valid JSON { kpiId, series } for a seeded kpi', async () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const { parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: true });

    expect(parsed).not.toBeNull();
    const payload = parsed as Record<string, unknown>;
    expect(payload['kpiId']).toBe('cost_per_sprint');
    expect(Array.isArray(payload['series'])).toBe(true);
    const series = payload['series'] as Array<Record<string, unknown>>;
    expect(series.length).toBeGreaterThanOrEqual(1);
  });

  it('series items have periodKey + value + status fields', async () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const { parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: true });

    const series = (parsed as Record<string, unknown>)['series'] as Array<Record<string, unknown>>;
    const point = series[0];
    expect(point).toHaveProperty('periodKey');
    expect(point).toHaveProperty('value');
    expect(point).toHaveProperty('status');
    expect(typeof point['periodKey']).toBe('string');
    expect(typeof point['value']).toBe('number');
  });

  it('goCriteria: old→new ordering — sprint-330 before sprint-331', async () => {
    const store = new KpiStore(dbPath);
    const defs = loadKpiDefinitions();
    seedSprint(store, SPRINT_A, 7);
    seedSprint(store, SPRINT_B, 5);
    computeSprintKpis(store, defs, TENANT, SPRINT_A);
    computeSprintKpis(store, defs, TENANT, SPRINT_B);
    store.close();

    const { parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: true });

    const series = (parsed as Record<string, unknown>)['series'] as Array<Record<string, unknown>>;
    expect(series).toHaveLength(2);
    expect(series[0]['periodKey']).toBe(SPRINT_A);
    expect(series[0]['value']).toBeCloseTo(7, 5);
    expect(series[1]['periodKey']).toBe(SPRINT_B);
    expect(series[1]['value']).toBeCloseTo(5, 5);
  });

  it('--n limits the number of results returned (n=1 → most recent)', async () => {
    const store = new KpiStore(dbPath);
    const defs = loadKpiDefinitions();
    seedSprint(store, SPRINT_A, 7);
    seedSprint(store, SPRINT_B, 5);
    computeSprintKpis(store, defs, TENANT, SPRINT_A);
    computeSprintKpis(store, defs, TENANT, SPRINT_B);
    store.close();

    const { parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: true, n: 1 });

    const series = (parsed as Record<string, unknown>)['series'] as Array<Record<string, unknown>>;
    expect(series).toHaveLength(1);
    expect(series[0]['periodKey']).toBe(SPRINT_B);
  });
});

// ─── Empty history ────────────────────────────────────────────────────────────

describe('kpi --trend — empty / missing history', () => {
  it('JSON mode: empty series[] for unknown kpiId (no crash)', async () => {
    const store = new KpiStore(dbPath);
    store.close();

    const { parsed } = await runTrend(dbPath, { trend: 'nonexistent_kpi', json: true });

    expect(parsed).not.toBeNull();
    const payload = parsed as Record<string, unknown>;
    expect(payload['kpiId']).toBe('nonexistent_kpi');
    expect(Array.isArray(payload['series'])).toBe(true);
    expect((payload['series'] as unknown[]).length).toBe(0);
  });

  it('JSON mode: empty series[] when DB has no results for this KPI', async () => {
    const store = new KpiStore(dbPath);
    store.close();

    const { parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: true });

    const payload = parsed as Record<string, unknown>;
    expect(Array.isArray(payload['series'])).toBe(true);
    expect((payload['series'] as unknown[]).length).toBe(0);
  });

  it('JSON mode: empty series[] when DB file does not exist (no crash)', async () => {
    rmSync(join(tmpDir, '.brain'), { recursive: true, force: true });

    const { parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: true });

    const payload = parsed as Record<string, unknown>;
    expect(payload['kpiId']).toBe('cost_per_sprint');
    expect((payload['series'] as unknown[]).length).toBe(0);
  });

  it('table mode: renders kpi.no_data message on empty series (no crash)', async () => {
    const store = new KpiStore(dbPath);
    store.close();

    const { output, parsed } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: false });

    expect(output).toContain('cost_per_sprint');
    expect(parsed).toBeNull(); // table output is not JSON
  });
});

// ─── Table mode ───────────────────────────────────────────────────────────────

describe('kpi --trend table mode', () => {
  it('renders i18n headers: Value, Target, Status columns', async () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const { output } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: false });

    expect(output).toContain('Value');
    expect(output).toContain('Target');
    expect(output).toContain('Status');
  });

  it('renders the sprint period key (sprint id) in the table rows', async () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const { output } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: false });

    expect(output).toContain(SPRINT_A);
  });

  it('renders direction arrow (↓) for lower-is-better cost_per_sprint', async () => {
    const defs = loadKpiDefinitions();
    const costDef = defs.find(d => d.id === 'cost_per_sprint');
    expect(costDef?.direction).toBe('down');

    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, defs, TENANT, SPRINT_A);
    store.close();

    const { output } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: false });

    expect(output).toContain('↓');
  });

  it('renders currency-formatted value ($7.00) for cost_per_sprint', async () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const { output } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: false });

    expect(output).toContain('$7.00');
  });

  it('Turkish lang uses kpi.title TR form in the trend header', async () => {
    const store = new KpiStore(dbPath);
    seedSprint(store, SPRINT_A, 7);
    computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT_A);
    store.close();

    const { output } = await runTrend(dbPath, { trend: 'cost_per_sprint', json: false }, 'tr');

    // kpi.title TR: 'KPI Karnesi — {sprint}'
    expect(output).toContain('Karnesi');
  });
});
