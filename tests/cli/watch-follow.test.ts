/**
 * watch-follow.test.ts — Tests for docker live-monitor follow mode.
 *
 * Covers:
 *   - watchDockerLogs (watch.ts): docker logs -f spawning + error handling
 *   - followDockerOutput (output-collector.ts): async streaming with injectable spawn
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn().mockReturnValue(true),
  createWatchLayout: vi.fn(),
  attachToWorkerPane: vi.fn(),
  TmuxError: class TmuxError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TmuxError';
    }
  },
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/core/constants.js', () => ({
  DASHBOARD_FILE: '.dashboard',
  TASKS_DIR: '.tasks',
  DECKENT_DIR: '.deckent',
  BRAIN_DIR: '.brain',
  SPRINTS_DIR: '.brain/sprints',
  DEBT_TABLE_HEADER: '# Debt',
  DECKENT_FILE: 'DECKENT.md',
  PROJECT_CONFIG_PATH: '.deckent/config.json',
  ERRORS_FILE: '.brain/ERRORS.md',
  ERRORS_MAX_LINES: 500,
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(0),
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/core/errors.js', () => ({
  DeckentError: class DeckentError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'DeckentError';
      this.code = code;
    }
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import { print, printError } from '../../src/cli/helpers/output.js';
import { watchDockerLogs } from '../../src/cli/commands/watch.js';
import { followDockerOutput } from '../../src/core/output-collector.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock ChildProcess for watchDockerLogs (stdio:inherit → no streams). */
function makeMockProc() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    kill: vi.fn().mockReturnValue(true),
    stdout: null,
    stderr: null,
  });
}

/** Build a mock ChildProcess with readable stdout/stderr streams for followDockerOutput. */
function makeStreamProc() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = Object.assign(new EventEmitter(), {
    kill: vi.fn().mockReturnValue(true),
    stdout,
    stderr,
  });
  return { proc, stdout, stderr };
}

// ─── Tests: watchDockerLogs ────────────────────────────────────────────────────

describe('watchDockerLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spawns docker with logs -f and the correct container name', () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

    watchDockerLogs('279-007');

    expect(spawn).toHaveBeenCalledWith(
      'docker',
      ['logs', '-f', 'deckent-w-279-007'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('prints the container name and Ctrl+C hint before spawning', () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

    watchDockerLogs('123-001');

    expect(print).toHaveBeenCalledWith(expect.stringContaining('deckent-w-123-001'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Ctrl+C'));
  });

  it('handles spawn error gracefully by calling printError', () => {
    const mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as unknown as ReturnType<typeof spawn>);

    watchDockerLogs('500-001');

    // Simulate docker not found error
    mockProc.emit('error', new Error('spawn docker ENOENT'));

    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('docker') })
    );
  });
});

// ─── Tests: followDockerOutput ────────────────────────────────────────────────

describe('followDockerOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams stdout lines to the onLine callback', () => {
    const { proc, stdout } = makeStreamProc();
    const spawnFn = vi.fn().mockReturnValue(proc);
    const onLine = vi.fn();

    followDockerOutput('my-container', onLine, spawnFn as unknown as Parameters<typeof followDockerOutput>[2]);

    stdout.emit('data', Buffer.from('line one\nline two\n'));

    expect(onLine).toHaveBeenCalledWith('line one');
    expect(onLine).toHaveBeenCalledWith('line two');
    expect(onLine).toHaveBeenCalledTimes(2);
  });

  it('streams stderr lines to the onLine callback', () => {
    const { proc, stderr } = makeStreamProc();
    const spawnFn = vi.fn().mockReturnValue(proc);
    const onLine = vi.fn();

    followDockerOutput('err-container', onLine, spawnFn as unknown as Parameters<typeof followDockerOutput>[2]);

    stderr.emit('data', Buffer.from('error line one\nerror line two\n'));

    expect(onLine).toHaveBeenCalledWith('error line one');
    expect(onLine).toHaveBeenCalledWith('error line two');
  });

  it('stop() calls proc.kill() to terminate the stream', () => {
    const { proc } = makeStreamProc();
    const spawnFn = vi.fn().mockReturnValue(proc);
    const onLine = vi.fn();

    const handle = followDockerOutput('stop-container', onLine, spawnFn as unknown as Parameters<typeof followDockerOutput>[2]);
    handle.stop();

    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('skips blank and whitespace-only lines', () => {
    const { proc, stdout } = makeStreamProc();
    const spawnFn = vi.fn().mockReturnValue(proc);
    const onLine = vi.fn();

    followDockerOutput('blank-container', onLine, spawnFn as unknown as Parameters<typeof followDockerOutput>[2]);

    stdout.emit('data', Buffer.from('real line\n\n   \nother line\n'));

    expect(onLine).toHaveBeenCalledWith('real line');
    expect(onLine).toHaveBeenCalledWith('other line');
    expect(onLine).toHaveBeenCalledTimes(2);
  });

  it('passes docker logs -f and containerName to the spawn function', () => {
    const { proc } = makeStreamProc();
    const spawnFn = vi.fn().mockReturnValue(proc);

    followDockerOutput('test-container', vi.fn(), spawnFn as unknown as Parameters<typeof followDockerOutput>[2]);

    expect(spawnFn).toHaveBeenCalledWith('docker', ['logs', '-f', 'test-container']);
  });

  it('handles partial chunks across multiple data events (buffering)', () => {
    const { proc, stdout } = makeStreamProc();
    const spawnFn = vi.fn().mockReturnValue(proc);
    const onLine = vi.fn();

    followDockerOutput('buf-container', onLine, spawnFn as unknown as Parameters<typeof followDockerOutput>[2]);

    // Partial line split across two chunks
    stdout.emit('data', Buffer.from('partial '));
    stdout.emit('data', Buffer.from('line\nnext line\n'));

    expect(onLine).toHaveBeenCalledWith('partial line');
    expect(onLine).toHaveBeenCalledWith('next line');
    expect(onLine).toHaveBeenCalledTimes(2);
  });
});
