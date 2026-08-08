import { describe, expect, it } from 'vitest';

import {
  assembleSprintTerminalEvidence,
  SPRINT_TERMINAL_EVIDENCE_VERSION,
  type CoordinatorTerminalEvidence,
  type ExactAttemptEvidence,
  type ExactAttemptIdentity,
} from '../../src/orchestra/sprint-terminal-evidence.js';

interface ResultPayload {
  readonly marker: string;
}

const A1: ExactAttemptIdentity = { taskId: '485-001', attemptId: 'attempt-1' };
const A2: ExactAttemptIdentity = { taskId: '485-001-fix', attemptId: 'attempt-2' };

function verifiedAttribution(evidenceRef: string) {
  return {
    state: 'VERIFIED' as const,
    evidenceRef,
    filesChanged: ['src/orchestra/example.ts'],
    linesAdded: 4,
    linesRemoved: 1,
  };
}

function completedAttempt(input: {
  identity: ExactAttemptIdentity;
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  marker: string;
  supersedes?: ExactAttemptIdentity;
  logicalTaskId?: string;
}): ExactAttemptEvidence<ResultPayload> {
  return {
    logicalTaskId: input.logicalTaskId ?? 'logical-485-001',
    identity: input.identity,
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    authority: {
      state: 'TERMINAL',
      verdict: input.verdict,
      evidenceRef: `settlement:${input.identity.attemptId}`,
    },
    result: {
      state: 'COMPLETE',
      verdict: input.verdict,
      evidenceRef: `result:${input.identity.attemptId}`,
      payload: { marker: input.marker },
    },
    attribution: verifiedAttribution(`attribution:${input.identity.attemptId}`),
  };
}

function coordinator(
  overrides: Partial<CoordinatorTerminalEvidence> = {},
): CoordinatorTerminalEvidence {
  return {
    evidenceId: 'coordinator-terminal',
    kind: 'terminal-receipt',
    state: 'VERIFIED',
    evidenceRef: 'coordinator:terminal',
    requiredForCleanup: true,
    attempt: A2,
    ...overrides,
  };
}

