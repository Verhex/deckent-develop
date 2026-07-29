import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(),
  SpawnLockError: class extends Error {},
}));

import { spawn, spawnSync } from 'node:child_process';
import { releaseAllSpawnLocks } from '../../src/core/file-lock.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  createTaskResultSettlementRefForAttempt,
  DOCKER_ATTEMPT_LABELS,
  dockerAttemptLabels,
  readTaskResultSettlementActiveClaim,
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementLandedRetirement,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementExecutionBudgetAuthorityAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  writeTaskResultSettlementPreparedAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import {
  claimExecutionContinuationAtomic,
  createExecutionLandingCheckpoint,
  readExecutionAttemptRetirement,
  readExecutionContinuationClaim,
  readExecutionLandingCheckpoint,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
} from '../../src/core/execution-landing-checkpoint.js';
import { executionLandingProposalPath } from '../../src/core/execution-landing-proposal.js';
import { TaskStatus, type Task } from '../../src/core/task-types.js';
import {
  prepareDockerExecutionLanding,
  stampDockerExecutionLandingCheckpoint,
} from '../../src/orchestra/execution-landing-coordinator.js';
import { RuntimeBudgetMonitor } from '../../src/orchestra/runtime-budget-monitor.js';
import {
  archiveLandedAttemptArtifacts,
  DockerSpawnBackend,
  DOCKER_ERROR_CODES,
  persistDockerTerminalProviderBillingReceipt,
} from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);
const mockReleaseAllSpawnLocks = vi.mocked(releaseAllSpawnLocks);

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly kill = vi.fn(() => true);
}

function spawnResult(
  status: number,
  stdout = '',
  stderr = '',
): ReturnType<typeof spawnSync> {
  return {
    stdout,
    stderr,
    status,
    signal: null,
    pid: 1,
    output: ['', stdout, stderr],
  } as unknown as ReturnType<typeof spawnSync>;
}

function fixture(taskId: string): {
  root: string;
  tasks: string;
  ref: TaskResultSettlementRefV1;
} {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-restart-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  const ref = createTaskResultSettlementRef(root, taskId);
  writeTaskResultSettlementAttemptAtomic(ref);
  return { root, tasks, ref };
}

function prepare(ref: TaskResultSettlementRefV1, containerId?: string): void {
  claimTaskResultSettlementAttemptAtomic(ref);
  writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
  if (containerId) writeTaskResultSettlementDispatchAtomic(ref, containerId);
}

function writeDone(tasks: string, taskId: string): void {
  writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
    taskId,
    selfAssessment: 'DONE',
    testsPassed: true,
  }), 'utf-8');
}

function providerUsageLog(totalUsd: number, cacheReadTokens: number): string {
  return `${JSON.stringify({
    ts: '2026-07-24T01:00:00.000Z',
    seq: 1,
    type: 'usage',
    content: {
      type: 'result',
      total_cost_usd: totalUsd,
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 10,
          outputTokens: 2,
          cacheReadInputTokens: cacheReadTokens,
          cacheCreationInputTokens: 5,
          costUSD: totalUsd,
          contextWindow: 4_000,
        },
      },
    },
  })}\n`;
}

function persistedContinuation(
  root: string,
  tasks: string,
  parentRef: TaskResultSettlementRefV1,
  containerId: string,
): {
  checkpoint: ReturnType<typeof createExecutionLandingCheckpoint>;
  continuationRef: TaskResultSettlementRefV1;
} {
  const taskId = parentRef.taskId;
  writeFileSync(
    join(tasks, `task-${taskId}.json`),
    JSON.stringify({ id: taskId, status: TaskStatus.EXECUTING }),
    'utf-8',
  );
  prepare(parentRef, 'f'.repeat(64));
  const checkpoint = createExecutionLandingCheckpoint(root, {
    taskId,
    attemptId: parentRef.attemptId,
    tenantId: 'tenant-recovery',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'claude',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'claude',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'claude',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      backend: 'docker',
      auth: 'subscription',
      fallbackReason: null,
    },
    policyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: { maxCacheReadTokens: 1_000, maxContextTokens: 4_000 },
    cumulativeUsage: {
      turns: 2,
      inputTokens: 20,
      outputTokens: 4,
      cacheReadTokens: 750,
      cacheCreationTokens: 10,
      totalTokens: 784,
      maxContextTokens: 780,
    },
    attemptFence: 'parent-recovery-fence',
    providerSequence: {
      firstSequence: 1,
      lastSequence: 2,
      eventCount: 2,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'Parent attempt retired before coordinator recovery.',
      completedWork: ['Published the parent checkpoint.'],
      remainingWork: ['Recover the exact continuation.'],
      nextAction: 'Adopt or settle the first-writer continuation.',
      unresolvedRisks: [],
    },
    scope: { filesRead: ['source.ts'], filesWrite: ['source.ts'] },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'Recovery must preserve cumulative continuation lineage.',
    landingRequestedAt: '2026-07-24T01:00:00.000Z',
    landedAt: '2026-07-24T01:00:01.000Z',
  });
  writeExecutionLandingCheckpointAtomic(root, checkpoint);
  writeFileSync(join(tasks, `task-${taskId}.log`), providerUsageLog(0.4, 750));
  archiveLandedAttemptArtifacts(tasks, taskId, checkpoint.checkpoint);
  writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    runtimeDisposition: 'stopped-removed',
    resourcesReleased: true,
    evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
  });
  writeTaskResultSettlementLandedRetirementAtomic(parentRef);

  const continuationAttemptId = randomUUID();
  claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    continuationAttemptId,
    continuationFence: 'continuation-recovery-fence',
  });
  const continuationRef = createTaskResultSettlementRefForAttempt(
    root,
    taskId,
    continuationAttemptId,
  );
  writeTaskResultSettlementAttemptAtomic(continuationRef);
  claimTaskResultSettlementAttemptAtomic(continuationRef);
  writeTaskResultSettlementPreparedAtomic(continuationRef, 'claude-fable-5');
  writeTaskResultSettlementDispatchAtomic(continuationRef, containerId);
  return { checkpoint, continuationRef };
}

