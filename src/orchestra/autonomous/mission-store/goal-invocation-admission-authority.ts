import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../core/audit-writer.js';
import type { GoalPurposeAdmissionDecision } from '../../../core/execution-budget-policy.js';
import type {
  HostRoleInvocationAdmissionRequest,
  HostRoleInvocationAdmissionResult,
  HostRoleInvocationAdmissionRuntime,
  HostRoleInvocationNonReservableSubscription,
  HostRoleVerifierCandidateProjection,
} from '../../../core/host-role-invocation-admission-runtime.js';
import { resolveRoleInvocation } from '../../../core/role-invocation-resolver.js';
import type { GoalInvocationEstimateProjection } from './goal-invocation-budget-authority.js';
import { GoalInvocationHeldError } from './goal-mission.js';

function goalPurposeAdmissionEvidenceRef(detail: unknown): string {
  return `goal-purpose-admission:${createHash('sha256').update(canonicalJson(detail)).digest('hex')}`;
}

function goalLimitHold(
  purposeAdmission: GoalPurposeAdmissionDecision,
  detail: unknown,
): GoalInvocationHeldError {
  const evidenceRef = goalPurposeAdmissionEvidenceRef(
    purposeAdmission.state === 'available'
      ? { policyDigest: purposeAdmission.policyDigest, detail }
      : { profileRef: purposeAdmission.profileRef, reasonCode: purposeAdmission.reasonCode, detail },
  );
  return new GoalInvocationHeldError({
    schemaVersion: 1,
    reasonCode: 'reservation_not_executable',
    providerAuthorityReasonCode: 'goal_limit_unit_unreservable',
    evidenceRefs: [evidenceRef],
    invocationReceiptRef: null,
    heldAt: new Date().toISOString(),
  });
}

/**
 * Goal-specific admission authority: reserved arm delegates byte-identically to
 * {@link HostRoleInvocationAdmissionRuntime.admit}; the non-reservable subscription
 * arm mirrors cross-verify ingress without calling buildReservation.
 */
export function admitGoalInvocation(input: {
  readonly admissionRuntime: HostRoleInvocationAdmissionRuntime;
  readonly admission: HostRoleInvocationAdmissionRequest;
  readonly estimates: GoalInvocationEstimateProjection;
  readonly projection: HostRoleVerifierCandidateProjection;
  readonly authMode: 'subscription' | 'api' | 'oauth' | 'local' | 'unknown';
  readonly purposeAdmission: GoalPurposeAdmissionDecision;
  readonly provider: string;
  readonly model: string;
}): HostRoleInvocationAdmissionResult {
  if (input.estimates.state === 'ready') {
    return input.admissionRuntime.admit(input.admission);
  }
  if (input.projection.state !== 'ready') {
    throw goalLimitHold(input.purposeAdmission, {
      gate: 'projection-not-ready',
      reason: input.projection.reasonCode,
    });
  }
  if (input.projection.authority.provider !== input.provider) {
    throw goalLimitHold(input.purposeAdmission, {
      gate: 'projection-provider-mismatch',
      expected: input.provider,
      actual: input.projection.authority.provider,
    });
  }
  const candidate = input.projection.candidate;
  const windows = input.projection.requiredWindows;
  const nonReservableBaseEligible = input.estimates.state === 'hold'
    && input.estimates.reasonCode === 'goal_invocation_budget_unit_unsupported'
    && input.authMode === 'subscription'
    && windows.length > 0
    && windows.every(window => window.unit === 'percent')
    && candidate.limits.limited === false
    && candidate.reachability.reachable === true
    && candidate.reachability.evidenceRef !== null;
  if (!nonReservableBaseEligible) {
    throw goalLimitHold(input.purposeAdmission, {
      gate: 'non-reservable-preconditions',
      estimates: input.estimates.reasonCode,
      authMode: input.authMode,
    });
  }
  if (input.purposeAdmission.state !== 'available') {
    throw goalLimitHold(input.purposeAdmission, {
      gate: 'purpose-admission',
      reason: input.purposeAdmission.reasonCode,
    });
  }
  const resolution = resolveRoleInvocation({
    ...input.admission.invocation,
    evidence: {
      [input.provider]: {
        reachability: candidate.reachability,
        limits: candidate.limits,
      },
    },
  });
  if (!resolution.selected) {
    throw goalLimitHold(input.purposeAdmission, { gate: 'role-resolution-empty' });
  }
  const admission: HostRoleInvocationNonReservableSubscription = {
    decision: 'non_reservable_subscription',
    reservation: null,
    attempts: [],
    authorityEvidenceRef: goalPurposeAdmissionEvidenceRef({
      provider: input.provider,
      model: input.model,
      purposeAdmission: input.purposeAdmission.profileRef,
      policyDigest: input.purposeAdmission.policyDigest,
      candidateAuthorityEvidenceRef: input.projection.authorityEvidenceRef,
    }),
    basis: {
      advisoryLimitEvidenceRefs: candidate.limits.evidenceRefs,
      ownerBoundRef: `config:${input.purposeAdmission.profileRef}`,
      requiredWindows: windows.map(window => ({
        windowId: window.windowId,
        unit: 'percent' as const,
        model: window.model,
      })),
    },
    resolution,
  };
  return admission;
}
