import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { decideExecutionRecovery } from '../../src/core/execution-recovery.js';
import {
  ExecutionRecoveryService,
  type ExecutionRecoveryPersistence,
} from '../../src/orchestra/execution-recovery-service.js';
import {
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
  SprintRecoveryOperationError,
} from '../../src/orchestra/sprint-recovery-operation.js';

const identity = {
  executionId: 'sprint-480',
  generation: 12,
  taskId: '480-006-fix',
  attemptId: 'attempt-2',
  fenceToken: 'fence-exact',
};

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    identity,
    evidenceRefs: ['observation:sha256:abc'],
    dispatch: 'DISPATCHED' as const,
    control: 'RUNNING' as const,
    process: 'ALIVE' as const,
    fence: 'ACTIVE' as const,
    previousProgressSequence: 7,
    observedProgressSequence: 7,
    wallClockProjection: 'FRESH' as const,
    completion: 'INCOMPLETE' as const,
    ...overrides,
  };
}

describe('execution recovery adversarial contract', () => {
  it.each([
    ['auth absence before dispatch', {
      dispatch: 'NOT_DISPATCHED', process: 'ABSENT', fence: 'INACTIVE',
      previousProgressSequence: 0, observedProgressSequence: 0,
    }, 'NOT_DISPATCHED'],
    ['provider unreachable before dispatch', {
      dispatch: 'NOT_DISPATCHED', process: 'ABSENT', fence: 'INACTIVE',
      previousProgressSequence: 0, observedProgressSequence: 0,
    }, 'NOT_DISPATCHED'],
    ['partial or malformed evidence', { process: 'UNKNOWN' }, 'HELD'],
    ['no-progress coordinator', {}, 'STALLED'],
    ['stale dashboard projection', { wallClockProjection: 'STALE' }, 'STALLED'],
    ['definitively absent attempt', { process: 'ABSENT', fence: 'INACTIVE' }, 'ORPHANED'],
  ] as const)('%s yields one typed provider-neutral decision', (_label, overrides, expected) => {
    expect(decideExecutionRecovery({
      expectedIdentity: identity,
      evidence: evidence(overrides),
    }).decision).toBe(expected);
  });

  it('PID reuse / ignored termination evidence fails before external effect', async () => {
    const apply = vi.fn(() => ({ ok: true, value: undefined }) as const);
    const persistence: ExecutionRecoveryPersistence = {
      reserve: vi.fn(async () => ({ status: 'accepted', sequence: 1 }) as const),
      commit: vi.fn(async () => true),
    };
    const service = new ExecutionRecoveryService({
      clock: { now: () => '2026-07-30T12:00:00.000Z' },
      processIdentity: {
        verify: vi.fn(async () => ({ ok: false, reason: 'pid-reused-or-still-alive' }) as const),
      },
      persistence,
      adapters: [{
        adapter: {
          mode: 'sprint',
          platform: 'posix',
          capabilities: {
            mode: 'sprint',
            platform: 'posix',
            supported: ['inspect', 'abort'],
          },
          inspect: () => ({
            ok: true,
            value: { expectedIdentity: identity, evidence: evidence() },
          }),
          apply,
        },
      }] as never,
    });

    const result = await service.mutate({
      mode: 'sprint',
      platform: 'posix',
      identity,
      nativeEvidence: {},
    }, 'abort', {
      approvalRef: 'approval:exact',
      operation: 'abort',
      identity,
      idempotencyKey: 'abort-once',
      leaseFence: identity.fenceToken,
    }, 0);

    expect(result).toEqual({ ok: false, code: 'PROCESS_IDENTITY_MISMATCH' });
    expect(apply).not.toHaveBeenCalled();
    expect(persistence.reserve).not.toHaveBeenCalled();
  });

  it('healthy inspection performs no process probe, persistence, lock, or effect work', () => {
    const processVerify = vi.fn();
    const reserve = vi.fn();
    const commit = vi.fn();
    const apply = vi.fn();
    const service = new ExecutionRecoveryService({
      clock: { now: () => '2026-07-30T12:00:00.000Z' },
      processIdentity: { verify: processVerify },
      persistence: { reserve, commit },
      adapters: [{
        adapter: {
          mode: 'sprint',
          platform: 'posix',
          capabilities: { mode: 'sprint', platform: 'posix', supported: ['inspect'] },
          inspect: () => ({
            ok: true,
            value: {
              expectedIdentity: identity,
              evidence: evidence({ observedProgressSequence: 8 }),
            },
          }),
          apply,
        },
      }] as never,
    });

    expect(service.inspect({
      mode: 'sprint',
      platform: 'posix',
      identity,
      nativeEvidence: {},
    })).toMatchObject({ ok: true, outcome: { decision: 'HEALTHY' } });
    expect(processVerify).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('refuses cleanup while live Sprint authority exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'recovery-live-authority-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'sprint-active.json'), JSON.stringify({
      sprintId: 'sprint-480',
      pid: process.pid,
      startedAt: new Date().toISOString(),
      env: 'test',
    }));
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-480',
      phase: 'EXECUTE',
      status: 'ACTIVE',
    }));
    writeFileSync(join(root, '.deckent', 'pids', 'sprint-480.pid'), JSON.stringify({
      sprintId: 'sprint-480',
      pid: process.pid,
    }));
    const exactIdentity = readSprintRecoverySettlementIdentity(root, 'sprint-480');

    await expect(runSprintRecoveryOperation(root, 'sprint-480', {
      skipAudit: true,
      approval: {
        approvalRef: 'test:exact-live',
        idempotencyKey: 'test:exact-live',
        identity: exactIdentity,
      },
    })).rejects.toMatchObject<SprintRecoveryOperationError>({
      code: 'ACTIVE_AUTHORITY',
    });
  });

  it('requires an exact generation/fence approval before any recovery mutation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'recovery-approval-binding-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const exactIdentity = readSprintRecoverySettlementIdentity(root, 'sprint-481');

    await expect(runSprintRecoveryOperation(root, 'sprint-481', {
      skipAudit: true,
    })).rejects.toMatchObject<SprintRecoveryOperationError>({
      code: 'APPROVAL_REQUIRED',
    });
    await expect(runSprintRecoveryOperation(root, 'sprint-481', {
      skipAudit: true,
      approval: {
        approvalRef: 'test:stale',
        idempotencyKey: 'test:stale',
        identity: { ...exactIdentity, generation: exactIdentity.generation + 1 },
      },
    })).rejects.toMatchObject<SprintRecoveryOperationError>({
      code: 'APPROVAL_MISMATCH',
    });
  });
});
