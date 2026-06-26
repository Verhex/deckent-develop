// ─── KPI Foundation Types ─────────────────────────────────────────────────────

// ─── Measure Primitives ───────────────────────────────────────────────────────

/** Counter: monotonically increasing (e.g. task count).
 *  Gauge: point-in-time value that can go up or down (e.g. cost_usd).
 *  Ratio: computed fraction 0..1 (e.g. success_rate). */
export type MeasureKind = 'counter' | 'gauge' | 'ratio';

/** How raw measurements are aggregated across time or scope. */
export type AggMethod = 'sum' | 'avg' | 'last' | 'max' | 'min';

/** A named, typed signal that can be collected during sprint finalization. */
export interface BaseMeasure {
  /** Unique snake_case identifier, must match key in BASE_MEASURES. */
  id: string;
  kind: MeasureKind;
  aggMethod: AggMethod;
  /** SI / domain unit string, e.g. "count", "USD", "tokens", "lines". */
  unit: string;
  description: string;
}

// ─── KPI Semantics ───────────────────────────────────────────────────────────

/** Whether higher or lower values indicate better performance. */
export type KpiDirection = 'higher_is_better' | 'lower_is_better' | 'target';

/** How the numeric value should be formatted in UI. */
export type KpiFormat = 'number' | 'percent' | 'currency' | 'duration';

/** Organizational level this KPI is intended for. */
export type KpiTier = 'operational' | 'tactical' | 'strategic';

/** Temporal granularity of aggregation. */
export type KpiGrain = 'sprint' | 'day' | 'week' | 'month';

/** Health status determined by threshold evaluation. */
export type KpiStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

// ─── KPI Definition ───────────────────────────────────────────────────────────

/** Warning/critical boundaries for a KPI.
 *  Semantics depend on KpiDirection: for higher_is_better, values BELOW these
 *  trigger the corresponding state; for lower_is_better, values ABOVE trigger it. */
export interface KpiThreshold {
  warning: number;
  critical: number;
}

/** Fully declared KPI including display, behavior, and data linkage. */
export interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  /** References BaseMeasure.id that feeds this KPI. */
  measureId: string;
  direction: KpiDirection;
  format: KpiFormat;
  tier: KpiTier;
  grain: KpiGrain;
  /** Optional — if absent, status is always 'unknown'. */
  threshold?: KpiThreshold;
  /** Whether this KPI is included in summary dashboards. */
  featured: boolean;
}

// ─── Measurement Data ─────────────────────────────────────────────────────────

/** A single raw measurement captured at sprint finalization time. */
export interface Measurement {
  measureId: string;
  /** Sprint that produced this measurement, e.g. "sprint-330". */
  sprintId: string;
  value: number;
  /** ISO 8601 UTC timestamp when the value was captured. */
  capturedAt: string;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

/** One row in a roll-up report: aggregated values for a set of measures per grain period. */
export interface RollupRow {
  grain: KpiGrain;
  /** ISO 8601 period start (e.g. week start date). */
  periodStart: string;
  /** Map of measureId → aggregated numeric value. */
  values: Record<string, number>;
}

// ─── Computed Results ─────────────────────────────────────────────────────────

/** A KPI evaluated against its definition — includes the computed value and status. */
export interface KpiResult {
  kpiId: string;
  measureId: string;
  value: number;
  status: KpiStatus;
  /** Grain period this result covers. */
  grain: KpiGrain;
  periodStart: string;
  evaluatedAt: string;
}

// ─── Dashboard View ───────────────────────────────────────────────────────────

/** Dashboard-ready projection combining definition metadata with live result. */
export interface KpiView {
  definition: KpiDefinition;
  /** Null when no measurement data is available for the period. */
  result: KpiResult | null;
}
