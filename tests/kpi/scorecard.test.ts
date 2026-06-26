// ─── Sprint 330 Task 10 — KPI Scorecard renderer ─────────────────────────────
// Unit tests for `renderScorecardMarkdown` + `formatKpiValue` (src/core/kpi/
// scorecard.ts). Seeded views are produced through the REAL pipeline
// (KpiStore → computeSprintKpis → KpiService.listSprintViews) so the test
// exercises the same KpiView shape the retro hook consumes.
//
// Hermetic: all DB I/O lands in an os.tmpdir() sandbox, cleaned up in afterEach.

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
import { renderScorecardMarkdown, formatKpiValue } from '../../src/core/kpi/scorecard.js';

const TENANT = 'default';
const SPRINT = 'sprint-330';

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

/** Seed 11 base measurements; costUsd drives cost_per_sprint (= costUsd / 1). */
function seedSprint(store: KpiStore, sprintId: string, costUsd: number): void {
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
}

/** Build the real KpiView[] for a seeded sprint via the SSOT pipeline. */
function buildViews(dbPath: string, costUsd: number): KpiView[] {
  const store = new KpiStore(dbPath);
  seedSprint(store, SPRINT, costUsd);
  computeSprintKpis(store, loadKpiDefinitions(), TENANT, SPRINT);
  store.close();

  const svc = new KpiService(dbPath);
  try {
    return svc.listSprintViews(SPRINT);
  } finally {
    svc.close();
  }
}

// ─── formatKpiValue ────────────────────────────────────────────────────────────

describe('formatKpiValue — display semantics', () => {
  it('currency → $x.xx (2 decimals)', () => {
    expect(formatKpiValue(7, 'currency')).toBe('$7.00');
    expect(formatKpiValue(2.5, 'currency')).toBe('$2.50');
  });

  it('percent → x.x% (ratio ×100, 1 decimal)', () => {
    expect(formatKpiValue(0.25, 'percent')).toBe('25.0%');
    expect(formatKpiValue(0, 'percent')).toBe('0.0%');
  });

  it('number → locale-grouped number', () => {
    expect(formatKpiValue(200, 'number')).toBe('200');
    expect(formatKpiValue(1234, 'number', 'en')).toBe('1,234');
  });

  it('null / undefined / non-finite → —', () => {
    expect(formatKpiValue(null, 'currency')).toBe('—');
    expect(formatKpiValue(undefined, 'number')).toBe('—');
    expect(formatKpiValue(Number.NaN, 'percent')).toBe('—');
    expect(formatKpiValue(Number.POSITIVE_INFINITY, 'currency')).toBe('—');
  });
});

// ─── renderScorecardMarkdown — empty cases ─────────────────────────────────────

describe('renderScorecardMarkdown — empty / no-data → ""', () => {
  it('empty views array → ""', () => {
    expect(renderScorecardMarkdown(SPRINT, [])).toBe('');
  });

  it('all views with null result (no measurement data) → ""', () => {
    const defs = loadKpiDefinitions().filter(d => d.enabled && d.grain === 'sprint');
    const nullViews: KpiView[] = defs.map(definition => ({ definition, result: null }));
    expect(renderScorecardMarkdown(SPRINT, nullViews)).toBe('');
  });
});

// ─── renderScorecardMarkdown — seeded (real pipeline) ──────────────────────────

describe('renderScorecardMarkdown — seeded views', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-scorecard-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('goCriteria: heading "### KPI Scorecard" + value + status present', () => {
    const views = buildViews(dbPath, 7);
    const md = renderScorecardMarkdown(SPRINT, views, 'en');

    // Heading (substring contract — sprint id appended like the rubric section).
    expect(md).toContain('### KPI Scorecard');
    expect(md).toContain(SPRINT);

    // English column headers.
    expect(md).toContain('| KPI | Value | Target | Status |');

    // cost_per_sprint = 7 → $7.00, status critical (7 ≥ 3.5 threshold).
    expect(md).toContain('Cost / Sprint');
    expect(md).toContain('$7.00');     // değer
    expect(md).toContain('critical');  // status
  });

  it('renders one markdown row per KPI that has a computed result', () => {
    const views = buildViews(dbPath, 2.5);
    const md = renderScorecardMarkdown(SPRINT, views, 'en');

    const withData = views.filter(v => v.result !== null);
    expect(withData.length).toBeGreaterThan(0);

    // Body rows = data rows; header + separator are the first two lines.
    const lines = md.split('\n');
    const bodyRows = lines.filter(l => l.startsWith('| ') && !l.includes('Value'));
    expect(bodyRows.length).toBe(withData.length);

    // No null-result KPI is rendered (those are omitted, not shown as all-—).
    const nullCount = views.length - withData.length;
    if (nullCount > 0) {
      // cost_per_kloc divides by lines→non-zero here, so it has data; assert the
      // omitted ones simply are not over-counted (rows == withData, checked above).
      expect(bodyRows.length).toBeLessThan(views.length + 1);
    }
  });

  it('lang="tr" localizes column headers and KPI titles', () => {
    const views = buildViews(dbPath, 7);
    const md = renderScorecardMarkdown(SPRINT, views, 'tr');

    expect(md).toContain('### KPI Scorecard');
    expect(md).toContain('| KPI | Değer | Hedef | Durum |');
    expect(md).toContain('Sprint Başına Maliyet'); // cost_per_sprint title.tr
  });
});
