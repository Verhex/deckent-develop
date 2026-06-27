// ─── KPI History Backfill — self-healing measurement reconstruction ────────────
// Forward-collection (collection.ts, wired into finalizeSprint) only records the
// 11 base measurements for sprints finalized AFTER the KPI build landed. Every
// sprint finalized BEFORE that build has a `type='sprint'` record in memory.db
// but ZERO `kpi_measurements` rows (the 009 data-gap) → `deckent kpi` reports
// all-null values ("empty kpis[]").
//
// This module closes that gap on the READ path: it derives the base measurements
// from each persisted sprint summary and records them through the SAME SSOT
// pipeline the live/forward paths use —
//   deriveMeasurements (pure, collection.ts) → recordMeasurements → computeSprintKpis
// — so a backfilled sprint's KPI values are byte-for-byte identical to what the
// forward path would have produced. No formula drift, one evaluator.
//
// Design invariants:
//   - IDEMPOTENT: a sprint that already has ≥1 measurement is SKIPPED, so repeated
//     reads (or a forward-collected sprint) are never double-recorded.
//   - TENANT-SCOPED: sprint history is read tenant-filtered and measurements are
//     written under the SAME tenant — a tenant-A backfill never produces tenant-B rows.
//   - NETWORK-ZERO / no process.cwd(): the DB path is always caller-supplied.
//   - Historical sprints carry NO per-task usage telemetry, so usage/results are
//     empty → cost/token/retry/lines measures default to 0 (deriveMeasurements is
//     null-safe). The rate KPIs (completion_rate, no_go_rate, boundary_violation_rate)
//     are still meaningful, computed from the persisted task totals.

import { MemoryStore } from '../memory-store.js';
import { KpiStore } from './kpi-store.js';
import { deriveMeasurements } from './collection.js';
import type { SprintMetricsLike } from './collection.js';
import { loadKpiDefinitions } from './kpi-definitions.js';
import { computeSprintKpis } from './rollup-engine.js';

// ─── Public result shape ───────────────────────────────────────────────────────

/** Outcome of one {@link backfillFromHistory} pass. */
export interface BackfillSummary {
  /** Number of `type='sprint'` records inspected for this tenant. */
  scanned: number;
  /** Records skipped because they already had measurements (idempotent guard). */
  skipped: number;
  /** Sprint ids freshly backfilled this call (measurements were absent). */
  backfilled: string[];
}

// ─── Sprint-summary metric parser ──────────────────────────────────────────────

/**
 * Extract the sprint-level task counters from a `type='sprint'` entry's content.
 *
 * The persisted summary is the `buildSprintEntrySummary` markdown
 * (sprint-retro-writer.ts), e.g.:
 *
 *   # sprint-330
 *
 *   - Total tasks: 28
 *   - Completed: 28
 *   - NO_GO: 0
 *   - Coverage: NaN%
 *   - Duration: 3923274ms
 *
 * `boundary_violations` is not persisted in the summary → defaults to 0.
 *
 * @returns The parsed counters, or `null` when any mandatory total is absent
 *          (a placeholder / malformed record is not backfillable).
 */
export function parseSprintMetrics(content: string): SprintMetricsLike | null {
  const match = (re: RegExp): number | null => {
    const m = content.match(re);
    if (m === null) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  const tasksTotal = match(/Total tasks:\s*(\d+)/i);
  const tasksDone = match(/Completed:\s*(\d+)/i);
  const noGo = match(/NO_GO:\s*(\d+)/i);

  if (tasksTotal === null || tasksDone === null || noGo === null) return null;

  return { tasksTotal, tasksDone, noGo, boundaryViolations: 0 };
}

// ─── Backfill ──────────────────────────────────────────────────────────────────

/**
 * Reconstruct missing KPI measurements for a tenant from its persisted sprint
 * history. Idempotent and self-contained: opens its own MemoryStore + KpiStore on
 * `dbPath`, reads every `type='sprint'` record, and for each sprint that has no
 * measurements yet, derives + records + computes through the SSOT pipeline.
 *
 * Safe to call on every read: sprints that already carry measurements (forward-
 * collected or previously backfilled) are skipped, so no row is ever duplicated.
 *
 * @param dbPath   Path to `.brain/memory.db` (the same DB the KpiStore lives in).
 * @param tenantId Tenant scope for both the history read and the measurement write.
 */
export function backfillFromHistory(dbPath: string, tenantId: string): BackfillSummary {
  const memory = new MemoryStore(dbPath);
  const store = new KpiStore(dbPath);
  const summary: BackfillSummary = { scanned: 0, skipped: 0, backfilled: [] };

  try {
    const defs = loadKpiDefinitions();
    const sprints = memory.getByType('sprint', tenantId);

    for (const entry of sprints) {
      const sprintId = entry.sprint_id;
      if (!sprintId) continue; // a sprint record with no sprint id is unkeyable
      summary.scanned += 1;

      // IDEMPOTENT guard — never double-record a sprint that already has data
      // (forward-collected at finalize, or backfilled by an earlier read).
      if (store.getSprintMeasurements(tenantId, sprintId).length > 0) {
        summary.skipped += 1;
        continue;
      }

      const metrics = parseSprintMetrics(entry.content);
      if (metrics === null) continue; // placeholder / malformed → not backfillable

      // SSOT pipeline, identical to the forward path. No usage telemetry survives
      // for a historical sprint → empty results + null usage (cost/tokens/retries/
      // lines default to 0). Timestamp the measurements with the sprint's own
      // record time (deterministic; no wall-clock dependency).
      const ts = entry.created_at || entry.updated_at;
      const measurements = deriveMeasurements(sprintId, tenantId, metrics, [], null, ts);
      store.recordMeasurements(measurements);
      computeSprintKpis(store, defs, tenantId, sprintId);
      summary.backfilled.push(sprintId);
    }

    return summary;
  } finally {
    store.close();
    memory.close();
  }
}
