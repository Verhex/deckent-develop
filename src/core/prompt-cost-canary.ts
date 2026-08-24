import { createHash } from 'node:crypto';

/** Schema version for the immutable canary plan and decision envelopes. */
export const PROMPT_COST_CANARY_VERSION = 1 as const;

export type PromptCostCanaryQualityVerdict = 'PASS' | 'FAIL';
export type PromptCostCanaryDisposition = 'PROMOTE' | 'HOLD' | 'REJECT';

export type PromptCostCanaryReasonCode =
  | 'thresholds_satisfied'
  | 'empty_baseline_cohort'
  | 'empty_candidate_cohort'
  | 'cohort_identity_mismatch'
  | 'provider_mismatch'
  | 'model_mismatch'
  | 'billing_mismatch'
  | 'feature_mismatch'
  | 'lineage_set_mismatch'
  | 'quality_below_minimum'
  | 'quality_regression_exceeded'
  | 'cost_increase_exceeded'
  | 'cache_hit_ratio_below_minimum'
  | 'cache_hit_ratio_regression_exceeded'
  | 'duration_measurement_unavailable'
  | 'duration_increase_exceeded';

/** Explicit, provider-neutral dimensions which make two cohorts comparable. */
export interface PromptCostCanaryCohortIdentity {
  readonly cohortId: string;
  readonly comparisonId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly billingClass: string;
  readonly featureId: string;
}

/** One settled logical lineage. Attempts must be combined before constructing this sample. */
export interface PromptCostCanarySample {
  readonly logicalLineageId: string;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
  /** Authoritative value reported by the provider. Reference/repriced costs are not accepted. */
  readonly providerReportedUsd: number;
  /** Optional because several real provider adapters do not expose wall time. */
  readonly durationMs?: number;
  readonly qualityVerdict: PromptCostCanaryQualityVerdict;
}

export interface PromptCostCanaryCohort {
  readonly identity: PromptCostCanaryCohortIdentity;
  readonly samples: readonly PromptCostCanarySample[];
}

export interface PromptCostCanaryThresholds {
  /** Inclusive candidate pass-rate floor, in [0, 1]. */
  readonly minimumQualityPassRate: number;
  /** Inclusive maximum `(baseline pass rate - candidate pass rate)`, in [0, 1]. */
  readonly maximumQualityPassRateRegression: number;
  /** Inclusive maximum relative increase in provider-reported USD per lineage. */
  readonly maximumCostPerLineageIncreaseRatio: number;
  /** Inclusive candidate measured cache-hit-ratio floor, in [0, 1]. */
  readonly minimumCacheHitRatio: number;
  /** Inclusive maximum `(baseline hit ratio - candidate hit ratio)`, in [0, 1]. */
  readonly maximumCacheHitRatioRegression: number;
  /** Optional inclusive relative increase in average duration. */
  readonly maximumDurationPerLineageIncreaseRatio?: number;
}

export interface PromptCostCanaryPlan {
  readonly version: typeof PROMPT_COST_CANARY_VERSION;
  readonly baseline: PromptCostCanaryCohort;
  readonly candidate: PromptCostCanaryCohort;
  readonly thresholds: PromptCostCanaryThresholds;
}

export interface PromptCostCanaryAggregate {
  readonly sampleCount: number;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
  readonly providerReportedUsd: number;
  readonly durationMs: number | null;
  readonly durationSampleCount: number;
  readonly qualityPassCount: number;
  readonly qualityFailCount: number;
  readonly qualityPassRate: number;
  /** cacheRead / (input + cacheRead + cacheCreation); zero when the denominator is zero. */
  readonly cacheHitRatio: number;
  readonly providerReportedUsdPerLineage: number;
  readonly durationMsPerLineage: number | null;
}

export interface PromptCostCanaryDeltas {
  /** Candidate minus baseline, never rounded. */
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
  readonly providerReportedUsd: number;
  readonly durationMs: number | null;
  readonly qualityPassRate: number;
  readonly cacheHitRatio: number;
  readonly providerReportedUsdPerLineage: number;
  readonly durationMsPerLineage: number | null;
  readonly costPerLineageIncreaseRatio: number;
  readonly durationPerLineageIncreaseRatio: number | null;
}

export interface PromptCostCanaryDecision {
  readonly version: typeof PROMPT_COST_CANARY_VERSION;
  readonly disposition: PromptCostCanaryDisposition;
  readonly reasonCodes: readonly PromptCostCanaryReasonCode[];
  readonly planDigest: string;
  readonly decisionDigest: string;
  readonly baseline: PromptCostCanaryAggregate;
  readonly candidate: PromptCostCanaryAggregate;
  readonly deltas: PromptCostCanaryDeltas;
}

