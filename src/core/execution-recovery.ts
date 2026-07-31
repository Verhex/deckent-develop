export const EXECUTION_RECOVERY_DECISIONS = [
  'HEALTHY',
  'STALLED',
  'ORPHANED',
  'NOT_DISPATCHED',
  'PAUSED',
  'HELD',
  'SAFE_TO_RESUME',
  'SAFE_TO_FINALIZE',
] as const;

export type ExecutionRecoveryDecision =
  (typeof EXECUTION_RECOVERY_DECISIONS)[number];

export type ExecutionRecoveryReasonCode =
  | 'MONOTONIC_PROGRESS_OBSERVED'
  | 'NO_MONOTONIC_PROGRESS'
  | 'EXECUTION_DEFINITIVELY_ABSENT'
  | 'DISPATCH_NOT_OBSERVED'
  | 'EXECUTION_PAUSED'
  | 'EXECUTION_HELD'
  | 'RESUME_EXPLICITLY_AUTHORIZED'
  | 'FINALIZE_EXPLICITLY_AUTHORIZED'
  | 'EVIDENCE_INCOMPLETE'
  | 'EVIDENCE_CONTRADICTORY'
  | 'ATTEMPT_IDENTITY_MISMATCH'
  | 'FENCE_IDENTITY_MISMATCH';

export type ExecutionRecoveryOperation =
  | 'OBSERVE'
  | 'WAIT'
  | 'REQUEST_EVIDENCE'
  | 'REQUEST_RESUME_AUTHORIZATION'
  | 'RESUME_EXACT_ATTEMPT'
  | 'FINALIZE_EXACT_ATTEMPT'
  | 'ABORT_EXACT_ATTEMPT'
  | 'TERMINATE_EXACT_ATTEMPT';

export interface ExecutionRecoveryIdentity {
  readonly taskId: string;
  readonly attemptId: string;
  readonly fenceToken: string;
}

export interface ExecutionRecoveryEvidence {
  readonly identity: ExecutionRecoveryIdentity;
  readonly evidenceRefs: readonly string[];
  readonly dispatch: 'NOT_DISPATCHED' | 'DISPATCHED';
  readonly control: 'RUNNING' | 'PAUSED' | 'HELD';
  readonly process: 'ALIVE' | 'ABSENT' | 'UNKNOWN';
  readonly fence: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  /**
   * Provider-neutral, monotonically increasing durable progress sequence.
   * A greater observed value proves progress independently of wall clocks.
   */
  readonly previousProgressSequence: number;
  readonly observedProgressSequence: number;
  /**
   * A projection only. It may support STALLED but can never prove ORPHANED.
   */
  readonly wallClockProjection: 'FRESH' | 'STALE' | 'UNKNOWN';
  readonly completion: 'INCOMPLETE' | 'DURABLE' | 'UNKNOWN';
  readonly resumePermitRef?: string;
  readonly finalizePermitRef?: string;
}

export interface ExecutionRecoveryInput {
  readonly expectedIdentity: ExecutionRecoveryIdentity;
  readonly evidence: ExecutionRecoveryEvidence;
}

export interface ExecutionRecoveryOutcome {
  readonly decision: ExecutionRecoveryDecision;
  readonly reasonCodes: readonly ExecutionRecoveryReasonCode[];
  readonly evidenceRefs: readonly string[];
  readonly allowedNextOperations: readonly ExecutionRecoveryOperation[];
  readonly failClosed: boolean;
  readonly explanation: string;
}

function outcome(
  decision: ExecutionRecoveryDecision,
  reasonCodes: readonly ExecutionRecoveryReasonCode[],
  evidenceRefs: readonly string[],
  allowedNextOperations: readonly ExecutionRecoveryOperation[],
  failClosed: boolean,
  explanation: string,
): ExecutionRecoveryOutcome {
  return {
    decision,
    reasonCodes,
    evidenceRefs,
    allowedNextOperations,
    failClosed,
    explanation,
  };
}

function isBoundedIdentity(value: string): boolean {
  return value.length > 0
    && value.length <= 512
    && value === value.trim()
    && !/[\r\n\0]/u.test(value);
}

