import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { ApprovalBroker } from '../../src/core/approval-broker.js';
import type { ExecutionRecoveryOutcome } from '../../src/core/execution-recovery.js';
import {
  proposeRecoveryNotification,
  resolveRecoveryNotification,
} from '../../src/nervous/recovery-notification.js';

function broker(): ApprovalBroker {
  const root = mkdtempSync(join(tmpdir(), 'recovery-notification-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return new ApprovalBroker(root);
}

const identity = {
  executionId: 'sprint-480',
  generation: 9,
  taskId: '480-006-fix',
  attemptId: 'attempt-2',
  fenceToken: 'fence-exact',
};

const target = {
  mode: 'sprint' as const,
  platform: 'posix' as const,
  identity,
  nativeEvidence: { source: 'checkpoint' },
};

const outcome: ExecutionRecoveryOutcome = {
  decision: 'STALLED',
  reasonCodes: ['NO_MONOTONIC_PROGRESS'],
  evidenceRefs: ['checkpoint:sha256:abc', 'pid:sha256:def'],
  allowedNextOperations: [
    'OBSERVE',
    'WAIT',
    'ABORT_EXACT_ATTEMPT',
    'TERMINATE_EXACT_ATTEMPT',
  ],
  failClosed: false,
  explanation: 'bounded test evidence',
};

function input() {
  return {
    target,
    outcome,
    operation: 'abort' as const,
    summary: 'Recovery approval required',
    productImpact: { code: 'execution.stalled', severity: 'high' as const },
    dogfoodImpact: { code: 'sprint.fix-blocked', severity: 'high' as const },
    createdAt: '2026-07-30T10:00:00.000Z',
    expiresAt: '2026-07-30T11:00:00.000Z',
    tenantId: 'local',
    userId: 'operator',
  };
}

describe('recovery Nervous notification', () => {
  it('deduplicates the same decision binding and stores only evidence digests', () => {
    const approvalBroker = broker();

    const first = proposeRecoveryNotification(approvalBroker, input());
    const duplicate = proposeRecoveryNotification(approvalBroker, input());

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.request.id).toBe(first.request.id);
    expect(duplicate.idempotencyKey).toBe(first.idempotencyKey);
    expect(JSON.stringify(first.request.details)).not.toContain('checkpoint:sha256:abc');
    expect(first.request.details.evidenceDigests).toHaveLength(2);
  });

  it('binds acceptance to exact identity and invokes the shared service once', async () => {
    const approvalBroker = broker();
    const proposal = proposeRecoveryNotification(approvalBroker, input());
    const mutate = vi.fn(async () => ({ ok: true, receipt: { receiptId: 'r-1' } }));

    const resolved = await resolveRecoveryNotification(
      approvalBroker,
      { mutate } as never,
      proposal.request.id,
      'accepted',
      target,
      0,
      { id: 'operator', channel: 'cli' },
      new Date('2026-07-30T10:30:00.000Z'),
    );

    expect(resolved.outcome).toBe('accepted');
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      target,
      'abort',
      expect.objectContaining({
        identity,
        idempotencyKey: proposal.idempotencyKey,
        leaseFence: identity.fenceToken,
      }),
      0,
    );
  });

  it('records rejection without invoking a recovery effect', async () => {
    const approvalBroker = broker();
    const proposal = proposeRecoveryNotification(approvalBroker, input());
    const mutate = vi.fn();

    const resolved = await resolveRecoveryNotification(
      approvalBroker,
      { mutate } as never,
      proposal.request.id,
      'rejected',
      target,
      0,
      { id: 'operator', channel: 'cli', reason: 'inspect first' },
      new Date('2026-07-30T10:30:00.000Z'),
    );

    expect(resolved.outcome).toBe('rejected');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('rejects stale approval replay against a different generation', async () => {
    const approvalBroker = broker();
    const proposal = proposeRecoveryNotification(approvalBroker, input());

    await expect(resolveRecoveryNotification(
      approvalBroker,
      { mutate: vi.fn() } as never,
      proposal.request.id,
      'accepted',
      { ...target, identity: { ...identity, generation: identity.generation + 1 } },
      0,
      { id: 'operator', channel: 'cli' },
      new Date('2026-07-30T10:30:00.000Z'),
    )).rejects.toThrow(/exact target/u);
  });
});
