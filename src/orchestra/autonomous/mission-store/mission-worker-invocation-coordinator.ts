import { createHash } from 'node:crypto';

import {
  HostRoleInvocationAdmissionRuntime,
  type HostRoleInvocationAdmissionRequest,
  type HostRoleInvocationAdmissionResult,
} from '../../../core/host-role-invocation-admission-runtime.js';
import {
  INVOCATION_RECEIPT_SCHEMA_VERSION,
  type InvocationEvent,
  type InvocationReceipt,
  type InvocationReceiptLedger,
  type InvocationReceiptRef,
  type InvocationSelection,
} from '../../../core/invocation-receipt.js';
import type { ProviderLimitAdmissionAllowed } from '../../../core/provider-limit-admission.js';
import type { ProviderLimitExecutionGrant } from '../../../core/provider-limit-store.js';
import type { ProviderLimitReservationEvent } from '../../../core/provider-limit-truth.js';
import {
  assertCanonicalModelApiId,
  assertCanonicalProviderId,
  assertOpaqueEvidenceRef,
} from '../../../core/provider-truth.js';
import type { RoleInvocationSelected } from '../../../core/role-invocation-resolver.js';
import type { MissionTaskContext } from './mission-dispatch.js';
import type { Mission, MissionDispatchClaim, ResultLike } from './mission-types.js';

type DispatchEvent = ProviderLimitReservationEvent & { readonly type: 'dispatched' };
type SettlementEvent = ProviderLimitReservationEvent & { readonly type: 'consumed' | 'released' };
type TransportEvent = Extract<InvocationEvent, { type: 'transport_settled' }>;
type ConsumerEvent = Extract<InvocationEvent, { type: 'consumer_settled' }>;

/** Raw Mission fence token is intentionally absent from every producer/executor surface. */
export type MissionWorkerInvocationClaimBinding = Omit<MissionDispatchClaim, 'fenceToken'>;
export type MissionWorkerExactExecutionContext = Omit<Readonly<MissionTaskContext>, 'provider' | 'model'>;

export interface MissionWorkerInvocationReceiptBlueprint {
  readonly configured: InvocationSelection;
  readonly requested: InvocationSelection;
  readonly createdAt: string;
}

export interface MissionWorkerInvocationIdentity {
  readonly invocationId: string;
  readonly idempotencyKey: string;
  readonly callId: string;
  readonly receiptRef: string;
}

export interface MissionWorkerInvocationPreparation {
  readonly admission: HostRoleInvocationAdmissionRequest;
  readonly receipt: MissionWorkerInvocationReceiptBlueprint;
  /** Host executor journal evidence written immediately before an external effect. */
  readonly buildDispatchEvent: (admission: ProviderLimitAdmissionAllowed) => DispatchEvent;
}

export interface MissionWorkerInvocationPrepareInput {
  readonly mission: Mission;
  readonly context: Readonly<MissionTaskContext>;
  readonly claim: MissionWorkerInvocationClaimBinding;
  readonly projectId: string;
  readonly identity: MissionWorkerInvocationIdentity;
}

export interface MissionWorkerInvocationAuthorities {
  readonly admissionRuntime: HostRoleInvocationAdmissionRuntime;
  readonly receiptLedger: InvocationReceiptLedger;
  /** Host-only deterministic projection. It owns account/backend/evidence/event identity. */
  readonly prepare: (input: MissionWorkerInvocationPrepareInput) => MissionWorkerInvocationPreparation;
}

/** Exact upstream composition HOLD; unlike legacy null it preserves why authority is unavailable. */
export interface MissionWorkerInvocationAuthorityHold {
  readonly state: 'hold';
  readonly reasonCode: string;
  readonly authorityEvidenceRef: string;
}

export interface MissionWorkerInvocationExecutionGrant extends ProviderLimitExecutionGrant {
  readonly provider: string;
  readonly model: string;
  readonly receiptRef: InvocationReceiptRef;
  readonly backend: ProviderLimitAdmissionAllowed['reservation']['backend'];
  readonly auth: {
    readonly mode: ProviderLimitAdmissionAllowed['reservation']['authMode'];
    readonly accountRefHash: string | null;
  };
}

