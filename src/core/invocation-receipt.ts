import type { ProviderName } from './task-types.js';

export const INVOCATION_RECEIPT_SCHEMA_VERSION = 1 as const;

export type InvocationRole = 'brain' | 'worker' | 'auditor';
export type InvocationPurpose =
  | 'sprint-planning'
  | 'goal-authoring'
  | 'goal-acceptance'
  | 'reachability-probe'
  | 'worker-execution'
  | 'audit-evaluation';
export type InvocationEvidenceState = 'known' | 'unknown' | 'stale' | 'unavailable';
export type InvocationSelectionSource =
  | 'config'
  | 'directive'
  | 'router'
  | 'fallback'
  | 'wire'
  | 'none';
export type InvocationAuthMode = 'subscription' | 'api' | 'hybrid' | 'local' | 'unknown';
export type InvocationTransport = 'cli' | 'api' | 'http' | 'local-runtime';
export type InvocationExecutionBackend =
  | 'host-subprocess'
  | 'docker'
  | 'tmux'
  | 'api'
  | 'in-process'
  | 'unknown';
export type InvocationTaskDisposition =
  | 'not_dispatched'
  | 'done'
  | 'no_go'
  | 'manual_review_required';
export type InvocationReasonCode =
  | 'none'
  | 'no_provider'
  | 'budget_capability_unsupported'
  | 'provider_authority_rejected'
  | 'routing_authority_rejected'
  | 'execution_admission_rejected'
  | 'legacy_operator_attestation'
  | 'not_dispatched_settled'
  | 'command_build_failed'
  | 'spawn_error'
  | 'nonzero_exit'
  | 'timeout'
  | 'empty_output'
  | 'parse_failed'
  | 'validation_failed'
  | 'fallback_unreachable'
  | 'fallback_limit_hold'
  | 'fallback_exhausted'
  | 'provider_resolution_fallback'
  | 'abandoned_dispatch_reconciled'
  | 'coordinator_restart_orphan'
  | 'duplicate_invocation';

export type InvocationPreDispatchReasonCode =
  | 'no_provider'
  | 'budget_capability_unsupported'
  | 'provider_authority_rejected'
  | 'routing_authority_rejected'
  | 'execution_admission_rejected'
  | 'legacy_operator_attestation'
  | 'command_build_failed'
  | 'fallback_unreachable'
  | 'fallback_limit_hold'
  | 'fallback_exhausted';

/** Immutable, privacy-preserving authority for reconciling a receipt-less legacy task. */
export interface InvocationOperatorAttestation {
  readonly attestationKind: 'legacy-reconciliation';
  readonly operatorRefHash: string;
  readonly attestedAt: string;
  readonly reasonCode: InvocationPreDispatchReasonCode;
  readonly statementDigest: string;
  readonly taskContentDigest: string;
  readonly taskCreatedAt: string;
  readonly observedAbsenceEvidenceRefs: readonly string[];
}

export interface InvocationScope {
  readonly tenantId: string;
  readonly projectId: string;
}

export interface InvocationReceiptRef extends InvocationScope {
  readonly schemaVersion: typeof INVOCATION_RECEIPT_SCHEMA_VERSION;
  readonly invocationId: string;
}

export interface InvocationSelection {
  readonly provider: ProviderName | string | null;
  readonly model: string | null;
  readonly source: InvocationSelectionSource;
  readonly reasonCode: InvocationReasonCode;
}

export interface InvocationFallbackTransition {
  readonly sequence: number;
  readonly fromProvider: ProviderName | string | null;
  readonly fromModel: string | null;
  readonly toProvider: ProviderName | string;
  readonly toModel: string;
  readonly reasonCode: InvocationReasonCode;
  readonly reachabilityRef: string | null;
  readonly limitEvidenceRefs: readonly string[];
}

