import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(msg: string, cmd?: string) {
      super(msg);
      this.name = 'TmuxError';
      this.command = cmd;
    }
  },
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('You are a worker...'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

// ─── Static Imports ──────────────────────────────────────────────────

import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { ensureSession, spawnWorker } from '../../src/orchestra/tmux.js';
import { buildWorkerPrompt } from '../../src/orchestra/brain.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import {
  createRunTaskId,
  buildRunTask,
  cleanupRunTask,
  waitForRunResult,
  registerRun,
} from '../../src/cli/commands/run.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('createRunTaskId', () => {
  it('returns a string starting with run-', () => {
    const id = createRunTaskId();
    expect(id).toMatch(/^run-\d+-\d+$/);
  });

  it('returns unique-format ids on each call', () => {
    const id1 = createRunTaskId();
    const id2 = createRunTaskId();
    expect(id1).toMatch(/^run-/);
    expect(id2).toMatch(/^run-/);
  });
});

describe('buildRunTask', () => {
  it('creates a task with correct structure', () => {
    const task = buildRunTask('run-123', 'Do something', 'sonnet', './src');
    expect(task.id).toBe('run-123');
    expect(task.model).toBe('sonnet');
    expect(task.scope.directories).toEqual(['./src']);
    expect(task.status).toBe('PENDING');
    expect(task.description).toBe('Do something');
  });

  it('truncates title to 80 characters', () => {
    const longDesc = 'a'.repeat(100);
    const task = buildRunTask('run-1', longDesc, 'opus', './');
    expect(task.title.length).toBeLessThanOrEqual(80);
  });

  it('uses the provided model', () => {
    const task = buildRunTask('run-1', 'test', 'haiku', './');
    expect(task.model).toBe('haiku');
  });

  it('sets createdAt as ISO string', () => {
    const task = buildRunTask('run-1', 'test', 'sonnet', './');
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  it('has correct goNogo defaults', () => {
    const task = buildRunTask('run-1', 'test', 'sonnet', './');
    expect(task.goNogo.goCriteria).toBe('Task completed successfully');
    expect(task.goNogo.noGoCriteria).toBe('Task failed or errored');
  });

  it('sets empty filesRead and filesWrite', () => {
    const task = buildRunTask('run-1', 'test', 'sonnet', './');
    expect(task.scope.filesRead).toEqual([]);
    expect(task.scope.filesWrite).toEqual([]);
  });
});

describe('cleanupRunTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes all task file extensions', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    cleanupRunTask('/project', 'run-123');
    expect(unlinkSync).toHaveBeenCalledTimes(5);
  });

  it('skips deletion if file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    cleanupRunTask('/project', 'run-123');
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it('does not throw if unlinkSync fails', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(unlinkSync).mockImplementation(() => { throw new Error('EPERM'); });
    expect(() => cleanupRunTask('/project', 'run-123')).not.toThrow();
  });
});

describe('waitForRunResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns result immediately if file exists', async () => {
    const fakeResult = { taskId: 'run-1', selfAssessment: 'DONE', testsPassed: true };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(fakeResult));

    const result = await waitForRunResult('/project', 'run-1', 5000);
    expect(result).toEqual(fakeResult);
  });

  it('returns null if timeout expires without result', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await waitForRunResult('/project', 'run-1', 10);
    expect(result).toBeNull();
  });

  it('returns null if result file has invalid JSON', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-json');
    const result = await waitForRunResult('/project', 'run-1', 5000);
    expect(result).toBeNull();
  });
});

describe('registerRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a "run" command on the program', () => {
    const program = new Command();
    program.exitOverride();
    registerRun(program);
    const cmd = program.commands.find(c => c.name() === 'run');
    expect(cmd).toBeDefined();
  });

  it('run command has --model option', () => {
    const program = new Command();
    registerRun(program);
    const cmd = program.commands.find(c => c.name() === 'run');
    const modelOpt = cmd?.options.find(o => o.long === '--model');
    expect(modelOpt).toBeDefined();
  });

  it('run command has --scope option', () => {
    const program = new Command();
    registerRun(program);
    const cmd = program.commands.find(c => c.name() === 'run');
    const scopeOpt = cmd?.options.find(o => o.long === '--scope');
    expect(scopeOpt).toBeDefined();
  });

  it('sets exit code 1 for invalid model', async () => {
    const origExitCode = process.exitCode;
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(existsSync).mockReturnValue(false);

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    try {
      await program.parseAsync(['node', 'deckent', 'run', 'do something', '--model', 'invalid']);
    } catch {
      // commander may throw on exitOverride
    }

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });

  it('spawns worker and reports DONE result', async () => {
    const origExitCode = process.exitCode;
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
    vi.mocked(ensureSession).mockReturnValue(undefined);
    vi.mocked(spawnWorker).mockReturnValue(undefined);
    vi.mocked(unlinkSync).mockReturnValue(undefined);

    // Return result file on first existsSync call
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      taskId: 'run-test',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: ['src/foo.ts'],
      notes: 'done',
    }));

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync(['node', 'deckent', 'run', 'test task', '--model', 'sonnet']);

    expect(spawnWorker).toHaveBeenCalledWith(
      expect.stringMatching(/^run-/),
      'sonnet',
      expect.any(String),
      '/project',
      expect.any(Object),
    );
    expect(process.exitCode).toBe(0);
    process.exitCode = origExitCode as number;
  });

  it('sets exit code 1 for NO_GO result', async () => {
    const origExitCode = process.exitCode;
    vi.mocked(resolveProjectRoot).mockReturnValue('/project');
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);
    vi.mocked(ensureSession).mockReturnValue(undefined);
    vi.mocked(spawnWorker).mockReturnValue(undefined);
    vi.mocked(unlinkSync).mockReturnValue(undefined);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      taskId: 'run-test',
      selfAssessment: 'NO_GO',
      testsPassed: false,
      filesChanged: [],
      notes: 'failed',
    }));

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync(['node', 'deckent', 'run', 'test task']);

    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });
});
