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
export type InvocationReasonCode =
  | 'none'
  | 'no_provider'
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
  | 'coordinator_restart_orphan'
  | 'duplicate_invocation';

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
      readonly payload: { readonly attempt: number };
    }
  | {
      readonly eventId: string;
      readonly type: 'dispatch_rejected';
      readonly occurredAt?: string;
      readonly payload: { readonly reasonCode: InvocationReasonCode };
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
  scanOpenDispatches(input: InvocationOpenDispatchScan): readonly InvocationOpenDispatchCandidate[];
  reconcileOpenDispatch(
    candidate: InvocationOpenDispatchCandidate,
    reconciliation: InvocationDispatchReconciliation,
  ): StoredInvocationEvent;
}
