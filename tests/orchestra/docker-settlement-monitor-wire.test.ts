import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
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
  releaseAllSpawnLocks: vi.fn(() => 1),
  releaseStaleSpawnLocksForTask: vi.fn(),
  SpawnLockError: class extends Error {},
}));

import { spawn, spawnSync } from 'node:child_process';
import { releaseAllSpawnLocks } from '../../src/core/file-lock.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  readTaskProviderActualCallReceipt,
  readTaskProviderTerminalBillingReceipt,
  readTaskProviderTerminalUsageReceipt,
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementLandedRetirement,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementExecutionContractAtomic,
  writeTaskResultSettlementPreparedAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import { createCrossVerifyEnforcedAttemptContract } from '../../src/core/cross-verify-execution-contract.js';
import {
  createExecutionLandingCheckpoint,
  readExecutionAttemptRetirement,
  readExecutionLandingCheckpoint,
  writeExecutionLandingCheckpointAtomic,
} from '../../src/core/execution-landing-checkpoint.js';
import { executionLandingProposalPath } from '../../src/core/execution-landing-proposal.js';
import type { ExecutionLandingContextEnvelopeV1 } from '../../src/core/execution-landing-context.js';
import type { ExecutionLandingPolicyConfig } from '../../src/core/config-types.js';
import type { ExecutionBudget } from '../../src/core/work-model.js';
import type { ProviderSpawnOptions } from '../../src/core/provider.js';
import { TaskStatus, type Task } from '../../src/core/task-types.js';
import { prepareDockerExecutionLanding } from '../../src/orchestra/execution-landing-coordinator.js';
import {
  RuntimeBudgetMonitor,
  readRuntimeBudgetUsage,
} from '../../src/orchestra/runtime-budget-monitor.js';
import { DockerSpawnBackend, type DistFingerprint } from '../../src/orchestra/spawn-backend-docker.js';

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

interface MonitorHarness {
  monitorContainer(
    taskId: string,
    containerId: string,
    tasksDir: string,
    model: string,
    projectDir: string,
    distFingerprintBefore: DistFingerprint | null,
    liveCtx?: undefined,
    executionBudget?: ExecutionBudget,
    executionLandingPolicy?: ExecutionLandingPolicyConfig,
    executionContinuation?: ProviderSpawnOptions['executionContinuation'],
    executionLandingContext?: ExecutionLandingContextEnvelopeV1,
    settlementRef?: TaskResultSettlementRefV1,
  ): void;
}

function fixture(taskId: string): {
  root: string;
  tasks: string;
  ref: TaskResultSettlementRefV1;
  containerId: string;
} {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-monitor-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  const ref = createTaskResultSettlementRef(root, taskId);
  const containerId = 'a'.repeat(64);
  writeTaskResultSettlementAttemptAtomic(ref);
  claimTaskResultSettlementAttemptAtomic(ref);
  writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
  writeTaskResultSettlementDispatchAtomic(ref, containerId);
  writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
    taskId,
    selfAssessment: 'DONE',
    testsPassed: true,
  }), 'utf-8');
  return { root, tasks, ref, containerId };
}

function persistStrictExecutionContract(ref: TaskResultSettlementRefV1): void {
  writeTaskResultSettlementExecutionContractAtomic(
    ref,
    createCrossVerifyEnforcedAttemptContract({
      tenantId: 'tenant-a',
      projectId: 'project-a',
      runId: 'run-a',
      taskId: 'author-task',
      verifierTaskId: ref.taskId,
      callId: 'call-a',
      attemptId: ref.attemptId,
      fenceTokenHash: '1'.repeat(64),
      operationClass: 'verify-implementation',
      basePromptSha256: '2'.repeat(64),
      dispatchedPromptSha256: '3'.repeat(64),
      taskSnapshotSha256: '4'.repeat(64),
      budget: { maxTokens: 1_000 },
      budgetFingerprint: createHash('sha256')
        .update(JSON.stringify({ maxTokens: 1_000 }))
        .digest('hex'),
      budgetProfileRef: 'execution-budget:strict-xverify-monitor',
      budgetPolicyDigest: '6'.repeat(64),
      landingPolicy: { reserve_ratio: 0.25 },
      attendanceMode: 'unattended',
      provider: 'claude',
      model: 'claude-fable-5',
      authMode: 'subscription',
      accountRefHash: '7'.repeat(64),
      transport: 'cli',
      executionBackend: 'docker',
      endpointRefHash: null,
      executionProfileRef: 'execution-profile:strict-xverify-monitor',
      providerLimitEstimates: [
        { windowId: 'tokens-all', unit: 'tokens', amount: 1_000 },
      ],
      timeoutMs: 120_000,
      modelEffort: 'low',
      toolProfileDigest: '8'.repeat(64),
      isolatedContext: true,
      settlementAttemptRef: ref,
    }),
  );
}

