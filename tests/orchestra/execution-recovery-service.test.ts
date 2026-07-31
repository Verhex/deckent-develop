import { describe, expect, it, vi } from 'vitest';

import type {
  ExecutionRecoveryEvidence,
  ExecutionRecoveryInput,
} from '../../src/core/execution-recovery.js';
import type {
  ExecutionRecoveryAdapterResult,
  ExecutionRecoveryFencedEffect,
  ExecutionRecoveryModeAdapter,
} from '../../src/orchestra/execution-recovery-adapter.js';
import {
  ExecutionRecoveryService,
  type ExecutionRecoveryPersistence,
  type ExecutionRecoveryReceipt,
  type ExecutionRecoveryReservation,
  type ExecutionRecoveryServiceIdentity,
} from '../../src/orchestra/execution-recovery-service.js';

const identity: ExecutionRecoveryServiceIdentity = {
  executionId: 'execution-480',
  generation: 7,
  taskId: 'task-480',
  attemptId: 'attempt-exact',
  fenceToken: 'fence-exact',
};

interface NativeEvidence {
  readonly phase: string;
  readonly evidence: ExecutionRecoveryEvidence;
}

function recoverableEvidence(): ExecutionRecoveryEvidence {
  return {
    identity,
    evidenceRefs: ['observation:sha256:abc'],
    dispatch: 'DISPATCHED',
    control: 'RUNNING',
    process: 'ABSENT',
    fence: 'INACTIVE',
    previousProgressSequence: 5,
    observedProgressSequence: 5,
    wallClockProjection: 'STALE',
    completion: 'INCOMPLETE',
    resumePermitRef: 'approval:sha256:def',
  };
}

function makePersistence() {
  const receipts: ExecutionRecoveryReceipt[] = [];
  let sequence = 0;
  const keys = new Map<string, ExecutionRecoveryReceipt>();
  const persistence: ExecutionRecoveryPersistence = {
    reserve: vi.fn(async (
      command: Parameters<ExecutionRecoveryPersistence['reserve']>[0],
    ) => {
      const duplicate = keys.get(command.idempotencyKey);
      if (duplicate) {
        return { status: 'duplicate', receipt: duplicate };
      }
      if (command.expectedSequence !== sequence) {
        return { status: 'out-of-order', currentSequence: sequence };
      }
      sequence += 1;
      return { status: 'accepted', sequence } satisfies ExecutionRecoveryReservation;
    }),
    commit: vi.fn(async receipt => {
      receipts.push(receipt);
      keys.set(receipt.idempotencyKey, receipt);
      return true;
    }),
  };
  return { persistence, receipts };
}

function makeHarness(
  applyResult: ExecutionRecoveryAdapterResult<void> = { ok: true, value: undefined },
) {
  const apply = vi.fn((_effect: ExecutionRecoveryFencedEffect) => applyResult);
  const inspect = vi.fn(
    (_expectedIdentity: ExecutionRecoveryServiceIdentity, native: NativeEvidence):
    ExecutionRecoveryAdapterResult<ExecutionRecoveryInput> => ({
      ok: true,
      value: { expectedIdentity: identity, evidence: native.evidence },
    }),
  );
  const adapter: ExecutionRecoveryModeAdapter<NativeEvidence> = {
    mode: 'sprint',
    platform: 'posix',
    capabilities: {
      mode: 'sprint',
      platform: 'posix',
      supported: ['inspect', 'resume', 'settle', 'abort', 'terminate'],
    },
    inspect,
    apply,
  };
  const { persistence, receipts } = makePersistence();
  const processIdentity = { verify: vi.fn(async () => ({ ok: true, evidenceRef: 'process:sha256:ghi' }) as const) };
  const service = new ExecutionRecoveryService({
    clock: { now: () => '2026-07-30T12:00:00.000Z' },
    processIdentity,
    persistence,
    adapters: [{ adapter }] as never,
  });
  const target = {
    mode: 'sprint' as const,
    platform: 'posix' as const,
    identity,
    nativeEvidence: { phase: 'RUN', evidence: recoverableEvidence() },
  };
  const approval = {
    approvalRef: 'approval:sha256:def',
    operation: 'resume' as const,
    identity,
    idempotencyKey: 'resume-once',
    leaseFence: identity.fenceToken,
  };
  return { service, target, approval, adapter, apply, inspect, persistence, receipts, processIdentity };
}

