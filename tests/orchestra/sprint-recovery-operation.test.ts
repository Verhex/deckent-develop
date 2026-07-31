import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutionRecoveryAdapterResult,
  ExecutionRecoveryFencedEffect,
  ExecutionRecoveryModeAdapter,
} from '../../src/orchestra/execution-recovery-adapter.js';
import {
  ExecutionRecoveryService,
  type ExecutionRecoveryPersistence,
  type ExecutionRecoveryServiceIdentity,
} from '../../src/orchestra/execution-recovery-service.js';
import {
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
} from '../../src/orchestra/sprint-recovery-operation.js';

const policy = {
  coordinator_termination_grace_ms: 2,
  termination_poll_interval_ms: 1,
  forced_termination_verify_ms: 2,
};

describe('runSprintRecoveryOperation coordinator death fence', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function rootWithCoordinator(): { root: string; pid: number } {
    const root = mkdtempSync(join(tmpdir(), 'sprint-recovery-death-'));
    roots.push(root);
    const pid = 424_242;
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'pids', 'sprint-482.pid'), JSON.stringify({
      pid,
      sprintId: 'sprint-482',
      startedAt: '2026-07-31T00:00:00.000Z',
      startToken: 'start-exact',
    }));
    return { root, pid };
  }

  function approval(root: string) {
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-482');
    return {
      approvalRef: 'approval:force-finalize',
      idempotencyKey: 'force-finalize-once',
      identity,
    };
  }

  it('settles only after the exact coordinator is observed dead after SIGTERM', async () => {
    const { root } = rootWithCoordinator();
    let alive = true;
    const signals: NodeJS.Signals[] = [];

    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => alive,
        verifyOwnership: () => 'owned',
        kill: (_pid, signal) => { signals.push(signal); },
        wait: async () => { alive = false; },
      },
    });

    expect(signals).toEqual(['SIGTERM']);
    expect(report.identity.executionId).toBe('sprint-482');
  });

  it('resolves containment timings from project effective config when no policy is injected', async () => {
    const { root } = rootWithCoordinator();
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({
      lifecycle_recovery: {
        coordinator_termination_grace_ms: 100,
        termination_poll_interval_ms: 10,
        forced_termination_verify_ms: 100,
      },
    }));
    let alive = true;
    const waits: number[] = [];

    await runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      terminationDeps: {
        isAlive: () => alive,
        verifyOwnership: () => 'owned',
        kill: () => undefined,
        wait: async ms => {
          waits.push(ms);
          alive = false;
        },
      },
    });

    expect(waits).toEqual([10]);
  });

  it('contains for finalize without archiving evidence before finalizeSprint owns settlement', async () => {
    const { root } = rootWithCoordinator();
    const taskPath = join(root, '.tasks', 'task-482-001.json');
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(taskPath, JSON.stringify({
      id: '482-001',
      sprintId: 'sprint-482',
      status: 'DONE',
    }));
    let alive = true;

    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      intent: 'FINALIZE_CONTAINMENT',
      skipAudit: true,
      approval: approval(root),
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => alive,
        verifyOwnership: () => 'owned',
        kill: () => undefined,
        wait: async () => { alive = false; },
      },
    });

    expect(report.taskFilesArchived).toBe(0);
    expect(existsSync(taskPath)).toBe(true);
    expect(existsSync(join(root, '.deckent', 'pids', 'sprint-482.pid'))).toBe(true);
  });

  it('revalidates the durable PID fence before SIGKILL and HOLDs without cleanup', async () => {
    const { root, pid } = rootWithCoordinator();
    const exactApproval = approval(root);
    const signals: NodeJS.Signals[] = [];
    let waits = 0;

    await expect(runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: exactApproval,
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => true,
        verifyOwnership: () => 'owned',
        kill: (_pid, signal) => { signals.push(signal); },
        wait: async () => {
          waits += 1;
          if (waits === 2) {
            writeFileSync(join(root, '.deckent', 'pids', 'sprint-482.pid'), JSON.stringify({
              pid,
              sprintId: 'sprint-482',
              startToken: 'foreign-generation',
            }));
          }
        },
      },
    })).rejects.toMatchObject({
      code: 'SETTLEMENT_FAILED',
      details: { disposition: 'HOLD', reason: 'stale-fence' },
    });

    expect(signals).toEqual(['SIGTERM']);
    expect(readSprintRecoverySettlementIdentity(root, 'sprint-482'))
      .not.toEqual(exactApproval.identity);
  });

  it('revalidates recovery generation evidence after SIGTERM and before SIGKILL', async () => {
    const { root } = rootWithCoordinator();
    const signals: NodeJS.Signals[] = [];

    await expect(runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => true,
        verifyOwnership: () => 'owned',
        verifyGeneration: () => false,
        kill: (_pid, signal) => { signals.push(signal); },
        wait: async () => undefined,
      },
    })).rejects.toMatchObject({
      code: 'SETTLEMENT_FAILED',
      details: { disposition: 'HOLD', reason: 'stale-fence' },
    });

    expect(signals).toEqual(['SIGTERM']);
  });

  it.each([
    ['ownership-unverified', 'unknown'],
    ['skipped-reused', 'reused'],
  ] as const)('returns typed HOLD for %s without signalling', async (reason, ownership) => {
    const { root } = rootWithCoordinator();
    const signals: NodeJS.Signals[] = [];

    await expect(runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => true,
        verifyOwnership: () => ownership,
        kill: (_pid, signal) => { signals.push(signal); },
      },
    })).rejects.toMatchObject({
      code: 'SETTLEMENT_FAILED',
      details: { disposition: 'HOLD', reason },
    });

    expect(signals).toEqual([]);
  });

  it('HOLDs when SIGKILL cannot prove death', async () => {
    const { root } = rootWithCoordinator();
    const signals: NodeJS.Signals[] = [];

    await expect(runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => true,
        verifyOwnership: () => 'owned',
        kill: (_pid, signal) => { signals.push(signal); },
        wait: async () => undefined,
      },
    })).rejects.toMatchObject({
      code: 'SETTLEMENT_FAILED',
      details: { disposition: 'HOLD', reason: 'still-alive' },
    });

    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });
});

