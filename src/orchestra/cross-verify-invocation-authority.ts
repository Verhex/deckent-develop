import { createHash } from 'node:crypto';

import type {
  HostRoleInvocationCandidateAuthority,
  HostRoleVerifierCandidateProjection,
} from '../core/host-role-invocation-admission-runtime.js';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationReceipt,
  type InvocationReceiptLedger,
} from '../core/invocation-receipt.js';
import {
  assertOpaqueEvidenceRef,
  assertOpaqueSha256,
} from '../core/provider-truth.js';
import { modelRegistry } from '../core/model-registry.js';
import type { VerifierEligibilityCandidate } from '../core/cross-verify.js';
import type { CrossVerifyInvocationReceiptContext } from './cross-verify-runner.js';

export interface CrossVerifyInvocationProjectionInput {
  readonly projection: Extract<HostRoleVerifierCandidateProjection, { state: 'ready' }>;
  readonly ledger: InvocationReceiptLedger;
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  /** Original task id; the receipt is bound to `${taskId}-xverify`. */
  readonly taskId: string;
  readonly attempt: number;
  /** Durable provider/runtime attempt identity; distinct from the ordinal attempt. */
  readonly attemptId: string;
  /** Host-only claim fence digest. The raw fence token is never projected. */
  readonly fenceTokenHash: string;
  readonly createdAt: string;
}

export interface CrossVerifyInvocationIdentity {
  readonly invocationId: string;
  readonly idempotencyKey: string;
  readonly callId: string;
  readonly receiptRef: string;
}

export type CrossVerifyInvocationProjectionResult =
  | {
      readonly state: 'ready';
      readonly authorityEvidenceRef: string;
      readonly identity: CrossVerifyInvocationIdentity;
      readonly binding: {
        readonly attemptId: string;
        readonly fenceTokenHash: string;
      };
      readonly candidateAuthority: HostRoleInvocationCandidateAuthority;
      readonly verifierCandidates: readonly [VerifierEligibilityCandidate];
      readonly invocationReceipt: CrossVerifyInvocationReceiptContext;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'scope_invalid'
        | 'project_identity_mismatch'
        | 'candidate_identity_invalid'
        | 'candidate_evidence_invalid';
      readonly authorityEvidenceRef: string;
    };

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

function evidenceRef(kind: string, ...parts: readonly string[]): string {
  return `xverify-invocation-authority:${digest(kind, ...parts)}`;
}

export function deriveCrossVerifyInvocationIdentity(input: {
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly attempt: number;
  readonly attemptId: string;
  readonly fenceTokenHash: string;
}): CrossVerifyInvocationIdentity {
  const identityDigest = digest(
    input.tenantId,
    input.projectId,
    input.runId,
    input.taskId,
    String(input.attempt),
    input.attemptId,
    input.fenceTokenHash,
    'auditor',
    'audit-evaluation',
  );
  return Object.freeze({
    invocationId: `xverify-invocation-${identityDigest}`,
    idempotencyKey: `xverify-idempotency-${identityDigest}`,
    callId: `xverify-call-${identityDigest}`,
    receiptRef: `invocation-receipt:${identityDigest}`,
  });
}

export function deriveCrossVerifyReservationIdentity(
  identity: CrossVerifyInvocationIdentity,
  provider: string,
  model: string,
): { readonly reservationId: string; readonly idempotencyKey: string } {
  const reservationDigest = digest(
    identity.invocationId,
    identity.callId,
    provider,
    model,
  );
  return Object.freeze({
    reservationId: `xverify-reservation-${reservationDigest}`,
    idempotencyKey: `xverify-reservation-idempotency-${reservationDigest}`,
  });
}