export interface MissionWorkerActualCallEvidence {
  readonly provider: string;
  readonly model: string;
  readonly backend: ProviderLimitAdmissionAllowed['reservation']['backend'];
  readonly auth: MissionWorkerInvocationExecutionGrant['auth'];
  readonly evidenceRef: string;
}

export interface MissionWorkerInvocationExecution {
  readonly result: ResultLike;
  readonly actualCall: MissionWorkerActualCallEvidence;
  readonly transportEvent: TransportEvent;
  readonly providerSettlementEvent: SettlementEvent;
  readonly consumerEvent: ConsumerEvent;
}

export interface MissionWorkerInvocationExecuteInput {
  readonly mission: Mission;
  readonly context: Readonly<MissionTaskContext>;
  readonly claim: MissionDispatchClaim;
  /** Re-read persisted MissionStore authority at each pre-dispatch boundary. */
  readonly isClaimActive: () => boolean;
}

export type MissionWorkerExactExecutor = (
  grant: Readonly<MissionWorkerInvocationExecutionGrant>,
) => Promise<MissionWorkerInvocationExecution>;

export interface MissionWorkerInvocationCoordinatorLike {
  execute(
    input: MissionWorkerInvocationExecuteInput,
    executeSelected: MissionWorkerExactExecutor,
  ): Promise<ResultLike>;
}

const SELECTION_SOURCES = new Set(['config', 'directive', 'router', 'fallback', 'wire', 'none']);
const REASON_CODES = new Set([
  'none', 'no_provider', 'command_build_failed', 'spawn_error', 'nonzero_exit',
  'timeout', 'empty_output', 'parse_failed', 'validation_failed',
  'fallback_unreachable', 'fallback_limit_hold', 'fallback_exhausted',
  'provider_resolution_fallback', 'duplicate_invocation',
]);

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function evidenceRef(kind: string, value: string): string {
  return `mission-worker-${kind}:${digest(value)}`;
}

function eventId(invocationId: string, phase: string): string {
  return `mission-worker-${phase}-${digest(`${invocationId}\0${phase}`)}`;
}

export function deriveMissionWorkerInvocationReceiptRef(
  tenantId: string,
  projectId: string,
  invocationId: string,
): string {
  return `invocation-receipt:${digest(`${tenantId}\0${projectId}\0${invocationId}`)}`;
}

export function deriveMissionWorkerInvocationIdentity(
  tenantId: string,
  projectId: string,
  claim: MissionWorkerInvocationClaimBinding,
): MissionWorkerInvocationIdentity {
  const key = digest([
    tenantId, projectId, claim.missionId, claim.workItemId,
    claim.attemptId, claim.fenceTokenHash,
  ].join('\0'));
  const invocationId = `mission-worker-invocation-${key}`;
  return Object.freeze({
    invocationId,
    idempotencyKey: `mission-worker-idempotency-${key}`,
    callId: `mission-worker-call-${key}`,
    receiptRef: deriveMissionWorkerInvocationReceiptRef(tenantId, projectId, invocationId),
  });
}

export function deriveMissionWorkerReservationIdentity(
  identity: MissionWorkerInvocationIdentity,
  provider: string,
  model: string,
): { readonly reservationId: string; readonly idempotencyKey: string } {
  const key = digest(`${identity.callId}\0${provider}\0${model}`);
  return Object.freeze({
    reservationId: `mission-worker-reservation-${key}`,
    idempotencyKey: `mission-worker-reservation-key-${key}`,
  });
}

function canonicalTimestamp(label: string, value: string): void {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
}

function assertSelection(label: string, selection: InvocationSelection): void {
  if (!SELECTION_SOURCES.has(selection.source) || !REASON_CODES.has(selection.reasonCode)) {
    throw new Error(`${label} carries an unsupported selection source or reason`);
  }
  if ((selection.provider === null) !== (selection.model === null)) {
    throw new Error(`${label} provider/model identity is incomplete`);
  }
  if (selection.provider !== null && selection.model !== null) {
    assertCanonicalProviderId(String(selection.provider));
    assertCanonicalModelApiId(selection.model);
  } else if (selection.source !== 'none') {
    throw new Error(`${label} empty identity must use source=none`);
  }
}

function sameSelection(left: InvocationSelection, right: InvocationSelection): boolean {
  return String(left.provider) === String(right.provider)
    && left.model === right.model
    && left.source === right.source
    && left.reasonCode === right.reasonCode;
}

