import { createHash } from 'node:crypto';

import type {
  InvocationOpenDispatchCandidate,
  InvocationReceiptReconciliationLedger,
  InvocationReceiptView,
  StoredInvocationEvent,
} from '../../../core/invocation-receipt.js';
import {
  deriveMissionWorkerInvocationIdentity,
  type MissionWorkerInvocationClaimBinding,
} from './mission-worker-invocation-coordinator.js';
import type {
  MissionEngineLease,
  MissionRecoveredDispatchAttemptV1,
  MissionStore,
} from './mission-types.js';

export interface MissionWorkerInvocationRecoverySummary {
  readonly inspected: number;
  readonly reconciled: number;
  readonly alreadyTerminal: number;
  readonly pending: number;
}

export interface MissionWorkerInvocationRecoveryReconcilerLike {
  reconcile(
    store: MissionStore,
    attempts: readonly MissionRecoveredDispatchAttemptV1[],
    engineLease: MissionEngineLease,
  ): MissionWorkerInvocationRecoverySummary;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function claimBinding(attempt: MissionRecoveredDispatchAttemptV1): MissionWorkerInvocationClaimBinding {
  return Object.freeze({
    schemaVersion: 1,
    workItemId: attempt.workItemId,
    missionId: attempt.missionId,
    claimedBy: attempt.claimedBy,
    claimedAt: attempt.claimedAt,
    itemRevision: attempt.itemRevision,
    attemptId: attempt.attemptId,
    fenceTokenHash: attempt.fenceTokenHash,
    claimRegistryRevision: attempt.claimRegistryRevision,
    claimRegistryDigest: attempt.claimRegistryDigest,
  });
}

function terminalTransportEvent(view: InvocationReceiptView): StoredInvocationEvent | null {
  for (let index = view.events.length - 1; index >= 0; index--) {
    const event = view.events[index];
    if (event?.type === 'transport_settled') return event;
  }
  return null;
}

function isExactReceipt(
  view: InvocationReceiptView,
  attempt: MissionRecoveredDispatchAttemptV1,
  projectId: string,
): boolean {
  const identity = deriveMissionWorkerInvocationIdentity(
    attempt.tenantId,
    projectId,
    claimBinding(attempt),
  );
  const receipt = view.receipt;
  return receipt.invocationId === identity.invocationId
    && receipt.idempotencyKey === identity.idempotencyKey
    && receipt.tenantId === attempt.tenantId
    && receipt.projectId === projectId
    && receipt.runId === attempt.missionId
    && receipt.taskId === attempt.workItemId
    && receipt.callId === identity.callId
    && receipt.role === 'worker'
    && receipt.purpose === 'worker-execution';
}

function isReconciliationConflict(error: unknown): boolean {
  return error !== null
    && typeof error === 'object'
    && 'code' in error
    && (error as { code?: unknown }).code === 'RECONCILIATION_CONFLICT';
}

/**
 * Cross-database recovery saga for Goal-v2 worker invocations.
 *
 * A MissionStore takeover is the death authority. This component never treats
 * time alone as proof and never re-drives work: it only closes the exact
 * invocation receipt as UNKNOWN, then acknowledges that durable terminal head.
 */
export class MissionWorkerInvocationRecoveryReconciler
implements MissionWorkerInvocationRecoveryReconcilerLike {
  constructor(private readonly ledger: InvocationReceiptReconciliationLedger) {}

  reconcile(
    store: MissionStore,
    attempts: readonly MissionRecoveredDispatchAttemptV1[],
    engineLease: MissionEngineLease,
  ): MissionWorkerInvocationRecoverySummary {
    let reconciled = 0;
    let alreadyTerminal = 0;
    let pending = 0;

    for (const attempt of attempts) {
      const identity = deriveMissionWorkerInvocationIdentity(
        attempt.tenantId,
        this.ledger.projectId,
        claimBinding(attempt),
      );
      const scope = { tenantId: attempt.tenantId, projectId: this.ledger.projectId };
      const candidate = this.ledger.scanOpenDispatches({
        before: engineLease.acquiredAt,
        tenantId: attempt.tenantId,
        invocationId: identity.invocationId,
        limit: 1,
      })[0];

      if (!candidate) {
        const view = this.ledger.get(scope, identity.invocationId);
        const terminal = view && isExactReceipt(view, attempt, this.ledger.projectId)
          ? terminalTransportEvent(view)
          : null;
        if (!terminal) {
          pending++;
          continue;
        }
        store.acknowledgeDispatchRecovery({
          schemaVersion: 1,
          recoveryId: attempt.recoveryId,
          outcome: 'receipt-already-terminal',
          invocationId: identity.invocationId,
          receiptEventId: terminal.eventId,
          receiptEventHash: terminal.hash,
          acknowledgedAt: engineLease.acquiredAt,
        }, engineLease);
        alreadyTerminal++;
        continue;
      }

      if (!this.isExactCandidate(candidate, attempt)) {
        pending++;
        continue;
      }
      const eventKey = digest([
        attempt.recoveryId,
        String(engineLease.epoch),
        candidate.dispatchEvent.hash,
      ].join('\0'));
      try {
        const terminal = this.ledger.reconcileOpenDispatch(candidate, {
          eventId: `mission-worker-recovery-${eventKey}`,
          evidenceRef: `mission-engine-takeover:${eventKey}`,
          occurredAt: engineLease.acquiredAt,
          outcome: 'unknown',
          exitCode: null,
          signal: null,
          reasonCode: 'coordinator_restart_orphan',
          durationMs: Math.max(
            0,
            Date.parse(engineLease.acquiredAt) - Date.parse(candidate.dispatchEvent.occurredAt),
          ),
        });
        store.acknowledgeDispatchRecovery({
          schemaVersion: 1,
          recoveryId: attempt.recoveryId,
          outcome: 'receipt-reconciled',
          invocationId: identity.invocationId,
          receiptEventId: terminal.eventId,
          receiptEventHash: terminal.hash,
          acknowledgedAt: engineLease.acquiredAt,
        }, engineLease);
        reconciled++;
      } catch (error) {
        if (!isReconciliationConflict(error)) throw error;
        const view = this.ledger.get(scope, identity.invocationId);
        const terminal = view && isExactReceipt(view, attempt, this.ledger.projectId)
          ? terminalTransportEvent(view)
          : null;
        if (!terminal) {
          pending++;
          continue;
        }
        store.acknowledgeDispatchRecovery({
          schemaVersion: 1,
          recoveryId: attempt.recoveryId,
          outcome: 'receipt-already-terminal',
          invocationId: identity.invocationId,
          receiptEventId: terminal.eventId,
          receiptEventHash: terminal.hash,
          acknowledgedAt: engineLease.acquiredAt,
        }, engineLease);
        alreadyTerminal++;
      }
    }

    return Object.freeze({
      inspected: attempts.length,
      reconciled,
      alreadyTerminal,
      pending,
    });
  }

  private isExactCandidate(
    candidate: InvocationOpenDispatchCandidate,
    attempt: MissionRecoveredDispatchAttemptV1,
  ): boolean {
    const view: InvocationReceiptView = {
      receipt: candidate.receipt,
      events: [candidate.dispatchEvent],
      transportOutcome: 'unknown',
      consumerOutcome: 'unknown',
    };
    return isExactReceipt(view, attempt, this.ledger.projectId);
  }
}
