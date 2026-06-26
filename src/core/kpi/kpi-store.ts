/**
 * KpiStore — SQLite persistence layer for the KPI subsystem (Phase 1).
 *
 * Wraps better-sqlite3 with three tenant-scoped tables (spec §7):
 *   - kpi_measurements : append-only raw event stream
 *   - kpi_rollups      : per-tenant/period aggregate (count/sum/min/max/last)
 *   - kpi_results      : computed KPI snapshots (idempotent upsert)
 *
 * Invariants:
 *   - NETWORK-ZERO: this layer NEVER performs network I/O — local memory.db only.
 *   - TENANT-AWARE: every row carries tenant_id and EVERY query filters on it
 *     (auto-injected security-context filter). No tenant-less read/write path exists.
 *   - Prepared statements + transactions only — zero string-concat SQL.
 *   - initSchema() is idempotent (CREATE IF NOT EXISTS) — re-opening a DB is a no-op.
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType, Statement } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { DeckentError } from '../errors.js';
import type { MeasureKind, KpiGrain, KpiStatus } from './types.js';

// ─── Public input/output shapes ──────────────────────────────────────────────

/** A single raw measurement to append to the event stream. */
export interface MeasurementInput {
  /** Optional caller-supplied id; auto-generated (UUID) when omitted. */
  id?: string;
  tenantId: string;
  measureId: string;
  value: number;
  kind: MeasureKind;
  /** SI / domain unit, e.g. "count", "USD", "tokens". */
  unit: string;
  sprintId: string;
  /** Optional originating task id. */
  taskId?: string | null;
  /** ISO 8601 UTC timestamp; defaults to now() (DB-side) when omitted. */
  ts?: string;
  /** Arbitrary structured tags; JSON-serialized on write. */
  tags?: Record<string, unknown>;
}

/** A measurement row as read back from the store. */
export interface MeasurementRow {
  id: string;
  tenantId: string;
  measureId: string;
  value: number;
  kind: string;
  unit: string;
  sprintId: string;
  taskId: string | null;
  ts: string;
  tags: Record<string, unknown>;
}

/** Aggregated rollup values for one measure within a (tenant, grain, period). */
export interface RollupAgg {
  measureId: string;
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  last: number | null;
  updatedAt: string;
}

/** A computed KPI result to persist (idempotent upsert). */
export interface ResultInput {
  tenantId: string;
  kpiId: string;
  grain: KpiGrain;
  periodKey: string;
  value: number;
  target?: number | null;
  status: KpiStatus;
}

/** A computed KPI result as read back from the store. */
export interface ResultRow {
  tenantId: string;
  kpiId: string;
  grain: KpiGrain;
  periodKey: string;
  value: number;
  target: number | null;
  status: KpiStatus;
  computedAt: string;
}

// ─── Internal SQLite row shapes ──────────────────────────────────────────────

interface MeasurementDbRow {
  id: string;
  tenant_id: string;
  measure_id: string;
  value: number;
  kind: string;
  unit: string;
  sprint_id: string;
  task_id: string | null;
  ts: string;
  tags: string;
}

interface RollupDbRow {
  measure_id: string;
  agg_count: number;
  agg_sum: number;
  agg_min: number | null;
  agg_max: number | null;
  agg_last: number | null;
  updated_at: string;
}

interface ResultDbRow {
  tenant_id: string;
  kpi_id: string;
  grain: string;
  period_key: string;
  value: number;
  target: number | null;
  status: string;
  computed_at: string;
}

// ─── KpiStore ────────────────────────────────────────────────────────────────

export class KpiStore {
  private readonly db: DatabaseType;

  // Prepared statements (compiled once in constructor).
  private readonly stmtInsertMeasurement: Statement;
  private readonly stmtSelectSprintMeasurements: Statement;
  private readonly stmtUpsertRollup: Statement;
  private readonly stmtSelectRollups: Statement;
  private readonly stmtUpsertResult: Statement;
  private readonly stmtSelectResults: Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();

    this.stmtInsertMeasurement = this.db.prepare(`
      INSERT INTO kpi_measurements (
        id, tenant_id, measure_id, value, kind, unit, sprint_id, task_id, ts, tags
      ) VALUES (
        @id, @tenant_id, @measure_id, @value, @kind, @unit, @sprint_id, @task_id,
        COALESCE(@ts, datetime('now')), @tags
      )
    `);

    this.stmtSelectSprintMeasurements = this.db.prepare(`
      SELECT id, tenant_id, measure_id, value, kind, unit, sprint_id, task_id, ts, tags
      FROM kpi_measurements
      WHERE tenant_id = @tenant_id AND sprint_id = @sprint_id
      ORDER BY ts ASC, rowid ASC
    `);

