import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  persistCrossVerifyTaskSettlement,
  readCrossVerifyTaskSettlement,
} from '../../src/orchestra/cross-verify-runner.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const originalDeckentHome = process.env.DECKENT_HOME;
let hostStateRoot = '';

beforeEach(() => {
  hostStateRoot = mkdtempSync(join(tmpdir(), 'xverify-task-settlement-host-state-'));
  process.env.DECKENT_HOME = join(hostStateRoot, '.deckent');
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  rmSync(hostStateRoot, { recursive: true, force: true });
});

function prepareAttempt(
  root: string,
  taskId: string,
  attemptId: string,
  terminal: boolean,
): void {
  const ref = createTaskResultSettlementRefForAttempt(root, taskId, attemptId);
  writeTaskResultSettlementAttemptAtomic(ref);
  claimTaskResultSettlementAttemptAtomic(ref);
  if (!terminal) return;
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref,
    exitCode: 0,
    result: {
      taskId,
      workerId: `worker-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'closed exact verifier transport',
    },
  }));
  writeTaskResultSettlementClosureAtomic(ref, {
    containerDisposition: 'stopped-removed',
    locksReleased: true,
  });
}

describe('XVerify runner task settlement', () => {
  it.each([
    ['confirmed', 'DONE'],
    ['refuted', 'NO_GO'],
    ['unclear', 'NO_GO'],
  ] as const)('publishes host-adjudicated %s as a private immutable %s receipt', (verdict, status) => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-task-settlement-'));
    try {
      const attemptId = '11111111-1111-4111-8111-111111111111';
      const transportReceipt = {
        taskId: '621-007-xverify', invocationId: 'invocation-1', attemptId,
        generation: 0, terminal: true as const, provider: 'codex',
        evidenceRef: 'host-observation:1', receiptDigest: digest('a'),
      };
      prepareAttempt(root, transportReceipt.taskId, attemptId, true);
      const receipt = persistCrossVerifyTaskSettlement({
        projectRoot: root,
        taskId: transportReceipt.taskId,
        invocationId: transportReceipt.invocationId,
        attemptId: transportReceipt.attemptId,
        generation: 0,
        producerProvider: 'claude',
        verifierProvider: 'codex',
        authorityEvidenceRef: 'owner-tier-authority:test-1',
        dispatchOutcome: {
          kind: 'adjudicated', transportReceipt,
          hostAdjudication: {
            verdict,
            disposition: verdict === 'unclear' ? 'fail-closed' : 'accepted',
            evidenceRef: 'host-adjudication:1', adjudicationDigest: digest('b'),
          },
        },
      });
      const stored = readCrossVerifyTaskSettlement({
        projectRoot: root,
        taskId: transportReceipt.taskId,
        attemptId,
      });
      expect(stored?.projection).toMatchObject({ terminal: true, status, resumable: false });
      expect(stored?.settlementDigest).toBe(receipt.settlementDigest);
      expect(stored?.invocationId).toBe('invocation-1');
      expect(stored?.authorityEvidenceRef).toBe('owner-tier-authority:test-1');
      expect(stored?.evidenceRefs).toContain('owner-tier-authority:test-1');
      expect(existsSync(join(root, '.tasks', 'task-621-007-xverify.result'))).toBe(false);
      expect(persistCrossVerifyTaskSettlement({
        projectRoot: root,
        taskId: transportReceipt.taskId,
        invocationId: transportReceipt.invocationId,
        attemptId: transportReceipt.attemptId,
        generation: 0,
        producerProvider: 'claude',
        verifierProvider: 'codex',
        authorityEvidenceRef: 'owner-tier-authority:test-1',
        dispatchOutcome: {
          kind: 'adjudicated', transportReceipt,
          hostAdjudication: {
            verdict,
            disposition: verdict === 'unclear' ? 'fail-closed' : 'accepted',
            evidenceRef: 'host-adjudication:1', adjudicationDigest: digest('b'),
          },
        },
      })).toEqual(receipt);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes terminal unavailable and resumable HOLD receipts instead of leaving PENDING', () => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-task-settlement-'));
    try {
      const base = {
        projectRoot: root,
        invocationId: 'invocation-2',
        attemptId: '22222222-2222-4222-8222-222222222222',
        generation: 0,
        producerProvider: 'claude', verifierProvider: 'codex',
      };
      const transportReceipt = {
        taskId: 'unavailable-xverify', invocationId: base.invocationId,
        attemptId: base.attemptId, generation: 0, terminal: true as const,
        provider: 'codex', evidenceRef: 'transport:unavailable', receiptDigest: digest('c'),
      };
      prepareAttempt(root, transportReceipt.taskId, base.attemptId, true);
      const unavailable = persistCrossVerifyTaskSettlement({
        ...base, taskId: transportReceipt.taskId,
        dispatchOutcome: {
          kind: 'unavailable', transportReceipt, reason: 'timeout', evidenceRef: 'timeout:1',
        },
      });
      expect(unavailable.projection).toMatchObject({ terminal: true, status: 'NO_GO' });

      const heldAttemptId = '33333333-3333-4333-8333-333333333333';
      prepareAttempt(root, 'held-xverify', heldAttemptId, false);
      const hold = persistCrossVerifyTaskSettlement({
        ...base, taskId: 'held-xverify', attemptId: heldAttemptId,
        dispatchOutcome: {
          kind: 'hold', reason: 'reconciliation-required', evidenceRef: 'reconcile:1',
          resumeAuthority: {
            resumeToken: 'resume-token-1',
            nextAttemptId: '44444444-4444-4444-8444-444444444444',
            nextGeneration: 1,
          },
        },
      });
      expect(hold.projection).toMatchObject({ terminal: false, status: 'HOLD', resumable: true });
      expect(readCrossVerifyTaskSettlement({
        projectRoot: root,
        taskId: 'held-xverify',
        attemptId: heldAttemptId,
      })?.settlementDigest).toBe(hold.settlementDigest);
      expect(existsSync(join(root, '.tasks', 'task-held-xverify.result'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
