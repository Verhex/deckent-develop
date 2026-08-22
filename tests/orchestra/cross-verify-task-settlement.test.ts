import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { persistCrossVerifyTaskSettlement } from '../../src/orchestra/cross-verify-runner.js';

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

describe('XVerify runner task settlement', () => {
  it.each([
    ['confirmed', 'DONE'],
    ['refuted', 'NO_GO'],
    ['unclear', 'NO_GO'],
  ] as const)('atomically projects host-adjudicated %s as %s', (verdict, status) => {
    const root = mkdtempSync(join(tmpdir(), 'xverify-task-settlement-'));
    try {
      const transportReceipt = {
        taskId: '621-007-xverify', invocationId: 'invocation-1', attemptId: 'attempt-1',
        generation: 0, terminal: true as const, provider: 'codex',
        evidenceRef: 'host-observation:1', receiptDigest: digest('a'),
      };
      const receipt = persistCrossVerifyTaskSettlement({
        projectRoot: root,
        taskId: transportReceipt.taskId,
        invocationId: transportReceipt.invocationId,
        attemptId: transportReceipt.attemptId,
        generation: 0,
        producerProvider: 'claude',
        verifierProvider: 'codex',
        dispatchOutcome: {
          kind: 'adjudicated', transportReceipt,
          hostAdjudication: {
            verdict,
            disposition: verdict === 'unclear' ? 'fail-closed' : 'accepted',
            evidenceRef: 'host-adjudication:1', adjudicationDigest: digest('b'),
          },
        },
      });
      const path = join(root, '.tasks', 'task-621-007-xverify.result');
      const stored = JSON.parse(readFileSync(path, 'utf8')) as {
        status: string; xverifyTaskSettlement: typeof receipt;
      };
      expect(stored.status).toBe(status);
      expect(stored.xverifyTaskSettlement.settlementDigest).toBe(receipt.settlementDigest);
      expect(stored.xverifyTaskSettlement.invocationId).toBe('invocation-1');
      expect(persistCrossVerifyTaskSettlement({
        projectRoot: root,
        taskId: transportReceipt.taskId,
        invocationId: transportReceipt.invocationId,
        attemptId: transportReceipt.attemptId,
        generation: 0,
        producerProvider: 'claude',
        verifierProvider: 'codex',
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
        projectRoot: root, invocationId: 'invocation-2', attemptId: 'attempt-2', generation: 0,
        producerProvider: 'claude', verifierProvider: 'codex',
      };
      const transportReceipt = {
        taskId: 'unavailable-xverify', invocationId: base.invocationId,
        attemptId: base.attemptId, generation: 0, terminal: true as const,
        provider: 'codex', evidenceRef: 'transport:unavailable', receiptDigest: digest('c'),
      };
      const unavailable = persistCrossVerifyTaskSettlement({
        ...base, taskId: transportReceipt.taskId,
        dispatchOutcome: {
          kind: 'unavailable', transportReceipt, reason: 'timeout', evidenceRef: 'timeout:1',
        },
      });
      expect(unavailable.projection).toMatchObject({ terminal: true, status: 'NO_GO' });

      const hold = persistCrossVerifyTaskSettlement({
        ...base, taskId: 'held-xverify',
        dispatchOutcome: {
          kind: 'hold', reason: 'reconciliation-required', evidenceRef: 'reconcile:1',
          resumeAuthority: {
            resumeToken: 'resume-token-1', nextAttemptId: 'attempt-3', nextGeneration: 1,
          },
        },
      });
      expect(hold.projection).toMatchObject({ terminal: false, status: 'HOLD', resumable: true });
      expect(readFileSync(join(root, '.tasks', 'task-held-xverify.result'), 'utf8'))
        .not.toContain('PENDING');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
