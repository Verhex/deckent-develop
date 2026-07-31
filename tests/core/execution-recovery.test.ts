import { describe, expect, it } from 'vitest';

import {
  EXECUTION_RECOVERY_DECISIONS,
  decideExecutionRecovery,
  type ExecutionRecoveryEvidence,
  type ExecutionRecoveryInput,
} from '../../src/core/execution-recovery.js';

const identity = {
  taskId: 'task-480',
  attemptId: 'attempt-exact',
  fenceToken: 'fence-exact',
} as const;

function evidence(
  overrides: Partial<ExecutionRecoveryEvidence> = {},
): ExecutionRecoveryEvidence {
  return {
    identity,
    evidenceRefs: ['recovery-observation:sha256:abc'],
    dispatch: 'DISPATCHED',
    control: 'RUNNING',
    process: 'ALIVE',
    fence: 'ACTIVE',
    previousProgressSequence: 4,
    observedProgressSequence: 5,
    wallClockProjection: 'FRESH',
    completion: 'INCOMPLETE',
    ...overrides,
  };
}

function input(
  overrides: Partial<ExecutionRecoveryEvidence> = {},
): ExecutionRecoveryInput {
  return { expectedIdentity: identity, evidence: evidence(overrides) };
}

describe('canonical execution recovery decision', () => {
  it('takes a pure bounded healthy path from monotonic progress', () => {
    const value = input();
    const snapshot = structuredClone(value);

    expect(decideExecutionRecovery(value)).toEqual({
      decision: 'HEALTHY',
      reasonCodes: ['MONOTONIC_PROGRESS_OBSERVED'],
      evidenceRefs: ['recovery-observation:sha256:abc'],
      allowedNextOperations: ['OBSERVE'],
      failClosed: false,
      explanation: 'The exact attempt has made monotonic progress.',
    });
    expect(value).toEqual(snapshot);
  });

  it('exports exactly the canonical decision vocabulary', () => {
    expect(EXECUTION_RECOVERY_DECISIONS).toEqual([
      'HEALTHY',
      'STALLED',
      'ORPHANED',
      'NOT_DISPATCHED',
      'PAUSED',
      'HELD',
      'SAFE_TO_RESUME',
      'SAFE_TO_FINALIZE',
    ]);
  });

  it.each([
    ['NOT_DISPATCHED', { dispatch: 'NOT_DISPATCHED', process: 'ABSENT', fence: 'INACTIVE', previousProgressSequence: 0, observedProgressSequence: 0 }],
    ['PAUSED', { control: 'PAUSED', previousProgressSequence: 5, observedProgressSequence: 5 }],
    ['HELD', { control: 'HELD', previousProgressSequence: 5, observedProgressSequence: 5 }],
  ] as const)('returns %s for its authoritative state', (decision, overrides) => {
    expect(decideExecutionRecovery(input(overrides)).decision).toBe(decision);
  });

  it('treats stale wall-clock projection as stalled, never orphaned', () => {
    const result = decideExecutionRecovery(input({
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      wallClockProjection: 'STALE',
    }));

    expect(result.decision).toBe('STALLED');
    expect(result.explanation).toContain('only a projection');
  });

  it('requires definitive process and fence evidence for orphaning', () => {
    const result = decideExecutionRecovery(input({
      process: 'ABSENT',
      fence: 'INACTIVE',
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      wallClockProjection: 'FRESH',
    }));

    expect(result.decision).toBe('ORPHANED');
    expect(result.reasonCodes).toEqual([
      'EXECUTION_DEFINITIVELY_ABSENT',
      'NO_MONOTONIC_PROGRESS',
    ]);
    expect(result.allowedNextOperations).toEqual([
      'REQUEST_RESUME_AUTHORIZATION',
      'ABORT_EXACT_ATTEMPT',
    ]);
  });

  it('never grants replay without an explicit exact-attempt resume permit', () => {
    const result = decideExecutionRecovery(input({
      process: 'ABSENT',
      fence: 'INACTIVE',
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      resumePermitRef: 'resume-permit:sha256:def',
    }));

    expect(result.decision).toBe('SAFE_TO_RESUME');
    expect(result.allowedNextOperations).toEqual(['RESUME_EXACT_ATTEMPT']);
    expect(result.evidenceRefs).toContain('resume-permit:sha256:def');
  });

  it('allows an explicitly authorized paused attempt to resume only after process and fence absence', () => {
    const permitted = decideExecutionRecovery(input({
      control: 'PAUSED',
      process: 'ABSENT',
      fence: 'INACTIVE',
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      resumePermitRef: 'resume-permit:sha256:paused',
    }));
    const stillOwned = decideExecutionRecovery(input({
      control: 'PAUSED',
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      resumePermitRef: undefined,
    }));

    expect(permitted).toMatchObject({
      decision: 'SAFE_TO_RESUME',
      allowedNextOperations: ['RESUME_EXACT_ATTEMPT'],
    });
    expect(stillOwned).toMatchObject({
      decision: 'PAUSED',
      allowedNextOperations: ['WAIT', 'REQUEST_RESUME_AUTHORIZATION', 'ABORT_EXACT_ATTEMPT'],
    });
  });

  it('exposes bounded abort/terminate operations for a stalled owned attempt', () => {
    expect(decideExecutionRecovery(input({
      previousProgressSequence: 5,
      observedProgressSequence: 5,
    }))).toMatchObject({
      decision: 'STALLED',
      allowedNextOperations: [
        'OBSERVE',
        'WAIT',
        'ABORT_EXACT_ATTEMPT',
        'TERMINATE_EXACT_ATTEMPT',
      ],
    });
  });

  it('requires durable completion and an explicit permit to finalize', () => {
    const withoutPermit = decideExecutionRecovery(input({
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      completion: 'DURABLE',
    }));
    const permitted = decideExecutionRecovery(input({
      previousProgressSequence: 5,
      observedProgressSequence: 5,
      completion: 'DURABLE',
      finalizePermitRef: 'finalize-permit:sha256:ghi',
    }));

    expect(withoutPermit).toMatchObject({ decision: 'HELD', failClosed: true });
    expect(permitted).toMatchObject({
      decision: 'SAFE_TO_FINALIZE',
      allowedNextOperations: ['FINALIZE_EXACT_ATTEMPT'],
      failClosed: false,
    });
  });

  it.each([
    [{ process: 'UNKNOWN' }, 'EVIDENCE_INCOMPLETE'],
    [{ observedProgressSequence: 3 }, 'EVIDENCE_CONTRADICTORY'],
    [{ process: 'ALIVE', fence: 'INACTIVE' }, 'EVIDENCE_CONTRADICTORY'],
  ] as const)('fails closed for incomplete or contradictory evidence', (overrides, reason) => {
    expect(decideExecutionRecovery(input(overrides))).toMatchObject({
      decision: 'HELD',
      reasonCodes: [reason],
      allowedNextOperations: ['REQUEST_EVIDENCE'],
      failClosed: true,
    });
  });

  it.each([
    [{ taskId: 'other', attemptId: identity.attemptId, fenceToken: identity.fenceToken }, 'ATTEMPT_IDENTITY_MISMATCH'],
    [{ taskId: identity.taskId, attemptId: 'other', fenceToken: identity.fenceToken }, 'ATTEMPT_IDENTITY_MISMATCH'],
    [{ taskId: identity.taskId, attemptId: identity.attemptId, fenceToken: 'other' }, 'FENCE_IDENTITY_MISMATCH'],
  ] as const)('requires exact task, attempt, and fence identity', (observed, reason) => {
    expect(decideExecutionRecovery(input({ identity: observed }))).toMatchObject({
      decision: 'HELD',
      reasonCodes: [reason],
      failClosed: true,
    });
  });
});