function spawnResult(status: number, stderr = ''): ReturnType<typeof spawnSync> {
  return {
    stdout: '',
    stderr,
    status,
    signal: null,
    pid: 1,
    output: ['', '', stderr],
  } as unknown as ReturnType<typeof spawnSync>;
}

function installChildRouter(): { waitChild: FakeChild } {
  const waitChild = new FakeChild();
  mockSpawn.mockImplementation((_command, args) => {
    const subcommand = String(args?.[0] ?? '');
    if (subcommand === 'wait') return waitChild as unknown as ChildProcess;
    if (subcommand === 'logs') {
      const logsChild = new FakeChild();
      queueMicrotask(() => logsChild.emit('close', 0, null));
      return logsChild as unknown as ChildProcess;
    }
    throw new Error(`unexpected docker child subcommand: ${subcommand}`);
  });
  return { waitChild };
}

function registerAuthority(
  backend: DockerSpawnBackend,
  taskId: string,
  containerId: string,
  root: string,
  tasks: string,
  ref: TaskResultSettlementRefV1,
): void {
  (backend as unknown as { containers: Map<string, unknown> }).containers.set(taskId, {
    containerId,
    containerName: `deckent-w-${taskId}`,
    model: 'claude-fable-5',
    projectDir: root,
    tasksDir: tasks,
    settlementRef: ref,
  });
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSpawnSync.mockReturnValue(spawnResult(0));
  mockReleaseAllSpawnLocks.mockReturnValue(1);
});

