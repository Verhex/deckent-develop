import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  canonicalTaskAttemptCustodyJson,
  taskAttemptCustodyDigest,
  type Sha256Digest,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyStore,
} from '../core/task-attempt-custody-store.js';
import type { ExactAcceptedTaskResultAuthorityMetadata } from './task-result-authority.js';
import {
  exactDockerDispatchCanonicalDigest,
  parseExactDockerDispatchTaskSnapshotAuthority,
} from './exact-docker-dispatch-task-authority.js';

export type ExactDockerProviderExitHoldReason =
  | 'provider-exit-admission-unavailable'
  | 'provider-exit-task-snapshot-invalid'
  | 'provider-exit-dispatch-admission-unavailable'
  | 'provider-exit-attempt-mismatch'
  | 'provider-exit-dispatch-not-released'
  | 'provider-exit-observation-missing'
  | 'provider-exit-observation-incomplete'
  | 'provider-exit-observation-invalid'
  | 'provider-exit-replay-mismatch';

export interface ExactAcceptedTaskProviderExitAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-accepted-task-provider-exit-authority-v2';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly dispatchRequestId: string;
  readonly dispatchAdmissionRefDigest: Sha256Digest;
  readonly dispatchReservationReceiptDigest: Sha256Digest;
  readonly dispatchAuthorityReceiptDigest: Sha256Digest;
  readonly dispatchProjectionFence: Sha256Digest;
  readonly providerExecutionAttemptId: string;
  readonly backendExecutionId: string;
  readonly exitCode: number;
  readonly dockerWaitProcessExitCode: 0;
  readonly dockerWaitSignal: null;
  readonly stdoutSha256: Sha256Digest;
  readonly stderrSha256: Sha256Digest;
  readonly waitEvidenceDigest: Sha256Digest;
  readonly observedAt: string;
  readonly providerExitObservationReceiptDigest: Sha256Digest;
  readonly providerExitObservationEvidenceDigest: Sha256Digest;
  readonly providerExitObservationBytesSha256: Sha256Digest;
  readonly authorityDigest: Sha256Digest;
}

export type ReadExactAcceptedTaskProviderExitAuthorityResult =
  | {
      readonly state: 'current';
      readonly authority: ExactAcceptedTaskProviderExitAuthorityV2;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: ExactDockerProviderExitHoldReason;
    };