function safeClaim(claim: MissionDispatchClaim): MissionWorkerInvocationClaimBinding {
  return Object.freeze({
    schemaVersion: claim.schemaVersion,
    workItemId: claim.workItemId,
    missionId: claim.missionId,
    claimedBy: claim.claimedBy,
    claimedAt: claim.claimedAt,
    itemRevision: claim.itemRevision,
    attemptId: claim.attemptId,
    fenceTokenHash: claim.fenceTokenHash,
    claimRegistryRevision: claim.claimRegistryRevision,
    claimRegistryDigest: claim.claimRegistryDigest,
  });
}

function assertClaim(input: MissionWorkerInvocationExecuteInput): void {
  const { claim, mission } = input;
  if (claim.schemaVersion !== 1
    || claim.missionId !== mission.id
    || !claim.workItemId
    || !claim.attemptId
    || digest(claim.fenceToken) !== claim.fenceTokenHash
    || !input.isClaimActive()) {
    throw new Error('Mission dispatch claim is not an active exact host authority');
  }
}

function primaryCandidate(request: HostRoleInvocationAdmissionRequest) {
  return request.candidates[String(request.invocation.primaryProvider)];
}

function assertPreparation(prepared: MissionWorkerInvocationPreparation): void {
  const blueprint = prepared.receipt;
  canonicalTimestamp('receipt createdAt', blueprint.createdAt);
  assertSelection('configured', blueprint.configured);
  assertSelection('requested', blueprint.requested);
  const invocation = prepared.admission.invocation;
  if (invocation.role !== 'worker'
    || (invocation.purpose ?? 'worker-execution') !== 'worker-execution') {
    throw new Error('Mission task admission must use worker/worker-execution');
  }
  if (String(blueprint.configured.provider) !== String(invocation.primaryProvider)
    || blueprint.configured.model !== invocation.model
    || String(blueprint.requested.provider) !== String(invocation.primaryProvider)
    || blueprint.requested.model !== invocation.model) {
    throw new Error('Receipt configured/requested identity differs from admission request');
  }
}

function bindAdmissionRequest(
  prepared: MissionWorkerInvocationPreparation,
  mission: Mission,
  claim: MissionDispatchClaim,
  projectId: string,
  identity: MissionWorkerInvocationIdentity,
): HostRoleInvocationAdmissionRequest {
  for (const [key, candidate] of Object.entries(prepared.admission.candidates)) {
    if (key !== candidate.provider
      || candidate.reachabilityQuery.tenantId !== mission.tenant
      || candidate.reachabilityQuery.projectId !== projectId
      || candidate.limitQuery.tenantId !== mission.tenant) {
      throw new Error('Candidate authority is outside the Mission tenant/project scope');
    }
  }
  return {
    ...prepared.admission,
    buildReservation: selected => {
      const reservation = prepared.admission.buildReservation(selected);
      const expected = deriveMissionWorkerReservationIdentity(
        identity, String(selected.provider), selected.model,
      );
      if (reservation.tenantId !== mission.tenant
        || reservation.projectId !== projectId
        || reservation.runId !== claim.missionId
        || reservation.taskId !== claim.workItemId
        || reservation.callId !== identity.callId
        || reservation.attemptId !== claim.attemptId
        || reservation.fenceTokenHash !== claim.fenceTokenHash
        || reservation.receiptRef !== identity.receiptRef
        || reservation.reservationId !== expected.reservationId
        || reservation.idempotencyKey !== expected.idempotencyKey) {
        throw new Error('Reservation identity is not the canonical Mission claim projection');
      }
      return reservation;
    },
  };
}

