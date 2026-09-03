import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TaskEvaluation, type Sprint, type Task, type TaskResult } from '../../src/core/types.js';
import type { TaskAttemptCustodyIdentityV2 } from '../../src/core/task-attempt-custody-store.js';
import type { ExactAcceptedResultTerminalAuthorityV2 } from '../../src/orchestra/exact-accepted-result-terminal-authority.js';
import type { ExactAcceptedTaskTerminalAuthorityRead } from '../../src/orchestra/evaluation-audit-trail.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  ExactTaskResultAuthorityMetadata,
} from '../../src/orchestra/task-result-authority.js';
import {
  buildFinalizerTerminalTruth,
  publishFencedSprintTerminalReceipt,
} from '../../src/orchestra/sprint-finalizer.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function task(taskId: string): Task {
  return {
    id: taskId,
    title: 'Exact terminal attempt',
    description: 'T10 attempt-custody finalizer fixture',
    type: 'code-development',
    status: 'DONE',
    priority: 'NORMAL',
    model: 'config-resolved',
    effort: 'medium',
    provider: 'config-resolved',
    dependencies: [],
    sprintId: 'sprint-910',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    goNogo: { goCriteria: 'fixture', noGoCriteria: 'fixture', techDebtAcceptable: 'none' },
  } as unknown as Task;
}

function result(taskId: string, verdict: 'DONE' | 'NO_GO', attemptId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/orchestra/exact.ts'],
    linesAdded: 2,
    linesRemoved: 1,
    testsPassed: verdict === 'DONE',
    coverage: 91,
    selfAssessment: verdict,
    evaluationDecision: verdict,
    notes: 'fixture',
    workAttribution: {
      state: 'VERIFIED',
      attemptId,
      baselineRef: `task-result-work-attribution-baseline:sha256:${'a'.repeat(64)}`,
      baselineSha256: 'a'.repeat(64),
      scopeDigest: 'b'.repeat(64),
    },
  } as TaskResult;
}

function exactAuthority(
  taskId: string,
  attemptId: string,
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
): {
  authority: ExactAcceptedResultTerminalAuthorityV2;
  terminal: ExactTaskResultAuthorityMetadata;
} {
  const identity: TaskAttemptCustodyIdentityV2 = {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: 'a'.repeat(64),
    projectId: 'project-a',
    taskId,
    attemptId,
    generation: 1,
  };
  const accepted: ExactAcceptedTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity,
    admissionReceiptDigest: digest('1'),
    acceptedResultRef: {
      schemaVersion: 2,
      kind: 'task-accepted-result-v2-ref',
      identity,
      artifactKey: 'accepted-result',
      artifactReceiptDigest: digest('2'),
    },
    acceptedResultChainDigest: digest('3'),
    resultDigest: digest('4'),
  };
  const terminal: ExactTaskResultAuthorityMetadata = {
    executionMode: 'normal-docker',
    identity,
    admissionReceiptDigest: accepted.admissionReceiptDigest,
    settlementRef: {
      schemaVersion: 2,
      kind: 'task-result-settlement-v2-ref',
      identity,
      artifactKey: 'settlement',
      artifactReceiptDigest: digest('5'),
    },
    settlementDigest: digest('6'),
    resultDigest: accepted.resultDigest,
    acceptedResultChainDigest: accepted.acceptedResultChainDigest,
    evaluationChainDigest: digest('7'),
    finalizerChainDigest: digest('8'),
    evaluationArtifact: {
      artifactReceiptDigest: digest('9'),
      chainDigest: digest('7'),
      artifactSha256: digest('a'),
      byteLength: 128,
    },
    finalizerArtifact: {
      artifactReceiptDigest: digest('b'),
      chainDigest: digest('8'),
      artifactSha256: digest('c'),
      byteLength: 96,
    },
  };
  return {
    terminal,
    authority: {
      schemaVersion: 2,
      kind: 'exact-accepted-result-terminal-authority-v2',
      acceptedAuthority: accepted,
      terminalResultAuthority: terminal,
      terminalDecisionAuthority: {
        schemaVersion: 2,
        kind: 'exact-task-terminal-decision-authority-v2',
        identity,
        evaluationReceipt: {
          verdict,
          artifactReceiptDigest: terminal.evaluationArtifact.artifactReceiptDigest,
          artifactSha256: terminal.evaluationArtifact.artifactSha256,
          byteLength: terminal.evaluationArtifact.byteLength,
          chainDigest: terminal.evaluationChainDigest,
        },
        finalizerReceipt: {
          state: 'terminal-ready',
          artifactReceiptDigest: terminal.finalizerArtifact.artifactReceiptDigest,
          artifactSha256: terminal.finalizerArtifact.artifactSha256,
          byteLength: terminal.finalizerArtifact.byteLength,
          chainDigest: terminal.finalizerChainDigest,
        },
      },
    },
  };
}

function currentRead(
  taskId: string,
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  projectedResult: TaskResult,
): ExactAcceptedTaskTerminalAuthorityRead {
  const exact = exactAuthority(taskId, `exact-attempt:${taskId}`, verdict);
  return {
    state: 'current',
    terminalAuthority: exact.authority,
    terminalResultAuthority: exact.terminal,
    evaluationReceipt: {
      verdict,
      receiptDigest: digest('d'),
    } as ExactAcceptedTaskTerminalAuthorityRead extends { state: 'current'; evaluationReceipt: infer T }
      ? T
      : never,
    finalizerReceipt: {
      verdict,
      receiptDigest: digest('e'),
    } as ExactAcceptedTaskTerminalAuthorityRead extends { state: 'current'; finalizerReceipt: infer T }
      ? T
      : never,
    result: {
      taskId,
      attemptCustody: { identity: exact.authority.acceptedAuthority.identity },
    } as ExactAcceptedTaskTerminalAuthorityRead extends { state: 'current'; result: infer T }
      ? T
      : never,
    projectedResult,
  };
}