function authorityProjection(
  ref: TaskResultSettlementRefV1,
  containerId: string,
  running: boolean,
  exitCode: number,
  override?: Partial<Record<keyof typeof DOCKER_ATTEMPT_LABELS, string>>,
): string {
  const labels = dockerAttemptLabels(ref);
  return [
    containerId,
    String(running),
    String(exitCode),
    override?.managed ?? labels[DOCKER_ATTEMPT_LABELS.managed],
    override?.project ?? labels[DOCKER_ATTEMPT_LABELS.project],
    override?.task ?? labels[DOCKER_ATTEMPT_LABELS.task],
    override?.attempt ?? labels[DOCKER_ATTEMPT_LABELS.attempt],
  ].join('|');
}

function installChildRouter(waitExitCode: number): void {
  mockSpawn.mockImplementation((_command, args) => {
    const subcommand = String(args?.[0] ?? '');
    const child = new FakeChild();
    if (subcommand === 'wait') {
      queueMicrotask(() => {
        child.stdout.write(`${waitExitCode}\n`);
        child.emit('close', 0, null);
      });
      return child as unknown as ChildProcess;
    }
    if (subcommand === 'logs') {
      queueMicrotask(() => child.emit('close', 0, null));
      return child as unknown as ChildProcess;
    }
    throw new Error(`unexpected docker child subcommand: ${subcommand}`);
  });
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockReleaseAllSpawnLocks.mockReturnValue(0);
});