function buildReceipt(
  ledger: InvocationReceiptLedger,
  mission: Mission,
  claim: MissionDispatchClaim,
  identity: MissionWorkerInvocationIdentity,
  prepared: MissionWorkerInvocationPreparation,
  admission: HostRoleInvocationAdmissionResult,
): InvocationReceipt {
  const blueprint = prepared.receipt;
  assertPreparation(prepared);
  if (!sameSelection(blueprint.configured, admission.resolution.configured)) {
    throw new Error('Receipt configured identity differs from admission authority');
  }
  const selected = admission.decision === 'allow' ? admission.reservation : null;
  const candidate = selected === null ? primaryCandidate(prepared.admission) : null;
  if (selected === null && !candidate) {
    throw new Error('Held invocation lacks its configured candidate identity');
  }
  const backend = selected?.backend ?? {
    transport: candidate!.reachabilityQuery.transport,
    executionBackend: candidate!.reachabilityQuery.executionBackend,
  };
  const auth = selected === null
    ? { mode: candidate!.limitQuery.authMode, accountRefHash: candidate!.limitQuery.accountRefHash }
    : { mode: selected.authMode, accountRefHash: selected.accountRefHash };
  const called: InvocationSelection = selected === null
    ? { provider: null, model: null, source: 'none', reasonCode: admission.resolution.decisionReasonCode }
    : { provider: selected.provider, model: selected.model, source: 'wire', reasonCode: 'none' };

  const receipt: InvocationReceipt = {
    schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION,
    invocationId: identity.invocationId,
    idempotencyKey: identity.idempotencyKey,
    tenantId: mission.tenant,
    projectId: ledger.projectId,
    runId: claim.missionId,
    taskId: claim.workItemId,
    callId: identity.callId,
    role: 'worker',
    purpose: 'worker-execution',
    configured: admission.resolution.configured,
    requested: blueprint.requested,
    resolved: admission.resolution.resolved,
    called,
    backend,
    auth,
    fallbackChain: admission.resolution.fallbackChain,
    reachability: admission.resolution.reachability,
    limits: admission.resolution.limits,
    createdAt: blueprint.createdAt,
  };
  for (const [label, selection] of [
    ['configured', receipt.configured], ['requested', receipt.requested],
    ['resolved', receipt.resolved], ['called', receipt.called],
  ] as const) assertSelection(label, selection);
  for (const transition of receipt.fallbackChain) {
    if (transition.sequence < 1 || !Number.isInteger(transition.sequence)) {
      throw new Error('Receipt fallback sequence is invalid');
    }
    assertCanonicalProviderId(String(transition.toProvider));
    assertCanonicalModelApiId(transition.toModel);
    if (transition.reachabilityRef !== null) {
      assertOpaqueEvidenceRef('fallback reachability ref', transition.reachabilityRef, true);
    }
    for (const ref of transition.limitEvidenceRefs) {
      assertOpaqueEvidenceRef('fallback limit ref', ref, true);
    }
  }
  if (selected !== null) {
    if (selected.tenantId !== receipt.tenantId
      || selected.projectId !== receipt.projectId
      || selected.runId !== receipt.runId
      || selected.taskId !== receipt.taskId
      || selected.callId !== receipt.callId
      || selected.attemptId !== claim.attemptId
      || selected.fenceTokenHash !== claim.fenceTokenHash
      || selected.requestedAt !== receipt.createdAt
      || selected.receiptRef !== identity.receiptRef
      || String(receipt.called.provider) !== selected.provider
      || receipt.called.model !== selected.model
      || receipt.reachability.evidenceRef !== selected.reachabilityEvidenceRef) {
      throw new Error('Receipt/reservation/Mission claim identity mismatch');
    }
    if (receipt.reachability.state !== 'known' || receipt.limits.state !== 'known') {
      throw new Error('Executable receipt requires known reachability and limit evidence');
    }
  }
  return Object.freeze(receipt);
}

