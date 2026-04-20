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

describe('status --follow', () => {
  let program: Command;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
  let processOnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    registerStatus(program);
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    processOnSpy = vi.spyOn(process, 'on').mockReturnThis();
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
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

    // hideCursor + clearScreen written before snapshot
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[hide][clear]');
    // snapshot content written
    expect(stdoutWriteSpy).toHaveBeenCalledWith('╭──── snapshot ────╮');
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

  it('subscribe callback triggers redraw with new snapshot', async () => {
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

    expect(rendererInstance.redraw).toHaveBeenCalledWith('╭──── updated ────╮');
  });

  it('SIGINT handler calls showCursor and unsubscribe', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    // Find the SIGINT handler
    const sigintCalls = processOnSpy.mock.calls.filter(c => c[0] === 'SIGINT');
    expect(sigintCalls.length).toBeGreaterThan(0);

    const sigintHandler = sigintCalls[sigintCalls.length - 1]![1] as () => void;

    // Call the cleanup
    sigintHandler();

    // Should write showCursor
    expect(stdoutWriteSpy).toHaveBeenCalledWith('[show]\n');
    // Should unwatch all event bus watchers
    expect(eventBus.unwatchAll).toHaveBeenCalled();
    // Should exit
    expect(processExitSpy).toHaveBeenCalledWith(0);
  });

  it('follow mode sets up SIGTERM handler too', async () => {
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);

    await program.parseAsync(['node', 'test', 'status', '--follow']);

    const sigtermCalls = processOnSpy.mock.calls.filter(c => c[0] === 'SIGTERM');
    expect(sigtermCalls.length).toBeGreaterThan(0);
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
