import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import { DockerSpawnBackend, type DistFingerprint } from '../../src/orchestra/spawn-backend-docker.js';
import { readRuntimeBudgetUsage } from '../../src/orchestra/runtime-budget-monitor.js';

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
    liveCtx?: { projectRoot: string; taskId: string; workerId?: string; enabled: boolean },
    executionBudget?: { maxTurns: number },
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

function installChildRouter(logContent = ''): { waitChild: FakeChild; followChild: FakeChild } {
  const waitChild = new FakeChild();
  const followChild = new FakeChild();
  mockSpawn.mockImplementation((_command, args) => {
    const subcommand = String(args?.[0] ?? '');
    if (subcommand === 'wait') return waitChild as unknown as ChildProcess;
    if (subcommand === 'logs') {
      if (args?.[1] === '-f') return followChild as unknown as ChildProcess;
      const logsChild = new FakeChild();
      queueMicrotask(() => {
        if (logContent) logsChild.stdout.write(logContent);
        logsChild.emit('close', 0, null);
      });
      return logsChild as unknown as ChildProcess;
    }
    throw new Error(`unexpected docker child subcommand: ${subcommand}`);
  });
  return { waitChild, followChild };
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

  it('closes an unmeasurable budgeted DONE as explicit host NO_GO', async () => {
    const taskId = 'monitor-budget-unmeasurable';
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
      { maxTurns: 1 },
      ref,
    );
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    expect(readRuntimeBudgetUsage(root, taskId)).toMatchObject({
      terminal: true,
      decision: { state: 'unmeasurable' },
    });
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: expect.stringContaining('not terminally measurable'),
    });
    expect(readTaskResultSettlement(ref)?.result).not.toHaveProperty('tokenUsage');
    expect(backend.list()).not.toContain(taskId);
  });

  it('closes a measurable within-budget DONE with exact host counters', async () => {
    const taskId = 'monitor-budget-within';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const usageLine = `${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-within-1',
        usage: { input_tokens: 11, output_tokens: 22, cache_read_input_tokens: 33 },
      },
    })}\n`;
    const { waitChild } = installChildRouter(usageLine);
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
      { maxTurns: 2 },
      ref,
    );
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    expect(readRuntimeBudgetUsage(root, taskId)).toMatchObject({
      terminal: true,
      decision: { state: 'within-budget' },
    });
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      selfAssessment: 'DONE',
      testsPassed: true,
      tokenUsage: {
        inputTokens: 11,
        outputTokens: 22,
        cacheReadTokens: 33,
        source: 'host-runtime-budget',
        provider: 'claude',
        model: 'claude-fable-5',
      },
    });
    expect(backend.list()).not.toContain(taskId);
  });

  it('closes partial usage plus observer loss as unmeasurable host NO_GO', async () => {
    const taskId = 'monitor-budget-observer-loss';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const usageLine = `${JSON.stringify({
      type: 'assistant',
      message: {
        id: 'msg-partial-1',
        usage: { input_tokens: 11, output_tokens: 22, cache_read_input_tokens: 33 },
      },
    })}\n`;
    const { waitChild, followChild } = installChildRouter(usageLine);
    mockSpawnSync.mockImplementation((command, args) => {
      expect(command).toBe('docker');
      if (args?.[0] === 'inspect') {
        return { ...spawnResult(0), stdout: 'false|143\n' };
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
      { projectRoot: root, taskId, workerId: `docker-${taskId}`, enabled: false },
      { maxTurns: 2 },
      ref,
    );
    followChild.stdout.write(usageLine);
    await vi.waitFor(() => expect(readRuntimeBudgetUsage(root, taskId)).toMatchObject({
      terminal: false,
      decision: { state: 'within-budget' },
    }));
    followChild.emit('error', new Error('docker log stream disconnected'));
    await vi.waitFor(() => expect(readRuntimeBudgetUsage(root, taskId)).toMatchObject({
      terminal: true,
      decision: {
        state: 'unmeasurable',
        reasons: [expect.stringContaining('docker log stream disconnected')],
      },
    }));
    waitChild.stdout.write('143\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readTaskResultSettlementClosure(ref)).not.toBeNull());
    const budgetAttemptId = readRuntimeBudgetUsage(root, taskId)?.attemptId;
    expect(budgetAttemptId).toBeTruthy();
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: expect.stringContaining(`attemptId=${budgetAttemptId}`),
    });
    expect(readTaskResultSettlement(ref)?.result).not.toHaveProperty('tokenUsage');
    expect(backend.list()).not.toContain(taskId);
  });

  it('retains lifecycle authority when budget evidence cannot be projected', async () => {
    const taskId = 'monitor-budget-reconcile-held';
    const { root, tasks, ref, containerId } = fixture(taskId);
    const resultPath = join(tasks, `task-${taskId}.result`);
    rmSync(resultPath);
    mkdirSync(resultPath);
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
      { maxTurns: 1 },
      ref,
    );
    waitChild.stdout.write('0\n');
    waitChild.emit('close', 0, null);

    await vi.waitFor(() => expect(readRuntimeBudgetUsage(root, taskId)).toMatchObject({
      terminal: true,
      decision: { state: 'unmeasurable' },
    }));
    expect(mockSpawnSync).not.toHaveBeenCalledWith('docker', ['rm', containerId], expect.anything());
    expect(mockReleaseAllSpawnLocks).not.toHaveBeenCalled();
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
    expect(backend.list()).toContain(taskId);
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
});