const CANONICAL_STRING = /^[^\u0000-\u001f\u007f]+$/u;

function requireIdentifier(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim() || !CANONICAL_STRING.test(value)) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
}

function requireNonNegative(name: string, value: number, integer = false): void {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new TypeError(`${name} must be a non-negative${integer ? ' safe integer' : ' finite number'}`);
  }
}

function requireRatio(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be a finite ratio in [0, 1]`);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $nonFiniteNumber: value > 0 ? 'Infinity' : value < 0 ? '-Infinity' : 'NaN' };
  }
  return typeof value === 'number' && Object.is(value, -0) ? 0 : value;
}

/** Stable UTF-8 JSON bytes used by both version-1 digests. */
export function encodePromptCostCanaryCanonical(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function digest(value: unknown): string {
  return createHash('sha256').update(encodePromptCostCanaryCanonical(value), 'utf8').digest('hex');
}

function validateIdentity(name: string, identity: PromptCostCanaryCohortIdentity): void {
  requireIdentifier(`${name}.cohortId`, identity.cohortId);
  requireIdentifier(`${name}.comparisonId`, identity.comparisonId);
  requireIdentifier(`${name}.providerId`, identity.providerId);
  requireIdentifier(`${name}.modelId`, identity.modelId);
  requireIdentifier(`${name}.billingClass`, identity.billingClass);
  requireIdentifier(`${name}.featureId`, identity.featureId);
}

function validateCohort(name: string, cohort: PromptCostCanaryCohort): void {
  validateIdentity(`${name}.identity`, cohort.identity);
  const lineages = new Set<string>();
  cohort.samples.forEach((sample, index) => {
    const prefix = `${name}.samples[${index}]`;
    requireIdentifier(`${prefix}.logicalLineageId`, sample.logicalLineageId);
    if (lineages.has(sample.logicalLineageId)) {
      throw new TypeError(`${name} contains duplicate logicalLineageId ${sample.logicalLineageId}`);
    }
    lineages.add(sample.logicalLineageId);
    requireNonNegative(`${prefix}.inputTokens`, sample.inputTokens, true);
    requireNonNegative(`${prefix}.cacheReadTokens`, sample.cacheReadTokens, true);
    requireNonNegative(`${prefix}.cacheCreationTokens`, sample.cacheCreationTokens, true);
    requireNonNegative(`${prefix}.outputTokens`, sample.outputTokens, true);
    requireNonNegative(`${prefix}.providerReportedUsd`, sample.providerReportedUsd);
    if (sample.durationMs !== undefined) requireNonNegative(`${prefix}.durationMs`, sample.durationMs);
    if (sample.qualityVerdict !== 'PASS' && sample.qualityVerdict !== 'FAIL') {
      throw new TypeError(`${prefix}.qualityVerdict must be PASS or FAIL`);
    }
  });
}

function validatePlan(plan: PromptCostCanaryPlan): void {
  if (plan.version !== PROMPT_COST_CANARY_VERSION) {
    throw new TypeError(`unsupported prompt cost canary version ${String(plan.version)}`);
  }
  validateCohort('baseline', plan.baseline);
  validateCohort('candidate', plan.candidate);
  requireRatio('thresholds.minimumQualityPassRate', plan.thresholds.minimumQualityPassRate);
  requireRatio('thresholds.maximumQualityPassRateRegression', plan.thresholds.maximumQualityPassRateRegression);
  requireNonNegative('thresholds.maximumCostPerLineageIncreaseRatio', plan.thresholds.maximumCostPerLineageIncreaseRatio);
  requireRatio('thresholds.minimumCacheHitRatio', plan.thresholds.minimumCacheHitRatio);
  requireRatio('thresholds.maximumCacheHitRatioRegression', plan.thresholds.maximumCacheHitRatioRegression);
  if (plan.thresholds.maximumDurationPerLineageIncreaseRatio !== undefined) {
    requireNonNegative('thresholds.maximumDurationPerLineageIncreaseRatio', plan.thresholds.maximumDurationPerLineageIncreaseRatio);
  }
}

function canonicalPlan(plan: PromptCostCanaryPlan): PromptCostCanaryPlan {
  const sortSamples = (samples: readonly PromptCostCanarySample[]) =>
    [...samples].sort((left, right) => left.logicalLineageId.localeCompare(right.logicalLineageId));
  return {
    version: PROMPT_COST_CANARY_VERSION,
    baseline: { identity: { ...plan.baseline.identity }, samples: sortSamples(plan.baseline.samples) },
    candidate: { identity: { ...plan.candidate.identity }, samples: sortSamples(plan.candidate.samples) },
    thresholds: { ...plan.thresholds },
  };
}

/** Digest of a validated, order-normalized plan. */
export function digestPromptCostCanaryPlan(plan: PromptCostCanaryPlan): string {
  validatePlan(plan);
  return digest(canonicalPlan(plan));
}

function aggregate(samples: readonly PromptCostCanarySample[]): PromptCostCanaryAggregate {
  const totals = samples.reduce((sum, sample) => ({
    inputTokens: sum.inputTokens + sample.inputTokens,
    cacheReadTokens: sum.cacheReadTokens + sample.cacheReadTokens,
    cacheCreationTokens: sum.cacheCreationTokens + sample.cacheCreationTokens,
    outputTokens: sum.outputTokens + sample.outputTokens,
    providerReportedUsd: sum.providerReportedUsd + sample.providerReportedUsd,
    durationMs: sum.durationMs + (sample.durationMs ?? 0),
    durationSampleCount: sum.durationSampleCount + (sample.durationMs === undefined ? 0 : 1),
    qualityPassCount: sum.qualityPassCount + (sample.qualityVerdict === 'PASS' ? 1 : 0),
  }), { inputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, outputTokens: 0,
    providerReportedUsd: 0, durationMs: 0, durationSampleCount: 0, qualityPassCount: 0 });
  const sampleCount = samples.length;
  const cacheDenominator = totals.inputTokens + totals.cacheReadTokens + totals.cacheCreationTokens;
  const durationMeasured = totals.durationSampleCount === sampleCount;
  return Object.freeze({
    sampleCount,
    inputTokens: totals.inputTokens,
    cacheReadTokens: totals.cacheReadTokens,
    cacheCreationTokens: totals.cacheCreationTokens,
    outputTokens: totals.outputTokens,
    providerReportedUsd: totals.providerReportedUsd,
    durationMs: durationMeasured ? totals.durationMs : null,
    durationSampleCount: totals.durationSampleCount,
    qualityPassCount: totals.qualityPassCount,
    qualityFailCount: sampleCount - totals.qualityPassCount,
    qualityPassRate: sampleCount === 0 ? 0 : totals.qualityPassCount / sampleCount,
    cacheHitRatio: cacheDenominator === 0 ? 0 : totals.cacheReadTokens / cacheDenominator,
    providerReportedUsdPerLineage: sampleCount === 0 ? 0 : totals.providerReportedUsd / sampleCount,
    durationMsPerLineage: durationMeasured && sampleCount > 0 ? totals.durationMs / sampleCount : null,
  });
}

function relativeIncrease(baseline: number, candidate: number): number {
  if (baseline === 0) return candidate === 0 ? 0 : Number.POSITIVE_INFINITY;
  return (candidate - baseline) / baseline;
}

function optionalDelta(baseline: number | null, candidate: number | null): number | null {
  return baseline === null || candidate === null ? null : candidate - baseline;
}

function optionalRelativeIncrease(
  baseline: number | null,
  candidate: number | null,
): number | null {
  return baseline === null || candidate === null ? null : relativeIncrease(baseline, candidate);
}

function mismatchReasons(plan: PromptCostCanaryPlan): PromptCostCanaryReasonCode[] {
  const baseline = plan.baseline.identity;
  const candidate = plan.candidate.identity;
  const reasons: PromptCostCanaryReasonCode[] = [];
  if (baseline.cohortId === candidate.cohortId || baseline.comparisonId !== candidate.comparisonId) reasons.push('cohort_identity_mismatch');
  if (baseline.providerId !== candidate.providerId) reasons.push('provider_mismatch');
  if (baseline.modelId !== candidate.modelId) reasons.push('model_mismatch');
  if (baseline.billingClass !== candidate.billingClass) reasons.push('billing_mismatch');
  if (baseline.featureId !== candidate.featureId) reasons.push('feature_mismatch');
  const baselineLineages = [...plan.baseline.samples].map(sample => sample.logicalLineageId).sort();
  const candidateLineages = [...plan.candidate.samples].map(sample => sample.logicalLineageId).sort();
  if (encodePromptCostCanaryCanonical(baselineLineages) !== encodePromptCostCanaryCanonical(candidateLineages)) {
    reasons.push('lineage_set_mismatch');
  }
  return reasons;
}

/**
 * Deterministically compares explicit measured cohorts. No pricing catalogue,
 * provider/model knowledge, clock, or implicit fallback participates.
 */
export function comparePromptCostCanary(plan: PromptCostCanaryPlan): PromptCostCanaryDecision {
  validatePlan(plan);
  const baseline = aggregate(plan.baseline.samples);
  const candidate = aggregate(plan.candidate.samples);
  const deltas: PromptCostCanaryDeltas = Object.freeze({
    inputTokens: candidate.inputTokens - baseline.inputTokens,
    cacheReadTokens: candidate.cacheReadTokens - baseline.cacheReadTokens,
    cacheCreationTokens: candidate.cacheCreationTokens - baseline.cacheCreationTokens,
    outputTokens: candidate.outputTokens - baseline.outputTokens,
    providerReportedUsd: candidate.providerReportedUsd - baseline.providerReportedUsd,
    durationMs: optionalDelta(baseline.durationMs, candidate.durationMs),
    qualityPassRate: candidate.qualityPassRate - baseline.qualityPassRate,
    cacheHitRatio: candidate.cacheHitRatio - baseline.cacheHitRatio,
    providerReportedUsdPerLineage: candidate.providerReportedUsdPerLineage - baseline.providerReportedUsdPerLineage,
    durationMsPerLineage: optionalDelta(
      baseline.durationMsPerLineage,
      candidate.durationMsPerLineage,
    ),
    costPerLineageIncreaseRatio: relativeIncrease(baseline.providerReportedUsdPerLineage, candidate.providerReportedUsdPerLineage),
    durationPerLineageIncreaseRatio: optionalRelativeIncrease(
      baseline.durationMsPerLineage,
      candidate.durationMsPerLineage,
    ),
  });
  const holdReasons: PromptCostCanaryReasonCode[] = [];
  if (baseline.sampleCount === 0) holdReasons.push('empty_baseline_cohort');
  if (candidate.sampleCount === 0) holdReasons.push('empty_candidate_cohort');
  holdReasons.push(...mismatchReasons(plan));
  if (plan.thresholds.maximumDurationPerLineageIncreaseRatio !== undefined
      && (baseline.durationMsPerLineage === null || candidate.durationMsPerLineage === null)) {
    holdReasons.push('duration_measurement_unavailable');
  }

  const rejectReasons: PromptCostCanaryReasonCode[] = [];
  if (holdReasons.length === 0) {
    const thresholds = plan.thresholds;
    if (candidate.qualityPassRate < thresholds.minimumQualityPassRate) rejectReasons.push('quality_below_minimum');
    if (baseline.qualityPassRate - candidate.qualityPassRate > thresholds.maximumQualityPassRateRegression) rejectReasons.push('quality_regression_exceeded');
    if (deltas.costPerLineageIncreaseRatio > thresholds.maximumCostPerLineageIncreaseRatio) rejectReasons.push('cost_increase_exceeded');
    if (candidate.cacheHitRatio < thresholds.minimumCacheHitRatio) rejectReasons.push('cache_hit_ratio_below_minimum');
    if (baseline.cacheHitRatio - candidate.cacheHitRatio > thresholds.maximumCacheHitRatioRegression) rejectReasons.push('cache_hit_ratio_regression_exceeded');
    if (thresholds.maximumDurationPerLineageIncreaseRatio !== undefined
      && deltas.durationPerLineageIncreaseRatio !== null
      && deltas.durationPerLineageIncreaseRatio > thresholds.maximumDurationPerLineageIncreaseRatio) {
      rejectReasons.push('duration_increase_exceeded');
    }
  }
  const disposition: PromptCostCanaryDisposition = holdReasons.length > 0 ? 'HOLD' : rejectReasons.length > 0 ? 'REJECT' : 'PROMOTE';
  const reasonCodes: readonly PromptCostCanaryReasonCode[] = Object.freeze(
    disposition === 'PROMOTE' ? ['thresholds_satisfied'] : disposition === 'HOLD' ? holdReasons : rejectReasons,
  );
  const planDigest = digestPromptCostCanaryPlan(plan);
  const unsigned = { version: PROMPT_COST_CANARY_VERSION, disposition, reasonCodes, planDigest, baseline, candidate, deltas };
  return Object.freeze({ ...unsigned, decisionDigest: digest(unsigned) });
}
