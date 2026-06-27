// ─── Sprint 332 Task 001 — `deckent kpi` no-arg latest-finalized fallback ──────
//
// Regression for POST-SPRINT VERIFY FIX-#1: a bare `deckent kpi` (no --sprint)
// once the current sprint is finalized used to emit `{ sprintId: null, kpis: [] }`
// because getCurrentSprintId returns null when there is no ACTIVE sprint — even
// though the store still holds the just-finalized sprint's kpi_results.
//
// Fix: when there is no --sprint AND no active sprint, fall back to the LATEST
// sprint that actually has KPI results in the store.
//
// RED (pre-fix): the "no active sprint, finalized results present" cases below
// would resolve sprintId=null and print an empty kpis[]. GREEN (post-fix): they
// resolve the real latest finalized sprint id with a populated kpis[].
//
// Hermetic (ADR + karpathy-discipline hermetic rule):
//   - All file I/O under os.tmpdir() — no project-root state.
//   - Pure module import, no subprocess (spawn-free).
//   - afterEach cleans up tmpdir.
//   - dbPathFn + currentSprintFn dep injection bypass resolveProjectRoot() and
//     the real status SSOT → no cwd / no active-sprint dependency.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import type { MeasurementInput } from '../../src/core/kpi/kpi-store.js';
import { loadKpiDefinitions } from '../../src/core/kpi/kpi-definitions.js';
import { computeSprintKpis } from '../../src/core/kpi/rollup-engine.js';
import { runKpiCommand } from '../../src/cli/commands/kpi.js';
import type { KpiCommandOptions, KpiDeps } from '../../src/cli/commands/kpi.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT = 'default';
const SPRINT_OLD = 'sprint-330';
const SPRINT_NEW = 'sprint-331';

function meas(
  sprintId: string,
  measureId: string,
  value: number,
  kind: MeasurementInput['kind'] = 'counter',
  unit = 'count',
): MeasurementInput {
  return { tenantId: TENANT, measureId, value, kind, unit, sprintId };
}