export interface InvocationReceipt {
  readonly schemaVersion: typeof INVOCATION_RECEIPT_SCHEMA_VERSION;
  readonly invocationId: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string | null;
  readonly callId: string;
  readonly role: InvocationRole;
  readonly purpose: InvocationPurpose;
  readonly configured: InvocationSelection;
  readonly requested: InvocationSelection;
  readonly resolved: InvocationSelection;
  readonly called: InvocationSelection;
  readonly backend: {
    readonly transport: InvocationTransport;
    readonly executionBackend: InvocationExecutionBackend;
    /** V1 writers may bind the already-hashed endpoint identity inline. */
    readonly endpointRefHash?: string | null;
  };
  readonly auth: {
    readonly mode: InvocationAuthMode;
    /** Opaque, already-hashed account correlation token. Never an email or credential. */
    readonly accountRefHash: string | null;
  };
  readonly fallbackChain: readonly InvocationFallbackTransition[];
  readonly reachability: {
    readonly state: InvocationEvidenceState;
    readonly evidenceRef: string | null;
  };
  readonly limits: {
    readonly state: InvocationEvidenceState;
    readonly evidenceRefs: readonly string[];
  };
  readonly createdAt: string;
}

export type InvocationEvent =
  | {
      readonly eventId: string;
      readonly type: 'dispatch_started';
      readonly occurredAt?: string;
      readonly payload: {
        readonly attempt: number;
        readonly executionEvidenceRef?: string;
        readonly calledProvider?: ProviderName | string;
        readonly calledModel?: string;
      };
    }
  | {
      readonly eventId: string;
      readonly type: 'dispatch_rejected';
      readonly occurredAt?: string;
      readonly payload: {
        readonly reasonCode: InvocationReasonCode;
        readonly evidenceRefs?: readonly string[];
        readonly attestation?: InvocationOperatorAttestation;
      };
    }
  | {
      readonly eventId: string;
      readonly type: 'transport_settled';
      readonly occurredAt?: string;
      readonly payload: {
        readonly outcome: 'succeeded' | 'failed' | 'timeout' | 'unknown';
        readonly exitCode: number | null;
        readonly signal: string | null;
        readonly reasonCode: InvocationReasonCode;
        readonly durationMs: number;
        readonly reconciliation?: {
          readonly evidenceRef: string;
          readonly dispatchEventHash: string;
        };
      };
    }
  | {
      readonly eventId: string;
      readonly type: 'consumer_settled';
      readonly occurredAt?: string;
      readonly payload: {
        readonly outcome: 'accepted' | 'rejected' | 'unknown';
        readonly reasonCode: InvocationReasonCode;
        readonly taskDisposition?: InvocationTaskDisposition;
        readonly evidenceRefs?: readonly string[];
      };
    };

export interface StoredInvocationEvent {
  readonly eventId: string;
  readonly invocationId: string;
  readonly sequence: number;
  readonly type: InvocationEvent['type'];
  readonly occurredAt: string;
  readonly payload: InvocationEvent['payload'];
  readonly payloadHash: string;
  readonly previousHash: string | null;
  readonly hash: string;
}

export interface InvocationReceiptView {
  readonly receipt: InvocationReceipt;
  readonly events: readonly StoredInvocationEvent[];
  readonly transportOutcome: 'not_dispatched' | 'succeeded' | 'failed' | 'timeout' | 'unknown';
  readonly consumerOutcome: 'accepted' | 'rejected' | 'unknown';
  readonly taskDisposition?: InvocationTaskDisposition | null;
}

export interface InvocationTaskReceiptScan extends InvocationScope {
  readonly taskId: string;
  readonly purpose?: InvocationPurpose;
  readonly limit?: number;
}

/**
 * One exact-scope task receipt projection for bulk readers. A task remains in
 * the result when it has no receipts, and every matching receipt is retained so
 * callers can distinguish absence from ambiguity without a lossy limit.
 */
export interface InvocationTaskReceiptGroup {
  readonly taskId: string;
  readonly receipts: readonly InvocationReceiptView[];
}