describe('ExecutionRecoveryService terminal settlement death gate', () => {
  it('returns HOLD before reserving authority when coordinator death is unverified', async () => {
    const identity: ExecutionRecoveryServiceIdentity = {
      executionId: 'sprint-482',
      generation: 1,
      taskId: 'sprint-482',
      attemptId: 'attempt-1',
      fenceToken: 'fence-1',
    };
    const apply = vi.fn((_effect: ExecutionRecoveryFencedEffect):
    ExecutionRecoveryAdapterResult<void> => ({ ok: true, value: undefined }));
    const adapter: ExecutionRecoveryModeAdapter<unknown> = {
      mode: 'sprint',
      platform: 'posix',
      capabilities: {
        mode: 'sprint',
        platform: 'posix',
        supported: ['inspect', 'settle'],
      },
      inspect: () => ({
        ok: true,
        value: {
          expectedIdentity: identity,
          evidence: {
            identity,
            evidenceRefs: ['evidence:orphan'],
            dispatch: 'DISPATCHED',
            control: 'RUNNING',
            process: 'ABSENT',
            fence: 'INACTIVE',
            previousProgressSequence: 1,
            observedProgressSequence: 1,
            wallClockProjection: 'STALE',
            completion: 'DURABLE',
            finalizePermitRef: 'permit:finalize',
          },
        },
      }),
      apply,
    };
    const persistence: ExecutionRecoveryPersistence = {
      reserve: vi.fn(),
      commit: vi.fn(),
    };
    const service = new ExecutionRecoveryService({
      clock: { now: () => '2026-07-31T00:00:00.000Z' },
      processIdentity: {
        verify: vi.fn(async () => ({ ok: true, evidenceRef: 'process:exact' })),
      },
      coordinatorDeath: {
        verifyDead: vi.fn(async () => ({ ok: false, reason: 'ownership-lost' })),
      },
      persistence,
      adapters: [{ adapter }] as never,
    });

    const result = await service.mutate(
      {
        mode: 'sprint',
        platform: 'posix',
        identity,
        nativeEvidence: {},
      },
      'settle',
      {
        approvalRef: 'permit:finalize',
        operation: 'settle',
        identity,
        idempotencyKey: 'settle-once',
        leaseFence: identity.fenceToken,
      },
      0,
    );

    expect(result).toEqual({
      ok: false,
      disposition: 'HOLD',
      code: 'COORDINATOR_DEATH_UNVERIFIED',
      reason: 'ownership-lost',
    });
    expect(persistence.reserve).not.toHaveBeenCalled();
    expect(persistence.commit).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
