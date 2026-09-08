import { createHash } from 'node:crypto';
import type { HostRoleInvocationAdmissionRequest, HostRoleInvocationAdmissionRuntime } from '../../../core/host-role-invocation-admission-runtime.js';
import { INVOCATION_RECEIPT_SCHEMA_VERSION, type InvocationOutputArtifactRef, type InvocationPurpose, type InvocationReceipt, type InvocationReceiptLedger, type InvocationRole, type InvocationSelection } from '../../../core/invocation-receipt.js';
import type { ProviderLimitAdmissionAllowed } from '../../../core/provider-limit-admission.js';
import type { ProviderLimitReservationEvent } from '../../../core/provider-limit-truth.js';
import type {
  GoalInvocationTransportBackend,
  GoalInvocationTransportInput,
  GoalInvocationTransportResult,
} from '../goal-invocation-transport.js';
import { GoalInvocationTransportError } from '../goal-invocation-transport.js';
import type { FinalOnlyUsageAuthorization } from '../../../core/execution-budget-policy.js';
import { GoalInvocationHeldError } from './goal-mission.js';
import type {
  GoalInvocationConsumerCheckpointV1,
  GoalInvocationConsumerReceiptSettlementV1,
} from './mission-types.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const ref = (kind: string, value: string) => `goal-${kind}:${hash(value)}`;

export interface GoalInvocationRuntimeInput {
  readonly tenantId: string;
  readonly missionId: string;
  readonly round: number;
  readonly role: Extract<InvocationRole, 'brain' | 'auditor'>;
  readonly purpose: Extract<InvocationPurpose, 'goal-authoring' | 'goal-acceptance'>;
  readonly prompt: string;
  readonly admission: HostRoleInvocationAdmissionRequest;
  readonly finalOnlyUsage: Readonly<FinalOnlyUsageAuthorization>;
}

export interface GoalInvocationPendingConsumer {
  readonly output: string;
  readonly outputDigest: string;
  readonly invocationReceiptRef: ReturnType<InvocationReceiptLedger['declare']>['ref'];
  /** Called only after the goal parser/consumer has durably accepted or rejected this output. */
  settleConsumer(
    outcome: 'accepted' | 'rejected',
    reasonCode?: 'none' | 'parse_failed' | 'validation_failed',
  ): GoalInvocationConsumerReceiptSettlementV1;
}

export class GoalInvocationRuntime {
  constructor(private readonly deps: {
    admissionRuntime: HostRoleInvocationAdmissionRuntime;
    receiptLedger: InvocationReceiptLedger;
    executeSelected: ((input: GoalInvocationTransportInput) => Promise<GoalInvocationTransportResult>) & {
      preflight?(input: Pick<GoalInvocationTransportInput, 'backend'>): void;
    };
    now?: () => Date;
  }) {}

