import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireSpawnLock, inspectStaleSpawnLocks } from '../../src/core/file-lock.js';
import { readEvents } from '../../src/core/event-stream.js';
import { AUDIT_EVENT_CHANNEL, _resetChainHead } from '../../src/core/audit-writer.js';
import {
  STALE_SPAWNLOCK_MAX_FILES_PER_DISPATCH,
  STALE_SPAWNLOCK_RELEASE_AUDIT_ACTION,
  sweepStaleSpawnLocksForDispatch,
} from '../../src/orchestra/spawn-coordinator.js';

describe('stale spawnlock dispatch watchdog', () => {
  let root: string;
  const children: ChildProcess[] = [];

  beforeEach(() => {
    root = join(tmpdir(), `deckent-spawnlock-watchdog-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(root, '.tasks'), { recursive: true });
    _resetChainHead();
  });

  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill('SIGTERM');
    }
    await Promise.all(children.map(child => child.exitCode === null && !child.killed
      ? new Promise<void>(resolve => child.once('exit', () => resolve()))
      : Promise.resolve()));
    rmSync(root, { recursive: true, force: true });
  });

  function spawnSleeper(): ChildProcess {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1_000)'], {
      stdio: 'ignore',
    });
    children.push(child);
    return child;
  }

  async function waitForSpawn(child: ChildProcess): Promise<number> {
    if (child.pid !== undefined) return child.pid;
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    if (child.pid === undefined) throw new Error('child PID unavailable');
    return child.pid;
  }

  async function stop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return;
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await exited;
  }

  function makeStaleLock(taskId: string, filePath: string, ownerPid: number): string {
    acquireSpawnLock(root, taskId, filePath);
    const locksDir = join(root, '.locks');
    const lockPath = join(locksDir, readdirSync(locksDir).find(file => {
      const parsed = JSON.parse(readFileSync(join(locksDir, file), 'utf-8')) as { taskId: string };
      return parsed.taskId === taskId;
    })!);
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(lockPath, JSON.stringify({ ...parsed, ownerPid }));
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockPath, old, old);
    return lockPath;
  }

  function writeTerminalResult(taskId: string): void {
    writeFileSync(join(root, '.tasks', `task-${taskId}.result`), JSON.stringify({
      taskId,
      workerId: `w-${taskId}`,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: '',
    }));
  }

  it('releases only stale dead-owner locks with terminal results and writes typed audit evidence', async () => {
    const dead = spawnSleeper();
    const deadPid = await waitForSpawn(dead);
    await stop(dead);
    const lockPath = makeStaleLock('549-dead', 'src/dead.ts', deadPid);
    writeTerminalResult('549-dead');

    const report = sweepStaleSpawnLocksForDispatch(root, { sprintId: 'sprint-549', tenantId: 'tenant-test' });

    expect(report).toEqual({ inspected: 1, eligible: 1, released: 1 });
    expect(existsSync(lockPath)).toBe(false);
    const events = readEvents(root, 'sprint-549', { channel: AUDIT_EVENT_CHANNEL });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      tenantId: 'tenant-test',
      actor: 'dispatch-watchdog',
      action: STALE_SPAWNLOCK_RELEASE_AUDIT_ACTION,
      target: lockPath,
      metadata: {
        lockPath,
        ownerPid: deadPid,
        taskId: '549-dead',
        evidence: { ageExceeded: true, ownerPidDead: true, taskResultTerminal: true },
      },
    });
  });

  it('never touches a live owner lock even when old and terminal', async () => {
    const live = spawnSleeper();
    const livePid = await waitForSpawn(live);
    const lockPath = makeStaleLock('549-live', 'src/live.ts', livePid);
    writeTerminalResult('549-live');

    expect(sweepStaleSpawnLocksForDispatch(root)).toEqual({ inspected: 1, eligible: 0, released: 0 });
    expect(existsSync(lockPath)).toBe(true);
  });

  it('never touches a dead-owner lock without a terminal result', async () => {
    const dead = spawnSleeper();
    const deadPid = await waitForSpawn(dead);
    await stop(dead);
    const lockPath = makeStaleLock('549-pending', 'src/pending.ts', deadPid);

    expect(sweepStaleSpawnLocksForDispatch(root)).toEqual({ inspected: 1, eligible: 0, released: 0 });
    expect(existsSync(lockPath)).toBe(true);
  });

  it('does not release when audit persistence fails', async () => {
    const dead = spawnSleeper();
    const deadPid = await waitForSpawn(dead);
    await stop(dead);
    const lockPath = makeStaleLock('549-no-audit', 'src/no-audit.ts', deadPid);
    writeTerminalResult('549-no-audit');

    const report = sweepStaleSpawnLocksForDispatch(root, {}, {
      isOwnerPidAlive: () => false,
      isTaskResultTerminal: () => true,
      writeReleaseAudit: () => false,
      inspect: inspectStaleSpawnLocks,
      release: () => {
        throw new Error('release must not run without audit');
      },
    });

    expect(report).toEqual({ inspected: 1, eligible: 1, released: 0 });
    expect(existsSync(lockPath)).toBe(true);
  });

  it('hard-caps each dispatch sweep', () => {
    const inspectCalls: number[] = [];
    const report = sweepStaleSpawnLocksForDispatch(root, { maxFiles: Number.MAX_SAFE_INTEGER }, {
      isOwnerPidAlive: () => true,
      isTaskResultTerminal: () => false,
      writeReleaseAudit: () => false,
      inspect: (_projectRoot, options) => {
        inspectCalls.push(options.maxFiles);
        return [];
      },
      release: () => false,
    });

    expect(inspectCalls).toEqual([STALE_SPAWNLOCK_MAX_FILES_PER_DISPATCH]);
    expect(report).toEqual({ inspected: 0, eligible: 0, released: 0 });
  });
});