    this.stmtUpsertRollup = this.db.prepare(`
      INSERT INTO kpi_rollups (
        tenant_id, measure_id, grain, period_key,
        agg_count, agg_sum, agg_min, agg_max, agg_last, updated_at
      ) VALUES (
        @tenant_id, @measure_id, @grain, @period_key,
        @agg_count, @agg_sum, @agg_min, @agg_max, @agg_last, datetime('now')
      )
      ON CONFLICT (tenant_id, measure_id, grain, period_key) DO UPDATE SET
        agg_count  = excluded.agg_count,
        agg_sum    = excluded.agg_sum,
        agg_min    = excluded.agg_min,
        agg_max    = excluded.agg_max,
        agg_last   = excluded.agg_last,
        updated_at = excluded.updated_at
    `);

    this.stmtSelectRollups = this.db.prepare(`
      SELECT measure_id, agg_count, agg_sum, agg_min, agg_max, agg_last, updated_at
      FROM kpi_rollups
      WHERE tenant_id = @tenant_id AND grain = @grain AND period_key = @period_key
      ORDER BY measure_id ASC
    `);

    this.stmtUpsertResult = this.db.prepare(`
      INSERT INTO kpi_results (
        tenant_id, kpi_id, grain, period_key, value, target, status, computed_at
      ) VALUES (
        @tenant_id, @kpi_id, @grain, @period_key, @value, @target, @status, datetime('now')
      )
      ON CONFLICT (tenant_id, kpi_id, grain, period_key) DO UPDATE SET
        value       = excluded.value,
        target      = excluded.target,
        status      = excluded.status,
        computed_at = excluded.computed_at
    `);

