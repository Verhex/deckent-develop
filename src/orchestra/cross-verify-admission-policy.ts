/**
 * Pure, provider-neutral admission policy for cross-provider verification.
 *
 * This module only classifies candidates. It neither resolves authority nor
 * dispatches a verifier, and it never changes the producer result.
 */

export type CrossVerifyAdmissionStatus =
  | 'admitted'
  | 'deferred-by-policy'
  | 'unavailable-authority'
  | 'budget-exhausted';

export type CrossVerifyAdmissionReasonCode =
  | 'XVERIFY_ADMITTED'
  | 'XVERIFY_POLICY_INVALID'
  | 'XVERIFY_CANDIDATE_INVALID'
  | 'XVERIFY_NOT_MATERIAL'
  | 'XVERIFY_LINEAGE_ALREADY_VERIFIED'
  | 'XVERIFY_LINEAGE_DEDUPLICATED'
  | 'XVERIFY_MAX_VERIFICATIONS_REACHED'
  | 'XVERIFY_VERIFIER_AUTHORITY_UNAVAILABLE'
  | 'XVERIFY_SAME_PROVIDER_VERIFIER'
  | 'XVERIFY_FINITE_BUDGET_EXHAUSTED';

export type CrossVerifyVerifierAuthority =
  | {
      readonly state: 'available';
      readonly provider: string;
      readonly evidenceRef: string;
    }
  | {
      readonly state: 'unavailable';
      readonly evidenceRef: string;
    };

export interface CrossVerifyAdmissionCandidate {
  readonly taskId: string;
  readonly logicalLineageId: string;
  readonly producerProvider: string;
  readonly verifierAuthority: CrossVerifyVerifierAuthority;
  readonly riskScore: number;
  readonly materialityScore: number;
  readonly estimatedVerificationCost: number;
}

export interface CrossVerifyAdmissionPolicy {
  readonly minimumMaterialityScore: number;
  readonly maxVerifications: number;
  readonly finiteBudget: number;
}

export interface CrossVerifyAdmissionInput {
  readonly policy: CrossVerifyAdmissionPolicy;
  readonly candidates: readonly CrossVerifyAdmissionCandidate[];
  readonly verifiedLineageIds: readonly string[];
}

export interface CrossVerifyAdmissionDecision {
  readonly candidate: CrossVerifyAdmissionCandidate;
  readonly status: CrossVerifyAdmissionStatus;
  readonly reasonCode: CrossVerifyAdmissionReasonCode;
}

export interface CrossVerifyAdmissionResult {
  readonly decisions: readonly CrossVerifyAdmissionDecision[];
  readonly admittedCount: number;
  readonly admittedCost: number;
}

