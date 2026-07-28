import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
  statSync: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatDashboard: vi.fn().mockReturnValue('dashboard'),
  formatTable: vi.fn().mockReturnValue('table'),
  formatHumanStatus: vi.fn().mockReturnValue('human'),
  formatStandaloneStatus: vi.fn().mockReturnValue('standalone'),
  isNoColor: vi.fn().mockReturnValue(false),
  stripAnsi: vi.fn((s: string) => s),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn().mockReturnValue('No active sprint.'),
}));

vi.mock('../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-145'),
}));

vi.mock('../../src/core/output-formatter.js', () => ({
  formatStatus: vi.fn().mockReturnValue('formatted'),
  resolveOutputMode: vi.fn().mockReturnValue('standard'),
}));

vi.mock('../../src/orchestra/event-bus.js', () => {
  const subscribeMock = vi.fn().mockReturnValue(vi.fn());
  const watchFileMock = vi.fn();
  const unwatchAllMock = vi.fn();
  return {
    eventBus: {
      subscribe: subscribeMock,
      watchFile: watchFileMock,
      unwatchAll: unwatchAllMock,
      publish: vi.fn(),
      tail: vi.fn().mockResolvedValue([]),
    },
  };
});

const shutdownHookState = vi.hoisted(() => ({
  hooks: [] as Array<() => Promise<void>>,
  register: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock('../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook: (hook: () => Promise<void>) => {
    shutdownHookState.hooks.push(hook);
    shutdownHookState.register(hook);
    return shutdownHookState.unregister;
  },
}));

// StatusRenderer mock
vi.mock('../../src/cli/helpers/status-renderer.js', () => {
  const snapshotMock = vi.fn().mockReturnValue('╭──── snapshot ────╮');
  const redrawMock = vi.fn();
  return {
    StatusRenderer: vi.fn().mockImplementation(() => ({
      snapshot: snapshotMock,
      redraw: redrawMock,
    })),
  };
});