export interface InvocationTaskReceiptBulkScan extends InvocationScope {
  readonly taskIds: readonly string[];
  readonly purpose: InvocationPurpose;
}

export interface InvocationScopedTaskReceiptRequest {
  readonly tenantId: string;
  readonly taskId: string;
}

export interface InvocationProjectTaskReceiptBulkScan {
  readonly projectId: string;
  readonly requests: readonly InvocationScopedTaskReceiptRequest[];
  readonly purpose: InvocationPurpose;
}

export interface InvocationScopedTaskReceiptGroup extends InvocationScope {
  readonly taskId: string;
  readonly receipts: readonly InvocationReceiptView[];
}

export interface InvocationAtomicWrite {
  readonly receipt: InvocationReceipt;
  readonly events: readonly InvocationEvent[];
  /**
   * Last synchronous authority precondition, evaluated inside the same IMMEDIATE
   * SQLite transaction before any receipt/event row is written.
   */
  readonly requireSynchronousPrecondition?: () => boolean;
  /**
   * Optional task-level compare-and-set guard. The atomic write is refused when
   * any other receipt already owns the same task/purpose in this exact scope.
   */
  readonly requireTaskReceiptAbsence?: InvocationScope & {
    readonly taskId: string;
    readonly purpose: InvocationPurpose;
  };
}

export interface InvocationAtomicWriteResult {
  readonly declaration: InvocationDeclarationResult;
  readonly events: readonly StoredInvocationEvent[];
  readonly view: InvocationReceiptView;
}

export interface InvocationDeclarationResult {
  readonly ref: InvocationReceiptRef;
  readonly created: boolean;
}

export interface InvocationOpenDispatchCandidate {
  readonly ref: InvocationReceiptRef;
  readonly receipt: InvocationReceipt;
  readonly dispatchEvent: StoredInvocationEvent;
}

export interface InvocationOpenDispatchScan {
  /** Caller-authored UTC/offset timestamp; candidate selection is not death evidence. */
  readonly before: string;
  readonly tenantId?: string;
  /** Exact identity filter for recovery sagas; prevents unrelated open heads from starving lookup. */
  readonly invocationId?: string;
  readonly limit?: number;
}

export interface InvocationDispatchReconciliation {
  readonly eventId: string;
  readonly evidenceRef: string;
  readonly occurredAt?: string;
  readonly outcome: 'succeeded' | 'failed' | 'timeout' | 'unknown';
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly reasonCode: InvocationReasonCode;
  readonly durationMs: number;
}

export interface InvocationReceiptLedger {
  readonly projectId: string;
  declare(receipt: InvocationReceipt): InvocationDeclarationResult;
  append(scope: InvocationScope, invocationId: string, event: InvocationEvent): StoredInvocationEvent;
  get(scope: InvocationScope, invocationId: string): InvocationReceiptView | null;
  close(): void;
}

export interface InvocationReceiptReconciliationLedger extends InvocationReceiptLedger {
  declareTaskReceiptAtomic(receipt: InvocationReceipt): InvocationDeclarationResult;
  scanOpenDispatches(input: InvocationOpenDispatchScan): readonly InvocationOpenDispatchCandidate[];
  reconcileOpenDispatch(
    candidate: InvocationOpenDispatchCandidate,
    reconciliation: InvocationDispatchReconciliation,
  ): StoredInvocationEvent;
  writeAtomic(input: InvocationAtomicWrite): InvocationAtomicWriteResult;
  scanTaskReceipts(input: InvocationTaskReceiptScan): readonly InvocationReceiptView[];
  scanTaskReceiptsBulk(
    input: InvocationTaskReceiptBulkScan,
  ): readonly InvocationTaskReceiptGroup[];
  scanProjectTaskReceiptsBulk(
    input: InvocationProjectTaskReceiptBulkScan,
  ): readonly InvocationScopedTaskReceiptGroup[];
}
