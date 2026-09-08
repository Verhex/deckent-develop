import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  readCanonicalRunStatus,
} from '../../src/core/run-status-authority.js';
import {
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
  type SprintRecoveryOperationOptions,
} from '../../src/orchestra/sprint-recovery-operation.js';

const policy = {
  coordinator_termination_grace_ms: 2,
  termination_poll_interval_ms: 1,
  forced_termination_verify_ms: 2,
};

describe('exact started-failed retention isolation', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'started-failed-recovery-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const dispatchRequestId = `dreq-${'a'.repeat(64)}`;
  function fixture() {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', 'task-482-001.json'), '{}');
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-482');
    return { approval: { identity, approvalRef: 'approval:retention', idempotencyKey: 'retention-once' } };
  }
  const outcome = { state: 'retained' as const, dispatchRequestId, taskId: '482-001', attemptId: 'attempt-1',
    generation: 1, receiptDigest: `sha256:${'b'.repeat(64)}`, evidenceDigest: `sha256:${'c'.repeat(64)}` };

  it('dry-run inspects only the exact dispatch without approval, archive or generic custody scan', async () => {
    fixture();
    const boundary = vi.fn<NonNullable<SprintRecoveryOperationOptions['exactStartedFailedRecovery']>>()
      .mockResolvedValue({ ...outcome, state: 'eligible', receiptDigest: null });
    const generic = vi.fn(() => { throw new Error('generic scan forbidden'); });
    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      dryRun: true, startedFailedDispatchRequestId: dispatchRequestId,
      exactStartedFailedRecovery: boundary, exactCustodyInspection: generic,
    });
    expect(boundary).toHaveBeenCalledWith(expect.objectContaining({ projectRoot: root,
      sprintId: 'sprint-482', dispatchRequestId, dryRun: true }));
    expect(generic).not.toHaveBeenCalled();
    expect(report).toMatchObject({ startedFailedAttempt: { state: 'eligible' },
      audit: { overallGate: 'SKIPPED' }, taskFilesArchived: 0, staleLocksCleaned: 0 });
    expect(existsSync(join(root, '.tasks', 'task-482-001.json'))).toBe(true);
  });

  it('requires matching approval and preserves artifacts after exact fenced publication', async () => {
    const { approval } = fixture();
    const boundary = vi.fn<NonNullable<SprintRecoveryOperationOptions['exactStartedFailedRecovery']>>()
      .mockImplementation(async input => { input.beforePublish(); return outcome; });
    const opts = { startedFailedDispatchRequestId: dispatchRequestId, exactStartedFailedRecovery: boundary };
    await expect(runSprintRecoveryOperation(root, 'sprint-482', opts)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    expect(boundary).not.toHaveBeenCalled();
    const report = await runSprintRecoveryOperation(root, 'sprint-482', { ...opts, approval });
    expect(report.startedFailedAttempt).toEqual(outcome);
    expect(existsSync(join(root, '.tasks', 'task-482-001.json'))).toBe(true);
    expect(report.artifactPolicy.archiveManifests).toEqual([]);
  });

  it.each(['fence', 'foreign-live'] as const)('vetoes %s changes immediately before publication', async mode => {
    const { approval } = fixture();
    const boundary: NonNullable<SprintRecoveryOperationOptions['exactStartedFailedRecovery']> = async input => {
      mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
      const sprintId = mode === 'fence' ? 'sprint-482' : 'sprint-999';
      writeFileSync(join(root, '.deckent', 'pids', `${sprintId}.pid`), JSON.stringify({
        pid: process.pid, startToken: 'changed', sprintId, startedAt: new Date().toISOString(),
      }));
      if (mode === 'foreign-live') writeFileSync(join(root, '.deckent', 'sprint-state.json'),
        JSON.stringify({ sprintId, status: 'ACTIVE', phase: 'EXECUTE' }));
      input.beforePublish();
      return outcome;
    };
    await expect(runSprintRecoveryOperation(root, 'sprint-482', { approval,
      startedFailedDispatchRequestId: dispatchRequestId, exactStartedFailedRecovery: boundary,
    })).rejects.toMatchObject({ code: mode === 'fence' ? 'APPROVAL_MISMATCH' : 'ACTIVE_AUTHORITY' });
  });

  it('vetoes a process appearing after precheck without delivering a signal or calling the backend', async () => {
    fixture();
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'pids', 'sprint-719.pid'), JSON.stringify({
      pid: 424_242, startToken: 'stopped-retention-test', sprintId: 'sprint-719',
      startedAt: new Date().toISOString(),
    }));
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-719');
    const sendSignal = vi.fn();
    const isAlive = vi.fn(() => true);
    const boundary = vi.fn<NonNullable<SprintRecoveryOperationOptions['exactStartedFailedRecovery']>>()
      .mockResolvedValue(outcome);
    await expect(runSprintRecoveryOperation(root, 'sprint-719', {
      approval: { identity, approvalRef: 'approval:retention', idempotencyKey: 'retention-once' },
      startedFailedDispatchRequestId: dispatchRequestId, exactStartedFailedRecovery: boundary,
      terminationPolicy: policy,
      terminationDeps: { isAlive, verifyOwnership: () => 'owned', kill: sendSignal },
    })).rejects.toMatchObject({ code: 'ACTIVE_AUTHORITY' });
    expect(isAlive).toHaveBeenCalled();
    expect(sendSignal).not.toHaveBeenCalled();
    expect(boundary).not.toHaveBeenCalled();
  });

  it.each(['ACTIVE', 'FAILED'] as const)('refuses the same sprint live coordinator in %s without containment or backend calls', async status => {
    fixture();
    mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'pids', 'sprint-719.pid'), JSON.stringify({
      pid: process.pid, startToken: 'live-retention-test', sprintId: 'sprint-719',
      startedAt: new Date().toISOString(),
    }));
    writeFileSync(join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-719', status, phase: 'EXECUTE' }));
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-719');
    const sendSignal = vi.fn();
    const boundary = vi.fn<NonNullable<SprintRecoveryOperationOptions['exactStartedFailedRecovery']>>()
      .mockResolvedValue(outcome);
    await expect(runSprintRecoveryOperation(root, 'sprint-719', {
      approval: { identity, approvalRef: 'approval:retention', idempotencyKey: 'retention-once' },
      startedFailedDispatchRequestId: dispatchRequestId, exactStartedFailedRecovery: boundary,
      terminationDeps: { kill: sendSignal },
    })).rejects.toMatchObject({ code: 'ACTIVE_AUTHORITY' });
    expect(sendSignal).not.toHaveBeenCalled();
    expect(boundary).not.toHaveBeenCalled();
  });
});

