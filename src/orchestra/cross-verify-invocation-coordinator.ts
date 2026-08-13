import { createHash } from 'node:crypto';

import { canonicalJson } from '../core/audit-writer.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import { debugLog } from '../core/utils.js';
import {
  assertCrossVerifyEnforcedAttemptContract,
  sameCrossVerifyExecutionContract,
  type CrossVerifyEnforcedAttemptContract,
} from '../core/cross-verify-execution-contract.js';
import {
  type HostRoleInvocationAdmissionRequest,
  type HostRoleInvocationAdmissionResult,
  type HostRoleInvocationNonReservableSubscription,
  HostRoleInvocationAdmissionRuntime,
} from '../core/host-role-invocation-admission-runtime.js';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationEvent,
  type InvocationReceipt,
  type InvocationReceiptRef,
} from '../core/invocation-receipt.js';
import type { ProviderLimitAdmissionAllowed } from '../core/provider-limit-admission.js';
import type { ProviderLimitExecutionGrant } from '../core/provider-limit-store.js';
import {
  assertProviderLimitReservationEvent,
  type ProviderLimitReservation,
  type ProviderLimitReservationEvent,
} from '../core/provider-limit-truth.js';
import {
  assertCanonicalModelApiId,
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
} from '../core/provider-truth.js';
import type { RoleInvocationSelected } from '../core/role-invocation-resolver.js';
import type { CrossVerifyExecutionEvidence } from '../core/task-types.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import {
  deriveCrossVerifyReservationIdentity,
  type CrossVerifyInvocationProjectionResult,
} from './cross-verify-invocation-authority.js';

type ReadyProjection = Extract<CrossVerifyInvocationProjectionResult, { state: 'ready' }>;
type DispatchEvent = ProviderLimitReservationEvent & { readonly type: 'dispatched' };
type SettlementEvent = ProviderLimitReservationEvent & { readonly type: 'consumed' | 'released' };
type TransportEvent = Extract<InvocationEvent, { type: 'transport_settled' }>;
type ConsumerEvent = Extract<InvocationEvent, { type: 'consumer_settled' }>;

interface CrossVerifyExecutionGrantCommon {
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly callId: string;
  readonly attemptId: string;
  readonly fenceTokenHash: string;
  readonly provider: string;
  readonly model: string;
  readonly receiptRef: InvocationReceiptRef;
  /** The canonical invocation-receipt ref string (`invocation-receipt:…`) —
   *  identical on both arms; the non-reservable termination binding reads it. */
  readonly invocationReceiptRef: string;
  readonly backend: ProviderLimitReservation['backend'] & {
    readonly executionProfileRef: string;
  };
  readonly auth: {
    readonly mode: ProviderLimitReservation['authMode'];
    readonly accountRefHash: string | null;
  };
  readonly executionContract: Readonly<CrossVerifyEnforcedAttemptContract>;
  /** Dispatch evidence ref: the reservation-ledger `dispatched` event (reserved)
   *  or the invocation-ledger `dispatch_started` event (non-reservable). */
  readonly dispatchEventRef: string;
  readonly dispatchEventHash: string;
}

/** Reserved arm — carries the numeric reservation; byte-identical to the prior grant. */
export interface CrossVerifyReservedExecutionGrant
extends CrossVerifyExecutionGrantCommon, ProviderLimitExecutionGrant {
  readonly admissionMode: 'reserved';
  readonly reservation: Readonly<ProviderLimitReservation>;
}

/**
 * Non-reservable subscription arm — NO numeric reservation and NO reservation
 * identity is fabricated. There is no `reservationId`; the dispatch is keyed by
 * the invocation-ledger event and the grant's own identity fields.
 */
export interface CrossVerifyNonReservableExecutionGrant extends CrossVerifyExecutionGrantCommon {
  readonly admissionMode: 'non_reservable_subscription';
  readonly reservation: null;
}

export type CrossVerifyInvocationExecutionGrant =
  | CrossVerifyReservedExecutionGrant
  | CrossVerifyNonReservableExecutionGrant;

export interface CrossVerifyActualCallEvidence {
  readonly provider: string;
  readonly model: string;
  readonly backend: CrossVerifyInvocationExecutionGrant['backend'];
  readonly auth: CrossVerifyInvocationExecutionGrant['auth'];
  readonly evidenceRef: string;
}

export interface CrossVerifyTerminalEvidenceBundle {
  readonly output: string;
  /**
   * Null means the host proved no provider call identity. Only a separately
   * verified `released` settlement may close that reservation.
   */
  readonly actualCall: CrossVerifyActualCallEvidence | null;
  readonly execution: CrossVerifyExecutionEvidence;
  readonly lineage: {
    readonly coverage: 'complete' | 'partial';
    readonly attemptIds: readonly string[];
    readonly settlementEvidenceRefs: readonly string[];
  };
  readonly usageEvidenceRefs: readonly string[];
  readonly transportEvent: TransportEvent;
  readonly consumerEvent: ConsumerEvent;
}

export type CrossVerifyProviderUsageProjection =
  | {
      readonly state: 'settled';
      readonly event: SettlementEvent;
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'usage_evidence_missing'
        | 'usage_lineage_partial'
        | 'window_mapper_unavailable'
        | 'window_scope_mismatch'
        | 'actual_call_mismatch'
        | 'termination_unverified'
        | 'authority_failure';
      readonly authorityEvidenceRef: string;
    };