describe('assembleSprintTerminalEvidence', () => {
  it('settles host-confirmed dispatch exhaustion as FAILED without fabricating a worker result', () => {
    const evidence = assembleSprintTerminalEvidence({
      attempts: [{
        logicalTaskId: 'logical-not-dispatched',
        identity: { taskId: '488-nd', attemptId: 'host-redispatch-1' },
        authority: {
          state: 'TERMINAL',
          verdict: 'NO_GO',
          evidenceRef: 'host:dispatch-exhausted',
          reasonCode: 'DISPATCH_EXHAUSTED',
        },
        result: {
          state: 'NOT_APPLICABLE',
          evidenceRef: 'host:dispatch-exhausted',
          reasonCode: 'DISPATCH_EXHAUSTED',
        },
        attribution: {
          state: 'VERIFIED',
          evidenceRef: 'host:zero-work',
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
        },
      }],
      coordinatorEvidence: [],
    });

    expect(evidence.logicalTasks).toEqual([
      expect.objectContaining({ state: 'FAILED', resolvingAttempt: { taskId: '488-nd', attemptId: 'host-redispatch-1' } }),
    ]);
    expect(evidence.holds).toEqual([]);
    expect(evidence.activeOrUnsettledAttempts).toEqual([]);
    expect(evidence.partialResults).toEqual([]);
    expect(evidence.cleanupEligibility).toMatchObject({ state: 'BLOCKED', candidate: false });
  });

  it('folds a superseding attempt lineage into one completed aggregate', () => {
    const first = completedAttempt({ identity: A1, verdict: 'NO_GO', marker: 'failed-first' });
    const second = completedAttempt({
      identity: A2,
      verdict: 'DONE',
      marker: 'fixed',
      supersedes: A1,
    });

    const evidence = assembleSprintTerminalEvidence({
      attempts: [second, first],
      coordinatorEvidence: [coordinator()],
    });

    expect(evidence.version).toBe(SPRINT_TERMINAL_EVIDENCE_VERSION);
    expect(evidence.summary).toEqual({
      logicalTaskCount: 1,
      observedAttemptCount: 2,
      completedLogicalTaskCount: 1,
      activeOrUnsettledAttemptCount: 0,
      partialResultCount: 0,
      attributionExclusionCount: 0,
      holdCount: 0,
    });
    expect(evidence.logicalTasks).toEqual([expect.objectContaining({
      logicalTaskId: 'logical-485-001',
      state: 'COMPLETED',
      attemptCount: 2,
      resolvingAttempt: A2,
    })]);
    expect(evidence.completed).toEqual([expect.objectContaining({
      logicalTaskId: 'logical-485-001',
      resolvedBy: A2,
      verdict: 'DONE',
      result: { marker: 'fixed' },
      attemptCount: 2,
      excludedAttributionCount: 0,
    })]);
    expect(evidence.completed[0]?.verifiedAttribution).toHaveLength(2);
    expect(evidence.coordinatorEvidence).toEqual([coordinator()]);
    expect(evidence.cleanupEligibility).toEqual({
      state: 'CANDIDATE',
      candidate: true,
      reasons: [],
    });
  });

  it('keeps active attempts and partial result payloads visible without manufacturing a HOLD', () => {
    const active: ExactAttemptEvidence<ResultPayload> = {
      logicalTaskId: 'logical-active',
      identity: { taskId: '485-002', attemptId: 'active-1' },
      authority: { state: 'ACTIVE', evidenceRef: 'process:alive' },
      result: {
        state: 'PARTIAL',
        evidenceRef: 'proposal:2',
        payload: { marker: 'bounded-partial' },
        reasonCode: 'landing reserve reached',
      },
      attribution: verifiedAttribution('attribution:active-1'),
    };

    const evidence = assembleSprintTerminalEvidence({
      attempts: [active],
      coordinatorEvidence: [],
    });

    expect(evidence.completed).toEqual([]);
    expect(evidence.logicalTasks[0]?.state).toBe('PARTIAL');
    expect(evidence.activeOrUnsettledAttempts).toEqual([expect.objectContaining({
      identity: active.identity,
      authorityState: 'ACTIVE',
      resultState: 'PARTIAL',
      reasonCodes: [],
    })]);
    expect(evidence.partialResults).toEqual([expect.objectContaining({
      identity: active.identity,
      evidenceState: 'PARTIAL',
      payload: { marker: 'bounded-partial' },
    })]);
    expect(evidence.holds).toEqual([]);
    expect(evidence.cleanupEligibility).toEqual({
      state: 'BLOCKED',
      candidate: false,
      reasons: ['ACTIVE_OR_UNSETTLED_ATTEMPT', 'LINEAGE_NOT_COMPLETED', 'PARTIAL_RESULT'],
    });
  });

  it('never treats complete result presence as completion without terminal authority', () => {
    const rawComplete: ExactAttemptEvidence<ResultPayload> = {
      logicalTaskId: 'logical-raw',
      identity: { taskId: '485-003', attemptId: 'raw-1' },
      authority: { state: 'UNSETTLED', evidenceRef: 'claim:open' },
      result: {
        state: 'COMPLETE',
        verdict: 'DONE',
        evidenceRef: 'raw-result:file',
        payload: { marker: 'untrusted-done' },
      },
      attribution: verifiedAttribution('attribution:raw-1'),
    };

    const evidence = assembleSprintTerminalEvidence({
      attempts: [rawComplete],
      coordinatorEvidence: [],
    });

    expect(evidence.completed).toEqual([]);
    expect(evidence.summary.completedLogicalTaskCount).toBe(0);
    expect(evidence.partialResults[0]).toMatchObject({
      evidenceState: 'COMPLETE',
      payload: { marker: 'untrusted-done' },
      reasonCodes: ['RESULT_WITHOUT_TERMINAL_AUTHORITY'],
    });
    expect(evidence.holds.map(item => item.code)).toContain('RESULT_WITHOUT_TERMINAL_AUTHORITY');
    expect(evidence.logicalTasks[0]?.state).toBe('HOLD');
    expect(evidence.cleanupEligibility.state).toBe('HOLD');
  });

  it('retains unknown, contradictory, attribution-excluded and coordinator-held evidence', () => {
    const unknown: ExactAttemptEvidence<ResultPayload> = {
      logicalTaskId: 'logical-held',
      identity: { taskId: '485-004', attemptId: 'held-1' },
      authority: {
        state: 'UNKNOWN',
        evidenceRef: 'process:uncertain',
        reasonCode: 'process observation conflicted',
      },
      result: {
        state: 'CONTRADICTORY',
        evidenceRef: 'result:conflict',
        payload: { marker: 'must-remain-visible' },
        reasonCode: 'raw and settlement verdicts differ',
      },
      attribution: {
        state: 'UNAVAILABLE',
        evidenceRef: 'attribution:missing',
        reasonCode: 'claim-time baseline unavailable',
      },
    };
    const heldCoordinator = coordinator({
      evidenceId: 'coordinator-held',
      state: 'HOLD',
      evidenceRef: 'coordinator:held',
      attempt: unknown.identity,
      reasonCode: 'terminal receipt conflicts',
    });

    const evidence = assembleSprintTerminalEvidence({
      attempts: [unknown],
      coordinatorEvidence: [heldCoordinator],
    });

    expect(evidence.partialResults).toEqual([expect.objectContaining({
      identity: unknown.identity,
      evidenceState: 'CONTRADICTORY',
      payload: { marker: 'must-remain-visible' },
    })]);
    expect(evidence.attributionExclusions).toEqual([{
      logicalTaskId: 'logical-held',
      identity: unknown.identity,
      state: 'UNAVAILABLE',
      reasonCode: 'claim-time baseline unavailable',
      evidenceRef: 'attribution:missing',
      resultPayloadExcluded: true,
    }]);
    expect(evidence.coordinatorEvidence).toEqual([heldCoordinator]);
    expect(evidence.holds.map(item => item.code)).toEqual(expect.arrayContaining([
      'UNKNOWN_ATTEMPT_AUTHORITY',
      'RESULT_EVIDENCE_CONTRADICTORY',
      'COORDINATOR_EVIDENCE_HOLD',
    ]));
    expect(evidence.cleanupEligibility).toMatchObject({ state: 'HOLD', candidate: false });
    expect(evidence.cleanupEligibility.reasons).toEqual(expect.arrayContaining([
      'ATTRIBUTION_EXCLUDED',
      'COORDINATOR_EVIDENCE_INCOMPLETE',
      'PARTIAL_RESULT',
      'TYPED_HOLD_PRESENT',
    ]));
  });

  it('types broken lineage and duplicate exact-attempt evidence as HOLD', () => {
    const orphan = completedAttempt({
      identity: { taskId: '485-005', attemptId: 'orphan' },
      verdict: 'DONE',
      marker: 'orphan-result',
      supersedes: { taskId: '485-005', attemptId: 'missing-parent' },
      logicalTaskId: 'logical-broken',
    });
    const duplicate = completedAttempt({
      identity: { taskId: '485-006', attemptId: 'duplicate' },
      verdict: 'DONE',
      marker: 'duplicate-result',
      logicalTaskId: 'logical-duplicate',
    });

    const evidence = assembleSprintTerminalEvidence({
      attempts: [orphan, duplicate, duplicate],
      coordinatorEvidence: [],
    });

    expect(evidence.completed).toEqual([]);
    expect(evidence.logicalTasks.map(item => item.state)).toEqual(['HOLD', 'HOLD']);
    expect(evidence.holds.map(item => item.code)).toEqual(expect.arrayContaining([
      'LINEAGE_PARENT_MISSING',
      'LINEAGE_ROOT_AMBIGUOUS',
      'DUPLICATE_EXACT_ATTEMPT',
    ]));
    expect(evidence.cleanupEligibility.state).toBe('HOLD');
  });

  it('distinguishes a cross-logical-lineage parent from absent parent evidence', () => {
    const foreignParent = completedAttempt({
      identity: { taskId: '485-007', attemptId: 'foreign-parent' },
      verdict: 'NO_GO',
      marker: 'foreign',
      logicalTaskId: 'logical-foreign',
    });
    const child = completedAttempt({
      identity: { taskId: '485-008', attemptId: 'child' },
      verdict: 'DONE',
      marker: 'child',
      supersedes: foreignParent.identity,
      logicalTaskId: 'logical-child',
    });

    const evidence = assembleSprintTerminalEvidence({
      attempts: [child, foreignParent],
      coordinatorEvidence: [],
    });

    const childHolds = evidence.holds.filter(item => item.logicalTaskId === 'logical-child');
    expect(childHolds.map(item => item.code)).toContain('LINEAGE_PARENT_CROSS_BOUNDARY');
    expect(childHolds.map(item => item.code)).not.toContain('LINEAGE_PARENT_MISSING');
    expect(evidence.completed).toEqual([]);
  });

  it('returns a typed HOLD with non-zero observed count when a configured bound is exceeded', () => {
    const attempts = [
      completedAttempt({ identity: A1, verdict: 'DONE', marker: 'one' }),
      completedAttempt({
        identity: A2,
        verdict: 'DONE',
        marker: 'two',
        logicalTaskId: 'logical-485-002',
      }),
    ];

    const evidence = assembleSprintTerminalEvidence({
      attempts,
      coordinatorEvidence: [],
      limits: { attempts: 1 },
    });

    expect(evidence.summary).toMatchObject({
      logicalTaskCount: null,
      observedAttemptCount: 2,
      completedLogicalTaskCount: 0,
      holdCount: 1,
    });
    expect(evidence.holds).toEqual([expect.objectContaining({ code: 'INPUT_LIMIT_EXCEEDED' })]);
    expect(evidence.cleanupEligibility).toEqual({
      state: 'HOLD',
      candidate: false,
      reasons: ['TYPED_HOLD_PRESENT'],
    });
  });

  it('is deterministic across input order and does not mutate caller-owned arrays', () => {
    const attempts = [
      completedAttempt({
        identity: A2,
        verdict: 'GO_WITH_TECH_DEBT',
        marker: 'second',
        supersedes: A1,
      }),
      completedAttempt({ identity: A1, verdict: 'NO_GO', marker: 'first' }),
    ];
    const coordinatorEvidence = [
      coordinator({ evidenceId: 'z-last' }),
      coordinator({ evidenceId: 'a-first' }),
    ];
    const attemptsBefore = JSON.stringify(attempts);
    const coordinatorBefore = JSON.stringify(coordinatorEvidence);

    const forward = assembleSprintTerminalEvidence({ attempts, coordinatorEvidence });
    const reverse = assembleSprintTerminalEvidence({
      attempts: [...attempts].reverse(),
      coordinatorEvidence: [...coordinatorEvidence].reverse(),
    });

    expect(reverse).toEqual(forward);
    expect(JSON.stringify(attempts)).toBe(attemptsBefore);
    expect(JSON.stringify(coordinatorEvidence)).toBe(coordinatorBefore);
    expect(forward.coordinatorEvidence.map(item => item.evidenceId)).toEqual(['a-first', 'z-last']);
  });
});

