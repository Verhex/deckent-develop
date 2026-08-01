import { describe, expect, it } from 'vitest';

import {
  createPostSettlementVerificationStage,
  POST_SETTLEMENT_MAX_COMMAND_ARGS,
  reducePostSettlementVerification,
  type PostSettlementBuildPermission,
  type PostSettlementVerificationStage,
  type TerminalSettlementReceiptIdentity,
  type VerificationBuildIdentity,
} from '../../src/core/post-settlement-verification.js';

const receipt: TerminalSettlementReceiptIdentity = {
  receiptId: 'receipt:terminal:1',
  sourceAttemptId: 'attempt:1',
  sourceGeneration: 3,
  sourceDigest: 'source-sha256',
};
const build: VerificationBuildIdentity = {
  buildId: 'build:1',
  sourceDigest: receipt.sourceDigest,
  artifactDigest: 'artifact-sha256',
};
const permission: PostSettlementBuildPermission = {
  permissionId: 'permission:1',
  authority: 'coordinator',
  phase: 'post-settlement',
  receiptId: receipt.receiptId,
  sourceAttemptId: receipt.sourceAttemptId,
  sourceGeneration: receipt.sourceGeneration,
  sourceDigest: receipt.sourceDigest,
  buildId: build.buildId,
};
const command = { executable: 'npm', args: ['run', 'build'], cwdRef: 'project-root' } as const;

function contained(): PostSettlementVerificationStage {
  return reducePostSettlementVerification(
    createPostSettlementVerificationStage('verify:1', 'sprint'),
    { type: 'COORDINATOR_CONTAINED', containmentRef: 'containment:1' },
  );
}

function withReceipt(): PostSettlementVerificationStage {
  return reducePostSettlementVerification(contained(), { type: 'TERMINAL_RECEIPT_OBSERVED', receipt });
}

function ready(): PostSettlementVerificationStage {
  return reducePostSettlementVerification(withReceipt(), {
    type: 'BUILD_AUTHORIZED', build, permission, command,
  });
}

describe('post-settlement verification stage contract', () => {
  it('completes only after containment, fenced receipt, permission, command evidence and promotion proof', () => {
    const awaitingPromotion = reducePostSettlementVerification(ready(), {
      type: 'COMMAND_FINISHED', exitCode: 0, evidenceRef: 'command-receipt:1',
    });
    const completed = reducePostSettlementVerification(awaitingPromotion, {
      type: 'PROMOTION_RECORDED',
      result: {
        status: 'promoted',
        promotionProofRef: 'promotion-proof:1',
        receiptId: receipt.receiptId,
        buildId: build.buildId,
        artifactDigest: build.artifactDigest,
      },
    });

    expect(completed).toMatchObject({
      state: 'completed', ingress: 'sprint', receipt, build,
      promotion: { promotionProofRef: 'promotion-proof:1' },
    });
    expect(completed).not.toHaveProperty('taskId');
    expect(completed).not.toHaveProperty('result');
  });

  it.each(['sprint', 'run-flow', 'do', 'autonomous', 'process'] as const)(
    'keeps the %s ingress provider-neutral without creating logical work',
    ingress => {
      const stage = createPostSettlementVerificationStage(`verify:${ingress}`, ingress);
      expect(stage).toEqual({ version: 1, stageId: `verify:${ingress}`, ingress, state: 'awaiting-containment' });
    },
  );

  it('returns typed HOLD when build is attempted before coordinator containment or terminal receipt', () => {
    const initial = createPostSettlementVerificationStage('verify:1', 'sprint');
    expect(reducePostSettlementVerification(initial, {
      type: 'BUILD_AUTHORIZED', build, permission, command,
    })).toMatchObject({ state: 'hold', hold: { kind: 'hold', reason: 'coordinator-containment-required' } });

    expect(reducePostSettlementVerification(contained(), {
      type: 'BUILD_AUTHORIZED', build, permission, command,
    })).toMatchObject({ state: 'hold', hold: { reason: 'terminal-receipt-required' } });
  });

  it('fences permission to the exact receipt generation, attempt, source and build identity', () => {
    const mismatched = { ...permission, sourceGeneration: permission.sourceGeneration + 1 };
    expect(reducePostSettlementVerification(withReceipt(), {
      type: 'BUILD_AUTHORIZED', build, permission: mismatched, command,
    })).toMatchObject({ state: 'hold', hold: { reason: 'build-permission-mismatch' } });
  });

  it('rejects an unbounded argv command without exposing a shell command surface', () => {
    const args = Array.from({ length: POST_SETTLEMENT_MAX_COMMAND_ARGS + 1 }, () => 'arg');
    expect(reducePostSettlementVerification(withReceipt(), {
      type: 'BUILD_AUTHORIZED', build, permission, command: { ...command, args },
    })).toMatchObject({ state: 'hold', hold: { reason: 'command-out-of-bounds' } });
  });

  it.each([
    { ...command, executable: 'npm\0hidden' },
    { ...command, cwdRef: 'project-root\0outside' },
    { ...command, args: ['run', 'build\0hidden'] },
  ])('rejects NUL-delimited command adapter fields', invalidCommand => {
    expect(reducePostSettlementVerification(withReceipt(), {
      type: 'BUILD_AUTHORIZED', build, permission, command: invalidCommand,
    })).toMatchObject({ state: 'hold', hold: { reason: 'command-out-of-bounds' } });
  });

  it('does not promote from exit status alone and rejects mismatched promotion evidence', () => {
    const awaitingPromotion = reducePostSettlementVerification(ready(), {
      type: 'COMMAND_FINISHED', exitCode: 0, evidenceRef: 'command-receipt:1',
    });
    expect(awaitingPromotion.state).toBe('awaiting-promotion');

    expect(reducePostSettlementVerification(awaitingPromotion, {
      type: 'PROMOTION_RECORDED',
      result: {
        status: 'promoted', promotionProofRef: 'promotion-proof:1',
        receiptId: 'stale-receipt', buildId: build.buildId, artifactDigest: build.artifactDigest,
      },
    })).toMatchObject({ state: 'hold', hold: { reason: 'promotion-result-mismatch' } });
  });

  it('cannot transition by timer-shaped or out-of-order evidence', () => {
    const event = { type: 'TIMER_ELAPSED', elapsedMs: 10_000 } as never;
    expect(reducePostSettlementVerification(contained(), event)).toMatchObject({
      state: 'hold', hold: { reason: 'terminal-receipt-required' },
    });
  });
});