describe('ExecutionRecoveryService.inspect', () => {
  it('decides from adapter evidence without process or persistence mutation', () => {
    const harness = makeHarness();

    const result = harness.service.inspect(harness.target);

    expect(result).toMatchObject({ ok: true, outcome: { decision: 'SAFE_TO_RESUME' } });
    expect(harness.inspect).toHaveBeenCalledTimes(1);
    expect(harness.apply).not.toHaveBeenCalled();
    expect(harness.processIdentity.verify).not.toHaveBeenCalled();
    expect(harness.persistence.reserve).not.toHaveBeenCalled();
    expect(harness.persistence.commit).not.toHaveBeenCalled();
  });
});

describe('ExecutionRecoveryService mutations', () => {
  it('applies an approval/fence-bound resume once and durably records an immutable receipt', async () => {
    const harness = makeHarness();

    const result = await harness.service.mutate(harness.target, 'resume', harness.approval, 0);

    expect(result.ok).toBe(true);
    expect(harness.apply).toHaveBeenCalledTimes(1);
    expect(harness.persistence.reserve).toHaveBeenCalledTimes(1);
    expect(harness.persistence.commit).toHaveBeenCalledTimes(1);
    expect(harness.receipts[0]).toMatchObject({
      sequence: 1,
      operation: 'resume',
      status: 'APPLIED',
      identity,
    });
    expect(Object.isFrozen(harness.receipts[0])).toBe(true);
    expect(Object.isFrozen(harness.receipts[0]?.identity)).toBe(true);
  });

  it('refuses a duplicate effect before invoking the adapter again', async () => {
    const harness = makeHarness();
    const first = await harness.service.mutate(harness.target, 'resume', harness.approval, 0);
    expect(first.ok).toBe(true);

    const duplicate = await harness.service.mutate(harness.target, 'resume', harness.approval, 1);

    expect(duplicate).toMatchObject({ ok: false, code: 'DUPLICATE' });
    expect(harness.apply).toHaveBeenCalledTimes(1);
  });

  it('refuses out-of-order and mismatched approval/fence commands without effects', async () => {
    const harness = makeHarness();
    const outOfOrder = await harness.service.mutate(harness.target, 'resume', harness.approval, 4);
    const wrongFence = await harness.service.mutate(
      harness.target,
      'resume',
      { ...harness.approval, leaseFence: 'foreign' },
      0,
    );

    expect(outOfOrder).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
    expect(wrongFence).toMatchObject({ ok: false, code: 'APPROVAL_MISMATCH' });
    expect(harness.apply).not.toHaveBeenCalled();
  });

  it('records a failed continuation once while leaving recovery evidence resumable', async () => {
    const harness = makeHarness({
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      message: 'failed continuation',
    });

    const failed = await harness.service.mutate(harness.target, 'resume', harness.approval, 0);
    const after = harness.service.inspect(harness.target);

    expect(failed).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_CAPABILITY',
      receipt: { status: 'EFFECT_FAILED' },
    });
    expect(after).toMatchObject({ ok: true, outcome: { decision: 'SAFE_TO_RESUME' } });
    expect(harness.apply).toHaveBeenCalledTimes(1);
  });

  it.each(['abort', 'terminate'] as const)(
    'supports explicitly approved, exact-identity %s only when the core outcome allows it',
    async operation => {
      const harness = makeHarness();
      harness.target.nativeEvidence.evidence = {
        ...harness.target.nativeEvidence.evidence,
        process: 'ALIVE',
        fence: 'ACTIVE',
        resumePermitRef: undefined,
      };
      const result = await harness.service.mutate(
        harness.target,
        operation,
        { ...harness.approval, operation, idempotencyKey: `${operation}-once` },
        0,
      );

      expect(result).toMatchObject({ ok: true, receipt: { operation } });
      expect(harness.apply).toHaveBeenCalledWith(expect.objectContaining({
        capability: operation,
        decision: 'STALLED',
        identity,
      }));
    },
  );

  it('never reports success when the receipt cannot be durably committed', async () => {
    const harness = makeHarness();
    vi.mocked(harness.persistence.commit).mockResolvedValue(false);

    const result = await harness.service.mutate(harness.target, 'resume', harness.approval, 0);

    expect(result).toEqual({ ok: false, code: 'DURABILITY_FAILURE' });
  });
});