export type CrossVerifyNonReservableUsageProjection =
  | {
      readonly state: 'settled';
      /**
       * Real, transport-reported usage counters (e.g. total tokens). No usd on a
       * subscription; no estimate- or reservation-derived amount. No provider
       * limit reservation event is produced (there is no reservation to settle).
       */
      readonly usage: {
        readonly totalTokens: number;
        readonly inputTokens: number | null;
        readonly outputTokens: number | null;
      };
      readonly usageEvidenceRef: string;
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'usage_unavailable'
        | 'usage_lineage_partial'
        | 'actual_call_mismatch'
        | 'termination_unverified'
        | 'authority_failure';
      readonly authorityEvidenceRef: string;
    };

export type CrossVerifyProviderUsagePreflight =
  | {
      readonly state: 'ready';
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'window_mapper_unavailable'
        | 'window_scope_mismatch'
        | 'authority_failure';
      readonly authorityEvidenceRef: string;
    };

export interface CrossVerifyProviderUsageAuthority {
  /**
   * Prove that every reserved window has a provider/account-specific terminal
   * mapper before the provider dispatch claim is opened.
   */
  preflight(input: {
    readonly reservation: ProviderLimitReservation;
    readonly executionProfileRef: string;
  }): CrossVerifyProviderUsagePreflight;
  project(input: {
    readonly grant: Readonly<CrossVerifyInvocationExecutionGrant>;
    readonly reservation: ProviderLimitReservation;
    readonly terminal: Readonly<CrossVerifyTerminalEvidenceBundle>;
  }): CrossVerifyProviderUsageProjection;
  /**
   * B2 — non-reservable subscription usage. Records ONLY what the canonical
   * transport actually reported (the terminal usage receipt); never derives an
   * amount from an estimate or reservation, and never fabricates a usd figure
   * for a subscription. Absent/malformed transport usage is a typed
   * `usage_unavailable` HOLD, not a silent zero.
   */
  projectNonReservable(input: {
    readonly grant: Readonly<CrossVerifyInvocationExecutionGrant>;
    readonly terminal: Readonly<CrossVerifyTerminalEvidenceBundle>;
  }): CrossVerifyNonReservableUsageProjection;
}

export interface CrossVerifyInvocationCoordinatorAuthorities {
  readonly admissionRuntime: HostRoleInvocationAdmissionRuntime;
  readonly usageAuthority: CrossVerifyProviderUsageAuthority;
  readonly observationAuthority: CrossVerifyHostObservationAuthority;
}

export interface CrossVerifyInvocationCoordinatorInput {
  readonly projection: ReadyProjection;
  readonly admission: HostRoleInvocationAdmissionRequest;
  readonly executionContract: Readonly<CrossVerifyEnforcedAttemptContract>;
  readonly executionRequest: Readonly<CrossVerifyStrictExecutionRequest>;
  readonly buildDispatchEvent: (admission: ProviderLimitAdmissionAllowed) => DispatchEvent;
  /**
   * Pre-built non-reservable subscription admission (advisory `percent`-only
   * windows under the owner flag). When present, the coordinator takes the
   * non-reservable branch: it does NOT call the reservation-producing admission
   * runtime, and no reservation-ledger event is ever emitted. Absent → the
   * byte-identical reserved path via `admissionRuntime.admit`.
   */
  readonly nonReservableAdmission?: HostRoleInvocationNonReservableSubscription;
  /** Re-read the host claim immediately before each irreversible boundary. */
  readonly isClaimActive: () => boolean;
}

export interface CrossVerifyStrictDispatchHandle {
  readonly settlementRef: Readonly<TaskResultSettlementRefV1>;
  readonly outputArtifactRef: string;
}

export interface CrossVerifyStrictExecutionRequest {
  readonly basePrompt: string;
  readonly dispatchedPrompt: string;
  readonly taskSnapshot: Readonly<Record<string, unknown>>;
}

export type CrossVerifyStrictLauncher = (
  grant: Readonly<CrossVerifyInvocationExecutionGrant>,
  request: Readonly<CrossVerifyStrictExecutionRequest>,
) => Promise<CrossVerifyStrictDispatchHandle>;

export type CrossVerifyHostObservation =
  | {
      readonly state: 'settled';
      readonly terminal: Readonly<CrossVerifyTerminalEvidenceBundle>;
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'actual_call_unproven'
        | 'provider_envelope_incomplete'
        | 'settlement_incomplete'
        | 'execution_lineage_partial'
        | 'authority_failure';
      readonly authorityEvidenceRef: string;
    };

export interface CrossVerifyHostObservationAuthority {
  observe(input: {
    readonly grant: Readonly<CrossVerifyInvocationExecutionGrant>;
    readonly reservation: ProviderLimitReservation | null;
    readonly dispatch: Readonly<CrossVerifyStrictDispatchHandle>;
  }): Promise<CrossVerifyHostObservation>;
}