// ═══ RCPT-1 (GR-2026-08-08-DOGFOOD-RCPT1-01) — resolution-aware exclusions ══
// Measured on the first full-pass cold-start run: a mid-lineage
// CLAIM_OUTSIDE_WRITE_SCOPE hold kept a 2/2-DONE sprint permanently
// cleanup-ineligible — no FIX-recovered sprint could ever settle. An exclusion
// now demotes to journaled evidence when the lineage completed, the excluded
// attempt is not the resolver, and every claimed path is covered by the
// sprint's union of VERIFIED attributions. Everything else stays fail-closed.
describe('RCPT-1 — resolution-aware attribution exclusions', () => {
  const heldAttempt = (input: {
    identity: ExactAttemptIdentity;
    logicalTaskId: string;
    claimedPaths?: readonly string[];
  }): ExactAttemptEvidence<ResultPayload> => ({
    logicalTaskId: input.logicalTaskId,
    identity: input.identity,
    authority: {
      state: 'TERMINAL',
      verdict: 'NO_GO',
      evidenceRef: `settlement:${input.identity.attemptId}`,
    },
    result: {
      state: 'COMPLETE',
      verdict: 'NO_GO',
      evidenceRef: `result:${input.identity.attemptId}`,
      payload: { marker: 'held' },
    },
    attribution: {
      state: 'HOLD',
      reasonCode: 'CLAIM_OUTSIDE_WRITE_SCOPE',
      ...(input.claimedPaths !== undefined ? { claimedPaths: input.claimedPaths } : {}),
    },
  });

  // The full-pass run's exact shape: first attempt held out-of-scope, the
  // fix resolves the lineage, and the claimed path is verified elsewhere.
  it('demotes a superseded, path-covered exclusion — sprint becomes cleanup-eligible', () => {
    const held = heldAttempt({
      identity: A1,
      logicalTaskId: 'logical-485-001',
      claimedPaths: ['src/orchestra/example.ts'], // covered by the fix's verified attribution
    });
    const resolver = completedAttempt({
      identity: A2, verdict: 'DONE', marker: 'fixed', supersedes: A1,
    });
    const evidence = assembleSprintTerminalEvidence<ResultPayload>({
      attempts: [held, resolver], coordinatorEvidence: [],
    });
    expect(evidence.attributionExclusions).toHaveLength(1);
    expect(evidence.attributionExclusions[0]!.supersededByVerifiedResolution).toBe(true);
    expect(evidence.cleanupEligibility.reasons).not.toContain('ATTRIBUTION_EXCLUDED');
    expect(evidence.cleanupEligibility.candidate).toBe(true);
  });

  it('UNKNOWN claims fail closed — no claimedPaths means the exclusion still blocks', () => {
    const held = heldAttempt({ identity: A1, logicalTaskId: 'logical-485-001' });
    const resolver = completedAttempt({
      identity: A2, verdict: 'DONE', marker: 'fixed', supersedes: A1,
    });
    const evidence = assembleSprintTerminalEvidence<ResultPayload>({
      attempts: [held, resolver], coordinatorEvidence: [],
    });
    expect(evidence.attributionExclusions[0]!.supersededByVerifiedResolution).not.toBe(true);
    expect(evidence.cleanupEligibility.reasons).toContain('ATTRIBUTION_EXCLUDED');
    expect(evidence.cleanupEligibility.candidate).toBe(false);
  });

  it('an UNCOVERED claimed path still blocks — nobody accountable owns it', () => {
    const held = heldAttempt({
      identity: A1,
      logicalTaskId: 'logical-485-001',
      claimedPaths: ['src/somewhere/never-verified.ts'],
    });
    const resolver = completedAttempt({
      identity: A2, verdict: 'DONE', marker: 'fixed', supersedes: A1,
    });
    const evidence = assembleSprintTerminalEvidence<ResultPayload>({
      attempts: [held, resolver], coordinatorEvidence: [],
    });
    expect(evidence.cleanupEligibility.reasons).toContain('ATTRIBUTION_EXCLUDED');
  });

  it('an UNRESOLVED lineage keeps its exclusion blocking (no verified resolution exists)', () => {
    const held = heldAttempt({
      identity: A1,
      logicalTaskId: 'logical-485-001',
      claimedPaths: ['src/orchestra/example.ts'],
    });
    const evidence = assembleSprintTerminalEvidence<ResultPayload>({
      attempts: [held], coordinatorEvidence: [],
    });
    expect(evidence.attributionExclusions[0]!.supersededByVerifiedResolution).not.toBe(true);
    expect(evidence.cleanupEligibility.candidate).toBe(false);
  });
});