function assertExecution(
  execution: MissionWorkerInvocationExecution,
  admission: ProviderLimitAdmissionAllowed,
): void {
  if (execution.transportEvent.type !== 'transport_settled'
    || execution.consumerEvent.type !== 'consumer_settled'
    || (execution.providerSettlementEvent.type !== 'consumed'
      && execution.providerSettlementEvent.type !== 'released')) {
    throw new Error('Executor returned an invalid terminal evidence bundle');
  }
  assertCanonicalProviderId(execution.actualCall.provider);
  assertCanonicalModelApiId(execution.actualCall.model);
  assertOpaqueEvidenceRef('actual provider call evidence', execution.actualCall.evidenceRef, true);
  if (execution.actualCall.provider !== admission.reservation.provider
    || execution.actualCall.model !== admission.reservation.model
    || execution.actualCall.backend.transport !== admission.reservation.backend.transport
    || execution.actualCall.backend.executionBackend !== admission.reservation.backend.executionBackend
    || execution.actualCall.backend.endpointRefHash !== admission.reservation.backend.endpointRefHash
    || execution.actualCall.auth.mode !== admission.reservation.authMode
    || execution.actualCall.auth.accountRefHash !== admission.reservation.accountRefHash) {
    throw new Error('Actual provider call evidence differs from the exact execution grant');
  }
  if (!REASON_CODES.has(execution.transportEvent.payload.reasonCode)
    || !REASON_CODES.has(execution.consumerEvent.payload.reasonCode)
    || !Number.isFinite(execution.transportEvent.payload.durationMs)
    || execution.transportEvent.payload.durationMs < 0
    || execution.providerSettlementEvent.fenceTokenHash !== admission.reservation.fenceTokenHash) {
    throw new Error('Executor terminal evidence is malformed or outside the reservation fence');
  }
  if (execution.result.ok && (
    execution.transportEvent.payload.outcome !== 'succeeded'
    || execution.consumerEvent.payload.outcome !== 'accepted'
    || execution.providerSettlementEvent.type !== 'consumed'
  )) {
    throw new Error('Successful result contradicts terminal transport/consumer/usage evidence');
  }
  if (execution.providerSettlementEvent.type === 'released' && execution.result.ok) {
    throw new Error('Released provider reservation cannot settle a successful result');
  }
  if (execution.result.dispatchDisposition !== undefined) {
    throw new Error('Exact executor cannot author host dispatch disposition');
  }
}

function parked(
  reason: string,
  detail: string,
  receiptRef: InvocationReceiptRef | null = null,
  existingDispatchEvidenceRef: string | null = null,
  exactAuthorityEvidenceRef?: string,
): ResultLike {
  return {
    ok: false,
    dispatchDisposition: 'parked',
    reason,
    authorityEvidenceRef: exactAuthorityEvidenceRef ?? evidenceRef('hold', detail),
    invocationReceiptRef: receiptRef,
    ...(existingDispatchEvidenceRef ? { existingDispatchEvidenceRef } : {}),
  };
}

function reconciliationRequired(
  detail: string,
  receiptRef: InvocationReceiptRef | null,
  dispatchEvidenceRef: string,
): ResultLike {
  return {
    ok: false,
    dispatchDisposition: 'reconciliation-required',
    reason: 'MISSION_WORKER_INVOCATION_RECONCILIATION_REQUIRED',
    authorityEvidenceRef: evidenceRef('reconciliation', detail),
    invocationReceiptRef: receiptRef,
    existingDispatchEvidenceRef: dispatchEvidenceRef,
  };
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'unknown');
  }
  return error instanceof Error ? error.name : 'unknown';
}

function receiptRefFor(
  tenantId: string,
  projectId: string,
  invocationId: string,
): InvocationReceiptRef {
  return { schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION, tenantId, projectId, invocationId };
}

function assertExistingReceiptIdentity(
  existing: NonNullable<ReturnType<InvocationReceiptLedger['get']>>,
  mission: Mission,
  claim: MissionDispatchClaim,
  identity: MissionWorkerInvocationIdentity,
  projectId: string,
): void {
  const receipt = existing.receipt;
  if (receipt.invocationId !== identity.invocationId
    || receipt.idempotencyKey !== identity.idempotencyKey
    || receipt.tenantId !== mission.tenant
    || receipt.projectId !== projectId
    || receipt.runId !== claim.missionId
    || receipt.taskId !== claim.workItemId
    || receipt.callId !== identity.callId
    || receipt.role !== 'worker'
    || receipt.purpose !== 'worker-execution') {
    throw new Error('Existing invocation receipt differs from the canonical Mission claim');
  }
}

function selectedFromReceipt(
  existing: NonNullable<ReturnType<InvocationReceiptLedger['get']>>,
): RoleInvocationSelected | null {
  const { called, resolved, fallbackChain } = existing.receipt;
  if (called.provider === null || called.model === null) return null;
  return {
    provider: called.provider,
    model: called.model,
    source: resolved.source === 'fallback' ? 'fallback' : 'config',
    sequence: Math.max(1, fallbackChain.length + 1),
  };
}