describe('Docker coordinator restart reconciliation', () => {
  it('keeps historical retired landings out of the current task workspace', async () => {
    const taskId = '457-002';
    const base = mkdtempSync(join(tmpdir(), 'deckent-docker-history-'));
    roots.push(base);
    const root = join(base, 'project');
    const tasks = join(root, '.tasks');
    mkdirSync(tasks, { recursive: true });
    process.env.DECKENT_HOME = join(base, 'host-state');
    const checkpoint = createExecutionLandingCheckpoint(root, {
      taskId,
      attemptId: randomUUID(),
      tenantId: 'tenant-history',
      originalRequestDigest: '1'.repeat(64),
      taskDigest: '2'.repeat(64),
      role: 'worker',
      kind: 'code-development',
      admissionMode: 'unattended',
      identity: {
        configuredProvider: 'claude',
        configuredModel: 'claude-sonnet-5',
        requestedProvider: 'claude',
        requestedModel: 'claude-sonnet-5',
        resolvedProvider: 'claude',
        resolvedModel: 'claude-sonnet-5',
        calledProvider: 'claude',
        calledModel: 'claude-sonnet-5',
        backend: 'docker',
        auth: 'subscription',
        fallbackReason: null,
      },
      policyDigest: '3'.repeat(64),
      landingPolicy: { reserve_ratio: 0.25 },
      hardBudget: { maxTurns: 1 },
      cumulativeUsage: {
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
        maxContextTokens: 0,
      },
      attemptFence: 'historical-attempt-fence',
      providerSequence: {
        firstSequence: 1,
        lastSequence: 1,
        eventCount: 1,
        eventDigest: '4'.repeat(64),
      },
      semanticState: {
        summary: 'Historical landing evidence.',
        completedWork: [],
        remainingWork: ['No current run owns this task.'],
        nextAction: 'Remain archived as host evidence.',
        unresolvedRisks: [],
      },
      scope: { filesRead: ['historical-evidence.md'], filesWrite: [] },
      diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
      evidenceRefs: [`landing-evidence:sha256:${'6'.repeat(64)}`],
      acceptanceCriteria: 'Historical evidence must not leak into a later run.',
      landingRequestedAt: '2026-07-25T20:44:23.000Z',
      landedAt: '2026-07-25T20:44:24.000Z',
    });
    writeExecutionLandingCheckpointAtomic(root, checkpoint);
    writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: ['historical-runtime-retired'],
    });

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.retiredLanded).toEqual([]);
    expect(report.resumedContinuations).toEqual([]);
    expect(existsSync(join(tasks, `task-${taskId}.result`))).toBe(false);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('adopts and closes a valid pre-lifecycle settlement without rewriting its receipt', async () => {
    const taskId = 'restart-legacy-settled';
    const { root, tasks, ref } = fixture(taskId);
    const result = {
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      markerType: 'EXIT_WITHOUT_RESULT',
      exitCode: 0,
    };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({
      id: taskId,
      status: 'PENDING',
      type: 'audit',
    }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 0, result }));
    const settlementBefore = readFileSync(taskResultSettlementPath(ref), 'utf-8');
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such container'));

    const backend = new DockerSpawnBackend(root);
    const report = await backend.reconcilePendingAttempts();
    const closureBefore = readFileSync(
      join(taskResultSettlementPath(ref), '..', 'closure.json'),
      'utf-8',
    );

    expect(report).toEqual({
      adopted: [],
      closedNotDispatched: [],
      closedAbsentAfterExit: [taskId],
      retiredLanded: [],
      resumedContinuations: [],
    });
    expect(readFileSync(taskResultSettlementPath(ref), 'utf-8')).toBe(settlementBefore);
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'absent-after-exit',
      locksReleased: true,
      evidenceRef: 'legacy-lifecycle-adoption:v1',
    });
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      id: taskId,
      status: 'NO_GO',
    });
    expect(mockSpawnSync.mock.calls.filter(call => ['run', 'stop', 'kill', 'rm'].includes(String(call[1]?.[0]))))
      .toHaveLength(0);

    mockSpawnSync.mockClear();
    expect(await backend.reconcilePendingAttempts()).toEqual({
      adopted: [],
      closedNotDispatched: [],
      closedAbsentAfterExit: [],
      retiredLanded: [],
      resumedContinuations: [],
    });
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(readFileSync(taskResultSettlementPath(ref), 'utf-8')).toBe(settlementBefore);
    expect(readFileSync(join(taskResultSettlementPath(ref), '..', 'closure.json'), 'utf-8'))
      .toBe(closureBefore);
  });

  it('resumes an interrupted legacy adoption from the exact existing claim', async () => {
    const taskId = 'restart-legacy-claimed';
    const { root, tasks, ref } = fixture(taskId);
    const result = { taskId, selfAssessment: 'DONE', testsPassed: true };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({ id: taskId, status: 'EXECUTING' }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 0, result }));
    claimTaskResultSettlementAttemptAtomic(ref);
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.closedAbsentAfterExit).toEqual([taskId]);
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'absent-after-exit',
      evidenceRef: 'legacy-lifecycle-adoption:v1',
    });
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      status: 'DONE',
    });
  });

  it('does not adopt a legacy settlement while its deterministic container is present', async () => {
    const taskId = 'restart-legacy-present';
    const containerId = 'a'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    const result = { taskId, selfAssessment: 'NO_GO', testsPassed: false };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({ id: taskId, status: 'PENDING' }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 1, result }));
    mockSpawnSync.mockReturnValue(spawnResult(0, authorityProjection(ref, containerId, true, 0)));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/legacy-settlement-container-present/);

    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(readTaskResultSettlementActiveClaim(ref)).toBeNull();
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      status: 'PENDING',
    });
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(mockSpawnSync.mock.calls.filter(call => ['run', 'stop', 'kill', 'rm'].includes(String(call[1]?.[0]))))
      .toHaveLength(0);
  });

  it('also refuses adoption when only the current project-scoped container name is present', async () => {
    const taskId = 'restart-current-name-present';
    const containerId = 'b'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    const result = { taskId, selfAssessment: 'NO_GO', testsPassed: false };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({ id: taskId, status: 'PENDING' }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 1, result }));
    mockSpawnSync
      .mockReturnValueOnce(spawnResult(1, '', 'Error: No such container'))
      .mockReturnValueOnce(spawnResult(0, authorityProjection(ref, containerId, true, 0)));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/legacy-settlement-container-present/);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(readTaskResultSettlementActiveClaim(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
  });

  it('rejects a legacy raw-result mismatch before publishing claim or closure', async () => {
    const taskId = 'restart-legacy-result-mismatch';
    const { root, tasks, ref } = fixture(taskId);
    const settledResult = { taskId, selfAssessment: 'NO_GO', testsPassed: false };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({ id: taskId, status: 'PENDING' }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      ...settledResult,
      selfAssessment: 'DONE',
    }), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: settledResult,
    }));
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such container'));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/legacy-settlement-result-mismatch/);

    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(readTaskResultSettlementActiveClaim(ref)).toBeNull();
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      status: 'PENDING',
    });
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
  });

  it('fails closed when Docker cannot prove a legacy container absent', async () => {
    const taskId = 'restart-legacy-authority-unavailable';
    const { root, tasks, ref } = fixture(taskId);
    const result = { taskId, selfAssessment: 'NO_GO', testsPassed: false };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({ id: taskId, status: 'PENDING' }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 1, result }));
    mockSpawnSync.mockReturnValue(spawnResult(
      1,
      '',
      'permission denied while trying to connect to the Docker daemon socket',
    ));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE);

    expect(readTaskResultSettlementActiveClaim(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.json`), 'utf-8'))).toMatchObject({
      status: 'PENDING',
    });
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
  });

  it('rejects a legacy task identity mismatch before publishing claim or closure', async () => {
    const taskId = 'restart-legacy-task-mismatch';
    const { root, tasks, ref } = fixture(taskId);
    const result = { taskId, selfAssessment: 'NO_GO', testsPassed: false };
    writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({
      id: 'foreign-task',
      status: 'PENDING',
    }), 'utf-8');
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({ ref, exitCode: 1, result }));
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such container'));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/legacy-settlement-task-mismatch/);

    expect(readTaskResultSettlementActiveClaim(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
  });

  it('closes an attempt that never crossed the prepared/provider boundary', async () => {
    const taskId = 'restart-unprepared';
    const { root, tasks, ref } = fixture(taskId);

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report).toEqual({
      adopted: [],
      closedNotDispatched: [taskId],
      closedAbsentAfterExit: [],
      retiredLanded: [],
      resumedContinuations: [],
    });
    expect(mockSpawnSync).not.toHaveBeenCalled();
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      taskId,
      selfAssessment: 'NO_GO',
      exitCode: null,
    });
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'not-dispatched',
      locksReleased: true,
    });
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.result`), 'utf-8'))).toMatchObject({
      selfAssessment: 'NO_GO',
    });
  });

  it('holds prepared-without-dispatch ambiguity when the container is proven absent', async () => {
    const taskId = 'restart-prepared-absent';
    const { root, ref } = fixture(taskId);
    prepare(ref);
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such container'));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/DECKENT_E091:ambiguous-dispatch-container-absent/);

    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it('adopts a running exact attempt, contains it, and awaits normal monitor settlement', async () => {
    const taskId = 'restart-running';
    const containerId = 'a'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeDone(tasks, taskId);
    installChildRouter(143);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect' && argv[1] === containerId) {
        return spawnResult(0, authorityProjection(ref, containerId, true, 0));
      }
      if (argv[0] === 'stop') return spawnResult(0);
      if (argv[0] === 'inspect' && argv[1] === '--format') return spawnResult(0, 'false|143');
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.adopted).toEqual([taskId]);
    expect(mockSpawnSync.mock.calls.filter(call => call[1]?.[0] === 'run')).toHaveLength(0);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['stop', '--time=15', containerId],
      expect.any(Object),
    );
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'stopped-removed',
    });
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
    });
    expect(String(readTaskResultSettlement(ref)?.result.notes)).toContain(`attemptId=${ref.attemptId}`);
  });

  it('recovers the exact container when crash happened between Docker ACK and dispatch persistence', async () => {
    const taskId = 'restart-prepared-container-present';
    const containerId = 'e'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref);
    writeDone(tasks, taskId);
    installChildRouter(0);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect') {
        return spawnResult(0, authorityProjection(ref, containerId, false, 0));
      }
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.adopted).toEqual([taskId]);
    expect(readTaskResultSettlementDispatch(ref)).toMatchObject({ containerId });
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'stopped-removed',
    });
  });

  it('rejects short container identities without any recovery mutation', async () => {
    const taskId = 'restart-short-container-id';
    const shortContainerId = 'e'.repeat(12);
    const { root, ref } = fixture(taskId);
    prepare(ref);

    expect(() => writeTaskResultSettlementDispatchAtomic(ref, shortContainerId))
      .toThrow(/Invalid Docker dispatch container identity/);
    expect(readTaskResultSettlementDispatch(ref)).toBeNull();

    mockSpawnSync.mockReturnValue(spawnResult(
      0,
      authorityProjection(ref, shortContainerId, true, 0),
    ));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync.mock.calls.filter(call => ['run', 'stop', 'kill', 'rm'].includes(String(call[1]?.[0]))))
      .toHaveLength(0);
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(readTaskResultSettlementDispatch(ref)).toBeNull();
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
  });

  it('adopts an exact stopped exit-0 attempt and manufactures no success when result is missing', async () => {
    const taskId = 'restart-stopped-no-result';
    const containerId = 'b'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    installChildRouter(0);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect') {
        return spawnResult(0, authorityProjection(ref, containerId, false, 0));
      }
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.adopted).toEqual([taskId]);
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.result`), 'utf-8'))).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      exitCode: 0,
      markerType: 'EXIT_WITHOUT_RESULT',
    });
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({ selfAssessment: 'NO_GO' });
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'stopped-removed',
    });
  });

  it('restores persisted budget and vetoes DONE when recovered usage is unmeasurable', async () => {
    const taskId = 'restart-budget-unmeasurable';
    const containerId = 'f'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeDone(tasks, taskId);
    writeTaskResultSettlementExecutionBudgetAuthorityAtomic(ref, {
      model: 'claude-fable-5',
      budget: { maxTurns: 1 },
      landingPolicy: { reserve_ratio: 0.25 },
      admissionMode: 'unattended',
    });
    installChildRouter(0);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect') {
        return spawnResult(0, authorityProjection(ref, containerId, false, 0));
      }
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.adopted).toEqual([taskId]);
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: expect.stringContaining('not terminally measurable'),
    });
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'stopped-removed',
    });
  });

  it('settles a durable result after exact container absence without redrive', async () => {
    const taskId = 'restart-result-absent';
    const containerId = 'c'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeDone(tasks, taskId);
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.closedAbsentAfterExit).toEqual([taskId]);
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({ selfAssessment: 'DONE' });
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'absent-after-exit',
    });
    expect(mockSpawnSync.mock.calls.filter(call => call[1]?.[0] === 'run')).toHaveLength(0);
  });

  it('reconciles exact host terminal billing after container absence and ignores worker billing', async () => {
    const taskId = 'restart-result-absent-terminal-billing';
    const containerId = 'c'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
      providerBilling: {
        source: 'provider-envelope',
        provider: 'claude',
        currency: 'USD',
        providerReportedUsd: 99,
        modelUsage: {},
        capturedAt: '2026-07-24T01:00:00.000Z',
      },
    }), 'utf-8');
    persistDockerTerminalProviderBillingReceipt(
      ref,
      'claude',
      providerUsageLog(0.25, 100),
    );
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.closedAbsentAfterExit).toEqual([taskId]);
    expect(readTaskResultSettlement(ref)?.result.providerBilling).toMatchObject({
      providerReportedUsd: 0.25,
      provider: 'claude',
    });
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      containerDisposition: 'absent-after-exit',
      locksReleased: true,
    });
  });

  it('holds an absent attempt when immutable settlement conflicts with terminal billing receipt', async () => {
    const taskId = 'restart-result-absent-terminal-billing-conflict';
    const containerId = 'c'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    const staleResult = {
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
      providerBilling: {
        source: 'provider-envelope',
        provider: 'claude',
        currency: 'USD',
        providerReportedUsd: 99,
        modelUsage: {},
        capturedAt: '2026-07-24T01:00:00.000Z',
      },
    };
    writeFileSync(
      join(tasks, `task-${taskId}.result`),
      JSON.stringify(staleResult),
      'utf-8',
    );
    persistDockerTerminalProviderBillingReceipt(
      ref,
      'claude',
      providerUsageLog(0.25, 100),
    );
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: staleResult,
    }));
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/terminal-billing-settlement-conflict/);
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
  });

  it('reconciles absent cumulative token and exact host billing without trusting project-mounted log', async () => {
    const taskId = 'restart-continuation-absent-complete';
    const containerId = 'd'.repeat(64);
    const { root, tasks, ref: parentRef } = fixture(taskId);
    const { continuationRef } = persistedContinuation(
      root,
      tasks,
      parentRef,
      containerId,
    );
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'Continuation budget was exhausted.',
    }), 'utf-8');
    const terminalReceipt = persistDockerTerminalProviderBillingReceipt(
      continuationRef,
      'claude',
      providerUsageLog(0.15, 100),
    );
    expect(terminalReceipt).not.toBeNull();
    writeFileSync(join(tasks, `task-${taskId}.log`), providerUsageLog(9.99, 999));
    const terminal = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: continuationRef.attemptId,
      backend: 'docker',
      budget: { maxCacheReadTokens: 250, maxContextTokens: 4_000 },
      counterScope: 'attempt',
      onStop: vi.fn(),
    });
    terminal.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'continuation-terminal-call',
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 5,
          },
          content: [],
        },
      },
    });
    terminal.settle();
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.closedAbsentAfterExit).toEqual([taskId]);
    expect(readTaskResultSettlement(continuationRef)?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      tokenUsage: {
        inputTokens: 30,
        outputTokens: 6,
        cacheReadTokens: 850,
        cacheCreationTokens: 15,
        source: 'host-runtime-budget-lineage',
      },
    });
    expect(readTaskResultSettlement(continuationRef)?.result.providerBilling).toMatchObject({
      providerReportedUsd: 0.55,
      lineage: {
        coverage: 'complete',
        attemptIds: [parentRef.attemptId, continuationRef.attemptId],
        evidenceRefs: expect.arrayContaining([
          terminalReceipt!.evidenceRef,
        ]),
      },
    });
    expect(readTaskResultSettlementClosure(continuationRef)).toMatchObject({
      containerDisposition: 'absent-after-exit',
      locksReleased: true,
    });
    expect(mockSpawnSync.mock.calls.filter(call => call[1]?.[0] === 'run')).toHaveLength(0);
  });

  it('holds an absent continuation when exact terminal usage is missing', async () => {
    const taskId = 'restart-continuation-absent-missing-usage';
    const containerId = 'd'.repeat(64);
    const { root, tasks, ref: parentRef } = fixture(taskId);
    const { continuationRef } = persistedContinuation(
      root,
      tasks,
      parentRef,
      containerId,
    );
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'Attempt-only projection must not settle.',
    }), 'utf-8');
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/terminal runtime evidence mismatch/);

    expect(readTaskResultSettlement(continuationRef)).toBeNull();
    expect(readTaskResultSettlementClosure(continuationRef)).toBeNull();
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
  });

  it('refuses to close an immutable attempt-only continuation settlement', async () => {
    const taskId = 'restart-continuation-attempt-only-settlement';
    const containerId = 'd'.repeat(64);
    const { root, tasks, ref: parentRef } = fixture(taskId);
    const { continuationRef } = persistedContinuation(
      root,
      tasks,
      parentRef,
      containerId,
    );
    const attemptOnlyResult = {
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 100,
        source: 'host-runtime-budget',
      },
    };
    writeFileSync(
      join(tasks, `task-${taskId}.result`),
      JSON.stringify(attemptOnlyResult),
      'utf-8',
    );
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: continuationRef,
      exitCode: 137,
      result: attemptOnlyResult,
    }));
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(/continuation-settlement-lineage-missing/);

    expect(readTaskResultSettlement(continuationRef)).toMatchObject({
      result: { tokenUsage: { source: 'host-runtime-budget' } },
    });
    expect(readTaskResultSettlementClosure(continuationRef)).toBeNull();
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
  });

  it('threads exact continuation authority into a running recovery monitor', async () => {
    const taskId = 'restart-continuation-running';
    const containerId = 'd'.repeat(64);
    const { root, tasks, ref: parentRef } = fixture(taskId);
    const { continuationRef } = persistedContinuation(
      root,
      tasks,
      parentRef,
      containerId,
    );
    writeDone(tasks, taskId);
    installChildRouter(143);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect' && argv[1] === containerId) {
        return spawnResult(0, authorityProjection(continuationRef, containerId, true, 0));
      }
      if (argv[0] === 'stop') return spawnResult(0);
      if (argv[0] === 'inspect' && argv[1] === '--format') return spawnResult(0, 'false|143');
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();

    expect(report.adopted).toEqual([taskId]);
    expect(readTaskResultSettlement(continuationRef)?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      tokenUsage: {
        inputTokens: 20,
        outputTokens: 4,
        cacheReadTokens: 750,
        cacheCreationTokens: 10,
        source: 'host-runtime-budget-lineage',
      },
    });
    expect(readTaskResultSettlementClosure(continuationRef)).toMatchObject({
      containerDisposition: 'stopped-removed',
    });
    expect(readExecutionContinuationClaim(
      root,
      {
        schemaVersion: 1,
        projectId: parentRef.projectRootSha256,
        taskId,
        attemptId: parentRef.attemptId,
      },
      readExecutionLandingCheckpoint(
        root,
        {
          schemaVersion: 1,
          projectId: parentRef.projectRootSha256,
          taskId,
          attemptId: parentRef.attemptId,
        },
      )!.checkpointSha256,
    )?.continuationAttemptId).toBe(continuationRef.attemptId);
  });

  it('resumes a retired checkpoint when the host crashed before creating its continuation claim', async () => {
    const taskId = 'restart-retired-before-continuation';
    const { root, tasks, ref } = fixture(taskId);
    writeFileSync(
      join(tasks, `task-${taskId}.json`),
      JSON.stringify({ id: taskId, status: TaskStatus.EXECUTING }),
      'utf-8',
    );
    prepare(ref, 'e'.repeat(64));
    const checkpoint = createExecutionLandingCheckpoint(root, {
      taskId,
      attemptId: ref.attemptId,
      tenantId: 'tenant-a',
      originalRequestDigest: '1'.repeat(64),
      taskDigest: '2'.repeat(64),
      role: 'worker',
      kind: 'code-development',
      admissionMode: 'unattended',
      identity: {
        configuredProvider: 'claude',
        configuredModel: 'claude-fable-5',
        requestedProvider: 'claude',
        requestedModel: 'claude-fable-5',
        resolvedProvider: 'claude',
        resolvedModel: 'claude-fable-5',
        calledProvider: 'claude',
        calledModel: 'claude-fable-5',
        backend: 'docker',
        auth: 'subscription',
        fallbackReason: null,
      },
      policyDigest: '3'.repeat(64),
      landingPolicy: { reserve_ratio: 0.25 },
      hardBudget: { maxCacheReadTokens: 1_000 },
      cumulativeUsage: {
        turns: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 750,
        cacheCreationTokens: 0,
        totalTokens: 750,
        maxContextTokens: 750,
      },
      attemptFence: 'parent-fence',
      providerSequence: {
        firstSequence: 1,
        lastSequence: 1,
        eventCount: 1,
        eventDigest: '4'.repeat(64),
      },
      semanticState: {
        summary: 'Parent retired before continuation claim publication.',
        completedWork: ['published parent checkpoint'],
        remainingWork: ['resume bounded verification'],
        nextAction: 'dispatch the continuation claim',
        unresolvedRisks: [],
      },
      scope: {
        filesRead: ['source.ts'],
        filesWrite: ['source.ts'],
      },
      diskDiffRefs: [`scope-diff:sha256:${'5'.repeat(64)}`],
      evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
      acceptanceCriteria: 'Resume once from the retired checkpoint.',
      landingRequestedAt: '2026-07-23T18:00:00.000Z',
      landedAt: '2026-07-23T18:00:01.000Z',
    });
    writeExecutionLandingCheckpointAtomic(root, checkpoint);
    writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
    });
    writeTaskResultSettlementLandedRetirementAtomic(ref);
    const parentMonitor = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: ref.attemptId,
      backend: 'docker',
      budget: checkpoint.checkpoint.hardBudget,
      onStop: vi.fn(),
    });
    expect(parentMonitor.observe({
      type: 'text',
      content: {
        type: 'assistant',
        message: {
          id: 'restart-parent-startup-call',
          usage: {
            input_tokens: 10,
            output_tokens: 2,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 5,
          },
          content: [],
        },
      },
    }, 1).state).toBe('within-budget');

    const backend = new DockerSpawnBackend(root);
    const continuationSpawn = vi.spyOn(backend, 'spawn').mockImplementation(() => undefined);
    const report = await backend.reconcilePendingAttempts();
    const claim = readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    );

    expect(report.resumedContinuations).toEqual([taskId]);
    expect(continuationSpawn).toHaveBeenCalledOnce();
    expect(claim?.continuationAttemptId).toBeDefined();
    expect(continuationSpawn).toHaveBeenCalledWith(
      taskId,
      'claude-fable-5',
      expect.stringContaining(checkpoint.checkpointSha256),
      expect.objectContaining({
        executionBudget: { maxCacheReadTokens: 250 },
        settlementRef: expect.objectContaining({
          attemptId: claim?.continuationAttemptId,
        }),
      }),
    );

    const retryBackend = new DockerSpawnBackend(root);
    const retrySpawn = vi.spyOn(retryBackend, 'spawn').mockImplementation(() => undefined);
    const retryReport = await retryBackend.reconcilePendingAttempts();
    const retryClaim = readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    );
    expect(retryReport.resumedContinuations).toEqual([taskId]);
    expect(retrySpawn).toHaveBeenCalledOnce();
    expect(retryClaim).toEqual(claim);
  });

  it('completes an already-checkpointed LANDED attempt after coordinator restart without terminal settlement', async () => {
    const taskId = 'restart-landed';
    const containerId = 'e'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
    const task: Task = {
      id: taskId,
      title: 'Restart landing',
      description: 'Resume only from checkpoint.',
      model: 'claude-fable-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'M1',
      type: 'code-development',
      scope: { directories: [], filesRead: ['source.ts'], filesWrite: ['source.ts'] },
      dependencies: [],
      goNogo: {
        goCriteria: 'landing retirement is exactly once',
        noGoCriteria: 'raw result becomes terminal',
        techDebtAcceptable: 'none',
      },
      status: TaskStatus.EXECUTING,
      provider: 'claude',
      authMode: 'subscription',
      budget: { maxCacheReadTokens: 1_000 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        taskKind: 'code-development',
        resolvedProvider: 'claude',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'a'.repeat(64),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
      },
    };
    prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'WORK',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef: ref,
    });
    const requestedAt = new Date().toISOString();
    writeFileSync(executionLandingProposalPath(root, taskId), JSON.stringify({
      version: 1,
      taskId,
      attemptId: ref.attemptId,
      sequence: 1,
      summary: 'Checkpoint exists before coordinator restart.',
      completedWork: ['captured coherent work'],
      remainingWork: ['targeted verification'],
      nextAction: 'continue from checkpoint',
      unresolvedRisks: [],
      updatedAt: requestedAt,
    }));
    stampDockerExecutionLandingCheckpoint({
      projectRoot: root,
      settlementRef: ref,
      terminalUsage: {
        version: 2,
        projectId: ref.projectRootSha256,
        taskId,
        attemptId: ref.attemptId,
        budgetFingerprint: 'b'.repeat(64),
        backend: 'docker',
        terminal: true,
        budget: { maxCacheReadTokens: 1_000 },
        decision: {
          state: 'landing-requested',
          reasons: ['reserve reached'],
          counters: {
            turns: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 750,
            maxContextTokens: 750,
          },
          consecutiveCacheReadEvents: 1,
        },
        guardState: {
          version: 2,
          counters: {
            turns: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 750,
            maxContextTokens: 750,
          },
          seenDedupeKeys: ['call:restart-landing'],
          measurableEvents: 1,
          incrementalUsageEvents: 1,
          consecutiveCacheReadEvents: 1,
        },
        updatedAt: requestedAt,
      },
      landing: {
        version: 2,
        projectId: ref.projectRootSha256,
        taskId,
        attemptId: ref.attemptId,
        budgetFingerprint: 'b'.repeat(64),
        backend: 'docker',
        state: 'landing-requested',
        budget: { maxCacheReadTokens: 1_000 },
        decision: {
          state: 'landing-requested',
          reasons: ['reserve reached'],
          counters: {
            turns: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 750,
            cacheCreationTokens: 0,
            totalTokens: 750,
            maxContextTokens: 750,
          },
          consecutiveCacheReadEvents: 1,
        },
        providerSequence: {
          firstSequence: 1,
          lastSequence: 1,
          eventCount: 1,
          eventDigest: 'c'.repeat(64),
        },
        requestedAt,
      },
    });
    writeDone(tasks, taskId);
    mockSpawnSync.mockReturnValue(spawnResult(1, '', 'Error: No such object'));

    const report = await new DockerSpawnBackend(root).reconcilePendingAttempts();
    const landingRef = {
      schemaVersion: 1 as const,
      projectId: ref.projectRootSha256,
      taskId,
      attemptId: ref.attemptId,
    };

    expect(report.retiredLanded).toEqual([taskId]);
    expect(readExecutionAttemptRetirement(root, landingRef)).toMatchObject({
      disposition: 'landed',
      resourcesReleased: true,
    });
    expect(readTaskResultSettlementLandedRetirement(ref)).not.toBeNull();
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(mockSpawnSync.mock.calls.filter(call => call[1]?.[0] === 'run')).toHaveLength(0);
  });

  it('settles a LANDING_REQUESTED restart without continuation when terminal usage is absent', async () => {
    const taskId = 'restart-landing-requested';
    const containerId = 'a'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
    const task: Task = {
      id: taskId,
      title: 'Restart requested landing',
      description: 'Bind the newest exact-attempt proposal.',
      model: 'claude-fable-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'M2-047',
      type: 'code-development',
      scope: { directories: [], filesRead: ['source.ts'], filesWrite: ['source.ts'] },
      dependencies: [],
      goNogo: {
        goCriteria: 'post-stop proposal is checkpointed exactly once',
        noGoCriteria: 'stale proposal becomes immutable authority',
        techDebtAcceptable: 'none',
      },
      status: TaskStatus.EXECUTING,
      provider: 'claude',
      authMode: 'subscription',
      budget: { maxCacheReadTokens: 1_000 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        taskKind: 'code-development',
        resolvedProvider: 'claude',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'a'.repeat(64),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
      },
    };
    prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'WORK',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef: ref,
    });
    writeFileSync(executionLandingProposalPath(root, taskId), JSON.stringify({
      version: 1,
      taskId,
      attemptId: ref.attemptId,
      sequence: 1,
      summary: 'Evidence pass is still pending.',
      completedWork: [],
      remainingWork: ['run evidence pass'],
      nextAction: 'read bounded evidence',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));
    const monitor = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: ref.attemptId,
      backend: 'docker',
      budget: task.budget!,
      landingPolicy: task.budgetPolicy!.landingPolicy,
      onStop: vi.fn(),
    });
    expect(monitor.observe({
      type: 'usage',
      content: {
        type: 'result',
        session_id: 'restart-landing-session',
        usage: { cache_read_input_tokens: 750 },
      },
    }).state).toBe('landing-requested');
    writeFileSync(executionLandingProposalPath(root, taskId), JSON.stringify({
      version: 1,
      taskId,
      attemptId: ref.attemptId,
      sequence: 2,
      summary: 'Bounded evidence pass is complete.',
      completedWork: ['mapped every written criterion'],
      remainingWork: [],
      nextAction: 'emit terminal verdict',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));

    installChildRouter(143);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect') {
        return spawnResult(0, authorityProjection(ref, containerId, false, 143));
      }
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });
    const backend = new DockerSpawnBackend(root);
    const continuationSpawn = vi.spyOn(backend, 'spawn').mockImplementation(() => undefined);

    const report = await backend.reconcilePendingAttempts();
    const landingRef = {
      schemaVersion: 1 as const,
      projectId: ref.projectRootSha256,
      taskId,
      attemptId: ref.attemptId,
    };

    expect(report.retiredLanded).toEqual([]);
    expect(report.adopted).toEqual([taskId]);
    expect(readExecutionLandingCheckpoint(root, landingRef)).toBeNull();
    expect(readExecutionAttemptRetirement(root, landingRef)).toBeNull();
    expect(readTaskResultSettlementLandedRetirement(ref)).toBeNull();
    expect(readTaskResultSettlement(ref)).toMatchObject({
      result: {
        selfAssessment: 'NO_GO',
        notes: expect.stringContaining('Terminal runtime budget evidence does not match'),
      },
    });
    expect(readTaskResultSettlementClosure(ref)).not.toBeNull();
    expect(continuationSpawn).not.toHaveBeenCalled();
  });

  it('settles honestly without LANDED authority when the final restart proposal is corrupt', async () => {
    const taskId = 'restart-landing-corrupt-proposal';
    const containerId = 'b'.repeat(64);
    const { root, tasks, ref } = fixture(taskId);
    prepare(ref, containerId);
    writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
    const task: Task = {
      id: taskId,
      title: 'Reject corrupt landing proposal',
      description: 'Do not mint continuation authority from invalid worker evidence.',
      model: 'claude-fable-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'M2-047',
      type: 'code-development',
      scope: { directories: [], filesRead: ['source.ts'], filesWrite: ['source.ts'] },
      dependencies: [],
      goNogo: {
        goCriteria: 'corrupt proposal closes as an honest non-success',
        noGoCriteria: 'corrupt proposal mints LANDED authority',
        techDebtAcceptable: 'none',
      },
      status: TaskStatus.EXECUTING,
      provider: 'claude',
      authMode: 'subscription',
      budget: { maxCacheReadTokens: 1_000 },
      budgetPolicy: {
        state: 'allow',
        role: 'worker',
        taskKind: 'code-development',
        resolvedProvider: 'claude',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.worker.default',
        policyDigest: 'a'.repeat(64),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
      },
    };
    prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'WORK',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef: ref,
    });
    const monitor = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: ref.attemptId,
      backend: 'docker',
      budget: task.budget!,
      landingPolicy: task.budgetPolicy!.landingPolicy,
      onStop: vi.fn(),
    });
    expect(monitor.observe({
      type: 'usage',
      content: {
        type: 'result',
        session_id: 'restart-corrupt-landing-session',
        usage: { cache_read_input_tokens: 750 },
      },
    }).state).toBe('landing-requested');
    writeFileSync(
      executionLandingProposalPath(root, taskId),
      '{"version":1,"summary":"missing exact-attempt authority"}\n',
    );

    installChildRouter(143);
    mockSpawnSync.mockImplementation((_command, args) => {
      const argv = args as string[];
      if (argv[0] === 'inspect') {
        return spawnResult(0, authorityProjection(ref, containerId, false, 143));
      }
      if (argv[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync call: ${argv.join(' ')}`);
    });
    const backend = new DockerSpawnBackend(root);
    const continuationSpawn = vi.spyOn(backend, 'spawn').mockImplementation(() => undefined);

    const report = await backend.reconcilePendingAttempts();
    const landingRef = {
      schemaVersion: 1 as const,
      projectId: ref.projectRootSha256,
      taskId,
      attemptId: ref.attemptId,
    };
    const settlement = readTaskResultSettlement(ref);

    expect(report.retiredLanded).toEqual([]);
    expect(report.adopted).toEqual([taskId]);
    expect(readExecutionLandingCheckpoint(root, landingRef)).toBeNull();
    expect(readExecutionAttemptRetirement(root, landingRef)).toBeNull();
    expect(readTaskResultSettlementLandedRetirement(ref)).toBeNull();
    expect(settlement?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
    });
    expect(settlement?.result['notes']).toContain(
      'no valid immutable checkpoint could be created',
    );
    expect(readTaskResultSettlementClosure(ref)).not.toBeNull();
    expect(continuationSpawn).not.toHaveBeenCalled();
  });

  it('fails loud on foreign labels without stop, removal, lock release or redrive', async () => {
    const taskId = 'restart-foreign';
    const containerId = 'd'.repeat(64);
    const { root, ref } = fixture(taskId);
    prepare(ref, containerId);
    mockSpawnSync.mockReturnValue(spawnResult(
      0,
      authorityProjection(ref, containerId, true, 0, { project: 'foreign-project' }),
    ));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT);

    expect(mockSpawnSync.mock.calls.filter(call => ['run', 'stop', 'kill', 'rm'].includes(String(call[1]?.[0]))))
      .toHaveLength(0);
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
  });

  it('fails closed when Docker authority cannot prove presence or absence', async () => {
    const taskId = 'restart-authority-unavailable';
    const containerId = 'f'.repeat(64);
    const { root, ref } = fixture(taskId);
    prepare(ref, containerId);
    mockSpawnSync.mockReturnValue(spawnResult(
      1,
      '',
      'permission denied while trying to connect to the Docker daemon socket',
    ));

    await expect(new DockerSpawnBackend(root).reconcilePendingAttempts())
      .rejects.toThrow(DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync.mock.calls.filter(call => ['run', 'stop', 'kill', 'rm'].includes(String(call[1]?.[0]))))
      .toHaveLength(0);
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
  });
});