function sameIdentity(
  left: TaskAttemptCustodyIdentityV2,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) return null;
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if (ownKeys.length !== keys.length) return null;
  const expected = new Set(keys);
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expected.has(key)) return null;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function rawDigest(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function hold(
  reasonCode: ExactDockerProviderExitHoldReason,
): ReadExactAcceptedTaskProviderExitAuthorityResult {
  return Object.freeze({ state: 'hold' as const, reasonCode });
}

/**
 * Resolve provider termination only through the accepted attempt's immutable
 * Store lineage. Caller exit codes, container ids, timestamps and refs are not
 * inputs to this boundary.
 */
export function readExactAcceptedTaskProviderExitAuthority(input: {
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ReadExactAcceptedTaskProviderExitAuthorityResult {
  try {
    const identity = input.acceptedAuthority.identity;
    const admission = input.custodyStore.readAdmission(identity, input.policy);
    if (
      admission === null
      || admission.receiptDigest !== input.acceptedAuthority.admissionReceiptDigest
      || !sameIdentity(admission.identity, identity)
    ) return hold('provider-exit-admission-unavailable');

    const snapshot = input.custodyStore.readTaskSnapshot({
      identity,
      policy: input.policy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (snapshot === null || snapshot.proof.sha256 !== admission.taskSnapshot.sha256) {
      return hold('provider-exit-task-snapshot-invalid');
    }
    const taskAuthority = parseExactDockerDispatchTaskSnapshotAuthority(
      snapshot.bytes,
      input.policy,
    );
    if (
      taskAuthority === null
      || taskAuthority.snapshotSha256 !== snapshot.proof.sha256
      || taskAuthority.projectId !== identity.projectId
      || taskAuthority.taskId !== identity.taskId
    ) return hold('provider-exit-task-snapshot-invalid');

    const dispatched = (() => {
      try {
        return input.custodyStore.readDispatchAdmission({
          dispatchRequestId: taskAuthority.dispatchRequestId,
          policy: input.policy,
        });
      } catch {
        return null;
      }
    })();
    if (dispatched === null || dispatched.state !== 'admitted') {
      return hold('provider-exit-dispatch-admission-unavailable');
    }
    if (
      dispatched.ref.dispatchRequestId !== taskAuthority.dispatchRequestId
      || !sameIdentity(dispatched.ref.identity, identity)
      || !sameIdentity(dispatched.admission.identity, identity)
      || dispatched.ref.admissionReceiptDigest !== admission.receiptDigest
      || dispatched.ref.reservationReceiptDigest !== dispatched.reservation.receiptDigest
      || dispatched.ref.dispatchRequestMaterialDigest
        !== dispatched.reservation.dispatchRequestMaterialDigest
    ) return hold('provider-exit-attempt-mismatch');

    const dispatch = (() => {
      try {
        return input.custodyStore.readDispatchAuthority({
          admissionRef: dispatched.ref,
          policy: input.policy,
        });
      } catch {
        return null;
      }
    })();
    if (dispatch === null || dispatch.state !== 'terminal'
      || dispatch.authority.state !== 'RELEASED') {
      return hold('provider-exit-dispatch-not-released');
    }
    const released = dispatch.authority;
    if (
      !sameIdentity(released.admissionRef.identity, identity)
      || released.admissionRef.refDigest !== dispatched.ref.refDigest
      || released.providerExecutionAttempt.backendExecutionId !== released.backendExecutionId
      || !sameIdentity(released.providerExecutionAttempt.custodyIdentity, identity)
      || released.providerExecutionAttempt.admissionReceiptDigest !== admission.receiptDigest
    ) return hold('provider-exit-attempt-mismatch');

    const observation = (() => {
      try {
        return input.custodyStore.readDispatchObservationByClass({
          admissionRef: dispatched.ref,
          policy: input.policy,
          observationClass: 'PROVIDER_EXIT',
        });
      } catch {
        return null;
      }
    })();
    if (observation === null) return hold('provider-exit-observation-missing');
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(observation.bytes).toString('utf8')) as unknown;
    } catch {
      return hold('provider-exit-observation-invalid');
    }
    let canonical: Uint8Array;
    try {
      canonical = canonicalTaskAttemptCustodyJson(decoded, input.policy.jsonBounds);
    } catch {
      return hold('provider-exit-observation-invalid');
    }
    if (!Buffer.from(canonical).equals(Buffer.from(observation.bytes))) {
      return hold('provider-exit-observation-invalid');
    }
    const record = exactRecord(decoded, [
      'schemaVersion', 'kind', 'admissionRefDigest', 'containerId', 'exitCode',
      'dockerWaitProcessExitCode', 'dockerWaitSignal', 'stdoutSha256',
      'stderrSha256', 'waitEvidenceDigest', 'observedAt',
    ]);
    if (record === null) return hold('provider-exit-observation-incomplete');
    if (
      record.schemaVersion !== 2
      || record.kind !== 'exact-docker-provider-exit'
      || record.admissionRefDigest !== dispatched.ref.refDigest
      || record.containerId !== released.backendExecutionId
      || !Number.isSafeInteger(record.exitCode)
      || Number(record.exitCode) < 0
      || Number(record.exitCode) > 255
      || record.dockerWaitProcessExitCode !== 0
      || record.dockerWaitSignal !== null
      || !isDigest(record.stdoutSha256)
      || !isDigest(record.stderrSha256)
      || !isDigest(record.waitEvidenceDigest)
      || !isTimestamp(record.observedAt)
      || record.observedAt !== observation.receipt.observedAt
      || Date.parse(record.observedAt) < Date.parse(released.recordedAt)
      || Date.parse(record.observedAt) < Date.parse(released.releaseEvidence.releasedAt)
    ) return hold('provider-exit-observation-invalid');
    const waitEvidence = Object.freeze({
      admissionRefDigest: record.admissionRefDigest,
      containerId: record.containerId,
      exitCode: record.exitCode,
      dockerWaitProcessExitCode: record.dockerWaitProcessExitCode,
      dockerWaitSignal: record.dockerWaitSignal,
      stdoutSha256: record.stdoutSha256,
      stderrSha256: record.stderrSha256,
      observedAt: record.observedAt,
    });
    if (exactDockerDispatchCanonicalDigest(waitEvidence, input.policy)
      !== record.waitEvidenceDigest) return hold('provider-exit-replay-mismatch');

    const body = Object.freeze({
      schemaVersion: 2 as const,
      kind: 'exact-accepted-task-provider-exit-authority-v2' as const,
      identity: Object.freeze({ ...identity }),
      admissionReceiptDigest: admission.receiptDigest,
      taskSnapshotSha256: snapshot.proof.sha256,
      dispatchRequestId: taskAuthority.dispatchRequestId,
      dispatchAdmissionRefDigest: dispatched.ref.refDigest,
      dispatchReservationReceiptDigest: dispatched.reservation.receiptDigest,
      dispatchAuthorityReceiptDigest: released.receiptDigest,
      dispatchProjectionFence: released.projectionFence,
      providerExecutionAttemptId: released.providerExecutionAttempt.providerExecutionAttemptId,
      backendExecutionId: released.backendExecutionId,
      exitCode: Number(record.exitCode),
      dockerWaitProcessExitCode: 0 as const,
      dockerWaitSignal: null,
      stdoutSha256: record.stdoutSha256,
      stderrSha256: record.stderrSha256,
      waitEvidenceDigest: record.waitEvidenceDigest,
      observedAt: record.observedAt,
      providerExitObservationReceiptDigest: observation.receipt.receiptDigest,
      providerExitObservationEvidenceDigest: observation.receipt.evidenceDigest,
      providerExitObservationBytesSha256: rawDigest(observation.bytes),
    });
    const authority = Object.freeze({
      ...body,
      authorityDigest: taskAttemptCustodyDigest(
        'exact-accepted-task-provider-exit-authority-v2',
        body,
        input.policy.jsonBounds,
      ),
    });
    return Object.freeze({ state: 'current' as const, authority });
  } catch {
    return hold('provider-exit-observation-invalid');
  }
}