function isSequence(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Pure O(1) recovery classification over already-collected bounded evidence.
 * This function performs no I/O and grants resume/finalize only from an
 * explicit attempt-scoped permit reference.
 */
export function decideExecutionRecovery(
  input: ExecutionRecoveryInput,
): ExecutionRecoveryOutcome {
  const { expectedIdentity, evidence } = input;
  const refs = evidence.evidenceRefs;
  const incomplete = [
    expectedIdentity.taskId,
    expectedIdentity.attemptId,
    expectedIdentity.fenceToken,
    evidence.identity.taskId,
    evidence.identity.attemptId,
    evidence.identity.fenceToken,
  ].some(value => !isBoundedIdentity(value))
    || refs.length === 0
    || refs.some(ref => !isBoundedIdentity(ref))
    || !isSequence(evidence.previousProgressSequence)
    || !isSequence(evidence.observedProgressSequence)
    || evidence.process === 'UNKNOWN'
    || evidence.fence === 'UNKNOWN'
    || evidence.completion === 'UNKNOWN';

  if (incomplete) {
    return outcome(
      'HELD',
      ['EVIDENCE_INCOMPLETE'],
      refs,
      ['REQUEST_EVIDENCE'],
      true,
      'Recovery is held because required bounded evidence is incomplete.',
    );
  }

  if (expectedIdentity.taskId !== evidence.identity.taskId
    || expectedIdentity.attemptId !== evidence.identity.attemptId) {
    return outcome(
      'HELD',
      ['ATTEMPT_IDENTITY_MISMATCH'],
      refs,
      ['REQUEST_EVIDENCE'],
      true,
      'Recovery is held because task or attempt identity does not match.',
    );
  }
  if (expectedIdentity.fenceToken !== evidence.identity.fenceToken) {
    return outcome(
      'HELD',
      ['FENCE_IDENTITY_MISMATCH'],
      refs,
      ['REQUEST_EVIDENCE'],
      true,
      'Recovery is held because the exact fence identity does not match.',
    );
  }

  const progressed =
    evidence.observedProgressSequence > evidence.previousProgressSequence;
  const contradictory =
    evidence.observedProgressSequence < evidence.previousProgressSequence
    || (evidence.dispatch === 'NOT_DISPATCHED'
      && (evidence.process === 'ALIVE'
        || evidence.fence === 'ACTIVE'
        || evidence.completion === 'DURABLE'))
    || (evidence.process === 'ALIVE' && evidence.fence === 'INACTIVE')
    || (evidence.completion === 'DURABLE' && progressed)
    || (evidence.resumePermitRef !== undefined
      && (evidence.process !== 'ABSENT'
        || evidence.fence !== 'INACTIVE'
        || evidence.completion !== 'INCOMPLETE'))
    || (evidence.finalizePermitRef !== undefined
      && evidence.completion !== 'DURABLE');

  if (contradictory) {
    return outcome(
      'HELD',
      ['EVIDENCE_CONTRADICTORY'],
      refs,
      ['REQUEST_EVIDENCE'],
      true,
      'Recovery is held because authoritative evidence contradicts itself.',
    );
  }

  if (evidence.dispatch === 'NOT_DISPATCHED') {
    return outcome(
      'NOT_DISPATCHED',
      ['DISPATCH_NOT_OBSERVED'],
      refs,
      ['OBSERVE'],
      false,
      'No dispatch has been observed for the exact attempt and fence.',
    );
  }
  if (evidence.control === 'HELD') {
    return outcome(
      'HELD',
      ['EXECUTION_HELD'],
      refs,
      ['WAIT'],
      false,
      'Execution is held by its control authority.',
    );
  }
  if (evidence.control === 'PAUSED') {
    if (
      evidence.process === 'ABSENT'
      && evidence.fence === 'INACTIVE'
      && evidence.completion === 'INCOMPLETE'
      && evidence.resumePermitRef !== undefined
      && isBoundedIdentity(evidence.resumePermitRef)
    ) {
      return outcome(
        'SAFE_TO_RESUME',
        ['EXECUTION_PAUSED', 'RESUME_EXPLICITLY_AUTHORIZED'],
        [...refs, evidence.resumePermitRef],
        ['RESUME_EXACT_ATTEMPT'],
        false,
        'The paused exact attempt is absent, unfenced, and explicitly authorized to resume.',
      );
    }
    return outcome(
      'PAUSED',
      ['EXECUTION_PAUSED'],
      refs,
      ['WAIT', 'REQUEST_RESUME_AUTHORIZATION', 'ABORT_EXACT_ATTEMPT'],
      false,
      'Execution is paused by its control authority.',
    );
  }

  if (evidence.completion === 'DURABLE') {
    if (evidence.finalizePermitRef !== undefined
      && isBoundedIdentity(evidence.finalizePermitRef)) {
      return outcome(
        'SAFE_TO_FINALIZE',
        ['FINALIZE_EXPLICITLY_AUTHORIZED'],
        [...refs, evidence.finalizePermitRef],
        ['FINALIZE_EXACT_ATTEMPT'],
        false,
        'Durable completion and an explicit exact-attempt finalize permit are present.',
      );
    }
    return outcome(
      'HELD',
      ['EVIDENCE_INCOMPLETE'],
      refs,
      ['REQUEST_EVIDENCE'],
      true,
      'Durable completion cannot be finalized without an explicit permit.',
    );
  }

  if (progressed) {
    return outcome(
      'HEALTHY',
      ['MONOTONIC_PROGRESS_OBSERVED'],
      refs,
      ['OBSERVE'],
      false,
      'The exact attempt has made monotonic progress.',
    );
  }

  if (evidence.process === 'ABSENT' && evidence.fence === 'INACTIVE') {
    if (evidence.resumePermitRef !== undefined
      && isBoundedIdentity(evidence.resumePermitRef)) {
      return outcome(
        'SAFE_TO_RESUME',
        ['RESUME_EXPLICITLY_AUTHORIZED'],
        [...refs, evidence.resumePermitRef],
        ['RESUME_EXACT_ATTEMPT'],
        false,
        'Definitive absence and an explicit exact-attempt resume permit are present.',
      );
    }
    return outcome(
      'ORPHANED',
      ['EXECUTION_DEFINITIVELY_ABSENT', 'NO_MONOTONIC_PROGRESS'],
      refs,
      ['REQUEST_RESUME_AUTHORIZATION', 'ABORT_EXACT_ATTEMPT'],
      false,
      'Process absence, inactive fencing, and no monotonic progress prove orphaning.',
    );
  }

  return outcome(
    'STALLED',
    ['NO_MONOTONIC_PROGRESS'],
    refs,
    ['OBSERVE', 'WAIT', 'ABORT_EXACT_ATTEMPT', 'TERMINATE_EXACT_ATTEMPT'],
    false,
    evidence.wallClockProjection === 'STALE'
      ? 'No monotonic progress is visible; stale wall-clock data is only a projection.'
      : 'No monotonic progress is visible for the current observation.',
  );
}
