// ─── Sprint 334 Task 007 — KPI breach advisory surfaced in `deckent kpi` CLI ──
//
// goCriteria verification: `runKpiCommand` over a dep-injected, seeded view-set
// with one breached (`status:'critical'`) KPI + one healthy KPI → table output
// includes a "KPI Breaches" section naming ONLY the breached KPI.
//
// pre-fix RED: output has no breach section.
// post-fix GREEN: breach section present and correct.
//
// Hermetic (karpathy-discipline hermetic rule):
//   - All file I/O under os.tmpdir() — never reads project-root state.
//   - Pure module import, no subprocess (spawn-free).
//   - afterEach cleans up the tmpdir.
//   - dbPathFn + currentSprintFn + configFn dep injection bypass
//     resolveProjectRoot() and the real status SSOT.

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

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT = 'default';
const SPRINT_BREACH = 'sprint-334-breach';
const SPRINT_HEALTHY = 'sprint-334-healthy';

// cost_per_sprint threshold: warn=3.0, critical=3.5 (direction=down)
// costUsd=7 with sprint_count=1 → cost_per_sprint=7 → critical
const COST_CRITICAL = 7;
// costUsd=1 with sprint_count=1 → cost_per_sprint=1 → healthy (< 3.0)
const COST_HEALTHY = 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function meas(
  sprintId: string,
  measureId: string,
  value: number,
  kind: MeasurementInput['kind'] = 'counter',
  unit = 'count',
): MeasurementInput {
  return { tenantId: TENANT, measureId, value, kind, unit, sprintId };
}

function seedSprint(dbPath: string, sprintId: string, costUsd: number): void {
  const store = new KpiStore(dbPath);
  store.recordMeasurements([
    meas(sprintId, 'sprint_count',        1,       'counter', 'count'),
    meas(sprintId, 'cost_usd',            costUsd, 'gauge',   'USD'),
    meas(sprintId, 'tasks_total',         4,       'counter', 'count'),
    meas(sprintId, 'tasks_done',          4,       'counter', 'count'),
    meas(sprintId, 'no_go',               0,       'counter', 'count'),
    meas(sprintId, 'boundary_violations', 0,       'counter', 'count'),
    meas(sprintId, 'retries',             2,       'counter', 'count'),
    meas(sprintId, 'lines_added',         1000,    'counter', 'lines'),
    meas(sprintId, 'tokens_input',        500,     'gauge',   'tokens'),
    meas(sprintId, 'tokens_output',       300,     'gauge',   'tokens'),
    meas(sprintId, 'cache_read',          200,     'gauge',   'tokens'),
  ]);
  computeSprintKpis(store, loadKpiDefinitions(), TENANT, sprintId);
  store.close();
}

/** Run `runKpiCommand` in table mode and capture stdout. */
async function runKpi(
  dbPath: string,
  opts: KpiCommandOptions,
  sprintId: string,
  lang: 'en' | 'tr' = 'en',
): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(chunk);
    return true;
  };

  const deps: KpiDeps = {
    configFn: async () => ({ language: lang }),
    currentSprintFn: () => sprintId,
    dbPathFn: () => dbPath,
  };

  try {
    await runKpiCommand(opts, deps);
  } finally {
    process.stdout.write = origWrite;
  }

  return chunks.join('');
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'kpi-breach-surface-'));
  mkdirSync(join(tmpDir, '.brain'), { recursive: true });
  dbPath = join(tmpDir, '.brain', 'memory.db');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── goCriteria: breach section present when critical KPI exists ───────────────

describe('kpi table mode — breach advisory section', () => {
  it('goCriteria: output includes breach section when cost_per_sprint is critical (en)', async () => {
    seedSprint(dbPath, SPRINT_BREACH, COST_CRITICAL);

    const output = await runKpi(dbPath, {}, SPRINT_BREACH, 'en');

    // pre-fix RED: no "KPI Breaches" in output
    expect(output).toContain('KPI Breaches');
    // The breached KPI title must appear in the breach section
    expect(output).toContain('Cost / Sprint');
  });

  it('goCriteria: breach section names ONLY the breached KPI, not the healthy ones (en)', async () => {
    seedSprint(dbPath, SPRINT_BREACH, COST_CRITICAL);

    const output = await runKpi(dbPath, {}, SPRINT_BREACH, 'en');

    // "KPI Breaches" section exists
    const breachIdx = output.indexOf('KPI Breaches');
    expect(breachIdx).toBeGreaterThan(-1);

    // Extract text after the breach heading (remainder of output)
    const afterBreachHeading = output.slice(breachIdx);

    // cost_per_sprint (critical) appears in breach section
    expect(afterBreachHeading).toContain('Cost / Sprint');

    // no_go_rate (healthy, seeded with no_go=0 → 0% < 15% threshold) must NOT appear
    // in the breach advisory (it is healthy). It CAN appear in the scorecard table above.
    // We verify by checking the breach section lines only.
    const breachLines = afterBreachHeading
      .split('\n')
      .filter(l => l.startsWith('- '));
    expect(breachLines.length).toBeGreaterThan(0);
    // None of the bullet lines should reference a KPI known to be healthy (no_go_rate)
    const mentionsNoGoRate = breachLines.some(l =>
      l.toLowerCase().includes('no-go rate') || l.toLowerCase().includes('no_go_rate'),
    );
    expect(mentionsNoGoRate).toBe(false);
  });

  it('goCriteria: no breach section when all KPIs are healthy', async () => {
    seedSprint(dbPath, SPRINT_HEALTHY, COST_HEALTHY);

    const output = await runKpi(dbPath, {}, SPRINT_HEALTHY, 'en');

    // cost_per_sprint = 1 < 3.0 → healthy → no breach section
    expect(output).not.toContain('KPI Breaches');
  });

  it('goCriteria: breach section uses TR language titles when lang=tr', async () => {
    seedSprint(dbPath, SPRINT_BREACH, COST_CRITICAL);

    const output = await runKpi(dbPath, {}, SPRINT_BREACH, 'tr');

    expect(output).toContain('KPI Breaches');
    // TR title for cost_per_sprint
    expect(output).toContain('Sprint Başına Maliyet');
  });

  it('scorecard table is still rendered before the breach section', async () => {
    seedSprint(dbPath, SPRINT_BREACH, COST_CRITICAL);

    const output = await runKpi(dbPath, {}, SPRINT_BREACH, 'en');

    // kpi.title message includes the sprint id (scorecard header)
    expect(output).toContain(SPRINT_BREACH);
    // Scorecard table header appears BEFORE the breach section
    const tableIdx = output.indexOf(SPRINT_BREACH);
    const breachIdx = output.indexOf('KPI Breaches');
    expect(tableIdx).toBeLessThan(breachIdx);
  });

  it('JSON mode: no breach section emitted (JSON mode returns before table render)', async () => {
    seedSprint(dbPath, SPRINT_BREACH, COST_CRITICAL);

    const output = await runKpi(dbPath, { json: true }, SPRINT_BREACH, 'en');

    // JSON mode should return pure JSON — no advisory section
    expect(output).not.toContain('KPI Breaches');
    // But it should still be valid JSON
    expect(() => JSON.parse(output.trim())).not.toThrow();
  });
});