function classifyExistingInvocation(
  admissionRuntime: HostRoleInvocationAdmissionRuntime,
  receiptLedger: InvocationReceiptLedger,
  admissionRequest: HostRoleInvocationAdmissionRequest,
  mission: Mission,
  claim: MissionDispatchClaim,
  identity: MissionWorkerInvocationIdentity,
): ResultLike | null {
  const scope = { tenantId: mission.tenant, projectId: receiptLedger.projectId };
  const existing = receiptLedger.get(scope, identity.invocationId);
  if (!existing) return null;
  assertExistingReceiptIdentity(existing, mission, claim, identity, receiptLedger.projectId);
  const ref = receiptRefFor(scope.tenantId, scope.projectId, identity.invocationId);
  const receiptDispatch = existing.events.find(event => event.type === 'dispatch_started');
  if (receiptDispatch) {
    return reconciliationRequired(
      'existing-receipt-dispatch', ref, `invocation-receipt-event:${receiptDispatch.eventId}`,
    );
  }

  const selected = selectedFromReceipt(existing);
  if (selected) {
    const reservationRequest = admissionRequest.buildReservation(selected);
    const reservation = admissionRuntime.getReservation(reservationRequest);
    const providerDispatch = reservation?.events.find(event => event.type === 'dispatched');
    if (providerDispatch) {
      return reconciliationRequired(
        'existing-provider-dispatch', ref,
        `provider-limit-reservation-event:${providerDispatch.eventId}`,
      );
    }
  }

  if (existing.consumerOutcome === 'rejected') {
    return parked(
      'MISSION_WORKER_INVOCATION_HOLD:replayed_rejection',
      `${claim.missionId}:${claim.workItemId}:${claim.attemptId}`,
      ref,
    );
  }
  return null;
}

/**
 * Host-owned worker invocation saga. Mission/receipt/limit stores are separate
 * durability domains: every post-dispatch uncertainty is therefore parked for
 * reconciliation, never automatically re-driven.
 */
export class MissionWorkerInvocationCoordinator implements MissionWorkerInvocationCoordinatorLike {
  constructor(
    private readonly authorities:
      | MissionWorkerInvocationAuthorities
      | MissionWorkerInvocationAuthorityHold
      | null,
  ) {}

