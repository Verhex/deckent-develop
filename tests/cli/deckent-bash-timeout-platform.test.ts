import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// born-535 (DECKENT-BASH-HARDEN): chat-tool-exec.ts's deckent_bash default
// spawn path (defaultBashRun) had NO timeout — a hanging shell command
// (stuck on stdin, an infinite loop, a stuck network call) never fired
// close/error, freezing the whole chat turn forever — and hardcoded
// spawn('bash', ...), which fails ENOENT on native Windows (no WSL/Git-Bash,
// born-579 cluster). These tests exercise the real timeout/kill/platform
// logic directly: node:child_process is mocked with a fake EventEmitter-based
// child + vi.useFakeTimers, so no real subprocess is spawned and no test
// waits on a real wall-clock timer (hermetic, mirrors tests/cli/tool-bridge-timeout.test.ts).

const hoisted = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: hoisted.spawnMock,
}));

import {
  defaultBashRun,
  resolveBashInvocation,
} from '../../src/cli/commands/chat-tool-exec.js';

type FakeStream = EventEmitter & { setEncoding: ReturnType<typeof vi.fn> };

interface FakeChild extends EventEmitter {
  pid?: number;
  stdout: FakeStream;
  stderr: FakeStream;
  kill: ReturnType<typeof vi.fn>;
}

function fakeStream(): FakeStream {
  const stream = new EventEmitter() as FakeStream;
  stream.setEncoding = vi.fn();
  return stream;
}

function fakeChild(pid = 4321): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.pid = pid;
  child.stdout = fakeStream();
  child.stderr = fakeStream();
  child.kill = vi.fn();
  return child;
}

describe('resolveBashInvocation — platform-aware shell selection (born-535 / born-579)', () => {
  it('posix (linux/darwin) → bash -lc <cmd>, never a Windows shell', () => {
    expect(resolveBashInvocation('echo hi', 'linux')).toEqual({ command: 'bash', args: ['-lc', 'echo hi'] });
    expect(resolveBashInvocation('echo hi', 'darwin')).toEqual({ command: 'bash', args: ['-lc', 'echo hi'] });
  });

  it('win32 (native, no WSL/Git-Bash) → PowerShell, never the hardcoded bash', () => {
    const inv = resolveBashInvocation('Get-ChildItem', 'win32');
    expect(inv.command).not.toBe('bash');
    expect(inv.command).toMatch(/powershell|pwsh/i);
    expect(inv.args).toContain('Get-ChildItem');
  });

  it('defaults to process.platform when no platform arg is given', () => {
    const inv = resolveBashInvocation('echo hi');
    expect(inv.command).toBe(process.platform === 'win32' ? 'powershell.exe' : 'bash');
  });
});

describe('defaultBashRun — timeout + cancellation for a hanging shell command (born-535)', () => {
  let killSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    hoisted.spawnMock.mockReset();
    vi.useFakeTimers();
    // Default: simulate "no such process" (ESRCH) so tests that don't care
    // about the group-kill path fall back to the plain child.kill() branch
    // deterministically, without ever sending a real signal to a real pid.
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('kill ESRCH');
    });
  });

  afterEach(() => {
    killSpy.mockRestore();
    vi.useRealTimers();
  });

  it('a hanging command (never closes) is killed and the turn recovers instead of hanging forever', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultBashRun('sleep 999999', '/tmp/proj', { timeoutMs: 5_000, platform: 'linux' });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await promise;
    expect(result).toMatch(/timed out after 5s/);
    // dispatch() never throws by contract — the timeout resolves, it never rejects.
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('kills the WHOLE posix process group (not just the bash pid) so a hung pipeline leaves no orphans', async () => {
    const child = fakeChild(9999);
    hoisted.spawnMock.mockReturnValue(child);
    killSpy.mockImplementation(() => true as unknown as never);
    const promise = defaultBashRun('sleep 999 | cat', '/tmp/proj', { timeoutMs: 1_000, platform: 'linux' });
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;
    expect(killSpy).toHaveBeenCalledWith(-9999, 'SIGKILL');
    // Group-kill succeeded — no need to also fall back to the direct child kill.
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('win32 timeout uses a plain child kill — no POSIX group-signal attempt', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultBashRun('Start-Sleep -Seconds 999', 'C:\\proj', { timeoutMs: 1_000, platform: 'win32' });
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;
    expect(killSpy).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('a command finishing within budget resolves normally and is never killed', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultBashRun('echo hi', '/tmp/proj', { timeoutMs: 5_000, platform: 'linux' });
    child.stdout.emit('data', 'hi\n');
    child.emit('close', 0);
    await expect(promise).resolves.toBe('hi');
    // Advancing past the budget afterward must not retroactively kill anything.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(child.kill).not.toHaveBeenCalled();
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('a spawn-level error resolves immediately as [mcp-error] — no hang until the timeout fires', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultBashRun('echo hi', '/tmp/proj', { timeoutMs: 5_000, platform: 'linux' });
    child.emit('error', new Error('spawn ENOENT'));
    await expect(promise).resolves.toContain('[mcp-error] deckent_bash: spawn ENOENT');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('spawns with detached:true on posix (group-killable) and detached:false on win32', async () => {
    const posixChild = fakeChild();
    hoisted.spawnMock.mockReturnValueOnce(posixChild);
    const p1 = defaultBashRun('echo hi', '/tmp/proj', { platform: 'linux' });
    posixChild.emit('close', 0);
    await p1;
    expect(hoisted.spawnMock).toHaveBeenNthCalledWith(
      1,
      'bash',
      ['-lc', 'echo hi'],
      expect.objectContaining({ cwd: '/tmp/proj', detached: true }),
    );

    const winChild = fakeChild();
    hoisted.spawnMock.mockReturnValueOnce(winChild);
    const p2 = defaultBashRun('echo hi', 'C:\\proj', { platform: 'win32' });
    winChild.emit('close', 0);
    await p2;
    expect(hoisted.spawnMock).toHaveBeenNthCalledWith(
      2,
      'powershell.exe',
      ['-NoProfile', '-Command', 'echo hi'],
      expect.objectContaining({ cwd: 'C:\\proj', detached: false }),
    );
  });

  it('uses the DEFAULT_BASH_TIMEOUT_MS (5min) budget when no timeoutMs is given', async () => {
    const child = fakeChild();
    hoisted.spawnMock.mockReturnValue(child);
    const promise = defaultBashRun('sleep 999999', '/tmp/proj', { platform: 'linux' });
    // Well within the default budget — must not be killed yet.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300_000 - 60_000);
    const result = await promise;
    expect(result).toMatch(/timed out after 300s/);
  });
});
