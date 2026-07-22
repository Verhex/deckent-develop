import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
    executionBudget?: undefined,
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

    await vi.waitFor(() => {
      expect(readTaskResultSettlementClosure(ref)).toMatchObject({
        state: 'closed',
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
    });
    expect(order).toEqual(['remove', 'locks']);
    expect(readTaskResultSettlement(ref)).toMatchObject({ exitCode: 0 });
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

    await vi.waitFor(() => expect(mockReleaseAllSpawnLocks).toHaveBeenCalledWith(root, taskId));
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(readTaskResultSettlementClosure(ref)).toBeNull();
  });
});