export type CrossVerifyInvocationCoordinatorResult =
  | {
      readonly state: 'settled';
      readonly output: string;
      readonly execution: CrossVerifyExecutionEvidence;
      readonly invocationReceiptRef: InvocationReceiptRef;
      /** Null on a non-reservable subscription dispatch (no numeric reservation). */
      readonly providerLimitReservationId: string | null;
      readonly providerLimitDispatchEvidenceRef: string;
      /** Null on a non-reservable subscription dispatch (no reservation-ledger settlement). */
      readonly providerLimitSettlementEvidenceRef: string | null;
      /**
       * Real transport-reported usage evidence for a non-reservable dispatch
       * (B2). Null on the reserved path, where usage settles through the
       * reservation-ledger `consumed` event instead.
       */
      readonly providerReportedUsageEvidenceRef: string | null;
      readonly executionContractEvidenceRef: string;
      readonly outputArtifactRef: string;
      readonly hostObservationEvidenceRef: string;
      readonly terminalSettlementRef: Readonly<TaskResultSettlementRefV1>;
      readonly calledProvider: string;
      readonly calledModel: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: string;
      readonly authorityEvidenceRef: string;
      readonly invocationReceiptRef: InvocationReceiptRef | null;
    }
  | {
      readonly state: 'reconciliation-required';
      readonly reasonCode: string;
      readonly authorityEvidenceRef: string;
      readonly invocationReceiptRef: InvocationReceiptRef | null;
      readonly providerLimitDispatchEvidenceRef: string;
      readonly providerLimitSettlementEvidenceRef?: string;
    };

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

function authorityEvidenceRef(kind: string, ...parts: readonly string[]): string {
  return `xverify-invocation-coordinator:${digest(kind, ...parts)}`;
}

function eventId(invocationId: string, phase: string): string {
  return `xverify-${phase}-${digest(invocationId, phase)}`;
}

function receiptRef(projection: ReadyProjection): InvocationReceiptRef {
  const receipt = projection.invocationReceipt.receipt;
  return {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    tenantId: receipt.tenantId,
    projectId: receipt.projectId,
    invocationId: receipt.invocationId,
  };
}

function hold(
  reasonCode: string,
  detail: string,
  ref: InvocationReceiptRef | null = null,
): Extract<CrossVerifyInvocationCoordinatorResult, { state: 'hold' }> {
  return {
    state: 'hold',
    reasonCode,
    authorityEvidenceRef: authorityEvidenceRef('hold', detail),
    invocationReceiptRef: ref,
  };
}

function reconciliationRequired(
  reasonCode: string,
  detail: string,
  ref: InvocationReceiptRef | null,
  dispatchEvidenceRef: string,
  settlementEvidenceRef?: string,
): Extract<CrossVerifyInvocationCoordinatorResult, { state: 'reconciliation-required' }> {
  return {
    state: 'reconciliation-required',
    reasonCode,
    authorityEvidenceRef: authorityEvidenceRef('reconciliation', detail),
    invocationReceiptRef: ref,
    providerLimitDispatchEvidenceRef: dispatchEvidenceRef,
    ...(settlementEvidenceRef
      ? { providerLimitSettlementEvidenceRef: settlementEvidenceRef }
      : {}),
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'unknown');
  }
  return error instanceof Error ? error.name : 'unknown';
}

function terminalProtocol(output: string): boolean {
  const last = output.trim().split(/\r?\n/u)
    .filter(line => line.trim().length > 0)
    .at(-1)?.trim() ?? '';
  return /^VERDICT:\s*(?:REFUTED|CONFIRMED|UNCLEAR)\s+.+$/iu.test(last);
}