/** Seed one sprint's measurements (the same shape the finalizer hook records). */
function seedMeasurements(store: KpiStore, sprintId: string, costUsd: number): void {
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

/**
 * Persist a finalized sprint into the store: record measurements + compute the
 * KPI results (writes kpi_results rows for grain='sprint') — exactly what a
 * finalized sprint leaves behind, with no ACTIVE sprint pointer.
 */
function seedFinalizedSprint(dbPath: string, sprintId: string, costUsd: number): void {
  const store = new KpiStore(dbPath);
  seedMeasurements(store, sprintId, costUsd);
  computeSprintKpis(store, loadKpiDefinitions(), TENANT, sprintId);
  store.close();
}

interface RunResult {
  output: string;
  parsed: Record<string, unknown> | null;
}

/**
 * Run the scorecard with dep-injection. `activeSprint` models the status SSOT
 * (getCurrentSprintId): pass null for a finalized-no-active-sprint scenario.
 */
async function runKpi(
  dbPath: string,
  opts: KpiCommandOptions,
  activeSprint: string | null = null,
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
    currentSprintFn: () => activeSprint,
    dbPathFn: () => dbPath,
  };

  try {
    await runKpiCommand(opts, deps);
  } finally {
    process.stdout.write = origWrite;
  }

  const output = chunks.join('');
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(output.trim()) as Record<string, unknown>;
  } catch { /* not JSON (table mode) */ }

  return { output, parsed };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'kpi-fallback-'));
  mkdirSync(join(tmpDir, '.brain'), { recursive: true });
  dbPath = join(tmpDir, '.brain', 'memory.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Core goCriteria — latest-finalized fallback ────────────────────────────────

describe('kpi (no --sprint, no active sprint) → latest finalized fallback', () => {
  it('goCriteria: resolves the real latest sprint id with a non-empty kpis[]', async () => {
    seedFinalizedSprint(dbPath, SPRINT_NEW, 5);

    const { parsed } = await runKpi(dbPath, { json: true }, /* active */ null);

    expect(parsed).not.toBeNull();
    // Pre-fix RED: sprintId would be null here.
    expect(parsed?.['sprintId']).toBe(SPRINT_NEW);
    const kpis = parsed?.['kpis'] as unknown[];
    expect(Array.isArray(kpis)).toBe(true);
    expect(kpis.length).toBeGreaterThan(0);
    // The finalized results carry real measured values (not all-null).
    const hasValue = (kpis as Array<Record<string, unknown>>)
      .some(k => k['value'] !== null);
    expect(hasValue).toBe(true);
  });

  it('picks the LATEST finalized sprint when several have results', async () => {
    seedFinalizedSprint(dbPath, SPRINT_OLD, 7);
    seedFinalizedSprint(dbPath, SPRINT_NEW, 5);

    const { parsed } = await runKpi(dbPath, { json: true }, /* active */ null);

    // computed_at DESC with period_key DESC tiebreak → sprint-331 (newest).
    expect(parsed?.['sprintId']).toBe(SPRINT_NEW);
  });

  it('table mode: renders the finalized sprint scorecard (not kpi.no_data)', async () => {
    seedFinalizedSprint(dbPath, SPRINT_NEW, 5);

    const { output, parsed } = await runKpi(dbPath, {}, /* active */ null);

    expect(parsed).toBeNull(); // table output is not JSON
    expect(output).toContain(SPRINT_NEW); // kpi.title carries the resolved sprint id
  });
});

// ─── Precedence — explicit --sprint wins ───────────────────────────────────────

describe('kpi precedence', () => {
  it('explicit --sprint wins over the latest-finalized fallback', async () => {
    seedFinalizedSprint(dbPath, SPRINT_OLD, 7);
    seedFinalizedSprint(dbPath, SPRINT_NEW, 5);

    const { parsed } = await runKpi(dbPath, { sprint: SPRINT_OLD, json: true }, null);

    expect(parsed?.['sprintId']).toBe(SPRINT_OLD);
  });

  it('active sprint wins over the fallback (active path unchanged)', async () => {
    // Only sprint-330 has results; sprint-331 is the ACTIVE sprint (no results yet).
    seedFinalizedSprint(dbPath, SPRINT_OLD, 7);

    const { parsed } = await runKpi(dbPath, { json: true }, /* active */ SPRINT_NEW);

    // Active path resolves sprint-331 — the fallback (which would pick sprint-330)
    // is NOT consulted when an active sprint exists.
    expect(parsed?.['sprintId']).toBe(SPRINT_NEW);
  });
});

// ─── Honest empty output — never crash, never create the DB ─────────────────────

describe('kpi empty-store honesty', () => {
  it('truly-empty store (DB exists, no kpi_results) → empty kpis[], no crash', async () => {
    // Schema present (KpiStore created the tables) but zero results rows.
    const store = new KpiStore(dbPath);
    store.close();

    const { parsed } = await runKpi(dbPath, { json: true }, /* active */ null);

    expect(parsed?.['sprintId']).toBeNull();
    expect((parsed?.['kpis'] as unknown[]).length).toBe(0);
  });

  it('DB without the KPI schema → degrades to empty (no "no such table" crash)', async () => {
    const raw = new Database(dbPath);
    raw.exec('CREATE TABLE unrelated (x INTEGER)');
    raw.close();

    const { parsed } = await runKpi(dbPath, { json: true }, /* active */ null);

    expect(parsed?.['sprintId']).toBeNull();
    expect((parsed?.['kpis'] as unknown[]).length).toBe(0);
  });

  it('no DB file at all → kpi.no_data and the DB is NOT created as a side effect', async () => {
    rmSync(join(tmpDir, '.brain'), { recursive: true, force: true });
    expect(existsSync(dbPath)).toBe(false);

    const { parsed } = await runKpi(dbPath, { json: true }, /* active */ null);

    expect(parsed?.['sprintId']).toBeNull();
    expect((parsed?.['kpis'] as unknown[]).length).toBe(0);
    // The read-only command must never create the store.
    expect(existsSync(dbPath)).toBe(false);
  });
});