interface RankedCandidate {
  readonly candidate: CrossVerifyAdmissionCandidate;
  readonly index: number;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function hasValidPolicy(policy: CrossVerifyAdmissionPolicy): boolean {
  return isFiniteNonNegative(policy.minimumMaterialityScore)
    && Number.isSafeInteger(policy.maxVerifications)
    && policy.maxVerifications >= 0
    && isFiniteNonNegative(policy.finiteBudget);
}

function hasValidCandidate(candidate: CrossVerifyAdmissionCandidate): boolean {
  return candidate.taskId.length > 0
    && candidate.logicalLineageId.length > 0
    && candidate.producerProvider.length > 0
    && isFiniteNonNegative(candidate.riskScore)
    && isFiniteNonNegative(candidate.materialityScore)
    && isFiniteNonNegative(candidate.estimatedVerificationCost);
}

function rankCandidates(left: RankedCandidate, right: RankedCandidate): number {
  const byRisk = right.candidate.riskScore - left.candidate.riskScore;
  if (byRisk !== 0) return byRisk;

  const byMateriality = right.candidate.materialityScore - left.candidate.materialityScore;
  if (byMateriality !== 0) return byMateriality;

  const byLineage = left.candidate.logicalLineageId.localeCompare(right.candidate.logicalLineageId);
  if (byLineage !== 0) return byLineage;

  const byTask = left.candidate.taskId.localeCompare(right.candidate.taskId);
  return byTask !== 0 ? byTask : left.index - right.index;
}

function decision(
  candidate: CrossVerifyAdmissionCandidate,
  status: CrossVerifyAdmissionStatus,
  reasonCode: CrossVerifyAdmissionReasonCode,
): CrossVerifyAdmissionDecision {
  return Object.freeze({ candidate, status, reasonCode });
}

/**
 * Selects bounded, material candidates in risk/materiality order.
 *
 * A candidate with unavailable verifier authority or a verifier that matches the
 * producer provider cannot be admitted. The policy deliberately does not seek a
 * fallback verifier: that authority belongs to the caller's exact ingress.
 */
export function decideCrossVerifyAdmissions(
  input: CrossVerifyAdmissionInput,
): CrossVerifyAdmissionResult {
  if (!hasValidPolicy(input.policy)) {
    return Object.freeze({
      decisions: input.candidates.map((candidate) => decision(
        candidate,
        'deferred-by-policy',
        'XVERIFY_POLICY_INVALID',
      )),
      admittedCount: 0,
      admittedCost: 0,
    });
  }

  const decisions = new Array<CrossVerifyAdmissionDecision | undefined>(input.candidates.length);
  const verifiedLineages = new Set(input.verifiedLineageIds);
  const selectable: RankedCandidate[] = [];

  input.candidates.forEach((candidate, index) => {
    if (!hasValidCandidate(candidate)) {
      decisions[index] = decision(candidate, 'deferred-by-policy', 'XVERIFY_CANDIDATE_INVALID');
    } else if (candidate.materialityScore < input.policy.minimumMaterialityScore) {
      decisions[index] = decision(candidate, 'deferred-by-policy', 'XVERIFY_NOT_MATERIAL');
    } else if (verifiedLineages.has(candidate.logicalLineageId)) {
      decisions[index] = decision(candidate, 'deferred-by-policy', 'XVERIFY_LINEAGE_ALREADY_VERIFIED');
    } else if (candidate.verifierAuthority.state === 'unavailable') {
      decisions[index] = decision(
        candidate,
        'unavailable-authority',
        'XVERIFY_VERIFIER_AUTHORITY_UNAVAILABLE',
      );
    } else if (candidate.verifierAuthority.provider === candidate.producerProvider) {
      decisions[index] = decision(
        candidate,
        'unavailable-authority',
        'XVERIFY_SAME_PROVIDER_VERIFIER',
      );
    } else {
      selectable.push({ candidate, index });
    }
  });

  let admittedCount = 0;
  let admittedCost = 0;
  const selectedLineages = new Set<string>();

  for (const entry of selectable.sort(rankCandidates)) {
    const { candidate, index } = entry;
    if (selectedLineages.has(candidate.logicalLineageId)) {
      decisions[index] = decision(candidate, 'deferred-by-policy', 'XVERIFY_LINEAGE_DEDUPLICATED');
    } else if (admittedCount >= input.policy.maxVerifications) {
      decisions[index] = decision(candidate, 'deferred-by-policy', 'XVERIFY_MAX_VERIFICATIONS_REACHED');
    } else if (candidate.estimatedVerificationCost > input.policy.finiteBudget - admittedCost) {
      decisions[index] = decision(candidate, 'budget-exhausted', 'XVERIFY_FINITE_BUDGET_EXHAUSTED');
    } else {
      selectedLineages.add(candidate.logicalLineageId);
      admittedCount += 1;
      admittedCost += candidate.estimatedVerificationCost;
      decisions[index] = decision(candidate, 'admitted', 'XVERIFY_ADMITTED');
    }
  }

  return Object.freeze({
    decisions: decisions as readonly CrossVerifyAdmissionDecision[],
    admittedCount,
    admittedCost,
  });
}
