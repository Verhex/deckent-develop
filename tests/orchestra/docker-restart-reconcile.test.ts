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
  DOCKER_ATTEMPT_LABELS,
  dockerAttemptLabels,
  readTaskResultSettlementActiveClaim,
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  taskResultSettlementPath,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
  type TaskResultSettlementRefV1,
} from '../../src/core/task-result-settlement.js';
import { DockerSpawnBackend, DOCKER_ERROR_CODES } from '../../src/orchestra/spawn-backend-docker.js';

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