describe('exact committed-unsettled retention isolation', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'committed-unsettled-recovery-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const dispatchRequestId = `dreq-${'c'.repeat(64)}`;

  it('uses the distinct exact branch and preserves the unresolved disposition in dry-run', async () => {
    const boundary = vi.fn<NonNullable<SprintRecoveryOperationOptions['exactCommittedUnsettledRecovery']>>()
      .mockResolvedValue({ state: 'eligible', dispatchRequestId, taskId: '482-001', attemptId: 'attempt-1',
        generation: 1, receiptDigest: null, evidenceDigest: `sha256:${'d'.repeat(64)}`,
        phase: 'COMMITTED_JOURNAL_RELEASE_PENDING', acceptedResult: 'ABSENT', settlement: 'UNRESOLVED' });
    const publishStatus = vi.fn();
    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      dryRun: true, committedUnsettledDispatchRequestId: dispatchRequestId,
      exactCommittedUnsettledRecovery: boundary,
      publishCanonicalRunStatusReadModel: publishStatus,
    });
    expect(boundary).toHaveBeenCalledWith(expect.objectContaining({ projectRoot: root,
      sprintId: 'sprint-482', dispatchRequestId, dryRun: true }));
    expect(report).toMatchObject({ committedUnsettledAttempt: {
      state: 'eligible', phase: 'COMMITTED_JOURNAL_RELEASE_PENDING', acceptedResult: 'ABSENT', settlement: 'UNRESOLVED',
    }, audit: { overallGate: 'SKIPPED' }, taskFilesArchived: 0 });
    expect(publishStatus).not.toHaveBeenCalled();
  });

  it('publishes only the derived canonical status after retained apply, without generic recovery settlement', async () => {
    mkdirSync(join(root, '.tasks'), { recursive: true });
    const taskPath = join(root, '.tasks', 'task-482-001.json');
    writeFileSync(taskPath, JSON.stringify({ id: '482-001', status: 'FAILED' }));
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-482');
    const boundary = vi.fn<NonNullable<SprintRecoveryOperationOptions['exactCommittedUnsettledRecovery']>>()
      .mockImplementation(async input => {
        input.beforePublish();
        return {
          state: 'retained', dispatchRequestId, taskId: '482-001', attemptId: 'attempt-1', generation: 1,
          receiptDigest: `sha256:${'e'.repeat(64)}`, evidenceDigest: `sha256:${'f'.repeat(64)}`,
          phase: 'COMMITTED_JOURNAL_RELEASE_PENDING', acceptedResult: 'ABSENT', settlement: 'UNRESOLVED',
        };
      });
    const generic = vi.fn(() => { throw new Error('generic recovery is forbidden'); });
    const publishStatus = vi.fn();

    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      approval: { identity, approvalRef: 'approval:retention', idempotencyKey: 'retain-once' },
      committedUnsettledDispatchRequestId: dispatchRequestId,
      exactCommittedUnsettledRecovery: boundary,
      exactCustodyInspection: generic,
      publishCanonicalRunStatusReadModel: publishStatus,
    });

    expect(report.committedUnsettledAttempt).toMatchObject({
      state: 'retained', phase: 'COMMITTED_JOURNAL_RELEASE_PENDING',
      acceptedResult: 'ABSENT', settlement: 'UNRESOLVED',
    });
    expect(generic).not.toHaveBeenCalled();
    expect(publishStatus).toHaveBeenCalledTimes(1);
    expect(publishStatus).toHaveBeenCalledWith(root, {
      authority: readCanonicalRunStatus(root, { sprintIdHint: 'sprint-482' }),
    });
    expect(existsSync(taskPath)).toBe(true);
    expect(existsSync(join(root, '.deckent', 'recent-works', 'sprint-482-terminal-receipt.json'))).toBe(false);
  });

  it('vetoes a newly-live authority after retained apply before publishing status', async () => {
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-482');
    const publishStatus = vi.fn();
    const boundary: NonNullable<SprintRecoveryOperationOptions['exactCommittedUnsettledRecovery']> = async input => {
      input.beforePublish();
      mkdirSync(join(root, '.deckent', 'pids'), { recursive: true });
      writeFileSync(join(root, '.deckent', 'pids', 'sprint-999.pid'), JSON.stringify({
        pid: process.pid, startToken: 'new-live-authority', sprintId: 'sprint-999',
        startedAt: new Date().toISOString(),
      }));
      writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
        sprintId: 'sprint-999', status: 'ACTIVE', phase: 'EXECUTE',
      }));
      expect(readCanonicalRunStatus(root)).toMatchObject({
        sprintId: 'sprint-999', active: true, coordinator: 'alive',
      });
      return {
        state: 'retained', dispatchRequestId, taskId: '482-001', attemptId: 'attempt-1', generation: 1,
        receiptDigest: `sha256:${'e'.repeat(64)}`, evidenceDigest: `sha256:${'f'.repeat(64)}`,
        phase: 'COMMITTED_JOURNAL_RELEASE_PENDING', acceptedResult: 'ABSENT', settlement: 'UNRESOLVED',
      };
    };

    await expect(runSprintRecoveryOperation(root, 'sprint-482', {
      approval: { identity, approvalRef: 'approval:retention', idempotencyKey: 'retain-once' },
      committedUnsettledDispatchRequestId: dispatchRequestId,
      exactCommittedUnsettledRecovery: boundary,
      publishCanonicalRunStatusReadModel: publishStatus,
    })).rejects.toMatchObject({ code: 'ACTIVE_AUTHORITY' });
    expect(publishStatus).not.toHaveBeenCalled();
  });
});

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

  it('reconciles exact reservation-only custody only after coordinator death and approval validation', async () => {
    const { root } = rootWithCoordinator();
    let alive = true;
    const exactCustodyRecovery = vi.fn((input: {
      sprintId: string;
      recoveryAuthority: { executionId: string; approvalRef: string };
    }) => ({
      sprintId: input.sprintId,
      reconciled: [{
        dispatchRequestId: `dreq-${'1'.repeat(64)}`,
        taskId: '482-001',
        state: 'retired-before-admission' as const,
        receiptDigest: `sha256:${'2'.repeat(64)}`,
      }],
      recoveryListReceiptDigest: `sha256:${'3'.repeat(64)}`,
    }));

    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      exactCustodyRecovery,
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => alive,
        verifyOwnership: () => 'owned',
        kill: () => undefined,
        wait: async () => { alive = false; },
      },
    });

    expect(exactCustodyRecovery).toHaveBeenCalledTimes(1);
    expect(exactCustodyRecovery).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: root,
      sprintId: 'sprint-482',
      recoveryAuthority: expect.objectContaining({
        executionId: 'sprint-482',
        taskId: 'sprint-482',
        approvalRef: 'approval:force-finalize',
      }),
    }));
    expect(report.exactCustodyReservations).toEqual({
      pendingBeforeAdmission: 0,
      heldAdmissionGraphs: 0,
      unresolvedBeforeRecovery: 0,
      admittedFromStagedSnapshot: 0,
      retiredBeforeAdmission: 1,
      quarantinedHistoricalAdmissions: 0,
      receiptDigest: `sha256:${'3'.repeat(64)}`,
    });
  });

  it('reports admission-graph holds separately and counts canonical quarantine settlement', async () => {
    const { root } = rootWithCoordinator();
    let alive = true;
    const exactCustodyRecovery = vi.fn((input: { sprintId: string }) => ({
      sprintId: input.sprintId,
      reconciled: [{
        dispatchRequestId: `dreq-${'1'.repeat(64)}`,
        taskId: '482-001',
        state: 'quarantined-historical-admission' as const,
        receiptDigest: `sha256:${'4'.repeat(64)}`,
      }],
      recoveryListReceiptDigest: `sha256:${'5'.repeat(64)}`,
    }));

    const report = await runSprintRecoveryOperation(root, 'sprint-482', {
      skipAudit: true,
      approval: approval(root),
      exactCustodyInspection: () => ({
        state: 'hold',
        unresolved: [{
          dispatchRequestId: `dreq-${'1'.repeat(64)}`,
          taskId: '482-001',
          reasonCode: 'ADMISSION_GRAPH_HOLD',
          custodyHoldCode: 'ARTIFACT_CHANGED',
        }],
        recoveryListReceiptDigest: `sha256:${'3'.repeat(64)}`,
      }),
      exactCustodyRecovery,
      terminationPolicy: policy,
      terminationDeps: {
        isAlive: () => alive,
        verifyOwnership: () => 'owned',
        kill: () => undefined,
        wait: async () => { alive = false; },
      },
    });

    expect(report.exactCustodyReservations).toEqual({
      pendingBeforeAdmission: 0,
      heldAdmissionGraphs: 1,
      unresolvedBeforeRecovery: 1,
      admittedFromStagedSnapshot: 0,
      retiredBeforeAdmission: 0,
      quarantinedHistoricalAdmissions: 1,
      receiptDigest: `sha256:${'5'.repeat(64)}`,
    });
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
