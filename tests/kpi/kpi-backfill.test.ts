// ─── KPI History Backfill — hermetic tests ─────────────────────────────────────
// Verifies the self-healing read-path backfill (kpi-backfill.ts): a memory.db
// that holds sprint records but no forward-collected kpi_measurements (the 009
// data-gap) is reconstructed on first read, idempotently, via the SAME SSOT
// evaluator the live/rollup paths use, with strict tenant isolation.
//
// Hermetic: every fixture lives under os.tmpdir(); no project/HOME state is read.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { KpiStore } from '../../src/core/kpi/kpi-store.js';
import { KpiService } from '../../src/core/kpi/kpi-service.js';
import {
  backfillFromHistory,
  parseSprintMetrics,
} from '../../src/core/kpi/kpi-backfill.js';

// ─── Fixture helpers ───────────────────────────────────────────────────────────

/** The canonical `buildSprintEntrySummary` markdown stored in a `type='sprint'`
 *  entry's content (sprint-retro-writer.ts). */
function sprintSummary(
  sprintId: string,
  total: number,
  completed: number,
  noGo: number,
): string {
  return [
    `# ${sprintId}`,
    '',
    `- Total tasks: ${total}`,
    `- Completed: ${completed}`,
    `- NO_GO: ${noGo}`,
    `- Coverage: NaN%`,
    `- Duration: 3923274ms`,
    '',
    '## Task Outcomes',
    `- ${sprintId}-001: DONE — foundation`,
  ].join('\n');
}

/** Seed a `type='sprint'` history record (no kpi_measurements) into memory.db. */
function seedSprintRecord(
  store: MemoryStore,
  opts: {
    sprintId: string;
    total: number;
    completed: number;
    noGo: number;
    tenantId?: string;
  },
): void {
  const sprintNum = parseInt(opts.sprintId.replace(/\D/g, ''), 10) || 0;
  store.insert({
    id: `sprint-log-${opts.sprintId}`,
    type: 'sprint',
    title: `Sprint ${opts.sprintId}`,
    content: sprintSummary(opts.sprintId, opts.total, opts.completed, opts.noGo),
    source: 'brain',
    sprint_id: opts.sprintId,
    sprint_num: sprintNum,
    tenant_id: opts.tenantId,
  });
}

/** Count raw measurement rows for a (tenant, sprint) via a transient store. */
function measurementCount(dbPath: string, tenantId: string, sprintId: string): number {
  const store = new KpiStore(dbPath);
  try {
    return store.getSprintMeasurements(tenantId, sprintId).length;
  } finally {
    store.close();
  }
}

// ─── parseSprintMetrics ────────────────────────────────────────────────────────

describe('parseSprintMetrics', () => {
  it('extracts task totals from a canonical sprint summary', () => {
    const metrics = parseSprintMetrics(sprintSummary('sprint-330', 28, 27, 1));
    expect(metrics).not.toBeNull();
    expect(metrics!.tasksTotal).toBe(28);
    expect(metrics!.tasksDone).toBe(27);
    expect(metrics!.noGo).toBe(1);
    expect(metrics!.boundaryViolations).toBe(0); // not persisted → defaults to 0
  });

  it('returns null when a mandatory total is missing', () => {
    expect(parseSprintMetrics('# sprint-330\n\n- Completed: 4\n- NO_GO: 0')).toBeNull();
    expect(parseSprintMetrics('not a sprint summary at all')).toBeNull();
  });
});

// ─── backfillFromHistory — core behaviour ──────────────────────────────────────