  async execute(
    input: MissionWorkerInvocationExecuteInput,
    executeSelected: MissionWorkerExactExecutor,
  ): Promise<ResultLike> {
    if (!this.authorities) {
      return parked(
        'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE',
        `${input.claim.missionId}:${input.claim.workItemId}:${input.claim.attemptId}`,
      );
    }
    if ('state' in this.authorities) {
      const validReason = /^[a-z][a-z0-9_]*$/u.test(this.authorities.reasonCode);
      const validEvidence = /^[a-z][a-z0-9-]*:.+$/u.test(this.authorities.authorityEvidenceRef);
      return parked(
        `MISSION_WORKER_INVOCATION_HOLD:${
          validReason ? this.authorities.reasonCode : 'authority_failure'
        }`,
        `${input.claim.missionId}:${input.claim.workItemId}:${input.claim.attemptId}`,
        null,
        null,
        validEvidence ? this.authorities.authorityEvidenceRef : undefined,
      );
    }

    let receiptRef: InvocationReceiptRef | null = null;
    let dispatchEvidenceRef: string | null = null;
    try {
      assertClaim(input);
      const { admissionRuntime, receiptLedger } = this.authorities;
      const claimBinding = safeClaim(input.claim);
      const identity = deriveMissionWorkerInvocationIdentity(
        input.mission.tenant, receiptLedger.projectId, claimBinding,
      );
      const prepared = this.authorities.prepare({
        mission: input.mission,
        context: input.context,
        claim: claimBinding,
        projectId: receiptLedger.projectId,
        identity,
      });
      assertPreparation(prepared);
      if (!input.isClaimActive()) throw new Error('Mission dispatch claim expired during preparation');
      const admissionRequest = bindAdmissionRequest(
        prepared, input.mission, input.claim, receiptLedger.projectId, identity,
      );
      const replay = classifyExistingInvocation(
        admissionRuntime, receiptLedger, admissionRequest,
        input.mission, input.claim, identity,
      );
      if (replay) return replay;
      const admission = admissionRuntime.admit(admissionRequest);
      const receipt = buildReceipt(
        receiptLedger, input.mission, input.claim, identity, prepared, admission,
      );
      receiptRef = receiptLedger.declare(receipt).ref;
      const scope = { tenantId: receipt.tenantId, projectId: receipt.projectId };

      if (admission.decision === 'hold') {
        const reasonCode = admission.resolution.decisionReasonCode;
        receiptLedger.append(scope, receipt.invocationId, {
          eventId: eventId(receipt.invocationId, 'dispatch-rejected'),
          type: 'dispatch_rejected',
          payload: { reasonCode },
        });
        receiptLedger.append(scope, receipt.invocationId, {
          eventId: eventId(receipt.invocationId, 'consumer-rejected'),
          type: 'consumer_settled',
          payload: { outcome: 'rejected', reasonCode },
        });
        return parked(
          `MISSION_WORKER_INVOCATION_HOLD:${admission.reasonCode}`,
          admission.authorityEvidenceRef,
          receiptRef,
        );
      }

      if (admission.decision === 'non_reservable_subscription') {
        // The non-reservable subscription arm is produced ONLY by the xverify
        // verifier-adjudication ingress; the mission-worker admission runtime
        // never yields it. Rather than dispatch this xverify-only arm, park a
        // typed HOLD that preserves the admission's authority evidence — the
        // mission worker must never dispatch it, and never fails on a raw throw.
        return parked(
          'MISSION_WORKER_INVOCATION_HOLD:non_reservable_subscription_unsupported',
          admission.authorityEvidenceRef,
          receiptRef,
        );
      }

      if (!input.isClaimActive()) throw new Error('Mission dispatch claim expired before provider grant');
      const dispatchEvent = prepared.buildDispatchEvent(admission);
      if (dispatchEvent.type !== 'dispatched'
        || dispatchEvent.fenceTokenHash !== input.claim.fenceTokenHash) {
        throw new Error('Dispatch event is outside the exact Mission claim fence');
      }
      const dispatch = admissionRuntime.claimDispatch(admission, dispatchEvent);
      if (!dispatch.claimed) {
        return reconciliationRequired(
          dispatch.existingDispatchEvidenceRef, receiptRef, dispatch.existingDispatchEvidenceRef,
        );
      }
      dispatchEvidenceRef = dispatch.executionGrant.dispatchEventRef;
      receiptLedger.append(scope, receipt.invocationId, {
        eventId: eventId(receipt.invocationId, 'dispatch-started'),
        type: 'dispatch_started',
        payload: { attempt: Math.max(1, input.claim.itemRevision) },
      });
      if (!input.isClaimActive()) {
        return reconciliationRequired(
          'claim-expired-after-provider-grant', receiptRef, dispatchEvidenceRef,
        );
      }

      const grant = Object.freeze<MissionWorkerInvocationExecutionGrant>({
        ...dispatch.executionGrant,
        provider: admission.reservation.provider,
        model: admission.reservation.model,
        receiptRef,
        backend: admission.reservation.backend,
        auth: {
          mode: admission.reservation.authMode,
          accountRefHash: admission.reservation.accountRefHash,
        },
      });
      const execution = await executeSelected(grant);
      assertExecution(execution, admission);
      receiptLedger.append(scope, receipt.invocationId, execution.transportEvent);
      const settlement = admissionRuntime.settleDispatch(
        admission,
        execution.providerSettlementEvent,
      );
      receiptLedger.append(scope, receipt.invocationId, execution.consumerEvent);
      return {
        ...execution.result,
        invocationReceiptRef: receiptRef,
        providerLimitReservationId: admission.reservation.reservationId,
        providerLimitDispatchEvidenceRef: dispatchEvidenceRef,
        providerLimitSettlementEvidenceRef: `provider-limit-reservation-event:${settlement.eventId}`,
        calledProvider: admission.reservation.provider,
        calledModel: admission.reservation.model,
      };
    } catch (error) {
      if (dispatchEvidenceRef) {
        return reconciliationRequired(
          `${errorCode(error)}:${input.claim.missionId}:${input.claim.attemptId}`,
          receiptRef,
          dispatchEvidenceRef,
        );
      }
      return parked(
        'MISSION_WORKER_INVOCATION_HOLD:authority_failure',
        `${errorCode(error)}:${input.claim.missionId}:${input.claim.attemptId}`,
        receiptRef,
      );
    }
  }
}
