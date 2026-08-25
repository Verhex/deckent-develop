import { describe, expect, it } from 'vitest';

import {
  comparePromptCostCanary,
  digestPromptCostCanaryPlan,
  type PromptCostCanaryPlan,
  type PromptCostCanarySample,
} from '../../src/core/prompt-cost-canary.js';

const baselineSamples: PromptCostCanarySample[] = [
  { logicalLineageId: 'lineage-a', inputTokens: 40, cacheReadTokens: 60, cacheCreationTokens: 0,
    outputTokens: 20, providerReportedUsd: 2, durationMs: 1_000, qualityVerdict: 'PASS' },
  { logicalLineageId: 'lineage-b', inputTokens: 50, cacheReadTokens: 50, cacheCreationTokens: 0,
    outputTokens: 30, providerReportedUsd: 2, durationMs: 2_000, qualityVerdict: 'PASS' },
];

const candidateSamples: PromptCostCanarySample[] = [
  { logicalLineageId: 'lineage-a', inputTokens: 20, cacheReadTokens: 80, cacheCreationTokens: 0,
    outputTokens: 18, providerReportedUsd: 1.5, durationMs: 900, qualityVerdict: 'PASS' },
  { logicalLineageId: 'lineage-b', inputTokens: 30, cacheReadTokens: 70, cacheCreationTokens: 0,
    outputTokens: 25, providerReportedUsd: 1.5, durationMs: 1_500, qualityVerdict: 'PASS' },
];

function plan(): PromptCostCanaryPlan {
  const comparable = { comparisonId: 'comparison-1', providerId: 'opaque-provider', modelId: 'opaque-model',
    billingClass: 'metered-envelope', featureId: 'prompt-cache-feature' };
  return {
    version: 1,
    baseline: { identity: { ...comparable, cohortId: 'baseline' }, samples: baselineSamples },
    candidate: { identity: { ...comparable, cohortId: 'candidate' }, samples: candidateSamples },
    thresholds: {
      minimumQualityPassRate: 0.9,
      maximumQualityPassRateRegression: 0,
      maximumCostPerLineageIncreaseRatio: 0,
      minimumCacheHitRatio: 0.7,
      maximumCacheHitRatioRegression: 0,
      maximumDurationPerLineageIncreaseRatio: 0,
    },
  };
}

