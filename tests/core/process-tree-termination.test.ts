import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  killProcessGroupWithEscalation,
  signalProcessGroup,
} from '../../src/core/process-tree-termination.js';

interface FakeProcess {
  readonly process: ChildProcess;
  readonly kill: ReturnType<typeof vi.fn>;
  readonly unref: ReturnType<typeof vi.fn>;
}

function fakeProcess(pid?: number): FakeProcess {
  const emitter = new EventEmitter();
  const kill = vi.fn(() => true);
  const unref = vi.fn();
  Object.assign(emitter, {
    pid,
    exitCode: null,
    signalCode: null,
    kill,
    unref,
  });
  return {
    process: emitter as unknown as ChildProcess,
    kill,
    unref,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('signalProcessGroup', () => {
  it('signals the negative detached process-group id on POSIX', () => {
    const child = fakeProcess(4123);
    const processKill = vi.fn();

    signalProcessGroup(child.process, 'SIGTERM', 'linux', { processKill });

    expect(processKill).toHaveBeenCalledWith(-4123, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('falls back to the direct child when POSIX group signalling fails', () => {
    const child = fakeProcess(4123);
    const processKill = vi.fn(() => {
      throw new Error('ESRCH');
    });

    signalProcessGroup(child.process, 'SIGTERM', 'darwin', { processKill });

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('uses taskkill tree semantics on Windows and falls back on non-zero settlement', () => {
    const child = fakeProcess(8123);
    const killer = fakeProcess(9999);
    const spawnProcess = vi.fn(() => killer.process);

    signalProcessGroup(child.process, 'SIGKILL', 'win32', { spawnProcess });

    expect(spawnProcess).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '8123', '/T', '/F'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect(killer.unref).toHaveBeenCalledOnce();
    killer.process.emit('close', 1);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('signals the direct child when no platform tree identity exists', () => {
    const child = fakeProcess();
    signalProcessGroup(child.process, 'SIGTERM', 'linux');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('killProcessGroupWithEscalation', () => {
  it('escalates SIGTERM to SIGKILL after the bounded grace window', async () => {
    vi.useFakeTimers();
    const child = fakeProcess(5123);
    const processKill = vi.fn();

    killProcessGroupWithEscalation(
      child.process,
      'SIGTERM',
      'linux',
      75,
      { processKill },
    );
    expect(processKill).toHaveBeenCalledWith(-5123, 'SIGTERM');

    await vi.advanceTimersByTimeAsync(75);
    expect(processKill).toHaveBeenCalledWith(-5123, 'SIGKILL');
  });

  it('cancels escalation when the child exits during the grace window', async () => {
    vi.useFakeTimers();
    const child = fakeProcess(6123);
    const processKill = vi.fn();

    killProcessGroupWithEscalation(
      child.process,
      'SIGTERM',
      'linux',
      75,
      { processKill },
    );
    child.process.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(75);

    expect(processKill).toHaveBeenCalledTimes(1);
    expect(processKill).toHaveBeenCalledWith(-6123, 'SIGTERM');
  });
});