function sameBackend(
  left: Pick<CrossVerifyInvocationExecutionGrant['backend'],
    'transport' | 'executionBackend' | 'endpointRefHash'>,
  right: Pick<CrossVerifyInvocationExecutionGrant['backend'],
    'transport' | 'executionBackend' | 'endpointRefHash'>,
): boolean {
  return left.transport === right.transport
    && left.executionBackend === right.executionBackend
    && left.endpointRefHash === right.endpointRefHash;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function sameSettlementRef(
  left: Readonly<TaskResultSettlementRefV1>,
  right: Readonly<TaskResultSettlementRefV1>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.taskId === right.taskId
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.attemptId === right.attemptId;
}

function sameEstimates(
  left: ProviderLimitReservation['estimates'],
  right: CrossVerifyEnforcedAttemptContract['providerLimitEstimates'],
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sameCandidateAuthority(
  projected: ReadyProjection['candidateAuthority'],
  supplied: ReadyProjection['candidateAuthority'] | undefined,
): boolean {
  if (!supplied) return false;
  const leftReachability = projected.reachabilityQuery;
  const rightReachability = supplied.reachabilityQuery;
  const leftLimit = projected.limitQuery;
  const rightLimit = supplied.limitQuery;
  return projected.provider === supplied.provider
    && projected.model === supplied.model
    && leftReachability.tenantId === rightReachability.tenantId
    && leftReachability.projectId === rightReachability.projectId
    && leftReachability.provider === rightReachability.provider
    && leftReachability.model === rightReachability.model
    && leftReachability.authMode === rightReachability.authMode
    && leftReachability.accountRefHash === rightReachability.accountRefHash
    && leftReachability.transport === rightReachability.transport
    && leftReachability.executionBackend === rightReachability.executionBackend
    && leftReachability.endpointRefHash === rightReachability.endpointRefHash
    && leftReachability.runtimeFingerprint === rightReachability.runtimeFingerprint
    && leftReachability.executionProfileRef === rightReachability.executionProfileRef
    && leftReachability.capability === rightReachability.capability
    && leftLimit.tenantId === rightLimit.tenantId
    && leftLimit.provider === rightLimit.provider
    && leftLimit.accountRefHash === rightLimit.accountRefHash
    && leftLimit.quotaScopeRefHash === rightLimit.quotaScopeRefHash
    && leftLimit.authMode === rightLimit.authMode;
}

function assertProjection(input: CrossVerifyInvocationCoordinatorInput): void {
  const { projection, admission } = input;
  const receipt = projection.invocationReceipt.receipt;
  const candidate = projection.verifierCandidates[0];
  assertCrossVerifyEnforcedAttemptContract(input.executionContract);
  const contract = input.executionContract;
  const request = input.executionRequest;
  const requestTaskId = request.taskSnapshot['id'];
  const requestModel = request.taskSnapshot['model'];
  const requestBudget = request.taskSnapshot['budget'];
  const requestBudgetPolicy = request.taskSnapshot['budgetPolicy'];
  const requestPolicy = requestBudgetPolicy
    && typeof requestBudgetPolicy === 'object'
    && !Array.isArray(requestBudgetPolicy)
    ? requestBudgetPolicy as Record<string, unknown>
    : null;
  if (projection.verifierCandidates.length !== 1
    || receipt.role !== 'auditor'
    || receipt.purpose !== 'audit-evaluation'
    || receipt.projectId !== projection.invocationReceipt.ledger.projectId
    || receipt.taskId === null
    || receipt.invocationId !== projection.identity.invocationId
    || receipt.idempotencyKey !== projection.identity.idempotencyKey
    || receipt.callId !== projection.identity.callId
    || admission.invocation.role !== 'auditor'
    || admission.invocation.purpose !== 'audit-evaluation'
    || String(admission.invocation.primaryProvider) !== candidate.provider
    || admission.invocation.model !== candidate.model
    || admission.invocation.fallbackProviders.length !== 0
    || Object.keys(admission.candidates).length !== 1
    || admission.candidates[candidate.provider]?.model !== candidate.model
    || contract.tenantId !== receipt.tenantId
    || contract.projectId !== receipt.projectId
    || contract.runId !== receipt.runId
    || contract.taskId !== receipt.taskId.replace(/-xverify$/u, '')
    || contract.verifierTaskId !== receipt.taskId
    || contract.callId !== receipt.callId
    || contract.attemptId !== projection.binding.attemptId
    || contract.fenceTokenHash !== projection.binding.fenceTokenHash
    || contract.provider !== candidate.provider
    || contract.model !== candidate.model
    || contract.authMode !== candidate.auth.mode
    || contract.accountRefHash !== candidate.auth.accountRefHash
    || contract.transport !== candidate.backend.transport
    || contract.executionBackend !== candidate.backend.executionBackend
    || contract.endpointRefHash !== candidate.backend.endpointRefHash
    || contract.executionProfileRef !== candidate.backend.executionProfileRef
    || digest(request.basePrompt) !== contract.basePromptSha256
    || digest(request.dispatchedPrompt) !== contract.dispatchedPromptSha256
    || digest(canonicalJson(request.taskSnapshot)) !== contract.taskSnapshotSha256
    || requestTaskId !== contract.verifierTaskId
    || requestModel !== contract.model
    || canonicalJson(requestBudget) !== canonicalJson(contract.budget)
    || requestPolicy?.['profileRef'] !== contract.budgetProfileRef
    || requestPolicy?.['policyDigest'] !== contract.budgetPolicyDigest
    || requestPolicy?.['admissionMode'] !== contract.attendanceMode
    || canonicalJson(requestPolicy?.['landingPolicy'])
      !== canonicalJson(contract.landingPolicy)
    || !sameCandidateAuthority(
      projection.candidateAuthority,
      admission.candidates[candidate.provider],
    )) {
    throw createExecutionAuthorityError(
      'Xverify projection and admission authority do not share one exact identity',
    );
  }
  assertCanonicalProviderId(candidate.provider);
  assertCanonicalModelApiId(candidate.model);
}

function bindAdmission(
  input: CrossVerifyInvocationCoordinatorInput,
): HostRoleInvocationAdmissionRequest {
  const { projection } = input;
  const receipt = projection.invocationReceipt.receipt;
  return {
    ...input.admission,
    buildReservation: (selected: RoleInvocationSelected) => {
      const reservation = input.admission.buildReservation(selected);
      const expected = deriveCrossVerifyReservationIdentity(
        projection.identity,
        String(selected.provider),
        selected.model,
      );
      if (reservation.tenantId !== receipt.tenantId
        || reservation.projectId !== receipt.projectId
        || reservation.runId !== receipt.runId
        || reservation.taskId !== receipt.taskId
        || reservation.callId !== receipt.callId
        || reservation.attemptId !== projection.binding.attemptId
        || reservation.fenceTokenHash !== projection.binding.fenceTokenHash
        || reservation.receiptRef !== projection.identity.receiptRef
        || reservation.reservationId !== expected.reservationId
        || reservation.idempotencyKey !== expected.idempotencyKey
        || reservation.requestedAt !== receipt.createdAt
        || reservation.provider !== input.executionContract.provider
        || reservation.model !== input.executionContract.model
        || reservation.authMode !== input.executionContract.authMode
        || reservation.accountRefHash !== input.executionContract.accountRefHash
        || !sameBackend(reservation.backend, {
          transport: input.executionContract.transport,
          executionBackend: input.executionContract.executionBackend,
          endpointRefHash: input.executionContract.endpointRefHash,
        })
        || !sameEstimates(
          reservation.estimates,
          input.executionContract.providerLimitEstimates,
        )
        || reservation.estimateEvidenceRefs.filter(
          ref => ref === input.executionContract.evidenceRef,
        ).length !== 1) {
        throw createExecutionAuthorityError(
          'Provider reservation is not the canonical xverify claim projection',
        );
      }
      return reservation;
    },
  };
}

function buildReceipt(
  projection: ReadyProjection,
  admission: HostRoleInvocationAdmissionResult,
): InvocationReceipt {
  if (admission.decision === 'hold') {
    throw createExecutionAuthorityError('Executable xverify receipt requires an allowed admission');
  }
  const projected = projection.invocationReceipt.receipt;
  const candidate = projection.verifierCandidates[0];
  let called: { readonly provider: string; readonly model: string };
  let backend: InvocationReceipt['backend'];
  let auth: InvocationReceipt['auth'];
  if (admission.decision === 'allow') {
    const reservation = admission.reservation;
    if (reservation.provider !== candidate.provider
      || reservation.model !== candidate.model
      || reservation.authMode !== candidate.auth.mode
      || reservation.accountRefHash !== candidate.auth.accountRefHash
      || !sameBackend(reservation.backend, candidate.backend)
      || reservation.reachabilityEvidenceRef !== candidate.reachability.evidenceRef
      || admission.resolution.selected?.provider !== candidate.provider
      || admission.resolution.selected.model !== candidate.model) {
      throw createExecutionAuthorityError(
        'Admitted xverify route differs from the exact verifier projection',
      );
    }
    called = { provider: reservation.provider, model: reservation.model };
    backend = {
      transport: reservation.backend.transport,
      executionBackend: reservation.backend.executionBackend,
    };
    auth = { mode: reservation.authMode, accountRefHash: reservation.accountRefHash };
  } else {
    // non_reservable_subscription — the identity source is the exact verifier
    // candidate (there is no numeric reservation). The same route-drift guard
    // against the projection still holds; reachability must be proven.
    if (candidate.reachability.evidenceRef === null
      || admission.resolution.selected?.provider !== candidate.provider
      || admission.resolution.selected.model !== candidate.model) {
      throw createExecutionAuthorityError(
        'Admitted xverify route differs from the exact verifier projection',
      );
    }
    called = { provider: candidate.provider, model: candidate.model };
    backend = {
      transport: candidate.backend.transport,
      executionBackend: candidate.backend.executionBackend,
    };
    auth = { mode: candidate.auth.mode, accountRefHash: candidate.auth.accountRefHash };
  }
  const receipt: InvocationReceipt = {
    ...projected,
    configured: admission.resolution.configured,
    resolved: admission.resolution.resolved,
    called: {
      provider: called.provider,
      model: called.model,
      source: 'wire',
      reasonCode: 'none',
    },
    backend,
    auth,
    fallbackChain: admission.resolution.fallbackChain,
    reachability: admission.resolution.reachability,
    limits: admission.resolution.limits,
  };
  return Object.freeze(receipt);
}

function assertActualCall(
  actualCall: CrossVerifyActualCallEvidence,
  grant: CrossVerifyInvocationExecutionGrant,
): void {
  assertCanonicalProviderId(actualCall.provider);
  assertCanonicalModelApiId(actualCall.model);
  assertOpaqueEvidenceRef('xverify actual provider call evidence', actualCall.evidenceRef, true);
  if (actualCall.provider !== grant.provider
    || actualCall.model !== grant.model
    || actualCall.auth.mode !== grant.auth.mode
    || actualCall.auth.accountRefHash !== grant.auth.accountRefHash
    || !sameBackend(actualCall.backend, grant.backend)
    || actualCall.backend.executionProfileRef !== grant.backend.executionProfileRef) {
    throw createExecutionAuthorityError(
      'Actual xverify provider call differs from the exact execution grant',
    );
  }
}

function assertTerminal(
  terminal: CrossVerifyTerminalEvidenceBundle,
  grant: CrossVerifyInvocationExecutionGrant,
): void {
  if (terminal.transportEvent.type !== 'transport_settled'
    || terminal.consumerEvent.type !== 'consumer_settled'
    || terminal.lineage.attemptIds.length === 0
    || terminal.lineage.attemptIds[0] !== grant.attemptId
    || terminal.execution.initialAttemptId !== grant.attemptId
    || terminal.lineage.attemptIds.at(-1) !== terminal.execution.terminalAttemptId) {
    throw createExecutionAuthorityError('Xverify terminal bundle has invalid attempt lineage');
  }
  for (const ref of [
    ...terminal.lineage.settlementEvidenceRefs,
    ...terminal.usageEvidenceRefs,
  ]) {
    assertOpaqueEvidenceRef('xverify terminal evidence', ref, true);
  }
  if (terminal.actualCall) assertActualCall(terminal.actualCall, grant);
  const accepted = terminal.consumerEvent.payload.outcome === 'accepted';
  if (accepted && (!terminal.actualCall
    || terminal.lineage.coverage !== 'complete'
    || terminal.transportEvent.payload.outcome !== 'succeeded'
    || terminal.execution.outcome !== 'completed'
    || !terminalProtocol(terminal.output))) {
    throw createExecutionAuthorityError(
      'Accepted xverify verdict lacks complete terminal authority',
    );
  }
  if (!accepted && terminalProtocol(terminal.output)) {
    throw createExecutionAuthorityError(
      'Terminal xverify protocol contradicts rejected consumer evidence',
    );
  }
}

function assertDispatchHandle(
  handle: CrossVerifyStrictDispatchHandle,
  grant: CrossVerifyInvocationExecutionGrant,
): void {
  const keys = Object.keys(handle).sort();
  if (canonicalJson(keys) !== canonicalJson(['outputArtifactRef', 'settlementRef'])) {
    throw createExecutionAuthorityError(
      'Strict xverify launcher returned fields outside its dispatch authority',
    );
  }
  assertOpaqueEvidenceRef('xverify output artifact', handle.outputArtifactRef, true);
  if (!sameSettlementRef(handle.settlementRef, grant.executionContract.settlementAttemptRef)) {
    throw createExecutionAuthorityError(
      'Strict xverify launcher returned a different settlement attempt',
    );
  }
}

function assertUsageSettlement(
  projection: CrossVerifyProviderUsageProjection,
  terminal: CrossVerifyTerminalEvidenceBundle,
  reservation: ProviderLimitReservation,
): asserts projection is Extract<CrossVerifyProviderUsageProjection, { state: 'settled' }> {
  if (projection.state !== 'settled') return;
  assertOpaqueEvidenceRef(
    'xverify usage authority evidence',
    projection.authorityEvidenceRef,
    true,
  );
  assertProviderLimitReservationEvent(projection.event);
  if (projection.event.fenceTokenHash !== reservation.fenceTokenHash) {
    throw createExecutionAuthorityError(
      'Provider usage settlement is outside the xverify reservation fence',
    );
  }
  if (projection.event.type === 'consumed' && terminal.actualCall === null) {
    throw createExecutionAuthorityError(
      'Provider consumption requires exact actual-call evidence',
    );
  }
  if (projection.event.type === 'released' && terminal.actualCall !== null) {
    throw createExecutionAuthorityError('A proven provider call cannot release its reservation');
  }
  if (terminal.consumerEvent.payload.outcome === 'accepted'
    && projection.event.type !== 'consumed') {
    throw createExecutionAuthorityError(
      'Accepted xverify verdict requires consumed provider settlement',
    );
  }
}

/**
 * Seam-A — the non-reservable analog of `assertUsageSettlement`. There is no
 * `consumed` reservation event on this arm; the proof that the provider call
 * truly happened is the terminal's own actual-call + succeeded-transport
 * evidence. Re-assert the acceptance binding so an accepted verdict can NEVER
 * settle without a proven provider call, giving the same integrity guarantee the
 * reserved arm gets from its consumed event. The reserved `assertUsageSettlement`
 * is untouched.
 */
function assertNonReservableUsageSettlement(
  terminal: CrossVerifyTerminalEvidenceBundle,
): void {
  if (terminal.consumerEvent.payload.outcome === 'accepted'
    && (terminal.actualCall === null
      || terminal.transportEvent.payload.outcome !== 'succeeded')) {
    throw createExecutionAuthorityError(
      'Accepted non-reservable xverify verdict requires a proven provider call',
    );
  }
}

/**
 * Host-owned auditor invocation saga.
 *
 * Receipt and provider-limit stores are separate durability domains. Every
 * uncertainty after the provider dispatch claim is therefore terminal
 * reconciliation-required; fallback and automatic re-dispatch are forbidden.
 */
export class CrossVerifyInvocationCoordinator {
  constructor(
    private readonly authorities: CrossVerifyInvocationCoordinatorAuthorities | null,
  ) {}

  async execute(
    input: CrossVerifyInvocationCoordinatorInput,
    launchSelected: CrossVerifyStrictLauncher,
  ): Promise<CrossVerifyInvocationCoordinatorResult> {
    if (!this.authorities) {
      return hold('XVERIFY_INVOCATION_AUTHORITY_UNAVAILABLE', 'authority-unavailable');
    }

    let ref: InvocationReceiptRef | null = null;
    let dispatchEvidenceRef: string | null = null;
    let settlementEvidenceRef: string | undefined;
    try {
      assertProjection(input);
      const { projection } = input;
      const ledger = projection.invocationReceipt.ledger;
      const receiptIntent = projection.invocationReceipt.receipt;
      const projectedRef = receiptRef(projection);
      const scope = { tenantId: receiptIntent.tenantId, projectId: receiptIntent.projectId };
      const existing = ledger.get(scope, receiptIntent.invocationId);
      if (existing) {
        ref = projectedRef;
        const dispatch = existing.events.find(event => event.type === 'dispatch_started');
        return dispatch
          ? reconciliationRequired(
              'XVERIFY_INVOCATION_REPLAY_AFTER_DISPATCH',
              dispatch.eventId,
              ref,
              `invocation-receipt-event:${dispatch.eventId}`,
            )
          : hold(
              'XVERIFY_INVOCATION_REPLAY_REQUIRES_RECONCILIATION',
              receiptIntent.invocationId,
              ref,
            );
      }
      if (!input.isClaimActive()) {
        return hold('XVERIFY_INVOCATION_CLAIM_INACTIVE', projection.binding.attemptId);
      }

      const admission: HostRoleInvocationAdmissionResult = input.nonReservableAdmission
        ? input.nonReservableAdmission
        : this.authorities.admissionRuntime.admit(bindAdmission(input));
      if (admission.decision === 'hold') {
        return hold(
          `XVERIFY_INVOCATION_HOLD:${admission.reasonCode}`,
          admission.authorityEvidenceRef,
        );
      }
      // The reserved arm carries a numeric reservation; the non-reservable
      // subscription arm carries none. `reserved` narrows the union so every
      // reservation-ledger sub-step below is compiler-scoped to the allow arm —
      // the non-reservable arm can never reach claimDispatch/settleDispatch.
      const reserved = admission.decision === 'allow' ? admission : null;
      const candidate = projection.verifierCandidates[0];
      const receipt = buildReceipt(projection, admission);
      if (reserved) {
        const usagePreflight = this.authorities.usageAuthority.preflight({
          reservation: reserved.reservation,
          executionProfileRef: candidate.backend.executionProfileRef,
        });
        assertOpaqueEvidenceRef(
          'xverify usage preflight authority',
          usagePreflight.authorityEvidenceRef,
          true,
        );
        if (usagePreflight.state === 'hold') {
          return hold(
            `XVERIFY_INVOCATION_USAGE_HOLD:${usagePreflight.reasonCode}`,
            usagePreflight.authorityEvidenceRef,
          );
        }
      }
      ref = ledger.declare(receipt).ref;
      if (!input.isClaimActive()) {
        return hold('XVERIFY_INVOCATION_CLAIM_EXPIRED_BEFORE_DISPATCH', projection.binding.attemptId, ref);
      }

      // Reserved: open a numeric reservation-ledger `dispatched` event and take
      // its execution grant. Non-reservable: no reservation ledger exists — the
      // invocation-ledger dispatch_started event (appended below) is the sole
      // dispatch evidence, and NO reservation identity is fabricated.
      let reservedDispatchGrant: ProviderLimitExecutionGrant | null = null;
      if (reserved) {
        const dispatchEvent = input.buildDispatchEvent(reserved);
        if (dispatchEvent.type !== 'dispatched'
          || dispatchEvent.fenceTokenHash !== projection.binding.fenceTokenHash) {
          throw createExecutionAuthorityError(
            'Xverify dispatch event is outside the exact claim fence',
          );
        }
        const dispatch = this.authorities.admissionRuntime.claimDispatch(reserved, dispatchEvent);
        if (!dispatch.claimed) {
          return reconciliationRequired(
            'XVERIFY_INVOCATION_DISPATCH_ALREADY_CLAIMED',
            dispatch.existingDispatchEvidenceRef,
            ref,
            dispatch.existingDispatchEvidenceRef,
          );
        }
        dispatchEvidenceRef = dispatch.executionGrant.dispatchEventRef;
        reservedDispatchGrant = dispatch.executionGrant;
      } else {
        dispatchEvidenceRef = `invocation-receipt-event:${eventId(receipt.invocationId, 'dispatch-started')}`;
      }
      ledger.append(scope, receipt.invocationId, {
        eventId: eventId(receipt.invocationId, 'dispatch-started'),
        type: 'dispatch_started',
        payload: { attempt: projection.invocationReceipt.attempt ?? 1 },
      });
      if (!input.isClaimActive()) {
        return reconciliationRequired(
          'XVERIFY_INVOCATION_CLAIM_EXPIRED_AFTER_DISPATCH',
          projection.binding.attemptId,
          ref,
          dispatchEvidenceRef,
        );
      }

      // Identity for the grant/launcher is the numeric reservation (reserved) or
      // the exact verifier candidate (non-reservable) — same provider/model/
      // backend/auth on both arms, already validated against the projection in
      // buildReceipt. The reserved arm is byte-identical to its prior form.
      const grantCommon = {
        tenantId: receipt.tenantId,
        projectId: receipt.projectId,
        runId: receipt.runId,
        taskId: receipt.taskId!,
        callId: receipt.callId,
        attemptId: projection.binding.attemptId,
        fenceTokenHash: projection.binding.fenceTokenHash,
        provider: reserved ? reserved.reservation.provider : candidate.provider,
        model: reserved ? reserved.reservation.model : candidate.model,
        receiptRef: { ...ref },
        invocationReceiptRef: projection.identity.receiptRef,
        backend: reserved
          ? { ...reserved.reservation.backend, executionProfileRef: candidate.backend.executionProfileRef }
          : {
              transport: candidate.backend.transport,
              executionBackend: candidate.backend.executionBackend,
              endpointRefHash: candidate.backend.endpointRefHash,
              executionProfileRef: candidate.backend.executionProfileRef,
            },
        auth: {
          mode: reserved ? reserved.reservation.authMode : candidate.auth.mode,
          accountRefHash: reserved ? reserved.reservation.accountRefHash : candidate.auth.accountRefHash,
        },
        executionContract: JSON.parse(
          JSON.stringify(input.executionContract),
        ) as CrossVerifyEnforcedAttemptContract,
      };
      const grant: CrossVerifyInvocationExecutionGrant = reserved && reservedDispatchGrant
        ? deepFreeze({
            admissionMode: 'reserved',
            reservationId: reservedDispatchGrant.reservationId,
            dispatchEventRef: reservedDispatchGrant.dispatchEventRef,
            dispatchEventHash: reservedDispatchGrant.dispatchEventHash,
            reservation: JSON.parse(JSON.stringify(reserved.reservation)) as ProviderLimitReservation,
            ...grantCommon,
          })
        : deepFreeze({
            admissionMode: 'non_reservable_subscription',
            reservation: null,
            dispatchEventRef: dispatchEvidenceRef,
            dispatchEventHash: digest(dispatchEvidenceRef),
            ...grantCommon,
          });
      if (!sameCrossVerifyExecutionContract(grant.executionContract, input.executionContract)) {
        throw createExecutionAuthorityError(
          'Frozen xverify grant differs from the admitted execution contract',
        );
      }
      if (grant.admissionMode === 'reserved'
        && canonicalJson(grant.reservation) !== canonicalJson(reserved!.reservation)) {
        throw createExecutionAuthorityError(
          'Frozen xverify grant differs from the admitted provider reservation',
        );
      }
      const executionRequest = deepFreeze<CrossVerifyStrictExecutionRequest>(
        JSON.parse(JSON.stringify(input.executionRequest)) as CrossVerifyStrictExecutionRequest,
      );
      const launched = await launchSelected(grant, executionRequest);
      assertDispatchHandle(launched, grant);
      const dispatchHandle = deepFreeze<CrossVerifyStrictDispatchHandle>({
        settlementRef: { ...launched.settlementRef },
        outputArtifactRef: launched.outputArtifactRef,
      });
      const observation = await this.authorities.observationAuthority.observe({
        grant,
        reservation: grant.reservation,
        dispatch: dispatchHandle,
      });
      assertOpaqueEvidenceRef(
        'xverify host observation authority',
        observation.authorityEvidenceRef,
        true,
      );
      if (observation.state === 'hold') {
        return reconciliationRequired(
          `XVERIFY_INVOCATION_OBSERVATION_HOLD:${observation.reasonCode}`,
          observation.authorityEvidenceRef,
          ref,
          dispatchEvidenceRef,
        );
      }
      const terminal = observation.terminal;
      assertTerminal(terminal, grant);
      // Usage settlement. Reserved: project the numeric `consumed` reservation
      // event and settle it on the reservation ledger. Non-reservable (B2):
      // record ONLY the transport-reported usage (a typed usage_unavailable HOLD
      // when absent) and settle through the invocation ledger — no reservation
      // event is ever produced.
      let providerReportedUsageEvidenceRef: string | null = null;
      if (reserved) {
        const usage = this.authorities.usageAuthority.project({
          grant,
          reservation: reserved.reservation,
          terminal,
        });
        if (usage.state === 'hold') {
          assertOpaqueEvidenceRef(
            'xverify usage authority hold',
            usage.authorityEvidenceRef,
            true,
          );
          return reconciliationRequired(
            `XVERIFY_INVOCATION_USAGE_HOLD:${usage.reasonCode}`,
            usage.authorityEvidenceRef,
            ref,
            dispatchEvidenceRef,
          );
        }
        assertUsageSettlement(usage, terminal, reserved.reservation);
        const settlement = this.authorities.admissionRuntime.settleDispatch(
          reserved,
          usage.event,
        );
        settlementEvidenceRef = `provider-limit-reservation-event:${settlement.eventId}`;
      } else {
        const usage = this.authorities.usageAuthority.projectNonReservable({ grant, terminal });
        assertOpaqueEvidenceRef(
          'xverify non-reservable usage authority',
          usage.authorityEvidenceRef,
          true,
        );
        if (usage.state === 'hold') {
          return reconciliationRequired(
            `XVERIFY_INVOCATION_USAGE_HOLD:${usage.reasonCode}`,
            usage.authorityEvidenceRef,
            ref,
            dispatchEvidenceRef,
          );
        }
        assertNonReservableUsageSettlement(terminal);
        providerReportedUsageEvidenceRef = usage.usageEvidenceRef;
      }
      ledger.append(scope, receipt.invocationId, terminal.transportEvent);
      ledger.append(scope, receipt.invocationId, terminal.consumerEvent);
      return {
        state: 'settled',
        output: terminal.output,
        execution: terminal.execution,
        invocationReceiptRef: ref,
        providerLimitReservationId: reserved ? reserved.reservation.reservationId : null,
        providerLimitDispatchEvidenceRef: dispatchEvidenceRef,
        providerLimitSettlementEvidenceRef: settlementEvidenceRef ?? null,
        providerReportedUsageEvidenceRef,
        executionContractEvidenceRef: grant.executionContract.evidenceRef,
        outputArtifactRef: dispatchHandle.outputArtifactRef,
        hostObservationEvidenceRef: observation.authorityEvidenceRef,
        terminalSettlementRef: dispatchHandle.settlementRef,
        calledProvider: grant.provider,
        calledModel: grant.model,
      };
    } catch (error) {
      // A bare reconciliation code hides why the post-dispatch attempt could not
      // settle. Record it ONLY via the bounded/sanitized debug sink (message-only,
      // 200-char cap, stderr just under DECKENT_DEBUG, skipped in tests) — never a
      // raw stack to the user surface. The typed result below stays authoritative.
      debugLog('cross-verify-coordinator:execute-failed', error);
      if (dispatchEvidenceRef) {
        return reconciliationRequired(
          'XVERIFY_INVOCATION_RECONCILIATION_REQUIRED',
          errorCode(error),
          ref,
          dispatchEvidenceRef,
          settlementEvidenceRef,
        );
      }
      return hold(
        'XVERIFY_INVOCATION_HOLD:authority_failure',
        errorCode(error),
        ref,
      );
    }
  }
}
