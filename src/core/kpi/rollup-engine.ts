// ─── KPI Rollup Engine — fold → evaluate → status → persist ─────────────────────
// The COMPUTE half of the KPI subsystem: turns the raw measurements (already
// folded into per-(tenant, sprint) rollups by KpiStore) into evaluated KPI
// *results* with a direction-aware health status.
//
// SSOT: every derived value flows through the sandboxed formula-evaluator
// (`evaluateFormula`). This module NEVER performs arithmetic on a formula itself
// (spec §4 architecture-C, §6, task nogo). The same evaluator feeds the live
// path (kpi-service, Task 7), so live and rollup values can never drift.
//
// Resilience (spec §11 — "no silent debt, no crash"): a formula that references
// a measure not yet emitted (Phase-2 instrumentation) or divides by zero (e.g.
// zero completed tasks) resolves to `null` → status "n/a". A `FormulaError` is
// caught and mapped to that same na-state — it is NEVER allowed to crash the
// fold of an otherwise-healthy sprint.

import { evaluateFormula, FormulaError } from './formula-evaluator.js';
import { getMeasure } from './measure-catalog.js';
import type { KpiStore, RollupAgg, ResultInput } from './kpi-store.js';
import type { KpiDefinitionSpec } from './kpi-definitions.js';
import type { AggMethod, KpiStatus } from './types.js';

// The four `KpiStatus` states encode the spec's ok | warn | critical | n/a
// vocabulary (spec §8/§11): healthy = ok, warning = warn, critical = critical,
// unknown = n/a. `KpiStatus` is the committed contract (`types.ts`,
// `ResultInput.status`); this module maps onto it rather than inventing a parallel set.

// ─── Direction-aware status ─────────────────────────────────────────────────────

/**
 * Classify a computed KPI value against its (direction-aware) threshold.
 *
 * - `value === null` (no data / division-by-zero) → `unknown` ("n/a").
 * - No `threshold` configured → `healthy` (nothing can be breached).
 * - `down` KPI (lower is better): value ≥ critical → `critical`; ≥ warn → `warning`.
 * - `up`   KPI (higher is better): value ≤ critical → `critical`; ≤ warn → `warning`.
 *
 * @param value The computed KPI value, or `null` when the formula had no data.
 * @param def   The KPI definition supplying `direction` and (optional) `threshold`.
 */
export function computeStatus(value: number | null, def: KpiDefinitionSpec): KpiStatus {
  if (value === null) return 'unknown';

  const threshold = def.threshold;
  if (threshold === undefined) return 'healthy';

  const { warn, critical } = threshold;
  if (def.direction === 'down') {
    // Lower is better → a HIGHER value is worse.
    if (value >= critical) return 'critical';
    if (value >= warn) return 'warning';
    return 'healthy';
  }
  // direction === 'up' — higher is better → a LOWER value is worse.
  if (value <= critical) return 'critical';
  if (value <= warn) return 'warning';
  return 'healthy';
}

// ─── Rollup → measure map ───────────────────────────────────────────────────────

/**
 * Pick the scalar a rollup contributes to the measure-map, per the measure's
 * declared `aggMethod`. Returns `null` when the chosen aggregate is itself
 * absent (e.g. an empty min/max), so the caller can omit the measure rather than
 * feed a non-finite value into the evaluator.
 */
function selectAggregate(agg: RollupAgg, method: AggMethod): number | null {
  switch (method) {
    case 'sum': return agg.sum;
    case 'avg': return agg.count > 0 ? agg.sum / agg.count : null;
    case 'last': return agg.last;
    case 'max': return agg.max;
    case 'min': return agg.min;
    default: {
      // Exhaustiveness guard: AggMethod is a closed union — unreachable.
      const _never: never = method;
      return _never;
    }
  }
}

/**
 * Collapse the rollup rows for a period into a flat `measureId → value` map ready
 * for the formula-evaluator. Each measure is reduced by its catalog `aggMethod`
 * (counter→sum, gauge→last, …); a measure absent from the catalog falls back to
 * `sum`. Measures whose chosen aggregate is null/non-finite are OMITTED, so a
 * formula referencing them resolves to an unknown-identifier → na, never a NaN.
 */
function buildMeasureMap(rollups: readonly RollupAgg[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const agg of rollups) {
    const method: AggMethod = getMeasure(agg.measureId)?.aggMethod ?? 'sum';
    const value = selectAggregate(agg, method);
    if (value !== null && Number.isFinite(value)) {
      map[agg.measureId] = value;
    }
  }
  return map;
}

// ─── Sprint KPI computation ─────────────────────────────────────────────────────

/**
 * Fold a sprint's raw measurements into rollups, evaluate every enabled
 * sprint-grain KPI definition over those rollups, persist the results
 * (idempotent upsert), and return them.
 *
 * Pipeline (spec §7 rollup-engine): foldSprintRollups → getRollupValues →
 * buildMeasureMap (aggMethod-aware) → evaluateFormula (SSOT) → computeStatus →
 * upsertResults. Re-runnable: both the fold and the upsert are idempotent.
 *
 * A `FormulaError` (unknown / not-yet-emitted measure, division-by-zero) is
 * caught and recorded as an na result — the fold never crashes on incomplete
 * Phase-2 instrumentation (spec §11, task nogo: "FormulaError'da crash" forbidden).
 *
 * @returns The `ResultInput[]` that was upserted (one per enabled sprint KPI).
 */
export function computeSprintKpis(
  store: KpiStore,
  defs: readonly KpiDefinitionSpec[],
  tenantId: string,
  sprintId: string,
): ResultInput[] {
  // 1. Fold raw measurements → sprint-grain rollups (idempotent).
  store.foldSprintRollups(tenantId, sprintId);

  // 2. Collapse rollups → measure-map once (aggMethod-aware), shared by all KPIs.
  const rollups = store.getRollupValues(tenantId, 'sprint', sprintId);
  const measures = buildMeasureMap(rollups);

  // 3. Evaluate every enabled sprint-grain KPI through the single evaluator.
  const results: ResultInput[] = [];
  for (const def of defs) {
    if (!def.enabled || def.grain !== 'sprint') continue;

    let value: number | null;
    try {
      value = evaluateFormula(def.formula, measures);
    } catch (err) {
      if (err instanceof FormulaError) {
        // Not-yet-emitted measure / bad reference → na, never a crash.
        value = null;
      } else {
        throw err;
      }
    }

    results.push({
      tenantId,
      kpiId: def.id,
      grain: 'sprint',
      periodKey: sprintId,
      // kpi_results.value is NOT NULL; na is encoded as 0 + status 'unknown'.
      // Callers/UI key off status (render "—" for unknown — spec §11), not value.
      value: value ?? 0,
      target: def.target ?? null,
      status: computeStatus(value, def),
    });
  }

  // 4. Persist (idempotent upsert) and return.
  store.upsertResults(results);
  return results;
}
