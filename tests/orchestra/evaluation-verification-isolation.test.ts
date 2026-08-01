import { describe, expect, it } from 'vitest';

import {
  evaluateResult,
  evaluateWithRubric,
  isVerificationIsolationHold,
} from '../../src/orchestra/result-evaluator.js';
import { decideFixRepairAuthority } from '../../src/orchestra/fix-repair-authority.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { TaskVerificationIsolationHoldReceiptV1 } from '../../src/core/task-result-settlement.js';

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-iso-1',
    title: 'Isolation test task',
    description: 'Exercise verification isolation HOLD semantics',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/foo.ts'] },
    ...overrides,
  } as Task;
}

function baseResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'task-iso-1',
    workerId: 'w-iso-1',
    filesChanged: ['src/orchestra/foo.ts'],
    linesAdded: 12,
    linesRemoved: 2,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: '',
    ...overrides,
  } as TaskResult;
}

function hostReceipt(
  overrides: Partial<TaskVerificationIsolationHoldReceiptV1> = {},
): TaskVerificationIsolationHoldReceiptV1 {
  return {
    schemaVersion: 1,
    taskId: 'task-iso-1',
    backend: 'docker',
    projectRootSha256: 'a'.repeat(64),
    attemptId: '11111111-1111-1111-1111-111111111111',
    lifecycleVersion: 1,
    state: 'verification-isolation-hold',
    observedAt: '2026-07-30T00:00:00.000Z',
    reasonCodes: ['isolation-not-granted'],
    authorityEvidenceRefs: ['verification-isolation:sha256:' + 'b'.repeat(64)],
    ...overrides,
  } as TaskVerificationIsolationHoldReceiptV1;
}

describe('isVerificationIsolationHold', () => {
  it('detects the enforceVerifyLoop no-admission marker', () => {
    const result = baseResult({ notes: 'Verification isolation admission is required — cannot proceed.' });
    expect(isVerificationIsolationHold(result)).toBe(true);
  });

  it('detects the adapter-level isolation-on-hold marker', () => {
    const result = baseResult({ notes: 'Verify failed: Verification isolation is on hold: mutable_head_authority' });
    expect(isVerificationIsolationHold(result)).toBe(true);
  });

  it('detects foreign verification diagnostics', () => {
    const result = baseResult({ notes: 'Foreign verification diagnostics: foreign_attempt, unbound_attempt' });
    expect(isVerificationIsolationHold(result)).toBe(true);
  });

  it('detects config-not-admitted and invalid-request adapter holds', () => {
    expect(isVerificationIsolationHold(baseResult({
      notes: 'Admitted TypeScript verification held: The TypeScript configuration is outside the admitted verification surface',
    }))).toBe(true);
    expect(isVerificationIsolationHold(baseResult({
      notes: 'Admitted TypeScript verification held: The scoped TypeScript verification request is invalid',
    }))).toBe(true);
  });

  it('detects execution-timeout adapter hold', () => {
    expect(isVerificationIsolationHold(baseResult({
      notes: 'Admitted TypeScript verification held: TypeScript verification exceeded its deadline',
    }))).toBe(true);
  });

  it('returns false for a genuine scoped compiler failure', () => {
    const result = baseResult({ notes: 'Admitted TypeScript verification failed with exit code 2' });
    expect(isVerificationIsolationHold(result)).toBe(false);
  });

  it('returns false for empty notes', () => {
    expect(isVerificationIsolationHold(baseResult({ notes: '' }))).toBe(false);
  });
});

describe('evaluateResult isolation prose is not authority (488-011)', () => {
  it('does not let worker notes promote a NO_GO self-assessment', async () => {
    const task = baseTask();
    const result = baseResult({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'Verification isolation admission is required — worker cannot confirm tests.',
    });
    const evaluation = await evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.NO_GO);
  });

  it('still returns NO_GO for a genuine scoped failure with no isolation evidence', async () => {
    const task = baseTask();
    const result = baseResult({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'Admitted TypeScript verification failed with exit code 2 — real type errors in foo.ts.',
    });
    const evaluation = await evaluateResult(result, task);
    expect(evaluation).toBe(TaskEvaluation.NO_GO);
  });
});

describe('evaluateWithRubric isolation prose is not a verdict fast-path (488-011)', () => {
  it('keeps a worker-note isolation claim inside the normal NO_GO rubric', () => {
    const task = baseTask();
    const result = baseResult({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'Foreign verification diagnostics: foreign_attempt',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.some(s => s.criterion === 'verification_isolation')).toBe(false);
  });

  it('leaves a genuine scoped NO_GO untouched', () => {
    const task = baseTask();
    const result = baseResult({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      linesAdded: 0,
      linesRemoved: 0,
      filesChanged: [],
      notes: 'Admitted TypeScript verification failed with exit code 2.',
    });
    const evaluation = evaluateWithRubric(result, task);
    expect(evaluation.decision).toBe('NO_GO');
    expect(evaluation.rubricScores.some(s => s.criterion === 'verification_isolation')).toBe(false);
  });
});

describe('decideFixRepairAuthority FIX-budget isolation semantics (488-011, proof: verification-hold-fix-budget)', () => {
  it('never spends FIX/retry budget on a non-NO_GO decision', () => {
    const decision = decideFixRepairAuthority('DONE', baseResult({ selfAssessment: 'DONE', testsPassed: true }));
    expect(decision.consumesRetryBudget).toBe(false);
    expect(decision.action).toBe('no-repair-needed');
  });

  it('parks and does not spend budget when a host-observed isolation hold receipt is present', () => {
    const decision = decideFixRepairAuthority(
      'NO_GO',
      baseResult({ notes: 'plain worker notes, no isolation markers' }),
      hostReceipt(),
    );
    expect(decision.consumesRetryBudget).toBe(false);
    expect(decision.action).toBe('park');
  });

  it('does not treat worker notes as repair-budget authority', () => {
    const decision = decideFixRepairAuthority(
      'NO_GO',
      baseResult({ notes: 'Verification isolation admission is required.' }),
    );
    expect(decision.consumesRetryBudget).toBe(true);
    expect(decision.action).toBe('repair');
  });

  it('spends the FIX/retry budget for a scoped NO_GO with no isolation evidence', () => {
    const decision = decideFixRepairAuthority(
      'NO_GO',
      baseResult({ notes: 'Admitted TypeScript verification failed with exit code 2.' }),
    );
    expect(decision.consumesRetryBudget).toBe(true);
    expect(decision.action).toBe('repair');
  });
});
