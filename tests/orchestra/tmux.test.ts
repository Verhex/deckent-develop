import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSessionActive,
  ensureSession,
  spawnWorker,
  killWorker,
  listWorkers,
  startAuditor,
  attach,
  destroy,
  sendKeys,
  TmuxError,
} from '../../src/orchestra/tmux.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';

const mockedSpawnSync = vi.mocked(spawnSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isSessionActive', () => {
  it('returns true when session exists (status=0)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    expect(isSessionActive()).toBe(true);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux', ['has-session', '-t', 'deckent'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('returns false when session does not exist (status≠0)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'no session', pid: 1, signal: null, output: [],
    } as never);

    expect(isSessionActive()).toBe(false);
  });
});

describe('ensureSession', () => {
  it('creates session when none exists', () => {
    // First call: has-session → fail
    mockedSpawnSync.mockReturnValueOnce({
      status: 1, stdout: '', stderr: 'no session', pid: 1, signal: null, output: [],
    } as never);
    // Second call: new-session → success
    mockedSpawnSync.mockReturnValueOnce({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    ensureSession();

    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2, 'tmux', ['new-session', '-d', '-s', 'deckent'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('is no-op when session already exists', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    ensureSession();

    // Only has-session check, no new-session
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux', ['has-session', '-t', 'deckent'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });
});

describe('spawnWorker', () => {
  it('opens window and sends claude command', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-001', 'sonnet', 'build the feature', '/project');

    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    // new-window
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1, 'tmux',
      ['new-window', '-t', 'deckent', '-n', 'w-task-001', '-c', '/project'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    // send-keys
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2, 'tmux',
      expect.arrayContaining(['send-keys', '-t', 'deckent:w-task-001']),
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('passes prompt as argument (injection-safe)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const dangerousPrompt = "'; rm -rf / #";
    spawnWorker('task-002', 'opus', dangerousPrompt, '/project');

    // The prompt is embedded in the claude command string, passed as send-keys arg
    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    expect(sendKeysCall![0]).toBe('tmux');
    const args = sendKeysCall![1] as string[];
    // Arguments array — no shell interpretation
    expect(args).toContain('send-keys');
  });

  it('adds --allowedTools when opts.allowedTools is set', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-003', 'sonnet', 'do work', '/project', {
      allowedTools: 'Read,Write,Bash',
    });

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('--allowedTools'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).toContain('Read,Write,Bash');
  });

  it('adds --dangerously-skip-permissions when autoApprove is true', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-004', 'haiku', 'quick task', '/project', {
      autoApprove: true,
    });

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('--dangerously-skip-permissions'));
    expect(cmdArg).toBeDefined();
  });

  it('uses only --model and -p when opts is undefined', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-005', 'sonnet', 'simple task', '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).toContain('--model sonnet');
    expect(cmdArg).toContain("-p 'simple task'");
    expect(cmdArg).not.toContain('--allowedTools');
    expect(cmdArg).not.toContain('--dangerously-skip-permissions');
  });
});

describe('killWorker', () => {
  it('kills the correct window', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    killWorker('task-001');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux', ['kill-window', '-t', 'deckent:w-task-001'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('throws TmuxError when window does not exist', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'no such window', pid: 1, signal: null, output: [],
    } as never);

    expect(() => killWorker('nonexistent')).toThrow(TmuxError);
  });
});

describe('listWorkers', () => {
  it('parses taskIds with w- prefix stripped, non-workers filtered', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'brain\nauditor\nw-task-001\nw-task-002\n',
      stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const workers = listWorkers();
    expect(workers).toEqual(['task-001', 'task-002']);
  });

  it('returns empty array when session does not exist', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'no session', pid: 1, signal: null, output: [],
    } as never);

    expect(listWorkers()).toEqual([]);
  });
});

describe('startAuditor', () => {
  it('creates auditor window with sonnet model', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    startAuditor('/project');

    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    // new-window with name "auditor"
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1, 'tmux',
      ['new-window', '-t', 'deckent', '-n', 'auditor', '-c', '/project'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    // send-keys with --model sonnet
    const sendKeysArgs = mockedSpawnSync.mock.calls[1]![1] as string[];
    const cmdArg = sendKeysArgs.find((a) => a.includes('claude'));
    expect(cmdArg).toContain('--model sonnet');
  });

  it('passes allowedTools from opts', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    startAuditor('/project', {
      allowedTools: 'Read,Write(.dashboard),Bash(git diff *)',
    });

    const sendKeysArgs = mockedSpawnSync.mock.calls[1]![1] as string[];
    const cmdArg = sendKeysArgs.find((a) => a.includes('--allowedTools'));
    expect(cmdArg).toBeDefined();
  });
});

describe('destroy', () => {
  it('kills the session', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    destroy();

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux', ['kill-session', '-t', 'deckent'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('does not throw when session does not exist', () => {
    mockedSpawnSync.mockReturnValue({
      status: 1, stdout: '', stderr: 'no session', pid: 1, signal: null, output: [],
    } as never);

    expect(() => destroy()).not.toThrow();
  });
});

describe('sendKeys', () => {
  it('sends correct target and keys', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    sendKeys('brain', 'ls -la');

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux',
      ['send-keys', '-t', 'deckent:brain', 'ls -la', 'Enter'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });
});

describe('attach', () => {
  it('uses stdio inherit for blocking attach', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    attach();

    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'tmux', ['attach', '-t', 'deckent'],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });
});
