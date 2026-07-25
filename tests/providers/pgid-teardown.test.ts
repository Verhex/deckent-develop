// PGID-TEARDOWN (ADR-G-013, MOAT-2 residual) — worker process-group teardown proof.
//
// MOAT-2 fixed the coordinator-linger by unref'ing the worker child handle, then
// added a SIGTERM→SIGKILL escalation so no orphan worker survives a clean run.
// That escalation signals a single pid — which reaps the direct worker but NOT
// any grandchild it forked (e.g. a CLI agent's own bash-tool subprocess), because
// a signal sent to one pid never reaches a process it spawned.
//
// FIX (this suite proves it):
//  - POSIX: `spawn()` launches the worker `detached: true`, making it the LEADER
//    of a brand-new process group — its own pid IS the process group id. Sending
//    the signal to the NEGATIVE pid (`process.kill(-pid, signal)`) is POSIX
//    kill(2)'s documented "signal the entire process group" form, so SIGTERM and
//    the SIGKILL escalation both reach the worker AND everything it spawned. A
//    throwing group-kill (e.g. ESRCH — group already reaped) falls back to the
//    original single-pid `proc.kill(signal)` so the worker is still reaped.
//  - win32: `process.kill()` has no negative-pid group-signal semantics, so
//    `taskkill /PID <pid> /T` owns graceful tree termination and `/F` owns the
//    escalation. A taskkill launch failure falls back to direct-child kill.
//
// MOAT-2's `child.unref()` / heartbeat-interval-unref fixes are NOT touched by
// this task — `tests/providers/subprocess-moat2-linger.test.ts` is the CI guard
// for those and must stay green untouched. This file adds one cheap smoke
// (`child.unref()` still called) as a regression tripwire, not a re-test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { SubprocessSpawnBackend } from '../../src/providers/subprocess.js';
import { LocalSubprocessTestBackend } from '../helpers/local-subprocess-backend-fixture.js';
import type { ModelType } from '../../src/core/types.js';

const { taskkillSpawn } = vi.hoisted(() => ({ taskkillSpawn: vi.fn() }));
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>(
    'node:child_process',
  );
  return { ...actual, spawn: taskkillSpawn };
});

/** The `node:child_process` `spawn` function type — matches the backend's `spawnImpl` seam. */
type SpawnFn = typeof import('node:child_process').spawn;

/** A fully-faked child — an EventEmitter with a stdin sink. Never a real process. */
function makeFakeChild(pid = 4242): ChildProcess & { emit: EventEmitter['emit'] } {
  const child = new EventEmitter() as unknown as ChildProcess & { emit: EventEmitter['emit'] };
  (child as unknown as { stdin: unknown }).stdin = { write: vi.fn(), end: vi.fn() };
  (child as unknown as { kill: unknown }).kill = vi.fn();
  (child as unknown as { unref: unknown }).unref = vi.fn();
  (child as unknown as { pid: number }).pid = pid;
  return child;
}

