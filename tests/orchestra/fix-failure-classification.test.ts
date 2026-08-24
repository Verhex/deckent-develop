import { describe, it, expect } from 'vitest';
import {
  buildAcceptanceFailureFingerprint,
  classifyFixFailure,
} from '../../src/orchestra/fix-failure-classification.js';
import type { TaskResult } from '../../src/core/task-types.js';

// The FIX phase used to route every NO_GO that was not a cascade-skip or a
// budget exhaustion into a same-scope re-run, with the real failure evidence
// reduced to prose in the fix worker's prompt. Measured cost (sprint-496,
// 2026-08-09): a scope contradiction no worker could repair was re-run three
// times for roughly 210k tokens, producing the same honest NO_GO each round.
// These tests pin the routing decision inside Deckent so it cannot drift back
// into a prompt, and so it is identical whichever provider backs the Brain.

function makeResult(over: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 't-1',
    workerId: 'w-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...over,
  } as TaskResult;
}

describe('classifyFixFailure', () => {
  it('fingerprints normalized typed provenance stably', () => {
    const first = buildAcceptanceFailureFingerprint([
      { criterionId: 'artifact', evidenceKind: 'file', subject: './src\\output.ts', observedState: 'absent' },
    ]);
    const reordered = buildAcceptanceFailureFingerprint([
      { criterionId: 'artifact', evidenceKind: 'file', subject: 'src/output.ts', observedState: 'absent' },
    ]);
    expect(first).toBe(reordered);
    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('stops an identical typed failure after one FIX', () => {
    const fingerprint = buildAcceptanceFailureFingerprint([
      { criterionId: 'artifact', evidenceKind: 'file', subject: 'src/output.ts', observedState: 'absent' },
    ]);
    const c = classifyFixFailure({
      result: makeResult({ notes: 'still missing' }),
      acceptanceFailureFingerprint: fingerprint,
      priorAcceptanceFailureFingerprint: fingerprint,
    });
    expect(c).toMatchObject({
      disposition: 'escalateReplan',
      code: 'REPEATED_ACCEPTANCE_FAILURE',
      allowsFixTask: false,
    });
  });

  it('allows a bounded FIX when typed failure evidence changed', () => {
    const prior = buildAcceptanceFailureFingerprint([
      { criterionId: 'artifact', evidenceKind: 'file', subject: 'src/a.ts', observedState: 'absent' },
    ]);
    const current = buildAcceptanceFailureFingerprint([
      { criterionId: 'artifact', evidenceKind: 'file', subject: 'src/b.ts', observedState: 'absent' },
    ]);
    const c = classifyFixFailure({
      result: makeResult({ notes: 'different remaining gap' }),
      acceptanceFailureFingerprint: current,
      priorAcceptanceFailureFingerprint: prior,
    });
    expect(c.code).toBe('ACCEPTANCE_SHORTFALL');
    expect(c.allowsFixTask).toBe(true);
  });
  it('routes a SIGKILL/OOM exit to an unchanged re-run', () => {
    const c = classifyFixFailure({ result: makeResult(), exitCode: 137 });
    expect(c.disposition).toBe('retrySame');
    expect(c.code).toBe('INFRASTRUCTURE_FAILURE');
    expect(c.allowsFixTask).toBe(true);
  });

  it('routes a coordinator crash before backend prepare to an unchanged re-run', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: 'DECKENT_E091:coordinator-crashed-before-docker-prepare:abc' }),
    });
    expect(c.disposition).toBe('retrySame');
  });

  it('routes a runtime budget circuit-breaker kill to an unchanged re-run', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: 'Runtime budget circuit breaker stopped the worker: input token budget exceeded' }),
    });
    expect(c.disposition).toBe('retrySame');
  });

  it('refuses a fix task for a boundary violation and demands a scope revision', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: '[honest-gate] BOUNDARY_VIOLATION: wrote outside scope' }),
    });
    expect(c.disposition).toBe('reviseScope');
    expect(c.code).toBe('BOUNDARY_VIOLATION');
    // Re-running the identical scope reproduces the identical violation.
    expect(c.allowsFixTask).toBe(true);
    expect(c.requiredAccess).toBe('access:write');
    expect(c.repairTarget).toBe('current');
  });

  it('treats a host attribution HOLD with out-of-scope claims as a scope violation', () => {
    const c = classifyFixFailure({
      result: makeResult({
        notes: 'worker prose says everything is fine',
        workAttribution: {
          state: 'HOLD',
          attemptId: 'a-1',
          baselineRef: 'ref',
          scopeDigest: 'digest',
          claimedOutsideScope: ['src/elsewhere.ts'],
        },
      }),
    });
    // Host-authored attribution outranks worker prose.
    expect(c.disposition).toBe('reviseScope');
    expect(c.code).toBe('CLAIM_OUTSIDE_WRITE_SCOPE');
  });

  it('escalates an unsatisfiable task definition instead of re-running it', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: 'contradictory read scope' }),
      taskDefinitionUnsatisfiable: true,
    });
    expect(c.disposition).toBe('escalateReplan');
    expect(c.code).toBe('TASK_DEFINITION_UNSATISFIABLE');
    expect(c.allowsFixTask).toBe(false);
  });

  it('re-issues a dishonest completion claim with a hardened instruction, not a plain retry', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: '[honest-gate] worker-self-stub: linesAdded=0 testsPassed=false' }),
    });
    expect(c.disposition).toBe('hardenSame');
    expect(c.code).toBe('DISHONEST_COMPLETION_CLAIM');
    expect(c.allowsFixTask).toBe(true);
  });

  it('corrects a verification gap narrowly when real work already landed', () => {
    // Owner note (2026-08-10): a small violation must not re-run work that is
    // essentially complete.
    const c = classifyFixFailure({
      result: makeResult({
        filesChanged: ['src/a.ts', 'tests/a.test.ts'],
        linesAdded: 42,
        testsPassed: false,
        notes: 'one assertion still failing',
      }),
    });
    expect(c.disposition).toBe('narrowCorrection');
    expect(c.allowsFixTask).toBe(true);
  });

  it('keeps an ordinary acceptance shortfall as a fix attempt — that is what FIX is for', () => {
    // A first revision escalated this as "unclassified" and the existing suite
    // immediately failed every "NORMAL NO_GO creates a fix task" test. Minimum FIX
    // triggering must not mean a disabled fallback.
    const c = classifyFixFailure({ result: makeResult({ notes: 'criteria not fully met' }) });
    expect(c.disposition).toBe('retrySame');
    expect(c.code).toBe('ACCEPTANCE_SHORTFALL');
    expect(c.allowsFixTask).toBe(true);
  });

  // Repetition is the proof, and it is host-measured. sprint-496 and sprint-502
  // each burned three rounds on a definition that produced no changed line, while
  // the workers correctly reported the task could not be satisfied. Counting the
  // lineage's own outcomes needs no trust in that prose — and gives no worker a
  // lever for declining work by asserting impossibility.
  it('escalates once the lineage has proven re-running changes nothing', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: 'the requirement lies outside the permitted scope' }),
      priorZeroDiffAttempts: 2,
    });
    expect(c.disposition).toBe('escalateReplan');
    expect(c.code).toBe('REPEATED_ZERO_DIFF_NO_GO');
    expect(c.allowsFixTask).toBe(false);
  });

  it('still allows a fix while the lineage is below the futility threshold', () => {
    const c = classifyFixFailure({
      result: makeResult({ notes: 'first honest miss' }),
      priorZeroDiffAttempts: 1,
    });
    expect(c.disposition).toBe('retrySame');
    expect(c.allowsFixTask).toBe(true);
  });

  it('does not call repetition futile when the latest attempt actually changed code', () => {
    // Real work landing means the definition is workable; the remaining gap is a
    // narrow correction, not an impossible task.
    const c = classifyFixFailure({
      result: makeResult({ filesChanged: ['src/a.ts'], linesAdded: 12, testsPassed: false }),
      priorZeroDiffAttempts: 3,
    });
    expect(c.disposition).toBe('narrowCorrection');
    expect(c.allowsFixTask).toBe(true);
  });

  it('escalates a missing result — absence is unmeasurable, not a retryable blip', () => {
    const c = classifyFixFailure({ result: null });
    expect(c.disposition).toBe('escalateReplan');
    expect(c.code).toBe('NO_RESULT_EVIDENCE');
    expect(c.allowsFixTask).toBe(false);
  });

  it('lets a scope violation outrank a substantially-complete diff', () => {
    // Files changed does not license re-running a scope the worker already broke.
    const c = classifyFixFailure({
      result: makeResult({
        filesChanged: ['src/a.ts'],
        linesAdded: 10,
        testsPassed: false,
        notes: '[honest-gate] SCOPE_VIOLATION_OR_EMPTY_WRITE: wrote outside declared scope',
      }),
    });
    expect(c.disposition).toBe('reviseScope');
  });

  it('routes typed upstream attribution repair with write authority', () => {
    const c = classifyFixFailure({
      result: makeResult(),
      evidence: {
        attribution: {
          state: 'HOLD',
          reasonCode: 'SCOPE_MISMATCH',
          claimedOutsideScope: ['src/upstream.ts'],
        },
        dependencyLineage: { failedUpstreamTaskId: 'upstream-1' },
      },
    });
    expect(c).toMatchObject({
      disposition: 'reviseScope',
      allowsFixTask: true,
      requiredAccess: 'access:write',
      repairTarget: 'upstream',
    });
  });
});
