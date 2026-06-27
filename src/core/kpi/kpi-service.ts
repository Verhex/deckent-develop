// ─── KPI Service Facade ────────────────────────────────────────────────────────
// Joins KPI definitions with stored (or live-computed) results.
//
// Two read paths (SSOT evaluator in both — no drift; spec §4 architecture-C):
//   1. Rollup path: kpi_results already has rows for this sprint → use them.
//   2. Live path (active sprint): no results yet but measurements exist
//      → call computeSprintKpis() (same evaluator), then read results.
//
// getTrend: reads kpi_results across multiple sprint periods via a transient
// better-sqlite3 connection (KpiStore has no cross-period KPI query).

import Database from 'better-sqlite3';
import { KpiStore } from './kpi-store.js';
import type { ResultRow } from './kpi-store.js';
import { loadKpiDefinitions } from './kpi-definitions.js';
import type { KpiDefinitionSpec } from './kpi-definitions.js';
import { computeSprintKpis } from './rollup-engine.js';
import { backfillFromHistory } from './kpi-backfill.js';
import type { KpiGrain, KpiStatus } from './types.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Dashboard-ready join of a KPI definition with its computed result for a period. */
export interface KpiView {
  /** Full KPI definition — includes i18n title (title.tr / title.en), formula, direction, threshold. */
  definition: KpiDefinitionSpec;
  /** Computed result for the requested period. Null when no measurement data is available. */
  result: ResultRow | null;
}

export interface KpiServiceOptions {
  /** Tenant scope for all queries. Defaults to 'default'. */
  tenantId?: string;
  /** Raw (unvalidated) custom KPI definitions to merge over the 8 built-ins. */
  customDefs?: readonly unknown[];
}

// ─── Internal DB row shape for getTrend ──────────────────────────────────────

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

// ─── KpiService ──────────────────────────────────────────────────────────────

export class KpiService {
  private readonly dbPath: string;
  private readonly tenantId: string;
  private readonly defs: KpiDefinitionSpec[];
  private readonly store: KpiStore;
  /** Self-healing backfill runs at most once per service instance (see ensureBackfill). */
  private backfillDone = false;

  constructor(dbPath: string, opts?: KpiServiceOptions) {
    this.dbPath = dbPath;
    this.tenantId = opts?.tenantId ?? 'default';
    this.defs = loadKpiDefinitions(opts?.customDefs);
    this.store = new KpiStore(dbPath);
  }

  /**
   * Self-heal the KPI store from persisted sprint history on first read.
   *
   * A DB with sprint records but no forward-collected measurements (e.g. sprints
   * finalized before the KPI build — the 009 data-gap) would otherwise read back
   * all-null KPIs. backfillFromHistory derives the missing measurements through
   * the SAME SSOT pipeline the live/rollup paths use, so values never drift; it is
   * idempotent (already-measured sprints are skipped) and tenant-scoped.
   *
   * Runs once per instance and is strictly best-effort: backfill is a telemetry
   * sidecar, so any failure is swallowed and NEVER breaks the primary read (the
   * caller simply sees null results for sprints that could not be reconstructed).
   */
  private ensureBackfill(): void {
    if (this.backfillDone) return;
    this.backfillDone = true;
    try {
      backfillFromHistory(this.dbPath, this.tenantId);
    } catch {
      // Best-effort self-healing — a backfill failure must not fail the read.
    }
  }

  /**
   * Return a KpiView[] for every enabled sprint-grain KPI definition.
   *
   * Read path:
   *   1. Pre-computed rollup: kpi_results has rows for this sprint → use them.
   *   2. Live (active sprint): no results persisted yet, but measurements exist
   *      → call computeSprintKpis() (SSOT evaluator) to compute + persist,
   *      then re-read results. Both paths use the same evaluator → no drift.
   *
   * KPIs with no data at all (no results, no measurements) yield `result: null`.
   */
  listSprintViews(sprintId: string): KpiView[] {
    // 0. Self-heal: backfill measurements from sprint history if this is a fresh
    //    (forward-collection-gap) DB. Idempotent + same SSOT evaluator → no drift.
    this.ensureBackfill();

    // 1. Try pre-computed results (rollup path).
    let results = this.store.getResults(this.tenantId, 'sprint', sprintId);

    // 2. Live fallback: no results but measurements exist → compute via SSOT evaluator.
    if (results.length === 0) {
      const measurements = this.store.getSprintMeasurements(this.tenantId, sprintId);
      if (measurements.length > 0) {
        computeSprintKpis(this.store, this.defs, this.tenantId, sprintId);
        results = this.store.getResults(this.tenantId, 'sprint', sprintId);
      }
    }

    // 3. Index results by kpiId for O(1) join.
    const resultMap = new Map<string, ResultRow>();
    for (const r of results) {
      resultMap.set(r.kpiId, r);
    }

    // 4. Join every enabled sprint-grain definition with its result (or null).
    return this.defs
      .filter(def => def.enabled && def.grain === 'sprint')
      .map(def => ({
        definition: def,
        result: resultMap.get(def.id) ?? null,
      }));
  }

  /**
   * Return the n most recent sprint-grain results for a KPI, ordered old→new.
   *
   * Opens and closes a transient Database connection for this query; KpiStore
   * exposes no cross-period KPI query. The connection is always closed in a
   * `finally` block — no resource leak on error.
   *
   * @param kpiId  KPI identifier (e.g. 'cost_per_sprint').
   * @param n      Maximum number of results to return.
   */
  getTrend(kpiId: string, n: number): ResultRow[] {
    // Self-heal first so a fresh DB yields a populated trend (same SSOT, idempotent).
    this.ensureBackfill();

    const db = new Database(this.dbPath);
    try {
      const rows = db.prepare(`
        SELECT tenant_id, kpi_id, grain, period_key, value, target, status, computed_at
        FROM kpi_results
        WHERE tenant_id = ? AND kpi_id = ? AND grain = 'sprint'
        ORDER BY period_key DESC
        LIMIT ?
      `).all(this.tenantId, kpiId, n) as ResultDbRow[];

      // Reverse DESC→ASC to yield old→new ordering.
      return rows.reverse().map(r => ({
        tenantId: r.tenant_id,
        kpiId: r.kpi_id,
        grain: r.grain as KpiGrain,
        periodKey: r.period_key,
        value: r.value,
        target: r.target,
        status: r.status as KpiStatus,
        computedAt: r.computed_at,
      }));
    } finally {
      db.close();
    }
  }

  /** Close the underlying KpiStore (releases the SQLite DB connection). */
  close(): void {
    this.store.close();
  }
}
