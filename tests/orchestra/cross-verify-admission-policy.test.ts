import { describe, expect, it } from 'vitest';

import {
  decideCrossVerifyAdmissions,
  type CrossVerifyAdmissionCandidate,
} from '../../src/orchestra/cross-verify-admission-policy.js';

function candidate(overrides: Partial<CrossVerifyAdmissionCandidate> = {}): CrossVerifyAdmissionCandidate {
  return {
    taskId: 'task-a',
    logicalLineageId: 'lineage-a',
    producerProvider: 'producer-alpha',
    verifierAuthority: {
      state: 'available',
      provider: 'verifier-bravo',
      evidenceRef: 'authority:verifier-bravo',
    },
    riskScore: 5,
    materialityScore: 5,
    estimatedVerificationCost: 2,
    ...overrides,
  };
}

const policy = {
  minimumMaterialityScore: 3,
  maxVerifications: 2,
  finiteBudget: 5,
} as const;

describe('decideCrossVerifyAdmissions', () => {
  it('admits only bounded material lineages in risk then materiality order', () => {
    const result = decideCrossVerifyAdmissions({
      policy,
      verifiedLineageIds: [],
      candidates: [
        candidate({ taskId: 'lower-risk', logicalLineageId: 'lineage-lower', riskScore: 4 }),
        candidate({ taskId: 'highest-material', logicalLineageId: 'lineage-high-material', riskScore: 8, materialityScore: 7 }),
        candidate({ taskId: 'highest-risk', logicalLineageId: 'lineage-high-risk', riskScore: 8, materialityScore: 8 }),
      ],
    });

    expect(result.decisions.map(({ candidate: value, status, reasonCode }) => ({
      taskId: value.taskId, status, reasonCode,
    }))).toEqual([
      { taskId: 'lower-risk', status: 'deferred-by-policy', reasonCode: 'XVERIFY_MAX_VERIFICATIONS_REACHED' },
      { taskId: 'highest-material', status: 'admitted', reasonCode: 'XVERIFY_ADMITTED' },
      { taskId: 'highest-risk', status: 'admitted', reasonCode: 'XVERIFY_ADMITTED' },
    ]);
    expect(result).toMatchObject({ admittedCount: 2, admittedCost: 4 });
  });

  it('de-duplicates already verified and competing logical lineages', () => {
    const result = decideCrossVerifyAdmissions({
      policy,
      verifiedLineageIds: ['lineage-settled'],
      candidates: [
        candidate({ taskId: 'already-verified', logicalLineageId: 'lineage-settled', riskScore: 10 }),
        candidate({ taskId: 'lineage-winner', logicalLineageId: 'lineage-active', riskScore: 9 }),
        candidate({ taskId: 'lineage-duplicate', logicalLineageId: 'lineage-active', riskScore: 8 }),
      ],
    });

    expect(result.decisions.map(({ status, reasonCode }) => ({ status, reasonCode }))).toEqual([
      { status: 'deferred-by-policy', reasonCode: 'XVERIFY_LINEAGE_ALREADY_VERIFIED' },
      { status: 'admitted', reasonCode: 'XVERIFY_ADMITTED' },
      { status: 'deferred-by-policy', reasonCode: 'XVERIFY_LINEAGE_DEDUPLICATED' },
    ]);
  });

  it('fails closed for unavailable or same-provider verifier authority', () => {
    const result = decideCrossVerifyAdmissions({
      policy,
      verifiedLineageIds: [],
      candidates: [
        candidate({
          taskId: 'unavailable',
          logicalLineageId: 'lineage-unavailable',
          verifierAuthority: { state: 'unavailable', evidenceRef: 'authority:missing' },
        }),
        candidate({
          taskId: 'same-provider',
          logicalLineageId: 'lineage-same-provider',
          verifierAuthority: {
            state: 'available', provider: 'producer-alpha', evidenceRef: 'authority:same-provider',
          },
        }),
      ],
    });

    expect(result.decisions.map(({ status, reasonCode }) => ({ status, reasonCode }))).toEqual([
      { status: 'unavailable-authority', reasonCode: 'XVERIFY_VERIFIER_AUTHORITY_UNAVAILABLE' },
      { status: 'unavailable-authority', reasonCode: 'XVERIFY_SAME_PROVIDER_VERIFIER' },
    ]);
    expect(result.admittedCount).toBe(0);
  });

  it('distinguishes materiality policy, bounded count, and finite budget exhaustion', () => {
    const result = decideCrossVerifyAdmissions({
      policy: { minimumMaterialityScore: 3, maxVerifications: 2, finiteBudget: 3 },
      verifiedLineageIds: [],
      candidates: [
        candidate({ taskId: 'not-material', logicalLineageId: 'lineage-not-material', materialityScore: 2, riskScore: 10 }),
        candidate({ taskId: 'within-budget', logicalLineageId: 'lineage-within-budget', riskScore: 9, estimatedVerificationCost: 2 }),
        candidate({ taskId: 'over-budget', logicalLineageId: 'lineage-over-budget', riskScore: 8, estimatedVerificationCost: 2 }),
      ],
    });

    expect(result.decisions.map(({ status, reasonCode }) => ({ status, reasonCode }))).toEqual([
      { status: 'deferred-by-policy', reasonCode: 'XVERIFY_NOT_MATERIAL' },
      { status: 'admitted', reasonCode: 'XVERIFY_ADMITTED' },
      { status: 'budget-exhausted', reasonCode: 'XVERIFY_FINITE_BUDGET_EXHAUSTED' },
    ]);
  });

  it('rejects malformed policy input without admitting a candidate', () => {
    const result = decideCrossVerifyAdmissions({
      policy: { minimumMaterialityScore: 1, maxVerifications: 1.5, finiteBudget: 10 },
      verifiedLineageIds: [],
      candidates: [candidate()],
    });

    expect(result.decisions).toMatchObject([
      { status: 'deferred-by-policy', reasonCode: 'XVERIFY_POLICY_INVALID' },
    ]);
    expect(result.admittedCount).toBe(0);
  });
});