  async execute(input: GoalInvocationRuntimeInput): Promise<GoalInvocationPendingConsumer> {
    if (!Number.isSafeInteger(input.round) || input.round < 1) throw new Error('GOAL_INVOCATION_ROUND_INVALID');
    const now = this.deps.now ?? (() => new Date());
    const invocationId = `goal-${hash(`${input.tenantId}\0${input.missionId}\0${input.round}\0${input.purpose}`)}`;
    const receiptAuthorityRef = `invocation-receipt:${hash(`${input.tenantId}\0${this.deps.receiptLedger.projectId}\0${invocationId}`)}`;
    const scope = { tenantId: input.tenantId, projectId: this.deps.receiptLedger.projectId };
    const replay = this.deps.receiptLedger.get(scope, invocationId);
    if (replay) {
      if (replay.consumerOutcome === 'accepted') throw new Error('GOAL_INVOCATION_ALREADY_CONSUMED');
      if (replay.transportOutcome === 'succeeded') {
        try {
          const artifact = this.deps.receiptLedger.readOutputArtifact(scope, invocationId);
          const candidate = artifact && input.admission.candidates[artifact.ref.provider];
          if (!artifact || artifact.ref.promptDigest !== hash(input.prompt) || artifact.ref.purpose !== input.purpose
            || artifact.reservationRequest.runId !== input.missionId || artifact.reservationRequest.taskId !== null
            || artifact.reservationRequest.callId !== `${input.purpose}:${input.round}`
            || artifact.reservationRequest.receiptRef !== receiptAuthorityRef
            || !candidate || candidate.provider !== artifact.ref.provider
            || candidate.model !== artifact.ref.model
            || !sameBackend(artifact.reservationRequest.backend, candidate.reachabilityQuery)
            || !sameBackend(artifact.reservationRequest.backend, replay.receipt.backend)) {
            throw new Error('binding mismatch');
          }
          this.deps.admissionRuntime.settleExistingDispatch(artifact.reservationRequest, artifact.usageEvent);
          return this.pendingConsumer(Buffer.from(artifact.bytes).toString('utf8'), artifact.ref, invocationId);
        } catch (error) {
          throw new GoalInvocationHeldError({ schemaVersion: 1, reasonCode: 'receipt_unavailable',
            evidenceRefs: [`goal-invocation-replay:${hash(error instanceof Error ? error.name : 'unknown')}`],
            invocationReceiptRef: { schemaVersion: 1, ...scope, invocationId }, heldAt: now().toISOString() });
        }
      }
      throw new Error('GOAL_INVOCATION_RECONCILIATION_REQUIRED');
    }
    let transportPreflightFailure: unknown = null;
    const admission = this.deps.admissionRuntime.admit({
      ...input.admission,
      buildReservation: selected => {
        const reservation = input.admission.buildReservation(selected);
        assertReservationPreflight(reservation, input, this.deps.receiptLedger.projectId, receiptAuthorityRef);
        try {
          const preflight = this.deps.executeSelected.preflight;
          if (!preflight) throw new Error('goal transport capability unavailable');
          preflight({ backend: reservation.backend });
        } catch (error) {
          transportPreflightFailure = error;
          throw error;
        }
        return reservation;
      },
    });
    if (transportPreflightFailure !== null) {
      throw new GoalInvocationHeldError({
        schemaVersion: 1,
        reasonCode: 'reservation_not_executable',
        evidenceRefs: [`goal-transport-backend:${hash(JSON.stringify(transportPreflightFailure instanceof Error
          ? transportPreflightFailure.name
          : 'unavailable'))}`],
        invocationReceiptRef: null,
        heldAt: now().toISOString(),
      });
    }
    if (admission.decision !== 'allow') throw new Error(`GOAL_INVOCATION_HOLD:${admission.decision}`);
    assertMeterable(admission);
    if (admission.reservation.tenantId !== input.tenantId
      || admission.reservation.projectId !== this.deps.receiptLedger.projectId
      || admission.reservation.runId !== input.missionId
      || admission.reservation.taskId !== null
      || admission.reservation.receiptRef !== receiptAuthorityRef) {
      throw new Error('GOAL_INVOCATION_RESERVATION_IDENTITY_MISMATCH');
    }
    const selected = admission.resolution.selected!;
    const selection: InvocationSelection = { provider: selected.provider, model: selected.model, source: selected.source, reasonCode: admission.resolution.decisionReasonCode };
    const receipt: InvocationReceipt = {
      schemaVersion: INVOCATION_RECEIPT_SCHEMA_VERSION, invocationId,
      idempotencyKey: invocationId, tenantId: input.tenantId, projectId: this.deps.receiptLedger.projectId,
      runId: input.missionId, taskId: null, callId: `${input.purpose}:${input.round}`,
      role: input.role, purpose: input.purpose,
      configured: admission.resolution.configured,
      requested: selection, resolved: selection, called: selection,
      backend: admission.reservation.backend,
      auth: { mode: admission.reservation.authMode, accountRefHash: admission.reservation.accountRefHash },
      fallbackChain: [], reachability: { state: 'known', evidenceRef: admission.reservation.reachabilityEvidenceRef },
      limits: { state: 'known', evidenceRefs: admission.reservation.estimateEvidenceRefs }, createdAt: now().toISOString(),
    };
    const receiptRef = this.deps.receiptLedger.declare(receipt).ref;
    const dispatchEvent = event(admission, 'dispatched', invocationId, now, undefined);
    const claim = this.deps.admissionRuntime.claimDispatch(admission, dispatchEvent);
    if (!claim.claimed) throw new Error('GOAL_INVOCATION_RECONCILIATION_REQUIRED');
    this.deps.receiptLedger.append(receiptRef, invocationId, { eventId: `${invocationId}-dispatch`, type: 'dispatch_started', payload: { attempt: input.round, calledProvider: String(selected.provider), calledModel: selected.model } });
    let result: GoalInvocationTransportResult;
    try {
      result = await this.deps.executeSelected({
        provider: String(selected.provider),
        model: selected.model,
        prompt: input.prompt,
        backend: admission.reservation.backend,
        maxWallClockSeconds: input.finalOnlyUsage.maxWallClockSeconds,
      });
    } catch (error) {
      const failure = error instanceof GoalInvocationTransportError ? error : null;
      this.deps.receiptLedger.append(receiptRef, invocationId, { eventId: `${invocationId}-transport`, type: 'transport_settled', payload: {
        outcome: failure?.outcome ?? 'unknown', exitCode: failure?.exitCode ?? null,
        signal: failure?.signal ?? null,
        reasonCode: failure?.reasonCode === 'backend_identity_mismatch'
          ? 'validation_failed'
          : failure?.reasonCode ?? 'spawn_error',
        durationMs: failure?.durationMs ?? 0,
      } });
      if (failure?.dispatchStarted === false) {
        this.deps.admissionRuntime.settleDispatch(admission, event(admission, 'released', invocationId, now));
      }
      throw error;
    }
    if (result.provider !== selected.provider || result.model !== selected.model
      || !sameBackend(result.backend, admission.reservation.backend)) {
      this.deps.receiptLedger.append(receiptRef, invocationId, { eventId: `${invocationId}-transport`, type: 'transport_settled', payload: {
        outcome: 'failed', exitCode: 0, signal: null, reasonCode: 'validation_failed', durationMs: result.durationMs,
      } });
      throw new Error('GOAL_SELECTED_TRANSPORT_IDENTITY_MISMATCH');
    }
    const usageEvent = event(admission, 'consumed', invocationId, now, result);
    const artifactRef = this.deps.receiptLedger.writeOutputArtifact({
      ref: { schemaVersion: 1, ...scope, invocationId, purpose: input.purpose,
        provider: String(selected.provider), model: selected.model, promptDigest: hash(input.prompt) },
      bytes: Buffer.from(result.output),
      transportEvent: { eventId: `${invocationId}-transport`, type: 'transport_settled', payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: result.durationMs } },
      reservationRequest: admission.reservation,
      usageEvent,
    });
    this.deps.admissionRuntime.settleDispatch(admission, usageEvent);
    return this.pendingConsumer(result.output, artifactRef, invocationId);
  }

  settlePersistedConsumer(
    checkpoint: GoalInvocationConsumerCheckpointV1,
  ): GoalInvocationConsumerReceiptSettlementV1 {
    const ref = checkpoint.invocationReceiptRef;
    const view = this.deps.receiptLedger.get(ref, ref.invocationId);
    const artifact = this.deps.receiptLedger.readOutputArtifact(ref, ref.invocationId);
    if (!view || !artifact || view.receipt.tenantId !== checkpoint.tenantId
      || view.receipt.projectId !== checkpoint.projectId
      || view.receipt.invocationId !== ref.invocationId
      || view.receipt.runId !== checkpoint.missionId || view.receipt.taskId !== null
      || view.receipt.callId !== `${checkpoint.purpose}:${checkpoint.round}`
      || view.receipt.purpose !== checkpoint.purpose
      || view.receipt.role !== (checkpoint.purpose === 'goal-authoring' ? 'brain' : 'auditor')
      || artifact.ref.invocationId !== ref.invocationId
      || artifact.ref.tenantId !== ref.tenantId || artifact.ref.projectId !== ref.projectId
      || artifact.ref.purpose !== checkpoint.purpose
      || artifact.ref.provider !== view.receipt.called.provider
      || artifact.ref.model !== view.receipt.called.model
      || artifact.reservationRequest.provider !== view.receipt.called.provider
      || artifact.reservationRequest.model !== view.receipt.called.model
      || !sameBackend(artifact.reservationRequest.backend, view.receipt.backend)
      || artifact.ref.contentSha256 !== checkpoint.outputDigest
      || createHash('sha256').update(artifact.bytes).digest('hex') !== checkpoint.outputDigest
      || view.transportOutcome !== 'succeeded' || view.consumerOutcome === 'rejected') {
      throw new Error('GOAL_INVOCATION_CHECKPOINT_RECEIPT_MISMATCH');
    }
    return this.appendConsumerSettlement(ref, 'accepted', 'none');
  }

  private appendConsumerSettlement(
    invocationReceiptRef: GoalInvocationConsumerReceiptSettlementV1['invocationReceiptRef'],
    outcome: 'accepted' | 'rejected',
    reasonCode: 'none' | 'parse_failed' | 'validation_failed',
  ): GoalInvocationConsumerReceiptSettlementV1 {
    const stored = this.deps.receiptLedger.append(invocationReceiptRef, invocationReceiptRef.invocationId, {
      eventId: `${invocationReceiptRef.invocationId}-consumer`,
      type: 'consumer_settled',
      payload: { outcome, reasonCode },
    });
    return {
      schemaVersion: 1,
      invocationReceiptRef,
      receiptEventId: stored.eventId,
      receiptEventHash: stored.hash,
    };
  }

  private pendingConsumer(
    output: string,
    artifactRef: InvocationOutputArtifactRef,
    invocationId: string,
  ): GoalInvocationPendingConsumer {
    let consumerSettled = false;
    return {
      output,
      outputDigest: artifactRef.contentSha256,
      invocationReceiptRef: { schemaVersion: 1, tenantId: artifactRef.tenantId, projectId: artifactRef.projectId, invocationId },
      settleConsumer: (outcome, reasonCode = outcome === 'accepted' ? 'none' : 'validation_failed') => {
        if (consumerSettled) throw new Error('GOAL_INVOCATION_CONSUMER_ALREADY_SETTLED');
        const settlement = this.appendConsumerSettlement(
          { schemaVersion: 1, tenantId: artifactRef.tenantId, projectId: artifactRef.projectId, invocationId },
          outcome,
          reasonCode,
        );
        consumerSettled = true;
        return settlement;
      },
    };
  }
}

