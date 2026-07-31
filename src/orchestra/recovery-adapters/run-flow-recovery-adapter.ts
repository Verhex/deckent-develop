import {
  decideExecutionRecovery,
  type ExecutionRecoveryEvidence,
  type ExecutionRecoveryIdentity,
  type ExecutionRecoveryInput,
} from '../../core/execution-recovery.js';

export type RunFlowRecoveryState = 'DETACHED_RUNNING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'BLOCKED';
export type RunFlowProcessState = 'ALIVE' | 'DEAD' | 'UNKNOWN';

export interface RunFlowProcessEvidence {
  readonly state: RunFlowProcessState;
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRef: string;
}

export interface RunFlowTerminalReceipt {
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRef: string;
}

export interface RunFlowRecoveryRead {
  readonly expectedIdentity: ExecutionRecoveryIdentity;
  readonly state: RunFlowRecoveryState;
  readonly evidenceRefs: readonly string[];
  readonly previousProgressSequence: number;
  readonly observedProgressSequence: number;
  readonly wallClockProjection: 'FRESH' | 'STALE';
  readonly process?: RunFlowProcessEvidence;
  readonly terminalReceipt?: RunFlowTerminalReceipt;
  readonly resumePermitRef?: string;
  readonly finalizePermitRef?: string;
}

export type RunFlowReconciliationProposal =
  | { readonly action: 'OBSERVE_ONLY'; readonly reason: 'VERIFIED_LIVE' }
  | { readonly action: 'REQUEST_RESUME_APPROVAL'; readonly reason: 'EXACT_ATTEMPT_RECOVERABLE' }
  | { readonly action: 'REQUEST_FINALIZE_APPROVAL'; readonly reason: 'EXACT_ATTEMPT_TERMINAL' }
  | { readonly action: 'HOLD'; readonly reason: 'INSUFFICIENT_OR_CONFLICTING_EVIDENCE' };

export interface RunFlowRecoveryReadResult {
  readonly input: ExecutionRecoveryInput;
  readonly decision: ReturnType<typeof decideExecutionRecovery>;
  readonly reconciliation: RunFlowReconciliationProposal;
}

function matches(expected: ExecutionRecoveryIdentity, observed: ExecutionRecoveryIdentity): boolean {
  return expected.taskId === observed.taskId
    && expected.attemptId === observed.attemptId
    && expected.fenceToken === observed.fenceToken;
}

function processEvidence(read: RunFlowRecoveryRead): Pick<ExecutionRecoveryEvidence, 'process' | 'fence'> {
  if (!read.process || !matches(read.expectedIdentity, read.process.identity)) {
    return { process: 'UNKNOWN', fence: 'UNKNOWN' };
  }
  if (read.process.state === 'ALIVE') return { process: 'ALIVE', fence: 'ACTIVE' };
  if (read.process.state === 'DEAD') return { process: 'ABSENT', fence: 'INACTIVE' };
  return { process: 'UNKNOWN', fence: 'UNKNOWN' };
}

function reconciliationFor(decision: ReturnType<typeof decideExecutionRecovery>): RunFlowReconciliationProposal {
  if (decision.decision === 'HEALTHY') return { action: 'OBSERVE_ONLY', reason: 'VERIFIED_LIVE' };
  if (decision.decision === 'SAFE_TO_RESUME') return { action: 'REQUEST_RESUME_APPROVAL', reason: 'EXACT_ATTEMPT_RECOVERABLE' };
  if (decision.decision === 'SAFE_TO_FINALIZE') return { action: 'REQUEST_FINALIZE_APPROVAL', reason: 'EXACT_ATTEMPT_TERMINAL' };
  return { action: 'HOLD', reason: 'INSUFFICIENT_OR_CONFLICTING_EVIDENCE' };
}

/**
 * Pure read adapter. A flow state is only a claim: process and receipt evidence
 * must carry the exact task/attempt/fence identity before it affects recovery.
 */
export function readRunFlowRecovery(read: RunFlowRecoveryRead): RunFlowRecoveryReadResult {
  const verifiedProcess = processEvidence(read);
  const receiptMatches = read.terminalReceipt !== undefined
    && matches(read.expectedIdentity, read.terminalReceipt.identity);
  const evidenceRefs = [
    ...read.evidenceRefs,
    ...(read.process && matches(read.expectedIdentity, read.process.identity) ? [read.process.evidenceRef] : []),
    ...(receiptMatches ? [read.terminalReceipt!.evidenceRef] : []),
  ];
  const evidence: ExecutionRecoveryEvidence = {
    identity: read.expectedIdentity,
    evidenceRefs,
    dispatch: 'DISPATCHED',
    control: receiptMatches || read.state === 'DETACHED_RUNNING' || read.state === 'RUNNING' ? 'RUNNING' : 'HELD',
    ...verifiedProcess,
    previousProgressSequence: read.previousProgressSequence,
    observedProgressSequence: read.observedProgressSequence,
    wallClockProjection: read.wallClockProjection,
    completion: receiptMatches ? 'DURABLE' : 'INCOMPLETE',
    ...(read.resumePermitRef ? { resumePermitRef: read.resumePermitRef } : {}),
    ...(read.finalizePermitRef ? { finalizePermitRef: read.finalizePermitRef } : {}),
  };
  const input = { expectedIdentity: read.expectedIdentity, evidence };
  const decision = decideExecutionRecovery(input);
  return { input, decision, reconciliation: reconciliationFor(decision) };
}

/** Effect boundary: exposes a proposal only; it never replays a provider operation. */
export function planRunFlowRecoveryEffect(result: RunFlowRecoveryReadResult): RunFlowReconciliationProposal {
  return result.reconciliation;
}
