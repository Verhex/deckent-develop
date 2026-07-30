// ─── Sprint Measurement Collection — derive + record pipeline ─────────────────
// Pure derivation layer that collapses sprint finalization data into the 11
// base measures, then feeds them through the KPI pipeline:
//   deriveMeasurements (pure) → recordMeasurements → computeSprintKpis
//
// Design constraints:
//   - deriveMeasurements is NETWORK-ZERO and I/O-ZERO (pure).
//   - usage may be null/undefined → all cost/token measures default to 0 (no crash).
//   - No tight coupling to full types.ts sprint/task types — only the fields
//     actually consumed are declared in the minimal *Like interfaces.

import { BASE_MEASURES } from './measure-catalog.js';
import { KpiStore } from './kpi-store.js';
import type { MeasurementInput } from './kpi-store.js';
import { loadKpiDefinitions } from './kpi-definitions.js';
import { computeSprintKpis } from './rollup-engine.js';

// ─── Minimal structural interfaces ───────────────────────────────────────────

/** Provider token / cost totals for a sprint. */
export interface UsageTotals {
  /**
   * Total sprint cost (USD), provider-agnostic. Real-cost-first: the producer
   * (buildUsageTotals) sums each result's provider-reported `cost.usd` when present
   * and only estimates from tokens for results that report no cost. `0` is a valid
   * authoritative value (e.g. an all-local/ollama sprint), never a "missing" marker.
   */
  costUsd: number;
  /** Catalog/reference value of consumed tokens; not an amount billed. */
  referenceCostUsd?: number;
  /** Results whose billing regime could not be resolved authoritatively. */
  unknownBillingTaskCount?: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
}

/** Minimal sprint-level counters consumed by deriveMeasurements. */
export interface SprintMetricsLike {
  tasksTotal: number;
  tasksDone: number;
  noGo: number;
  boundaryViolations?: number;
}

/** Minimal per-task result fields consumed by deriveMeasurements. */
export interface TaskResultLike {
  tscAttempts?: number;
  testAttempts?: number;
  linesAdded?: number;
}

// ─── Pure derivation ──────────────────────────────────────────────────────────

/**
 * Derive the 11 base measurements for a sprint from finalization data.
 *
 * Pure: no I/O, no side effects. The `usage` parameter is intentionally
 * `null | undefined`-safe so the caller does not crash when token-usage
 * telemetry is absent (Phase-2 instrumentation gap).
 *
 * @param ts  ISO 8601 UTC capture timestamp for all produced measurements.
 */
export function deriveMeasurements(
  sprintId: string,
  tenantId: string,
  metrics: SprintMetricsLike,
  results: readonly TaskResultLike[],
  usage: UsageTotals | null | undefined,
  ts: string,
): MeasurementInput[] {
  const retries = results.reduce(
    (acc, r) => acc + (r.tscAttempts ?? 0) + (r.testAttempts ?? 0),
    0,
  );
  const linesAdded = results.reduce((acc, r) => acc + (r.linesAdded ?? 0), 0);

  const raw: Array<[string, number]> = [
    ['sprint_count',        1],
    ['tasks_total',         metrics.tasksTotal],
    ['tasks_done',          metrics.tasksDone],
    ['no_go',               metrics.noGo],
    ['boundary_violations', metrics.boundaryViolations ?? 0],
    ['retries',             retries],
    ['lines_added',         linesAdded],
    ['cost_usd',            usage?.costUsd ?? 0],
    ['tokens_input',        usage?.inputTokens ?? 0],
    ['tokens_output',       usage?.outputTokens ?? 0],
    ['cache_read',          usage?.cacheRead ?? 0],
  ];

  return raw.map(([measureId, value]) => {
    const catalog = BASE_MEASURES[measureId];
    return {
      tenantId,
      measureId,
      value,
      kind: catalog?.kind ?? 'gauge',
      unit: catalog?.unit ?? 'count',
      sprintId,
      ts,
    };
  });
}

// ─── Pipeline: derive → record → compute ─────────────────────────────────────

/**
 * Full sprint KPI pipeline in one call:
 *   1. derive 11 base measurements (pure)
 *   2. record them into the KPI store (append)
 *   3. fold rollups and compute / persist all sprint KPI results
 *
 * Opens and closes its own KpiStore — caller provides only the DB path.
 *
 * @param ts  Optional ISO 8601 capture timestamp; defaults to `new Date()`.
 */
export function recordKpiMeasurements(
  dbPath: string,
  sprintId: string,
  tenantId: string,
  metrics: SprintMetricsLike,
  results: readonly TaskResultLike[],
  usage: UsageTotals | null | undefined,
  ts?: string,
): void {
  const capturedAt = ts ?? new Date().toISOString();
  const measurements = deriveMeasurements(sprintId, tenantId, metrics, results, usage, capturedAt);

  const store = new KpiStore(dbPath);
  try {
    store.recordMeasurements(measurements);
    const defs = loadKpiDefinitions();
    computeSprintKpis(store, defs, tenantId, sprintId);
  } finally {
    store.close();
  }
}