    this.stmtSelectResults = this.db.prepare(`
      SELECT tenant_id, kpi_id, grain, period_key, value, target, status, computed_at
      FROM kpi_results
      WHERE tenant_id = @tenant_id AND grain = @grain AND period_key = @period_key
      ORDER BY kpi_id ASC
    `);
  }

  // ── Schema ─────────────────────────────────────────────────────────────────

  /** Idempotent: CREATE IF NOT EXISTS — re-opening an existing DB is a no-op. */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kpi_measurements (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        measure_id TEXT NOT NULL,
        value REAL NOT NULL,
        kind TEXT NOT NULL,
        unit TEXT NOT NULL,
        sprint_id TEXT NOT NULL,
        task_id TEXT,
        ts TEXT NOT NULL DEFAULT (datetime('now')),
        tags TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_kpi_meas_tenant_measure_ts
        ON kpi_measurements (tenant_id, measure_id, ts);
      CREATE INDEX IF NOT EXISTS idx_kpi_meas_tenant_sprint
        ON kpi_measurements (tenant_id, sprint_id);

      CREATE TABLE IF NOT EXISTS kpi_rollups (
        tenant_id TEXT NOT NULL,
        measure_id TEXT NOT NULL,
        grain TEXT NOT NULL,
        period_key TEXT NOT NULL,
        agg_count INTEGER NOT NULL DEFAULT 0,
        agg_sum REAL NOT NULL DEFAULT 0,
        agg_min REAL,
        agg_max REAL,
        agg_last REAL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (tenant_id, measure_id, grain, period_key)
      );

      CREATE TABLE IF NOT EXISTS kpi_results (
        tenant_id TEXT NOT NULL,
        kpi_id TEXT NOT NULL,
        grain TEXT NOT NULL,
        period_key TEXT NOT NULL,
        value REAL NOT NULL,
        target REAL,
        status TEXT NOT NULL,
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (tenant_id, kpi_id, grain, period_key)
      );
    `);
  }

  // ── Tenant guard ─────────────────────────────────────────────────────────────

  /**
   * Reject a missing/empty tenant id. Closes the "tenant-less query path" hole
   * (nogo): a query without a tenant filter is a multi-tenant data-leak vector.
   */
  private static assertTenant(tenantId: string): void {
    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new DeckentError(
        'KPI_TENANT_REQUIRED',
        'KpiStore: tenantId is required for every operation (tenant-less access is forbidden)',
        'Pass an explicit tenant id (Phase-1 default is "default").',
      );
    }
  }

  // ── Measurements ─────────────────────────────────────────────────────────────

  /** Append raw measurements (single transaction). Each row is tenant-scoped. */
  recordMeasurements(rows: MeasurementInput[]): void {
    if (rows.length === 0) return;
    for (const r of rows) KpiStore.assertTenant(r.tenantId);

    const insertAll = this.db.transaction((items: MeasurementInput[]) => {
      for (const r of items) {
        this.stmtInsertMeasurement.run({
          id: r.id ?? randomUUID(),
          tenant_id: r.tenantId,
          measure_id: r.measureId,
          value: r.value,
          kind: r.kind,
          unit: r.unit,
          sprint_id: r.sprintId,
          task_id: r.taskId ?? null,
          ts: r.ts ?? null,
          tags: JSON.stringify(r.tags ?? {}),
        });
      }
    });
    insertAll(rows);
  }

  /** All raw measurements for a (tenant, sprint), ordered by capture time. */
  getSprintMeasurements(tenantId: string, sprintId: string): MeasurementRow[] {
    KpiStore.assertTenant(tenantId);
    const dbRows = this.stmtSelectSprintMeasurements.all({
      tenant_id: tenantId,
      sprint_id: sprintId,
    }) as MeasurementDbRow[];
    return dbRows.map(KpiStore.toMeasurementRow);
  }

  // ── Rollups ──────────────────────────────────────────────────────────────────

  /**
   * Fold all measurements for (tenant, sprint) into the sprint-grain rollup:
   * group-by measure_id → count/sum/min/max/last, then UPSERT (full replace).
   *
   * Idempotent: it re-aggregates from scratch every call and the upsert REPLACES
   * (not accumulates) the agg columns, so running it twice yields identical rows.
   * period_key for grain='sprint' is the sprint id.
   */
  foldSprintRollups(tenantId: string, sprintId: string): void {
    KpiStore.assertTenant(tenantId);

    // Ordered by ts,rowid so "last" is the most recent value per measure.
    const rows = this.stmtSelectSprintMeasurements.all({
      tenant_id: tenantId,
      sprint_id: sprintId,
    }) as MeasurementDbRow[];
    if (rows.length === 0) return;

    interface Agg { count: number; sum: number; min: number; max: number; last: number }
    const groups = new Map<string, Agg>();
    for (const r of rows) {
      const g = groups.get(r.measure_id);
      if (g === undefined) {
        groups.set(r.measure_id, {
          count: 1, sum: r.value, min: r.value, max: r.value, last: r.value,
        });
      } else {
        g.count += 1;
        g.sum += r.value;
        if (r.value < g.min) g.min = r.value;
        if (r.value > g.max) g.max = r.value;
        g.last = r.value; // rows are ts,rowid-ordered → last wins
      }
    }

    const upsertAll = this.db.transaction((entries: Array<[string, Agg]>) => {
      for (const [measureId, g] of entries) {
        this.stmtUpsertRollup.run({
          tenant_id: tenantId,
          measure_id: measureId,
          grain: 'sprint',
          period_key: sprintId,
          agg_count: g.count,
          agg_sum: g.sum,
          agg_min: g.min,
          agg_max: g.max,
          agg_last: g.last,
        });
      }
    });
    upsertAll([...groups.entries()]);
  }

  /** Aggregated rollup rows for a (tenant, grain, period). */
  getRollupValues(tenantId: string, grain: KpiGrain, periodKey: string): RollupAgg[] {
    KpiStore.assertTenant(tenantId);
    const dbRows = this.stmtSelectRollups.all({
      tenant_id: tenantId,
      grain,
      period_key: periodKey,
    }) as RollupDbRow[];
    return dbRows.map((r) => ({
      measureId: r.measure_id,
      count: r.agg_count,
      sum: r.agg_sum,
      min: r.agg_min,
      max: r.agg_max,
      last: r.agg_last,
      updatedAt: r.updated_at,
    }));
  }

  // ── Results ──────────────────────────────────────────────────────────────────

  /** Persist computed KPI results (single transaction, idempotent upsert). */
  upsertResults(rows: ResultInput[]): void {
    if (rows.length === 0) return;
    for (const r of rows) KpiStore.assertTenant(r.tenantId);

    const upsertAll = this.db.transaction((items: ResultInput[]) => {
      for (const r of items) {
        this.stmtUpsertResult.run({
          tenant_id: r.tenantId,
          kpi_id: r.kpiId,
          grain: r.grain,
          period_key: r.periodKey,
          value: r.value,
          target: r.target ?? null,
          status: r.status,
        });
      }
    });
    upsertAll(rows);
  }

  /** Computed KPI results for a (tenant, grain, period). */
  getResults(tenantId: string, grain: KpiGrain, periodKey: string): ResultRow[] {
    KpiStore.assertTenant(tenantId);
    const dbRows = this.stmtSelectResults.all({
      tenant_id: tenantId,
      grain,
      period_key: periodKey,
    }) as ResultDbRow[];
    return dbRows.map((r) => ({
      tenantId: r.tenant_id,
      kpiId: r.kpi_id,
      grain: r.grain as KpiGrain,
      periodKey: r.period_key,
      value: r.value,
      target: r.target,
      status: r.status as KpiStatus,
      computedAt: r.computed_at,
    }));
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private static toMeasurementRow(r: MeasurementDbRow): MeasurementRow {
    let tags: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(r.tags);
      tags = parsed !== null && typeof parsed === 'object'
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      tags = {};
    }
    return {
      id: r.id,
      tenantId: r.tenant_id,
      measureId: r.measure_id,
      value: r.value,
      kind: r.kind,
      unit: r.unit,
      sprintId: r.sprint_id,
      taskId: r.task_id,
      ts: r.ts,
      tags,
    };
  }
}