describe('sprint finalizer exact attempt custody', () => {
  it('uses the Store-revalidated T11 receipt instead of conflicting public verdicts', () => {
    const exactResult = result('910-001', 'DONE', 'exact-attempt:910-001');
    const exact = currentRead('910-001', 'DONE', exactResult);
    const truth = buildFinalizerTerminalTruth({
      tasks: [task('910-001')],
      evaluations: new Map([['910-001', TaskEvaluation.NO_GO]]),
      results: [result('910-001', 'NO_GO', 'public-attempt:910-001')],
      exactTerminalAuthorities: new Map([['910-001', exact]]),
    });

    expect(truth.logicalEvaluations.get('910-001')).toBe(TaskEvaluation.DONE);
    expect(truth.attempts[0]).toMatchObject({
      identity: { attemptId: 'exact-attempt:910-001' },
      authority: {
        state: 'TERMINAL',
        verdict: 'DONE',
        evidenceRef: expect.stringMatching(/^exact-terminal-authority:sha256:[a-f0-9]{64}$/u),
      },
      result: { state: 'COMPLETE', payload: exactResult },
    });
    expect(truth.exactCustodyDigests).toEqual([{
      taskId: '910-001',
      attemptId: 'exact-attempt:910-001',
      generation: 1,
      admissionReceiptDigest: digest('1'),
      acceptedResultArtifactReceiptDigest: digest('2'),
      acceptedResultChainDigest: digest('3'),
      resultDigest: digest('4'),
      evaluationArtifactReceiptDigest: digest('9'),
      evaluationChainDigest: digest('7'),
      evaluationReceiptDigest: digest('d'),
      finalizerArtifactReceiptDigest: digest('b'),
      finalizerChainDigest: digest('8'),
      finalizerReceiptDigest: digest('e'),
      settlementArtifactReceiptDigest: digest('5'),
      settlementDigest: digest('6'),
    }]);
  });

  it('persists every exact custody boundary digest in the terminal receipt', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-finalizer-exact-receipt-'));
    try {
      const exactTask = task('910-004');
      mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
      writeFileSync(
        join(projectRoot, '.tasks', 'task-910-004.json'),
        `${JSON.stringify(exactTask)}\n`,
        'utf-8',
      );
      const projected = result('910-004', 'DONE', 'exact-attempt:910-004');
      const truth = buildFinalizerTerminalTruth({
        tasks: [exactTask],
        evaluations: new Map([['910-004', TaskEvaluation.NO_GO]]),
        results: [result('910-004', 'NO_GO', 'public-attempt:910-004')],
        exactTerminalAuthorities: new Map([[
          '910-004',
          currentRead('910-004', 'DONE', projected),
        ]]),
      });
      const publication = publishFencedSprintTerminalReceipt({
        projectRoot,
        sprint: {
          id: 'sprint-910',
          number: 910,
          status: 'COMPLETE',
          phase: 'COMPLETE',
          tasks: [exactTask],
          workers: [],
        } as unknown as Sprint,
        truth,
        now: () => '2026-09-02T00:00:00.000Z',
      });
      const persisted = JSON.parse(readFileSync(publication.artifactPath, 'utf-8')) as {
        exactCustodyDigests?: unknown;
      };

      expect(persisted.exactCustodyDigests).toEqual(truth.exactCustodyDigests);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('rejects a callback envelope that pairs the valid terminal wrapper with a forged verdict', () => {
    const projected = result('910-003', 'DONE', 'exact-attempt:910-003');
    const valid = currentRead('910-003', 'DONE', projected);
    if (valid.state !== 'current') throw new Error('current fixture missing');
    const forged = {
      ...valid,
      evaluationReceipt: { ...valid.evaluationReceipt, verdict: 'NO_GO' as const },
      finalizerReceipt: { ...valid.finalizerReceipt, verdict: 'NO_GO' as const },
    } as ExactAcceptedTaskTerminalAuthorityRead;
    const truth = buildFinalizerTerminalTruth({
      tasks: [task('910-003')],
      evaluations: new Map([['910-003', TaskEvaluation.DONE]]),
      results: [projected],
      exactTerminalAuthorities: new Map([['910-003', forged]]),
    });

    expect(truth.attempts[0]?.authority).toEqual({
      state: 'UNKNOWN',
      reasonCode: 'EXACT_TERMINAL_AUTHORITY_HOLD:terminal-authority-read-invalid',
    });
  });

  it('keeps the sprint unresolved when exact terminal revalidation is on HOLD', () => {
    const truth = buildFinalizerTerminalTruth({
      tasks: [task('910-002')],
      evaluations: new Map([['910-002', TaskEvaluation.DONE]]),
      results: [result('910-002', 'DONE', 'public-attempt:910-002')],
      exactTerminalAuthorities: new Map([[
        '910-002',
        { state: 'hold', reasonCode: 'terminal-receipt-binding-mismatch' },
      ]]),
    });

    expect(truth.logicalEvaluations.has('910-002')).toBe(false);
    expect(truth.attempts[0]?.authority).toEqual({
      state: 'UNKNOWN',
      reasonCode: 'EXACT_TERMINAL_AUTHORITY_HOLD:terminal-receipt-binding-mismatch',
    });
    expect(truth.terminalEvidence.cleanupEligibility.candidate).toBe(false);
  });
});