function exactIdentity(value: string): boolean {
  return value.length > 0
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function candidateIsCanonical(candidate: VerifierEligibilityCandidate): boolean {
  const definition = modelRegistry.get(candidate.model);
  if (!definition
    || definition.id !== definition.apiId
    || definition.provider !== candidate.provider
    || candidate.reachability.state !== 'known'
    || candidate.reachability.reachable !== true
    || candidate.reachability.evidenceRef === null
    || candidate.limits.state !== 'known'
    || candidate.limits.limited
    || candidate.limits.evidenceRefs.length === 0
    || candidate.backend.executionBackend === 'unknown'
    || !exactIdentity(candidate.backend.executionProfileRef)) {
    return false;
  }
  try {
    if (candidate.auth.mode !== 'local') {
      assertOpaqueSha256('verifier accountRefHash', candidate.auth.accountRefHash, true);
    } else if (candidate.auth.accountRefHash !== null) {
      assertOpaqueSha256('local verifier accountRefHash', candidate.auth.accountRefHash, false);
    }
    assertOpaqueSha256('verifier endpointRefHash', candidate.backend.endpointRefHash, false);
    assertOpaqueEvidenceRef(
      'verifier reachability evidence',
      candidate.reachability.evidenceRef,
      true,
    );
    for (const ref of candidate.limits.evidenceRefs) {
      assertOpaqueEvidenceRef('verifier limit evidence', ref, true);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the immutable single-candidate receipt projection consumed by
 * `runCrossVerify`.
 *
 * This function does not declare the receipt, reserve provider capacity or
 * grant dispatch. The runner owns declaration/events; the later provider-limit
 * coordinator owns reservation and actual-usage settlement.
 */
export function projectCrossVerifyInvocation(
  input: CrossVerifyInvocationProjectionInput,
): CrossVerifyInvocationProjectionResult {
  if (!exactIdentity(input.tenantId)
    || !exactIdentity(input.runId)
    || !exactIdentity(input.taskId)
    || !exactIdentity(input.attemptId)
    || !Number.isSafeInteger(input.attempt)
    || input.attempt < 1
    || !/^[a-f0-9]{64}$/u.test(input.fenceTokenHash)
    || !canonicalTimestamp(input.createdAt)) {
    return {
      state: 'hold',
      reasonCode: 'scope_invalid',
      authorityEvidenceRef: evidenceRef('scope-invalid', input.runId, input.taskId),
    };
  }
  if (input.projectId !== input.ledger.projectId) {
    return {
      state: 'hold',
      reasonCode: 'project_identity_mismatch',
      authorityEvidenceRef: evidenceRef(
        'project-identity-mismatch',
        input.projectId,
        input.ledger.projectId,
      ),
    };
  }

  const { candidate } = input.projection;
  if (!candidateIsCanonical(candidate)) {
    return {
      state: 'hold',
      reasonCode: 'candidate_identity_invalid',
      authorityEvidenceRef: evidenceRef(
        'candidate-identity-invalid',
        String(candidate.provider),
        candidate.model,
      ),
    };
  }
  try {
    assertOpaqueEvidenceRef(
      'host candidate projection authority',
      input.projection.authorityEvidenceRef,
      true,
    );
  } catch {
    return {
      state: 'hold',
      reasonCode: 'candidate_evidence_invalid',
      authorityEvidenceRef: evidenceRef('candidate-evidence-invalid', candidate.model),
    };
  }

  const identity = deriveCrossVerifyInvocationIdentity(input);
  const selection = Object.freeze({
    provider: candidate.provider,
    model: candidate.model,
    source: 'config' as const,
    reasonCode: 'none' as const,
  });
  const receipt: InvocationReceipt = Object.freeze({
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: identity.invocationId,
    idempotencyKey: identity.idempotencyKey,
    tenantId: input.tenantId,
    projectId: input.projectId,
    runId: input.runId,
    taskId: `${input.taskId}-xverify`,
    callId: identity.callId,
    role: 'auditor',
    purpose: 'audit-evaluation',
    configured: selection,
    requested: Object.freeze({ ...selection, source: 'directive' as const }),
    resolved: Object.freeze({ ...selection, source: 'router' as const }),
    called: Object.freeze({ ...selection, source: 'wire' as const }),
    backend: Object.freeze({
      transport: candidate.backend.transport,
      executionBackend: candidate.backend.executionBackend,
    }),
    auth: Object.freeze({ ...candidate.auth }),
    fallbackChain: Object.freeze([]),
    reachability: Object.freeze({
      state: candidate.reachability.state,
      evidenceRef: candidate.reachability.evidenceRef,
    }),
    limits: Object.freeze({
      state: candidate.limits.state,
      evidenceRefs: Object.freeze([...candidate.limits.evidenceRefs]),
    }),
    createdAt: input.createdAt,
  });
  return {
    state: 'ready',
    authorityEvidenceRef: evidenceRef(
      'ready',
      input.projection.authorityEvidenceRef,
      identity.invocationId,
    ),
    identity,
    binding: Object.freeze({
      attemptId: input.attemptId,
      fenceTokenHash: input.fenceTokenHash,
    }),
    candidateAuthority: input.projection.authority,
    verifierCandidates: Object.freeze([candidate]) as readonly [VerifierEligibilityCandidate],
    invocationReceipt: Object.freeze({
      ledger: input.ledger,
      receipt,
      attempt: input.attempt,
    }),
  };
}