vi.mock('../../src/cli/helpers/ansi.js', () => ({
  hideCursor: vi.fn().mockReturnValue('[hide]'),
  showCursor: vi.fn().mockReturnValue('[show]'),
  clearScreen: vi.fn().mockReturnValue('[clear]'),
  clearLine: vi.fn().mockReturnValue('[clearLine]'),
  cursorTo: vi.fn().mockReturnValue('[cursor]'),
  color: {
    red: (s: string) => s,
    green: (s: string) => s,
    yellow: (s: string) => s,
    blue: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { registerStatus } from '../../src/cli/commands/status.js';
import { eventBus } from '../../src/orchestra/event-bus.js';
import { StatusRenderer } from '../../src/cli/helpers/status-renderer.js';
import { hideCursor, showCursor, clearScreen } from '../../src/cli/helpers/ansi.js';

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const readdirSyncMock = vi.mocked(readdirSync);

function lastShutdownHook(): () => Promise<void> {
  const hook = shutdownHookState.hooks[shutdownHookState.hooks.length - 1];
  if (!hook) throw new Error('no shutdown hook registered');
  return hook;
}

describe('status --follow', () => {
  let program: Command;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    shutdownHookState.hooks.length = 0;
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    program = new Command();
    registerStatus(program);
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      _value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      callback?.();
      return true;
    }) as typeof process.stdout.write);
    processOnSpy = vi.spyOn(process, 'on').mockReturnThis();
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
      _callback: (...args: unknown[]) => void,
      _delay?: number,
    ) => ({}) as ReturnType<typeof setInterval>) as typeof setInterval);
    clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    stdoutWriteSpy.mockRestore();
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('--follow flag is recognized by commander', () => {
    const statusCmd = program.commands.find(c => c.name() === 'status');
    expect(statusCmd).toBeDefined();
    const followOpt = statusCmd!.options.find(o => o.long === '--follow');
    expect(followOpt).toBeDefined();
    expect(followOpt!.short).toBe('-f');
  });

  it('-f short alias is recognized', () => {
    const statusCmd = program.commands.find(c => c.name() === 'status');
    const followOpt = statusCmd!.options.find(o => o.short === '-f');
    expect(followOpt).toBeDefined();
    expect(followOpt!.long).toBe('--follow');
  });

  it('follow mode writes initial snapshot to stdout', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    expect(stdoutWriteSpy).toHaveBeenCalledWith(
      '[hide][clear]╭──── snapshot ────╮',
      expect.any(Function),
    );
  });

  it('follow mode subscribes to eventBus', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    expect(eventBus.subscribe).toHaveBeenCalledWith(
      'sprint-145',
      undefined,
      expect.any(Function),
    );
    expect(eventBus.watchFile).toHaveBeenCalledWith('/mock/root', 'sprint-145');
  });

  it('subscribed events enqueue ANSI redraw frames', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    // Get the subscriber callback
    const subscribeCalls = vi.mocked(eventBus.subscribe).mock.calls;
    expect(subscribeCalls.length).toBe(1);
    const callback = subscribeCalls[0]![2];

    // Simulate event
    const rendererInstance = vi.mocked(StatusRenderer).mock.results[0]!.value as {
      snapshot: ReturnType<typeof vi.fn>;
      redraw: ReturnType<typeof vi.fn>;
    };
    rendererInstance.snapshot.mockReturnValue('╭──── updated ────╮');

    callback({ timestamp: '', sequence: 1, protocol_version: '1.0', source: 'brain', target: '*', channel: 'test', payload: {} });

    await vi.waitFor(() => {
      expect(stdoutWriteSpy).toHaveBeenCalledWith(
        '[clear]╭──── updated ────╮',
        expect.any(Function),
      );
    });
    expect(rendererInstance.redraw).not.toHaveBeenCalled();
  });

  it('registers central shutdown cleanup and no raw signal listeners', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    expect(shutdownHookState.register).toHaveBeenCalledTimes(1);
    expect(
      processOnSpy.mock.calls.filter(
        ([event]) =>
          event === 'SIGINT'
          || event === 'SIGTERM'
          || event === 'SIGBREAK',
      ),
    ).toEqual([]);
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('central shutdown cleanup is idempotent and unregisters its hook', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    const hook = lastShutdownHook();
    await Promise.all([hook(), hook()]);

    expect(shutdownHookState.unregister).toHaveBeenCalledTimes(1);
    expect(eventBus.unwatchAll).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[show]\n', expect.any(Function));
    expect(process.exitCode).toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('coalesces event bursts to one in-flight plus the latest frame and drains on shutdown', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);
    const pendingWrites: Array<{
      value: string;
      callback: (error?: Error | null) => void;
    }> = [];
    stdoutWriteSpy.mockImplementation(((
      value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      if (!callback) throw new Error('missing stdout callback');
      pendingWrites.push({ value: String(value), callback });
      return false;
    }) as typeof process.stdout.write);

    await program.parseAsync(['node', 'test', 'status', '--follow']);
    expect(pendingWrites).toHaveLength(1);
    const callback = vi.mocked(eventBus.subscribe).mock.calls[0]![2];
    const rendererInstance = vi.mocked(StatusRenderer).mock.results[0]!.value as {
      snapshot: ReturnType<typeof vi.fn>;
    };
    rendererInstance.snapshot.mockReturnValueOnce('snapshot-a');
    callback({ timestamp: '', sequence: 1, protocol_version: '1.0', source: 'brain', target: '*', channel: 'test', payload: {} });
    rendererInstance.snapshot.mockReturnValueOnce('snapshot-b');
    callback({ timestamp: '', sequence: 2, protocol_version: '1.0', source: 'brain', target: '*', channel: 'test', payload: {} });
    expect(pendingWrites).toHaveLength(1);

    pendingWrites[0]!.callback();
    process.stdout.emit('drain');
    await vi.waitFor(() => {
      expect(pendingWrites).toHaveLength(2);
    });
    expect(pendingWrites[1]!.value).toBe('[clear]snapshot-b');
    expect(pendingWrites.some(write => write.value.includes('snapshot-a'))).toBe(false);

    let hookResolved = false;
    const hookPromise = lastShutdownHook()().then(() => {
      hookResolved = true;
    });
    await Promise.resolve();
    expect(hookResolved).toBe(false);
    expect(pendingWrites).toHaveLength(2);

    pendingWrites[1]!.callback();
    process.stdout.emit('drain');
    await vi.waitFor(() => {
      expect(pendingWrites).toHaveLength(3);
    });
    expect(pendingWrites[2]!.value).toBe('[show]\n');
    expect(hookResolved).toBe(false);

    pendingWrites[2]!.callback();
    process.stdout.emit('drain');
    await hookPromise;

    expect(hookResolved).toBe(true);
    expect(shutdownHookState.unregister).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('JSON shutdown drains an empty sentinel without cursor or ANSI output', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow', '--json']);
    await lastShutdownHook()();

    const frames = stdoutWriteSpy.mock.calls.map(call => String(call[0]));
    expect(frames.at(-1)).toBe('');
    expect(frames.some(frame => frame.includes('[hide]'))).toBe(false);
    expect(frames.some(frame => frame.includes('[show]'))).toBe(false);
    expect(frames.slice(0, -1).every(frame => {
      const parsed = JSON.parse(frame.trim()) as unknown;
      return typeof parsed === 'object' && parsed !== null;
    })).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('runtime stdout failure performs bounded cleanup and publishes exit code 1', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);
    let writeCount = 0;
    stdoutWriteSpy.mockImplementation(((
      _value: string | Uint8Array,
      ...args: unknown[]
    ) => {
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === 'function',
      );
      writeCount += 1;
      callback?.(writeCount === 1 ? new Error('stream failed') : undefined);
      return true;
    }) as typeof process.stdout.write);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    await vi.waitFor(() => {
      expect(process.exitCode).toBe(1);
    });
    expect(shutdownHookState.unregister).toHaveBeenCalledTimes(1);
    expect(eventBus.unwatchAll).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(processExitSpy).not.toHaveBeenCalled();
  });
});

// ─── ansi.ts Unit Tests ───────────────────────────────────────────────

describe('ansi helpers', () => {
  it('hideCursor returns ANSI escape', () => {
    expect(hideCursor()).toBe('[hide]');
  });

  it('showCursor returns ANSI escape', () => {
    expect(showCursor()).toBe('[show]');
  });

  it('clearScreen returns ANSI escape', () => {
    expect(clearScreen()).toBe('[clear]');
  });
});
