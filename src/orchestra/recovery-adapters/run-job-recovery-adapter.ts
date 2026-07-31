import {
  decideExecutionRecovery,
  type ExecutionRecoveryEvidence,
  type ExecutionRecoveryIdentity,
  type ExecutionRecoveryInput,
} from '../../core/execution-recovery.js';

export type RunJobRecoveryState = 'RUNNING' | 'DETACHED_RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'BLOCKED';
export type RunJobProcessState = 'ALIVE' | 'DEAD' | 'UNKNOWN';

export interface RunJobProcessEvidence {
  readonly state: RunJobProcessState;
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRef: string;
}

export interface RunJobTerminalReceipt {
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRef: string;
}

export interface RunJobRecoveryRead {
  readonly expectedIdentity: ExecutionRecoveryIdentity;
  readonly state: RunJobRecoveryState;
  readonly evidenceRefs: readonly string[];
  readonly previousProgressSequence: number;
  readonly observedProgressSequence: number;
  readonly wallClockProjection: 'FRESH' | 'STALE';
  readonly process?: RunJobProcessEvidence;
  readonly terminalReceipt?: RunJobTerminalReceipt;
  readonly resumePermitRef?: string;
  readonly finalizePermitRef?: string;
}

export type RunJobReconciliationProposal =
  | { readonly action: 'OBSERVE_ONLY'; readonly reason: 'VERIFIED_LIVE' }
  | { readonly action: 'REQUEST_RESUME_APPROVAL'; readonly reason: 'EXACT_ATTEMPT_RECOVERABLE' }
  | { readonly action: 'REQUEST_FINALIZE_APPROVAL'; readonly reason: 'EXACT_ATTEMPT_TERMINAL' }
  | { readonly action: 'HOLD'; readonly reason: 'INSUFFICIENT_OR_CONFLICTING_EVIDENCE' };

export interface RunJobRecoveryReadResult {
  readonly input: ExecutionRecoveryInput;
  readonly decision: ReturnType<typeof decideExecutionRecovery>;
  readonly reconciliation: RunJobReconciliationProposal;
}

function matches(expected: ExecutionRecoveryIdentity, observed: ExecutionRecoveryIdentity): boolean {
  return expected.taskId === observed.taskId
    && expected.attemptId === observed.attemptId
    && expected.fenceToken === observed.fenceToken;
}

function processEvidence(read: RunJobRecoveryRead): Pick<ExecutionRecoveryEvidence, 'process' | 'fence'> {
  if (!read.process || !matches(read.expectedIdentity, read.process.identity)) {
    return { process: 'UNKNOWN', fence: 'UNKNOWN' };
  }
  if (read.process.state === 'ALIVE') return { process: 'ALIVE', fence: 'ACTIVE' };
  if (read.process.state === 'DEAD') return { process: 'ABSENT', fence: 'INACTIVE' };
  return { process: 'UNKNOWN', fence: 'UNKNOWN' };
}

function reconciliationFor(decision: ReturnType<typeof decideExecutionRecovery>): RunJobReconciliationProposal {
  if (decision.decision === 'HEALTHY') return { action: 'OBSERVE_ONLY', reason: 'VERIFIED_LIVE' };
  if (decision.decision === 'SAFE_TO_RESUME') return { action: 'REQUEST_RESUME_APPROVAL', reason: 'EXACT_ATTEMPT_RECOVERABLE' };
  if (decision.decision === 'SAFE_TO_FINALIZE') return { action: 'REQUEST_FINALIZE_APPROVAL', reason: 'EXACT_ATTEMPT_TERMINAL' };
  return { action: 'HOLD', reason: 'INSUFFICIENT_OR_CONFLICTING_EVIDENCE' };
}

/** Pure read adapter. A raw job status cannot establish liveness or replay authority. */
export function readRunJobRecovery(read: RunJobRecoveryRead): RunJobRecoveryReadResult {
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

/** Effect boundary: returns a reconciliation request and performs no provider work. */
export function planRunJobRecoveryEffect(result: RunJobRecoveryReadResult): RunJobReconciliationProposal {
  return result.reconciliation;
}
