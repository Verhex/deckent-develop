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
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(),
  SpawnLockError: class extends Error {},
}));

import { spawn, spawnSync } from 'node:child_process';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  readLatestTaskResultSettlementRef,
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementPrepared,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementPreparedAtomic,
} from '../../src/core/task-result-settlement.js';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];
const guardDirs: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;
const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);

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

function fixture(taskId: string): { root: string; tasks: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-owned-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  writeFileSync(join(tasks, `task-${taskId}.json`), JSON.stringify({
    id: taskId,
    scope: { filesRead: [], filesWrite: [] },
  }), 'utf-8');
  return { root, tasks };
}

function installChildRouter(): void {
  mockSpawn.mockImplementation((_command, args) => {
    const subcommand = String(args?.[0] ?? '');
    if (subcommand !== 'wait' && subcommand !== 'logs') {
      throw new Error(`unexpected docker child subcommand: ${subcommand}`);
    }
    return new FakeChild() as unknown as ChildProcess;
  });
}

function rememberGitGuard(args: readonly string[]): void {
  for (const arg of args) {
    const match = /^type=bind,src=(\/tmp\/deckent-git-guard\/[^,]+),dst=/.exec(arg);
    if (match?.[1]) guardDirs.push(match[1]);
  }
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const path of guardDirs.splice(0)) rmSync(path, { recursive: true, force: true });
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  installChildRouter();
});

describe('Docker backend-owned settlement authority', () => {
  it('prepares and dispatches a durable exact attempt when the caller supplies no ref', () => {
    const taskId = 'owned-ref';
    const { root } = fixture(taskId);
    const containerId = 'a'.repeat(64);

    mockSpawnSync.mockImplementation((command, args) => {
      const argv = (args ?? []) as string[];
      if (command === 'docker' && argv[0] === 'info') return spawnResult(0, 'ok');
      if (command === 'docker' && argv[0] === 'images') return spawnResult(0, 'image-id');
      if (command === 'claude' && argv[0] === 'auth') {
        return spawnResult(0, JSON.stringify({ loggedIn: true }));
      }
      if (command === 'docker' && argv[0] === 'run') {
        rememberGitGuard(argv);
        const ref = readLatestTaskResultSettlementRef(root, taskId);
        expect(ref).not.toBeNull();
        expect(readTaskResultSettlementPrepared(ref!)).toMatchObject({
          taskId,
          model: 'claude-fable-5',
          state: 'prepared',
        });
        return spawnResult(0, containerId);
      }
      if (command === 'docker' && argv[0] === 'inspect') return spawnResult(0, 'true|0');
      if (command === 'sleep') return spawnResult(0);
      return spawnResult(0);
    });

    new DockerSpawnBackend(root).spawn(
      taskId,
      'claude-fable-5',
      'bounded prompt',
      { executionBudget: { maxTurns: 1 } },
    );

    const ref = readLatestTaskResultSettlementRef(root, taskId);
    expect(ref).not.toBeNull();
    expect(readTaskResultSettlementDispatch(ref!)).toMatchObject({
      taskId,
      containerId,
      model: 'claude-fable-5',
    });
  });

  it('reuses an exact caller ref idempotently and rejects a conflicting active attempt pre-dispatch', () => {
    const taskId = 'owned-conflict';
    const { root } = fixture(taskId);
    const containerId = 'b'.repeat(64);
    const active = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(active);
    claimTaskResultSettlementAttemptAtomic(active);
    writeTaskResultSettlementPreparedAtomic(active, 'claude-fable-5');

    mockSpawnSync.mockImplementation((command, args) => {
      const argv = (args ?? []) as string[];
      if (command === 'docker' && argv[0] === 'info') return spawnResult(0, 'ok');
      if (command === 'docker' && argv[0] === 'images') return spawnResult(0, 'image-id');
      if (command === 'claude' && argv[0] === 'auth') {
        return spawnResult(0, JSON.stringify({ loggedIn: true }));
      }
      if (command === 'docker' && argv[0] === 'run') {
        rememberGitGuard(argv);
        return spawnResult(0, containerId);
      }
      if (command === 'docker' && argv[0] === 'inspect') return spawnResult(0, 'true|0');
      if (command === 'sleep') return spawnResult(0);
      return spawnResult(0);
    });

    expect(() => new DockerSpawnBackend(root).spawn(
      taskId,
      'claude-fable-5',
      'same attempt',
      { executionBudget: { maxTurns: 1 }, settlementRef: active },
    )).not.toThrow();
    expect(readTaskResultSettlementDispatch(active)).toMatchObject({ containerId });

    mockSpawnSync.mockClear();

    const conflicting = createTaskResultSettlementRef(root, taskId);
    expect(() => new DockerSpawnBackend(root).spawn(
      taskId,
      'claude-fable-5',
      'conflicting attempt',
      { executionBudget: { maxTurns: 1 }, settlementRef: conflicting },
    )).toThrow(/Conflicting active Docker result settlement attempt/);

    expect(mockSpawnSync.mock.calls.filter(call => call[0] === 'docker' && call[1]?.[0] === 'run'))
      .toHaveLength(0);
    expect(readLatestTaskResultSettlementRef(root, taskId)).toEqual(active);
  });

  it('leaves an ambiguous Docker ACK open for restart reconciliation instead of sealing not-dispatched', () => {
    const taskId = 'owned-authority-unavailable';
    const { root } = fixture(taskId);

    mockSpawnSync.mockImplementation((command, args) => {
      const argv = (args ?? []) as string[];
      if (command === 'docker' && argv[0] === 'info') return spawnResult(0, 'ok');
      if (command === 'docker' && argv[0] === 'images') return spawnResult(0, 'image-id');
      if (command === 'claude' && argv[0] === 'auth') {
        return spawnResult(0, JSON.stringify({ loggedIn: true }));
      }
      if (command === 'docker' && argv[0] === 'run') {
        rememberGitGuard(argv);
        return spawnResult(125, '', 'name already in use');
      }
      if (command === 'docker' && argv[0] === 'inspect') {
        return spawnResult(1, '', 'permission denied while connecting to Docker daemon');
      }
      if (command === 'sleep') return spawnResult(0);
      return spawnResult(0);
    });

    expect(() => new DockerSpawnBackend(root).spawn(
      taskId,
      'claude-fable-5',
      'ambiguous dispatch',
      { executionBudget: { maxTurns: 1 } },
    )).toThrow(/DECKENT_E090/);

    const ref = readLatestTaskResultSettlementRef(root, taskId);
    expect(ref).not.toBeNull();
    expect(readTaskResultSettlementPrepared(ref!)).not.toBeNull();
    expect(readTaskResultSettlementDispatch(ref!)).toBeNull();
    expect(readTaskResultSettlement(ref!)).toBeNull();
    expect(readTaskResultSettlementClosure(ref!)).toBeNull();
  });
});