const MODEL: ModelType = 'claude-sonnet-5';
const WORKER_PID = 4242;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pgid-teardown-'));
  taskkillSpawn.mockImplementation(() => {
    const killer = new EventEmitter() as EventEmitter & {
      unref: ReturnType<typeof vi.fn>;
    };
    killer.unref = vi.fn();
    return killer;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

function spawnPosixBackend(child: ReturnType<typeof makeFakeChild>): {
  backend: SubprocessSpawnBackend;
  spawnImpl: ReturnType<typeof vi.fn>;
} {
  const spawnImpl = vi.fn(() => child) as unknown as ReturnType<typeof vi.fn> & SpawnFn;
  const backend = new LocalSubprocessTestBackend(root, { platform: 'linux', spawnImpl: spawnImpl as unknown as SpawnFn });
  backend.spawn('t1', MODEL, 'the-prompt', { projectDir: root });
  return { backend, spawnImpl };
}

describe('PGID-TEARDOWN: POSIX spawns the worker as its own process-group leader', () => {
  it('spawn() passes detached:true to spawnImpl on a POSIX platform', () => {
    const child = makeFakeChild();
    const { spawnImpl } = spawnPosixBackend(child);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    const [, , spawnOpts] = spawnImpl.mock.calls[0] as [unknown, unknown, { detached?: boolean }];
    expect(spawnOpts.detached).toBe(true);
  });

  it('does not regress MOAT-2: child.unref() is still called after spawn', () => {
    const child = makeFakeChild();
    spawnPosixBackend(child);
    expect((child as unknown as { unref: ReturnType<typeof vi.fn> }).unref).toHaveBeenCalledTimes(1);
  });
});

describe('PGID-TEARDOWN: killWithSignal signals the whole process group on POSIX', () => {
  it('kill() (SIGTERM) signals process.kill(-pid, "SIGTERM") — the process-group form', () => {
    const child = makeFakeChild(WORKER_PID);
    const { backend } = spawnPosixBackend(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    backend.kill('t1');

    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGTERM');
    // The group form succeeded — the direct single-pid child.kill() must NOT be used.
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
    child.emit('exit', 0); // clears the SIGKILL-escalation timer
  });

  it('SIGTERM→SIGKILL escalation also targets the process group', () => {
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const { backend } = spawnPosixBackend(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    backend.kill('t1');
    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGTERM');
    expect(killSpy).not.toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');

    vi.advanceTimersByTime(2_000); // past SIGKILL_ESCALATION_MS

    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');
  });

  it('a worker that exits on SIGTERM is not SIGKILL-escalated (group form, escalation cleared on exit)', () => {
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const { backend } = spawnPosixBackend(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    backend.kill('t1');
    child.emit('exit', 0); // well-behaved worker exits → escalation timer cleared
    vi.advanceTimersByTime(2_000);

    expect(killSpy).not.toHaveBeenCalledWith(-WORKER_PID, 'SIGKILL');
  });

  it('falls back to the direct child pid when the group-kill form throws (e.g. group already reaped)', () => {
    const child = makeFakeChild(WORKER_PID);
    const { backend } = spawnPosixBackend(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH: no such process');
    });

    backend.kill('t1');

    expect(killSpy).toHaveBeenCalledWith(-WORKER_PID, 'SIGTERM');
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit', 0);
  });
});

describe('PGID-TEARDOWN: win32 uses taskkill tree authority', () => {
  function spawnWin32Backend(child: ReturnType<typeof makeFakeChild>) {
    const spawnImpl = vi.fn(() => child) as unknown as ReturnType<typeof vi.fn> & SpawnFn;
    const backend = new LocalSubprocessTestBackend(root, { platform: 'win32', spawnImpl: spawnImpl as unknown as SpawnFn });
    backend.spawn('t1', MODEL, 'the-prompt', { projectDir: root });
    return { backend, spawnImpl };
  }

  it('spawn() does NOT set detached on win32', () => {
    const child = makeFakeChild();
    const { spawnImpl } = spawnWin32Backend(child);
    const [, , spawnOpts] = spawnImpl.mock.calls[0] as [unknown, unknown, { detached?: boolean }];
    expect(spawnOpts.detached).toBe(false);
  });

  it('kill() terminates the complete Windows child tree without POSIX group signals', () => {
    const child = makeFakeChild(WORKER_PID);
    const { backend } = spawnWin32Backend(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    backend.kill('t1');

    expect(killSpy).not.toHaveBeenCalled();
    expect(taskkillSpawn).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', String(WORKER_PID), '/T'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
    child.emit('exit', 0);
  });

  it('SIGTERM→SIGKILL escalation forces the complete Windows child tree', () => {
    vi.useFakeTimers();
    const child = makeFakeChild(WORKER_PID);
    const { backend } = spawnWin32Backend(child);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    backend.kill('t1');
    vi.advanceTimersByTime(2_000);

    expect(killSpy).not.toHaveBeenCalled();
    expect(taskkillSpawn).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', String(WORKER_PID), '/T', '/F'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
  });
});