describe('comparePromptCostCanary', () => {
  it('promotes comparable measured cohorts and exposes exact aggregates, ratios, and deltas', () => {
    const result = comparePromptCostCanary(plan());
    expect(result.disposition).toBe('PROMOTE');
    expect(result.reasonCodes).toEqual(['thresholds_satisfied']);
    expect(result.baseline).toMatchObject({ inputTokens: 90, cacheReadTokens: 110, outputTokens: 50,
      providerReportedUsd: 4, durationMs: 3_000, qualityPassRate: 1, cacheHitRatio: 0.55,
      providerReportedUsdPerLineage: 2 });
    expect(result.candidate.cacheHitRatio).toBe(0.75);
    expect(result.deltas).toMatchObject({ providerReportedUsd: -1, providerReportedUsdPerLineage: -0.5,
      costPerLineageIncreaseRatio: -0.25, qualityPassRate: 0 });
    expect(result.deltas.cacheHitRatio).toBeCloseTo(0.2);
    expect(result.planDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.decisionDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.costAuthority).toBe('provider-reported-usd');
  });

  it('settles fully-unpriced subscription cohorts on digest-bound token-total authority without fabricating USD', () => {
    const input = plan();
    const unpriced = (samples: PromptCostCanarySample[]) =>
      samples.map(sample => ({ ...sample, providerReportedUsd: null }));
    const tokenPlan: PromptCostCanaryPlan = { ...input, costAuthority: 'token-total',
      baseline: { ...input.baseline, samples: unpriced(baselineSamples) },
      candidate: { ...input.candidate, samples: unpriced(candidateSamples) } };
    const result = comparePromptCostCanary(tokenPlan);
    // Candidate 243 total tokens vs baseline 250 → cost ratio −0.028: PROMOTE.
    expect(result).toMatchObject({ disposition: 'PROMOTE', costAuthority: 'token-total',
      reasonCodes: ['thresholds_satisfied'] });
    expect(result.baseline).toMatchObject({ providerReportedUsd: null, providerReportedUsdPerLineage: null, costPerLineage: 125 });
    expect(result.candidate.costPerLineage).toBe(121.5);
    expect(result.deltas).toMatchObject({ providerReportedUsd: null, costPerLineage: -3.5 });
    expect(result.deltas.costPerLineageIncreaseRatio).toBeCloseTo(-0.028);
    expect(result.planDigest).not.toBe(digestPromptCostCanaryPlan(input));
    // Mixed evidence is refused in both directions — no silent blending.
    expect(() => comparePromptCostCanary({ ...tokenPlan,
      baseline: { ...tokenPlan.baseline, samples: [{ ...baselineSamples[0]!, providerReportedUsd: 2 }] } }))
      .toThrow(/must be null \(subscription-unpriced\)/u);
    expect(() => comparePromptCostCanary({ ...input,
      baseline: { ...input.baseline, samples: unpriced(baselineSamples) } }))
      .toThrow(/must be provider-reported/u);
  });

  it('waives the cache-regression guard only under a measured cost reduction, visibly and never the floor', () => {
    const input = plan();
    // Candidate: cheaper per lineage (USD 4→3) but cache-hit 0.55→0.25 — the
    // shrunken-prefix class. Guard waived with a typed reason; still PROMOTE.
    const cheaperLessCached = [
      { ...candidateSamples[0]!, cacheReadTokens: 20, inputTokens: 80, providerReportedUsd: 1.5 },
      { ...candidateSamples[1]!, cacheReadTokens: 30, inputTokens: 70, providerReportedUsd: 1.5 },
    ];
    const waived = comparePromptCostCanary({ ...input,
      thresholds: { ...input.thresholds, minimumCacheHitRatio: 0, maximumDurationPerLineageIncreaseRatio: undefined },
      candidate: { ...input.candidate, samples: cheaperLessCached } });
    expect(waived).toMatchObject({ disposition: 'PROMOTE',
      reasonCodes: ['thresholds_satisfied', 'cache_regression_waived_by_cost_reduction'] });
    // Same cache regression WITHOUT a cost win still rejects — the guard's
    // real target class is untouched, and the absolute floor is never waived.
    const pricier = cheaperLessCached.map(sample => ({ ...sample, providerReportedUsd: 3 }));
    expect(comparePromptCostCanary({ ...input,
      thresholds: { ...input.thresholds, minimumCacheHitRatio: 0, maximumDurationPerLineageIncreaseRatio: undefined },
      candidate: { ...input.candidate, samples: pricier } }).reasonCodes)
      .toContain('cache_hit_ratio_regression_exceeded');
    expect(comparePromptCostCanary({ ...input,
      thresholds: { ...input.thresholds, minimumCacheHitRatio: 0.7, maximumDurationPerLineageIncreaseRatio: undefined },
      candidate: { ...input.candidate, samples: cheaperLessCached } }).reasonCodes)
      .toContain('cache_hit_ratio_below_minimum');
  });

  it('rejects every failed promotion threshold with bounded reason codes', () => {
    const input = plan();
    const result = comparePromptCostCanary({ ...input, candidate: { ...input.candidate, samples: [
      { ...candidateSamples[0]!, inputTokens: 90, cacheReadTokens: 10, providerReportedUsd: 3,
        durationMs: 2_000, qualityVerdict: 'FAIL' },
      { ...candidateSamples[1]!, inputTokens: 90, cacheReadTokens: 10, providerReportedUsd: 3,
        durationMs: 3_000, qualityVerdict: 'PASS' },
    ] } });
    expect(result.disposition).toBe('REJECT');
    expect(result.reasonCodes).toEqual([
      'quality_below_minimum', 'quality_regression_exceeded', 'cost_increase_exceeded',
      'cache_hit_ratio_below_minimum', 'cache_hit_ratio_regression_exceeded', 'duration_increase_exceeded',
    ]);
  });

  it('holds incomparable cohorts before applying thresholds', () => {
    const input = plan();
    const result = comparePromptCostCanary({
      ...input,
      candidate: {
        identity: { ...input.candidate.identity, providerId: 'other-provider', modelId: 'other-model',
          billingClass: 'subscription', featureId: 'other-feature' },
        samples: input.candidate.samples.slice(0, 1),
      },
    });
    expect(result.disposition).toBe('HOLD');
    expect(result.reasonCodes).toEqual([
      'provider_mismatch', 'model_mismatch', 'billing_mismatch', 'feature_mismatch', 'lineage_set_mismatch',
    ]);
  });

  it('holds empty evidence and validates malformed or duplicate samples', () => {
    const input = plan();
    expect(comparePromptCostCanary({ ...input, baseline: { ...input.baseline, samples: [] } })).toMatchObject({
      disposition: 'HOLD', reasonCodes: [
        'empty_baseline_cohort', 'lineage_set_mismatch', 'duration_measurement_unavailable',
      ],
    });
    expect(() => comparePromptCostCanary({ ...input, baseline: {
      ...input.baseline, samples: [baselineSamples[0]!, baselineSamples[0]!],
    } })).toThrow(/duplicate logicalLineageId/u);
    expect(() => comparePromptCostCanary({ ...input, candidate: { ...input.candidate, samples: [
      { ...candidateSamples[0]!, providerReportedUsd: Number.NaN }, candidateSamples[1]!,
    ] } })).toThrow(/providerReportedUsd/u);
  });

  it('canonicalizes object keys and sample order for stable plan and decision digests', () => {
    const first = plan();
    const reordered: PromptCostCanaryPlan = {
      thresholds: { ...first.thresholds }, candidate: { ...first.candidate, samples: [...first.candidate.samples].reverse() },
      baseline: { ...first.baseline, samples: [...first.baseline.samples].reverse() }, version: 1,
    };
    expect(digestPromptCostCanaryPlan(reordered)).toBe(digestPromptCostCanaryPlan(first));
    expect(comparePromptCostCanary(reordered).decisionDigest).toBe(comparePromptCostCanary(first).decisionDigest);
  });

  it('never substitutes a reference price and treats measured cost from zero as an unbounded increase', () => {
    const input = plan();
    const zeroBaseline = input.baseline.samples.map(sample => ({ ...sample, providerReportedUsd: 0 }));
    const result = comparePromptCostCanary({ ...input, baseline: { ...input.baseline, samples: zeroBaseline } });
    expect(result.deltas.costPerLineageIncreaseRatio).toBe(Number.POSITIVE_INFINITY);
    expect(result).toMatchObject({ disposition: 'REJECT', reasonCodes: ['cost_increase_exceeded'] });
  });

  it('accepts unavailable duration unless a duration threshold explicitly requires it', () => {
    const input = plan();
    const withoutDuration = (samples: readonly PromptCostCanarySample[]) =>
      samples.map(({ durationMs: _durationMs, ...sample }) => sample);
    const noDurationPlan: PromptCostCanaryPlan = {
      ...input,
      baseline: { ...input.baseline, samples: withoutDuration(input.baseline.samples) },
      candidate: { ...input.candidate, samples: withoutDuration(input.candidate.samples) },
      thresholds: { ...input.thresholds, maximumDurationPerLineageIncreaseRatio: undefined },
    };
    const accepted = comparePromptCostCanary(noDurationPlan);
    expect(accepted.disposition).toBe('PROMOTE');
    expect(accepted.baseline).toMatchObject({ durationMs: null, durationSampleCount: 0 });
    expect(accepted.deltas.durationPerLineageIncreaseRatio).toBeNull();

    expect(comparePromptCostCanary({
      ...noDurationPlan,
      thresholds: { ...noDurationPlan.thresholds, maximumDurationPerLineageIncreaseRatio: 0 },
    })).toMatchObject({ disposition: 'HOLD', reasonCodes: ['duration_measurement_unavailable'] });
  });
});
