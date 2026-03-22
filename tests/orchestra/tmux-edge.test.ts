import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSessionActive,
  ensureSession,
  spawnWorker,
  killWorker,
  listWorkers,
  cleanupPromptFile,
  TmuxError,
} from '../../src/orchestra/tmux.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: () => 'deadbeef' })),
}));

import { spawnSync } from 'node:child_process';
import { unlinkSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const successResult = {
  status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
} as never;

const failResult = (stderr = 'command failed') => ({
  status: 1, stdout: '', stderr, pid: 1, signal: null, output: [],
} as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
});

const isWindows = process.platform === 'win32';

// ─── TmuxError ───────────────────────────────────────────────────────

describe.skipIf(isWindows)('TmuxError', () => {
  it('has name "TmuxError"', () => {
    const err = new TmuxError('something failed');
    expect(err.name).toBe('TmuxError');
  });

  it('stores message correctly', () => {
    const err = new TmuxError('session not found');
    expect(err.message).toBe('session not found');
  });

  it('stores optional command', () => {
    const err = new TmuxError('failed', 'tmux kill-session -t deckent');
    expect(err.command).toBe('tmux kill-session -t deckent');
  });

  it('command is undefined when not provided', () => {
    const err = new TmuxError('failed');
    expect(err.command).toBeUndefined();
  });

  it('is instanceof Error', () => {
    const err = new TmuxError('oops');
    expect(err).toBeInstanceOf(Error);
  });

  it('is instanceof TmuxError', () => {
    const err = new TmuxError('oops');
    expect(err).toBeInstanceOf(TmuxError);
  });
});

// ─── isSessionActive edge cases ──────────────────────────────────────

describe.skipIf(isWindows)('isSessionActive edge cases', () => {
  it('returns false when spawnSync status is null (unexpected)', () => {
    mockedSpawnSync.mockReturnValue({
      status: null, stdout: '', stderr: '', pid: 0, signal: null, output: [],
    } as never);
    // null !== 0 → false
    expect(isSessionActive()).toBe(false);
  });

  it('returns false when spawnSync status is non-zero (e.g., 127 = not found)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 127, stdout: '', stderr: 'tmux: command not found', pid: 1, signal: null, output: [],
    } as never);
    expect(isSessionActive()).toBe(false);
  });

  it('checks specifically against TMUX_SESSION_NAME "deckent"', () => {
    mockedSpawnSync.mockReturnValue(successResult);
    isSessionActive();
    const args = mockedSpawnSync.mock.calls[0]![1] as string[];
    expect(args).toContain('deckent');
    expect(args).toContain('has-session');
    expect(args).toContain('-t');
  });
});

// ─── ensureSession edge cases ─────────────────────────────────────────

describe.skipIf(isWindows)('ensureSession edge cases', () => {
  it('throws TmuxError if new-session fails', () => {
    // has-session → no session
    mockedSpawnSync.mockReturnValueOnce(failResult('no session'));
    // new-session → fails
    mockedSpawnSync.mockReturnValueOnce(failResult('permission denied'));

    expect(() => ensureSession()).toThrow(TmuxError);
  });

  it('does not call new-session when session is already active', () => {
    mockedSpawnSync.mockReturnValue(successResult);
    ensureSession();
    const subcommands = mockedSpawnSync.mock.calls.map(c => (c[1] as string[])[0]);
    expect(subcommands).not.toContain('new-session');
    expect(subcommands).toContain('has-session');
  });

  it('calls new-session with detached flag -d', () => {
    // has-session → no session
    mockedSpawnSync.mockReturnValueOnce(failResult('no session'));
    // new-session → success
    mockedSpawnSync.mockReturnValueOnce(successResult);

    ensureSession();

    const newSessionCall = mockedSpawnSync.mock.calls[1]!;
    const args = newSessionCall[1] as string[];
    expect(args).toContain('-d');
    expect(args).toContain('-s');
    expect(args).toContain('deckent');
  });
});

// ─── spawnWorker edge cases ───────────────────────────────────────────

