/** Read-only, surface-neutral contract for exact worker output custody. */

import type {
  Sha256Digest,
  TaskAttemptCustodyHoldCode,
  TaskAttemptCustodyNotDispatchedReasonCode,
} from './task-attempt-custody-store.js';

declare const TASK_OUTPUT_READ_CAPABILITY: unique symbol;

/** Opaque process-local authority. Runtime consumers must revalidate it with its minting backend. */
export interface TaskOutputReadCapability {
  readonly [TASK_OUTPUT_READ_CAPABILITY]: true;
}

export interface TaskOutputReadQuery {
  readonly projectId: string;
  readonly taskId: string;
  readonly sprintId?: string;
  readonly attemptId?: string;
  readonly dispatchRequestId?: string;
  readonly caller: Readonly<{ readonly id: string; readonly tenantId?: string }>;
  readonly strictTenantIsolation: boolean;
}

export interface TaskOutputReadIdentity {
  readonly projectId: string;
  readonly taskId: string;
  readonly sprintId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly dispatchRequestId: string;
  readonly tenantId: string;
  readonly provider: string;
  readonly model: string;
}

export interface TaskOutputLiveObserveInput {
  readonly tail: number;
  readonly follow: boolean;
  readonly signal: AbortSignal;
  readonly limits: Readonly<{
    readonly termGraceMs: number;
    readonly reapObservationMs: number;
    readonly streamCloseMs: number;
  }>;
  /** Raw custody bytes remain internal to the application-service composition. */
  readonly onChunk: (
    bytes: Uint8Array,
    source: 'stdout' | 'stderr',
  ) => void | Promise<void>;
}

export type TaskOutputLiveObserveResult = Readonly<
  | { readonly state: 'closed'; readonly terminalMeaning: 'observer-only' }
  | { readonly state: 'aborted' }
  | {
      readonly state: 'unavailable';
      readonly reasonCode:
        | 'invalid-observation'
        | 'capability-denied'
        | 'custody-changed'
        | 'daemon-unavailable'
        | 'daemon-identity-mismatch'
        | 'unsupported-platform'
        | 'anchor-unavailable'
        | 'observer-spawn-failed'
        | 'observer-exit'
        | 'observer-anchor-lost'
        | 'sink-failed'
        | 'stream-close-timeout'
        | 'cleanup-unproven';
    }
>;

export type TaskOutputReadResult = Readonly<
  | {
      readonly state: 'sealed';
      readonly identity: TaskOutputReadIdentity;
      readonly capability: TaskOutputReadCapability;
      readonly source: 'pristine-provider-stream';
      readonly encoding: 'utf8';
      readonly content: string;
      readonly receiptDigest: Sha256Digest;
      readonly contentSha256: Sha256Digest;
      readonly byteLength: number;
      readonly capturedAt: string;
      readonly providerExitReceiptDigest: Sha256Digest;
    }
  | {
      readonly state: 'pending';
      readonly identity: TaskOutputReadIdentity;
      readonly phase: 'dispatch' | 'provider-exit' | 'stream-seal';
      readonly capability: TaskOutputReadCapability | null;
    }
  | {
      readonly state: 'not-dispatched';
      readonly identity: TaskOutputReadIdentity;
      readonly receiptDigest: Sha256Digest;
      readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode;
    }
  | {
      readonly state: 'ambiguous';
      readonly reasonCode: 'multiple-exact-attempts' | 'dispatch-authority-ambiguous';
      readonly candidateCount: number;
    }
  | {
      readonly state: 'unavailable';
      readonly reasonCode: 'store-unavailable' | 'admission-not-found' | 'custody-read-hold';
      readonly detailCode?: TaskAttemptCustodyHoldCode;
    }
  | {
      readonly state: 'denied';
      readonly reasonCode:
        | 'invalid-query'
        | 'project-mismatch'
        | 'task-mismatch'
        | 'sprint-mismatch'
        | 'attempt-mismatch'
        | 'tenant-unresolved'
        | 'tenant-mismatch';
    }
>;

export interface TaskOutputReadService {
  read(query: TaskOutputReadQuery): TaskOutputReadResult;
  observe(
    capability: TaskOutputReadCapability,
    input: TaskOutputLiveObserveInput,
  ): Promise<TaskOutputLiveObserveResult>;
}