describe('backfillFromHistory', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-backfill-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reconstructs measurements for a sprint that had none', () => {
    const mem = new MemoryStore(dbPath);
    seedSprintRecord(mem, { sprintId: 'sprint-330', total: 28, completed: 28, noGo: 0, tenantId: 'default' });
    mem.close();

    // Precondition: no measurements yet.
    expect(measurementCount(dbPath, 'default', 'sprint-330')).toBe(0);

    const summary = backfillFromHistory(dbPath, 'default');
    expect(summary.scanned).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.backfilled).toEqual(['sprint-330']);

    // 11 base measurements were recorded.
    expect(measurementCount(dbPath, 'default', 'sprint-330')).toBe(11);
  });

  it('is IDEMPOTENT — a second pass records no duplicate rows', () => {
    const mem = new MemoryStore(dbPath);
    seedSprintRecord(mem, { sprintId: 'sprint-330', total: 28, completed: 28, noGo: 0, tenantId: 'default' });
    mem.close();

    backfillFromHistory(dbPath, 'default');
    const afterFirst = measurementCount(dbPath, 'default', 'sprint-330');
    expect(afterFirst).toBe(11);

    const second = backfillFromHistory(dbPath, 'default');
    const afterSecond = measurementCount(dbPath, 'default', 'sprint-330');

    expect(afterSecond).toBe(afterFirst); // no duplication
    expect(second.skipped).toBe(1);
    expect(second.backfilled).toHaveLength(0);
  });

  it('skips a sprint record that is not parseable', () => {
    const mem = new MemoryStore(dbPath);
    mem.insert({
      id: 'sprint-log-bad',
      type: 'sprint',
      title: 'placeholder',
      content: '# sprint-999\n\n(no metrics persisted)',
      sprint_id: 'sprint-999',
      sprint_num: 999,
      tenant_id: 'default',
    });
    mem.close();

    const summary = backfillFromHistory(dbPath, 'default');
    expect(summary.scanned).toBe(1);
    expect(summary.backfilled).toHaveLength(0);
    expect(measurementCount(dbPath, 'default', 'sprint-999')).toBe(0);
  });

  it('preserves tenant isolation — tenant-A backfill never yields tenant-B rows', () => {
    const mem = new MemoryStore(dbPath);
    seedSprintRecord(mem, { sprintId: 'sprint-501', total: 10, completed: 10, noGo: 0, tenantId: 'tenant-A' });
    seedSprintRecord(mem, { sprintId: 'sprint-502', total: 20, completed: 18, noGo: 2, tenantId: 'tenant-B' });
    mem.close();

    const summary = backfillFromHistory(dbPath, 'tenant-A');
    // Only tenant-A's sprint is scanned + backfilled.
    expect(summary.scanned).toBe(1);
    expect(summary.backfilled).toEqual(['sprint-501']);

    expect(measurementCount(dbPath, 'tenant-A', 'sprint-501')).toBe(11);
    // tenant-B was never touched by a tenant-A backfill.
    expect(measurementCount(dbPath, 'tenant-B', 'sprint-502')).toBe(0);
  });

  it('no-ops gracefully on a DB with no sprint history', () => {
    const summary = backfillFromHistory(dbPath, 'default');
    expect(summary).toEqual({ scanned: 0, skipped: 0, backfilled: [] });
  });
});

// ─── KpiService self-heal (the wired read paths) ───────────────────────────────

describe('KpiService — self-healing backfill on read', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'kpi-svc-backfill-'));
    dbPath = join(tmpDir, 'memory.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('goCriteria: listSprintViews on a forward-collection-gap DB returns non-empty results with a numeric cost_per_sprint', () => {
    // Seed ONLY sprint history (NULL-tenant, mirroring real persisted records) —
    // no kpi_measurements at all.
    const mem = new MemoryStore(dbPath);
    seedSprintRecord(mem, { sprintId: 'sprint-330', total: 28, completed: 28, noGo: 0 });
    mem.close();

    const svc = new KpiService(dbPath);
    try {
      const views = svc.listSprintViews('sprint-330');
      expect(views.length).toBeGreaterThan(0);

      const cost = views.find(v => v.definition.id === 'cost_per_sprint');
      expect(cost).toBeDefined();
      expect(cost!.result).not.toBeNull(); // not empty
      expect(typeof cost!.result!.value).toBe('number');
      expect(Number.isFinite(cost!.result!.value)).toBe(true);

      // completion_rate is computed from the persisted task totals (28/28 = 1.0).
      const completion = views.find(v => v.definition.id === 'completion_rate');
      expect(completion!.result).not.toBeNull();
      expect(completion!.result!.value).toBeCloseTo(1.0, 10);

      // no_go_rate = 0/28 = 0.
      const noGo = views.find(v => v.definition.id === 'no_go_rate');
      expect(noGo!.result!.value).toBeCloseTo(0, 10);
    } finally {
      svc.close();
    }
  });

  it('repeated reads do not double-record (idempotent self-heal)', () => {
    const mem = new MemoryStore(dbPath);
    seedSprintRecord(mem, { sprintId: 'sprint-330', total: 28, completed: 28, noGo: 0, tenantId: 'default' });
    mem.close();

    // Two independent service instances each trigger ensureBackfill on read.
    const svc1 = new KpiService(dbPath);
    try { svc1.listSprintViews('sprint-330'); } finally { svc1.close(); }
    const svc2 = new KpiService(dbPath);
    try { svc2.listSprintViews('sprint-330'); } finally { svc2.close(); }

    expect(measurementCount(dbPath, 'default', 'sprint-330')).toBe(11);
  });

  it('getTrend self-heals so a fresh DB yields a populated trend', () => {
    const mem = new MemoryStore(dbPath);
    seedSprintRecord(mem, { sprintId: 'sprint-329', total: 6, completed: 6, noGo: 0, tenantId: 'default' });
    seedSprintRecord(mem, { sprintId: 'sprint-330', total: 28, completed: 28, noGo: 0, tenantId: 'default' });
    mem.close();

    const svc = new KpiService(dbPath, { tenantId: 'default' });
    try {
      const trend = svc.getTrend('completion_rate', 5);
      expect(trend.length).toBe(2);
      // old→new ordering: sprint-329 then sprint-330.
      expect(trend[0].periodKey).toBe('sprint-329');
      expect(trend[1].periodKey).toBe('sprint-330');
      for (const row of trend) {
        expect(typeof row.value).toBe('number');
        expect(row.value).toBeCloseTo(1.0, 10);
      }
    } finally {
      svc.close();
    }
  });
});