function sameBackend(
  left: (Omit<GoalInvocationTransportBackend, 'endpointRefHash'> & { readonly endpointRefHash?: string | null }) | null | undefined,
  right: (Omit<GoalInvocationTransportBackend, 'endpointRefHash'> & { readonly endpointRefHash?: string | null }) | null | undefined,
): boolean {
  return !!left && !!right
    && left.transport === right.transport
    && left.executionBackend === right.executionBackend
    && (left.endpointRefHash ?? null) === (right.endpointRefHash ?? null);
}

function assertMeterable(admission: ProviderLimitAdmissionAllowed): void {
  if (admission.reservation.estimates.some(item => item.unit !== 'tokens' && item.unit !== 'requests')) {
    throw new Error('GOAL_PROVIDER_USAGE_UNIT_UNSUPPORTED');
  }
}

function assertReservationPreflight(
  reservation: ReturnType<HostRoleInvocationAdmissionRequest['buildReservation']>,
  input: GoalInvocationRuntimeInput,
  projectId: string,
  receiptAuthorityRef: string,
): void {
  if (reservation.tenantId !== input.tenantId || reservation.projectId !== projectId
    || reservation.runId !== input.missionId || reservation.taskId !== null
    || reservation.receiptRef !== receiptAuthorityRef
    || reservation.estimates.some(item => item.unit !== 'tokens' && item.unit !== 'requests')) {
    throw new Error('GOAL_INVOCATION_RESERVATION_PREFLIGHT_FAILED');
  }
}

function event(admission: ProviderLimitAdmissionAllowed, type: 'dispatched' | 'consumed' | 'released', invocationId: string, now: () => Date, result?: GoalInvocationTransportResult): ProviderLimitReservationEvent {
  return {
    eventId: `${invocationId}-${type}`, type, occurredAt: now().toISOString(), fenceTokenHash: admission.reservation.fenceTokenHash,
    evidenceRef: ref(type, invocationId),
    ...(type === 'consumed' ? { actual: admission.reservation.estimates.map(item => ({ windowId: item.windowId, unit: item.unit, amount: item.unit === 'requests' ? 1 : result!.usage.totalTokens })) } : {}),
  };
}