describe('Docker monitor settlement authority wiring', () => {
  it('uses attempt-local counters for a checkpoint-subtracted continuation budget', async () => {
    const taskId = 'monitor-continuation-counters';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const parentAttemptId = randomUUID();
    const parent = new RuntimeBudgetMonitor({
      projectRoot: root,
      taskId,
      attemptId: parentAttemptId,
      backend: 'docker',
      budget: { maxTurns: 4 },
      onStop: vi.fn(),
    });
    for (let turn = 1; turn <= 3; turn += 1) {
      parent.observe({
        type: 'text',
        content: {
          type: 'assistant',
          message: { id: `parent-${turn}`, usage: { input_tokens: 1 }, content: [] },
        },
      });
    }
    const parentUsage = readRuntimeBudgetUsage(root, taskId)!;
    const checkpoint = createExecutionLandingCheckpoint(root, {
      taskId,
      attemptId: parentAttemptId,
      tenantId: 'tenant-monitor-test',
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
      hardBudget: { maxTurns: 4 },
      cumulativeUsage: parentUsage.decision.counters,
      attemptFence: 'parent-monitor-fence',
      providerSequence: {
        firstSequence: 1,
        lastSequence: 3,
        eventCount: 3,
        eventDigest: '4'.repeat(64),
      },
      semanticState: {
        summary: 'Parent monitor landed after three measured turns.',
        completedWork: ['Measured the parent attempt.'],
        remainingWork: ['Run one exact continuation turn.'],
        nextAction: 'Resume from the immutable checkpoint.',
        unresolvedRisks: [],
      },
      scope: {
        filesRead: ['src/orchestra/spawn-backend-docker.ts'],
        filesWrite: [],
      },
      diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
      evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
      acceptanceCriteria: 'Continuation accounting must remain attempt-local and settle cumulatively.',
      landingRequestedAt: '2026-07-24T01:00:00.000Z',
      landedAt: '2026-07-24T01:00:01.000Z',
    });
    writeExecutionLandingCheckpointAtomic(root, checkpoint);

    const waitChild = new FakeChild();
    const logsChild = new FakeChild();
    mockSpawn.mockImplementation((_command, args) => {
      if (args?.[0] === 'wait') return waitChild as unknown as ChildProcess;
      if (args?.[0] === 'logs' && args?.[1] === '-f') return logsChild as unknown as ChildProcess;
      if (args?.[0] === 'logs') {
        const captureChild = new FakeChild();
        queueMicrotask(() => {
          captureChild.stdout.end();
          captureChild.stderr.end();
          captureChild.emit('close', 0, null);
        });
        return captureChild as unknown as ChildProcess;
      }
      throw new Error(`unexpected docker child subcommand: ${String(args?.[0])}`);
    });

    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      { maxTurns: 1 },
      undefined,
      {
        version: 1,
        checkpointSha256: checkpoint.checkpointSha256,
        parentAttemptId,
        continuationAttemptId: ref.attemptId,
        continuationFence: 'continuation-fence',
      },
      undefined,
      ref,
    );
    logsChild.stdout.write(`${JSON.stringify({
      type: 'assistant',
      message: { id: 'continuation-turn-1', usage: { input_tokens: 1 }, content: [] },
    })}\n`);

    await vi.waitFor(() => expect(readRuntimeBudgetUsage(root, taskId)).toMatchObject({
      attemptId: ref.attemptId,
      terminal: false,
      decision: {
        state: 'within-budget',
        counters: { turns: 1 },
      },
    }));
    expect(mockSpawnSync).not.toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['stop', containerId]),
      expect.anything(),
    );

    logsChild.emit('close', 0, null);
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);
    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      selfAssessment: 'DONE',
      tokenUsage: {
        inputTokens: 4,
        source: 'host-runtime-budget-lineage',
      },
    });
  });

  it('writes receipt and closure only after exact-ID removal and lock release', async () => {
    const taskId = 'monitor-success';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const { waitChild } = installChildRouter();
    const order: string[] = [];
    mockSpawnSync.mockImplementation((command, args) => {
      expect(command).toBe('docker');
      expect(args).toEqual(['rm', containerId]);
      expect(readTaskResultSettlement(ref)).toBeNull();
      expect(readTaskResultSettlementClosure(ref)).toBeNull();
      order.push('remove');
      return spawnResult(0);
    });
    mockReleaseAllSpawnLocks.mockImplementation(() => {
      expect(readTaskResultSettlement(ref)).toBeNull();
      expect(readTaskResultSettlementClosure(ref)).toBeNull();
      order.push('locks');
      return 1;
    });

    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ref,
    );
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => {
      expect(readTaskResultSettlementClosure(ref)).toMatchObject({
        state: 'closed',
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
    });
    expect(order).toEqual(['remove', 'locks']);
    expect(readTaskResultSettlement(ref)).toMatchObject({ exitCode: 0 });
    expect(backend.list()).not.toContain(taskId);
    expect(mockSpawnSync).not.toHaveBeenCalledWith('docker', expect.arrayContaining(['-f']), expect.anything());
  });

  it('persists terminal provider billing from the live follower before removal and settlement', async () => {
    const taskId = 'monitor-terminal-billing';
    const { root, tasks, ref, containerId } = fixture(taskId);
    persistStrictExecutionContract(ref);
    const waitChild = new FakeChild();
    const liveLogsChild = new FakeChild();
    const terminalEvent = `${JSON.stringify({
      type: 'result',
      session_id: 'monitor-terminal-billing-session',
      total_cost_usd: 0.25,
      usage: {
        input_tokens: 2,
        output_tokens: 3,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 7,
      },
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 2,
          outputTokens: 3,
          cacheReadInputTokens: 5,
          cacheCreationInputTokens: 7,
          costUSD: 0.25,
        },
      },
    })}\n`;
    mockSpawn.mockImplementation((_command, args) => {
      if (args?.[0] === 'wait') return waitChild as unknown as ChildProcess;
      if (args?.[0] === 'logs' && args?.[1] === '-f') {
        return liveLogsChild as unknown as ChildProcess;
      }
      if (args?.[0] === 'logs') {
        const captureChild = new FakeChild();
        queueMicrotask(() => {
          captureChild.stdout.end(terminalEvent);
          captureChild.emit('close', 0, null);
        });
        return captureChild as unknown as ChildProcess;
      }
      throw new Error(`unexpected docker child args: ${JSON.stringify(args)}`);
    });
    mockSpawnSync.mockImplementation((_command, args) => {
      expect(args).toEqual(['rm', containerId]);
      expect(readTaskProviderTerminalBillingReceipt(ref)).toMatchObject({
        provider: 'claude',
        billing: { providerReportedUsd: 0.25 },
      });
      expect(readTaskResultSettlement(ref)).toBeNull();
      return spawnResult(0);
    });

    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      { maxTokens: 1_000 },
      undefined,
      undefined,
      undefined,
      ref,
    );

    liveLogsChild.stdout.write(terminalEvent);
    await vi.waitFor(() => {
      expect(readTaskProviderTerminalBillingReceipt(ref)).toMatchObject({
        billing: { providerReportedUsd: 0.25 },
      });
    });
    expect(readTaskResultSettlement(ref)).toBeNull();

    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);
    await vi.waitFor(() => {
      expect(readTaskResultSettlementClosure(ref)).toMatchObject({
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
    });
    expect(readTaskResultSettlement(ref)?.result.providerBilling).toMatchObject({
      providerReportedUsd: 0.25,
      provider: 'claude',
    });
    expect(readTaskProviderActualCallReceipt(ref)).toMatchObject({
      provider: 'claude',
      model: 'claude-fable-5',
      executionBackend: 'docker',
    });
    expect(readTaskProviderTerminalUsageReceipt(ref)).toMatchObject({
      attemptId: ref.attemptId,
      state: 'provider-terminal-usage',
      decisionState: 'within-budget',
      executionContractEvidenceRef: expect.stringMatching(/^xverify-contract:/u),
    });
  });

  it('does not write receipt or closure when exact-ID removal fails', async () => {
    const taskId = 'monitor-remove-failed';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const { waitChild } = installChildRouter();
    mockSpawnSync.mockImplementation((command, args) => {
      expect(command).toBe('docker');
      expect(args).toEqual(['rm', containerId]);
      return spawnResult(1, 'daemon unavailable');
    });

    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ref,
    );
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['rm', containerId],
      expect.anything(),
    ));
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(backend.list()).toContain(taskId);
  });

  it('preserves registry and locks when monitor lacks settlement authority', async () => {
    const taskId = 'monitor-missing-settlement-ref';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const { waitChild } = installChildRouter();
    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);

    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledWith(
      'docker',
      ['logs', containerId],
      expect.anything(),
    ));
    await Promise.resolve();
    expect(mockSpawnSync).not.toHaveBeenCalledWith('docker', ['rm', containerId], expect.anything());
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(backend.list()).toContain(taskId);
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
  });

  it('contains an errored wait by exact ID and finalizes NO_GO exactly once', async () => {
    const taskId = 'monitor-wait-error';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const { waitChild } = installChildRouter();
    const dockerCommands: string[] = [];
    mockSpawnSync.mockImplementation((command, args) => {
      expect(command).toBe('docker');
      const rendered = args?.join(' ') ?? '';
      dockerCommands.push(rendered);
      if (args?.[0] === 'stop') return spawnResult(0);
      if (args?.[0] === 'inspect') {
        return { ...spawnResult(0), stdout: 'false|143\n' };
      }
      if (args?.[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync command: ${rendered}`);
    });

    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ref,
    );
    waitChild.emit('error', new Error('daemon stream lost'));

    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    expect(readTaskResultSettlement(ref)).toMatchObject({ exitCode: 143 });
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.result`), 'utf-8')))
      .toMatchObject({
        selfAssessment: 'NO_GO',
        testsPassed: false,
        notes: expect.stringContaining(`attemptId=${ref.attemptId}`),
      });
    expect(dockerCommands.slice(0, 2)).toEqual([
      `stop --time=15 ${containerId}`,
      `inspect --format {{.State.Running}}|{{.State.ExitCode}} ${containerId}`,
    ]);
    expect(dockerCommands.filter(command => command === `rm ${containerId}`)).toHaveLength(1);
    expect(backend.list()).not.toContain(taskId);

    waitChild.emit('close', 1, null);
    await Promise.resolve();
    expect(dockerCommands.filter(command => command === `rm ${containerId}`)).toHaveLength(1);
  });

  it('holds registry, locks and receipts when wait-failure containment is unproven', async () => {
    const taskId = 'monitor-wait-containment-held';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const { waitChild } = installChildRouter();
    mockSpawnSync.mockImplementation((command, args) => {
      expect(command).toBe('docker');
      if (args?.[0] === 'inspect') {
        return { ...spawnResult(0), stdout: 'true|0\n' };
      }
      return spawnResult(0);
    });

    const backend = new DockerSpawnBackend(root);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ref,
    );
    waitChild.emit('error', new Error('docker socket unavailable'));
    await vi.waitFor(() => expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['inspect', '--format', '{{.State.Running}}|{{.State.ExitCode}}', containerId],
      expect.anything(),
    ));

    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(backend.list()).toContain(taskId);
    expect(mockSpawnSync).not.toHaveBeenCalledWith('docker', ['rm', containerId], expect.anything());
  });

  it('buffers split wait output and finalizes the strict complete integer once', async () => {
    const taskId = 'monitor-wait-split';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const { waitChild } = installChildRouter();
    mockSpawnSync.mockImplementation((command, args) => {
      expect(command).toBe('docker');
      if (args?.[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync command: ${args?.join(' ')}`);
    });

    const backend = new DockerSpawnBackend(root);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ref,
    );
    waitChild.stdout.write('1');
    waitChild.stdout.write('37\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    expect(readTaskResultSettlement(ref)).toMatchObject({ exitCode: 137 });
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it.each(['0junk\n', '', '0\n1\n'])(
    'rejects malformed complete wait evidence %j and contains before settlement',
    async waitEvidence => {
      const taskId = `monitor-wait-malformed-${Buffer.from(waitEvidence).toString('hex') || 'empty'}`;
      const { root, tasks, ref, containerId } = fixture(taskId);
      const { waitChild } = installChildRouter();
      mockSpawnSync.mockImplementation((command, args) => {
        expect(command).toBe('docker');
        if (args?.[0] === 'stop') return spawnResult(0);
        if (args?.[0] === 'inspect') return { ...spawnResult(0), stdout: 'false|143\n' };
        if (args?.[0] === 'rm') return spawnResult(0);
        throw new Error(`unexpected docker sync command: ${args?.join(' ')}`);
      });

      const backend = new DockerSpawnBackend(root);
      registerAuthority(backend, taskId, containerId, root, tasks, ref);
      (backend as unknown as MonitorHarness).monitorContainer(
        taskId,
        containerId,
        tasks,
        'claude-fable-5',
        root,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ref,
      );
      if (waitEvidence) waitChild.stdout.write(waitEvidence);
      waitChild.emit('close', 0, null);

      await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
      expect(readTaskResultSettlement(ref)).toMatchObject({ exitCode: 143 });
      const result = JSON.parse(
        readFileSync(join(tasks, `task-${taskId}.result`), 'utf-8'),
      ) as { selfAssessment: string; notes?: string };
      expect(result.selfAssessment).toBe('NO_GO');
      expect(result.notes).toContain('docker wait lost trustworthy terminal evidence');
    },
  );

  it('stamps, stops, and retires a reserve-threshold attempt as LANDED without terminal settlement', async () => {
    const taskId = 'monitor-landed';
    const { root, tasks, ref, containerId } = fixture(taskId);
    writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
    const task: Task = {
      id: taskId,
      title: 'Land coherently',
      description: 'Prepare a bounded checkpoint.',
      model: 'claude-fable-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'M1',
      type: 'code-development',
      scope: { directories: [], filesRead: ['source.ts'], filesWrite: ['source.ts'] },
      dependencies: [],
      goNogo: {
        goCriteria: 'checkpoint is durable',
        noGoCriteria: 'worker prose becomes authority',
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
    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'ORIGINAL-SHOULD-NOT-REPLAY',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef: ref,
    });
    const proposalAt = new Date().toISOString();
    writeFileSync(executionLandingProposalPath(root, taskId), JSON.stringify({
      version: 1,
      taskId,
      attemptId: ref.attemptId,
      sequence: 1,
      summary: 'The current logical provider turn is still in flight.',
      completedWork: [],
      remainingWork: ['update the proposal after the coherent step'],
      nextAction: 'finish the current proposal update',
      unresolvedRisks: ['checkpointing this proposal would replay completed work'],
      updatedAt: proposalAt,
    }));

    const waitChild = new FakeChild();
    const liveLogsChild = new FakeChild();
    const capturedLogsChild = new FakeChild();
    mockSpawn.mockImplementation((_command, args) => {
      if (args?.[0] === 'wait') return waitChild as unknown as ChildProcess;
      if (args?.[0] === 'logs' && args?.[1] === '-f') return liveLogsChild as unknown as ChildProcess;
      if (args?.[0] === 'logs') {
        queueMicrotask(() => {
          capturedLogsChild.stdout.end();
          capturedLogsChild.stderr.end();
          capturedLogsChild.emit('close', 0, null);
        });
        return capturedLogsChild as unknown as ChildProcess;
      }
      throw new Error(`unexpected docker child subcommand: ${String(args?.[0])}`);
    });
    mockSpawnSync.mockImplementation((_command, args) => {
      if (args?.[0] === 'pause') {
        expect(readExecutionLandingCheckpoint(root, {
          schemaVersion: 1,
          projectId: ref.projectRootSha256,
          taskId,
          attemptId: ref.attemptId,
        })).toBeNull();
        return spawnResult(0);
      }
      if (args?.[0] === 'kill' && args?.[1] === '--signal=SIGKILL') return spawnResult(0);
      if (args?.[0] === 'inspect') {
        return { ...spawnResult(0), stdout: 'false|137\n' };
      }
      if (args?.[0] === 'rm') return spawnResult(0);
      throw new Error(`unexpected docker sync command: ${args?.join(' ')}`);
    });

    const backend = new DockerSpawnBackend(root);
    const continuationSpawn = vi.spyOn(backend, 'spawn').mockImplementation(() => undefined);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      task.budget,
      task.budgetPolicy!.landingPolicy,
      undefined,
      prepared.context!,
      ref,
    );
    liveLogsChild.stdout.write(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'landing-parent-startup-call',
        usage: { cache_read_input_tokens: 100 },
        content: [],
      },
    })}\n`);
    liveLogsChild.stdout.write(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'landing-parent-threshold-call',
        usage: { cache_read_input_tokens: 650 },
        content: [],
      },
    })}\n`);

    const landingRef = {
      schemaVersion: 1 as const,
      projectId: ref.projectRootSha256,
      taskId,
      attemptId: ref.attemptId,
    };
    await vi.waitFor(() => expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['pause', containerId],
      expect.anything(),
    ));
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['kill', '--signal=SIGKILL', containerId],
      expect.anything(),
    );
    expect(readExecutionLandingCheckpoint(root, landingRef)).toBeNull();
    writeFileSync(executionLandingProposalPath(root, taskId), JSON.stringify({
      version: 1,
      taskId,
      attemptId: ref.attemptId,
      sequence: 2,
      summary: 'One coherent source step is complete.',
      completedWork: ['updated source.ts'],
      remainingWork: ['targeted verification'],
      nextAction: 'run the targeted test',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));
    waitChild.stdout.write('137\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readTaskResultSettlementLandedRetirement(ref)).not.toBeNull());
    expect(readExecutionLandingCheckpoint(root, landingRef)).toMatchObject({
      checkpoint: {
        semanticState: {
          summary: 'One coherent source step is complete.',
          completedWork: ['updated source.ts'],
          remainingWork: ['targeted verification'],
          nextAction: 'run the targeted test',
        },
      },
    });
    expect(readExecutionAttemptRetirement(root, landingRef)).toMatchObject({
      disposition: 'landed',
      resourcesReleased: true,
    });
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(existsSync(join(tasks, `task-${taskId}.result`))).toBe(false);
    expect(JSON.parse(readFileSync(join(tasks, `task-${taskId}.hb`), 'utf-8')))
      .toMatchObject({ status: 'LANDED' });
    expect(continuationSpawn).toHaveBeenCalledOnce();
    expect(continuationSpawn).toHaveBeenCalledWith(
      taskId,
      'claude-fable-5',
      expect.not.stringContaining('ORIGINAL-SHOULD-NOT-REPLAY'),
      expect.objectContaining({
        executionBudget: { maxCacheReadTokens: 250 },
        executionContinuation: expect.objectContaining({
          parentAttemptId: ref.attemptId,
        }),
      }),
    );
    expect(backend.executionLandingCapability).toBe('checkpoint-stop');
  });

  it('vetoes LANDED and continuation when provider shutdown crosses the hard ceiling', async () => {
    const taskId = 'monitor-landing-hard-stop';
    const { root, tasks, ref, containerId } = fixture(taskId);
    writeFileSync(join(root, 'source.ts'), 'export const value = 2;\n');
    const task: Task = {
      id: taskId,
      title: 'Do not continue after terminal exceedance',
      description: 'Prove terminal usage owns LANDED admission.',
      model: 'claude-fable-5',
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'M4-037',
      type: 'code-development',
      scope: { directories: [], filesRead: ['source.ts'], filesWrite: ['source.ts'] },
      dependencies: [],
      goNogo: {
        goCriteria: 'terminal hard-budget state vetoes continuation',
        noGoCriteria: 'landing-trigger counters mint remaining budget',
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
    const prepared = prepareDockerExecutionLanding({
      projectRoot: root,
      task,
      prompt: 'DO NOT REPLAY',
      calledProvider: 'claude',
      calledModel: 'claude-fable-5',
      auth: 'subscription',
      settlementRef: ref,
    });
    writeFileSync(executionLandingProposalPath(root, taskId), JSON.stringify({
      version: 1,
      taskId,
      attemptId: ref.attemptId,
      sequence: 2,
      summary: 'One coherent step completed before shutdown.',
      completedWork: ['updated source.ts'],
      remainingWork: ['targeted verification'],
      nextAction: 'run targeted verification',
      unresolvedRisks: [],
      updatedAt: new Date().toISOString(),
    }));

    const waitChild = new FakeChild();
    const liveLogsChild = new FakeChild();
    const capturedLogsChild = new FakeChild();
    mockSpawn.mockImplementation((_command, args) => {
      if (args?.[0] === 'wait') return waitChild as unknown as ChildProcess;
      if (args?.[0] === 'logs' && args?.[1] === '-f') return liveLogsChild as unknown as ChildProcess;
      if (args?.[0] === 'logs') {
        queueMicrotask(() => {
          capturedLogsChild.stdout.end();
          capturedLogsChild.stderr.end();
          capturedLogsChild.emit('close', 0, null);
        });
        return capturedLogsChild as unknown as ChildProcess;
      }
      throw new Error(`unexpected docker child subcommand: ${String(args?.[0])}`);
    });
    mockSpawnSync.mockImplementation((_command, args) => {
      if (args?.[0] === 'pause' || args?.[0] === 'kill' || args?.[0] === 'stop' || args?.[0] === 'rm') {
        return spawnResult(0);
      }
      if (args?.[0] === 'inspect') return { ...spawnResult(0), stdout: 'false|137\n' };
      throw new Error(`unexpected docker sync command: ${args?.join(' ')}`);
    });

    const backend = new DockerSpawnBackend(root);
    const continuationSpawn = vi.spyOn(backend, 'spawn').mockImplementation(() => undefined);
    registerAuthority(backend, taskId, containerId, root, tasks, ref);
    (backend as unknown as MonitorHarness).monitorContainer(
      taskId,
      containerId,
      tasks,
      'claude-fable-5',
      root,
      null,
      undefined,
      task.budget,
      task.budgetPolicy!.landingPolicy,
      undefined,
      prepared.context!,
      ref,
    );
    liveLogsChild.stdout.write(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'landing-turn',
        usage: { cache_read_input_tokens: 750 },
        content: [],
      },
    })}\n`);
    await vi.waitFor(() => expect(readRuntimeBudgetUsage(root, taskId)?.decision.state)
      .toBe('landing-requested'));
    liveLogsChild.stdout.write(`${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'shutdown-turn',
        usage: { cache_read_input_tokens: 400 },
        content: [],
      },
    })}\n`);
    await vi.waitFor(() => expect(readRuntimeBudgetUsage(root, taskId)?.decision.state)
      .toBe('exceeded'));
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'docker',
      ['stop', '--time=0', containerId],
      expect.anything(),
    );
    waitChild.stdout.write('137\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    expect(readExecutionLandingCheckpoint(root, {
      schemaVersion: 1,
      projectId: ref.projectRootSha256,
      taskId,
      attemptId: ref.attemptId,
    })).toBeNull();
    expect(readTaskResultSettlementLandedRetirement(ref)).toBeNull();
    expect(readTaskResultSettlement(ref)).toMatchObject({
      result: {
        selfAssessment: 'NO_GO',
        tokenUsage: {
          cacheReadTokens: 1_150,
          source: 'host-runtime-budget',
        },
      },
    });
    expect(continuationSpawn).not.toHaveBeenCalled();
  });
});