describe.skipIf(isWindows)('spawnWorker edge cases', () => {
  it('creates .tasks dir when it does not exist before writing prompt', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedSpawnSync.mockReturnValue(successResult);

    spawnWorker('task-edge-01', 'sonnet', 'prompt text', '/myproject');

    expect(mockedMkdirSync).toHaveBeenCalledWith(
      '/myproject/.tasks',
      { recursive: true },
    );
  });

  it('skips mkdirSync when .tasks dir already exists', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedSpawnSync.mockReturnValue(successResult);

    spawnWorker('task-edge-02', 'opus', 'do work', '/myproject');

    expect(mockedMkdirSync).not.toHaveBeenCalled();
  });

  it('writes prompt content to file (not embedded in command)', () => {
    mockedSpawnSync.mockReturnValue(successResult);
    const prompt = 'sensitive content with $SHELL and `whoami`';

    spawnWorker('task-edge-03', 'sonnet', prompt, '/proj');

    // writeFileSync should be called with the prompt content
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.prompt-deadbeef.txt'),
      prompt,
      'utf-8',
    );
  });

  it('sets up pipe-pane log with correct task-prefixed filename', () => {
    mockedSpawnSync.mockReturnValue(successResult);

    spawnWorker('edge-99', 'haiku', 'test prompt', '/workspace');

    const pipePaneCall = mockedSpawnSync.mock.calls.find(
      c => (c[1] as string[])[0] === 'pipe-pane',
    );
    expect(pipePaneCall).toBeDefined();
    const args = pipePaneCall![1] as string[];
    // The log path must include task-edge-99.log
    const logArg = args.find(a => a.includes('task-edge-99.log'));
    expect(logArg).toBeDefined();
    expect(logArg).toContain('cat >> ');
  });

  it('uses both allowedTools and autoApprove together', () => {
    mockedSpawnSync.mockReturnValue(successResult);

    spawnWorker('task-combo', 'sonnet', 'work', '/proj', {
      allowedTools: 'Read,Write',
      autoApprove: true,
    });

    const sendKeysCall = mockedSpawnSync.mock.calls[1]!;
    const args = sendKeysCall[1] as string[];
    const cmd = args.find(a => a.includes('claude'));
    expect(cmd).toContain('--allowedTools');
    expect(cmd).toContain('--dangerously-skip-permissions');
  });

  it('uses correct window name format w-<taskId>', () => {
    mockedSpawnSync.mockReturnValue(successResult);

    spawnWorker('sprint5-task', 'sonnet', 'prompt', '/proj');

    const newWindowCall = mockedSpawnSync.mock.calls[0]!;
    const args = newWindowCall[1] as string[];
    expect(args).toContain('w-sprint5-task');
  });
});

// ─── killWorker edge cases ────────────────────────────────────────────

describe.skipIf(isWindows)('killWorker edge cases', () => {
  it('throws TmuxError with the original stderr message', () => {
    mockedSpawnSync.mockReturnValue(failResult('can\'t find window: deckent:w-ghost'));

    let caughtErr: TmuxError | null = null;
    try { killWorker('ghost'); } catch (e) { caughtErr = e as TmuxError; }

    expect(caughtErr).toBeInstanceOf(TmuxError);
    expect(caughtErr!.message).toContain('can\'t find window');
  });

  it('throws TmuxError when session itself does not exist', () => {
    mockedSpawnSync.mockReturnValue(failResult('no server running on /tmp/tmux-1000'));

    expect(() => killWorker('task-001')).toThrow(TmuxError);
  });

  it('passes correct kill-window target', () => {
    mockedSpawnSync.mockReturnValue(successResult);
    killWorker('42-007');

    const args = mockedSpawnSync.mock.calls[0]![1] as string[];
    expect(args[0]).toBe('kill-window');
    expect(args).toContain('deckent:w-42-007');
  });

  it('includes the tmux command in TmuxError', () => {
    mockedSpawnSync.mockReturnValue(failResult('no such window'));
    let err: TmuxError | null = null;
    try { killWorker('missing'); } catch (e) { err = e as TmuxError; }

    expect(err!.command).toContain('kill-window');
  });
});

// ─── listWorkers edge cases ───────────────────────────────────────────

describe.skipIf(isWindows)('listWorkers edge cases', () => {
  it('returns empty array when output is empty string', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);
    expect(listWorkers()).toEqual([]);
  });

  it('filters out non-worker windows (brain, auditor, watch)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'brain\nauditor\nwatch\nbash\nw-001-001\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);
    expect(listWorkers()).toEqual(['001-001']);
  });

  it('returns multiple workers when multiple w- windows exist', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'w-001\nw-002\nw-003\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);
    expect(listWorkers()).toEqual(['001', '002', '003']);
  });

  it('returns empty array on tmux failure (no session)', () => {
    mockedSpawnSync.mockReturnValue(failResult('session not found'));
    expect(listWorkers()).toEqual([]);
  });

  it('strips the w- prefix from all returned taskIds', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'w-sprint5-task1\nw-sprint5-task2\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);
    const workers = listWorkers();
    expect(workers).toEqual(['sprint5-task1', 'sprint5-task2']);
    workers.forEach(w => expect(w.startsWith('w-')).toBe(false));
  });
});

// ─── cleanupPromptFile edge cases ────────────────────────────────────

describe.skipIf(isWindows)('cleanupPromptFile edge cases', () => {
  it('calls unlinkSync with the given path', () => {
    cleanupPromptFile('/tmp/.prompt-abc123.txt');
    expect(mockedUnlinkSync).toHaveBeenCalledWith('/tmp/.prompt-abc123.txt');
  });

  it('does not throw when file does not exist (ENOENT swallowed)', () => {
    mockedUnlinkSync.mockImplementation(() => {
      const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });

    expect(() => cleanupPromptFile('/tmp/gone.txt')).not.toThrow();
  });

  it('does not throw for any unlink error (all errors swallowed)', () => {
    mockedUnlinkSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(() => cleanupPromptFile('/root/protected.txt')).not.toThrow();
  });

  it('can be called multiple times on same path without throwing', () => {
    // First call succeeds
    mockedUnlinkSync.mockImplementationOnce(() => undefined);
    // Second call throws (already deleted)
    mockedUnlinkSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });

    expect(() => {
      cleanupPromptFile('/tmp/prompt.txt');
      cleanupPromptFile('/tmp/prompt.txt');
    }).not.toThrow();
  });
});
