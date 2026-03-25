import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks ───────────────────────────────────────────────────────────

const mockKillWorker = vi.fn();

vi.mock('../../../src/orchestra/tmux.js', () => {
  class TmuxError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TmuxError';
    }
  }
  return {
    killWorker: (...args: unknown[]) => mockKillWorker(...args),
    TmuxError,
  };
});

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

let mockRoot: string;
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => mockRoot,
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

import { print, printError } from '../../../src/cli/helpers/output.js';
import { TmuxError } from '../../../src/orchestra/tmux.js';
import { registerKill } from '../../../src/cli/commands/kill.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerKill(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

function setupTaskFile(taskId: string, status: string, sprintPrefix?: string): void {
  const tasksDir = join(mockRoot, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  const name = sprintPrefix ? `task-${sprintPrefix}-${taskId}.json` : `task-${taskId}.json`;
  writeFileSync(join(tasksDir, name), JSON.stringify({ id: taskId, status, title: 'test' }, null, 2));
}

function setupLockFile(ownerWorkerId: string, taskId: string, fileName: string): void {
  const locksDir = join(mockRoot, '.locks');
  mkdirSync(locksDir, { recursive: true });
  writeFileSync(join(locksDir, fileName), JSON.stringify({ ownerWorkerId, taskId, filePath: 'some/file.ts' }));
}

function setupPromptFile(taskId: string): void {
  const tasksDir = join(mockRoot, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, `.prompt-${taskId}.txt`), 'prompt content');
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('kill command enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    mockRoot = join(tmpdir(), `kill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(mockRoot, { recursive: true });
    mockKillWorker.mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    try { rmSync(mockRoot, { recursive: true, force: true }); } catch { /* */ }
  });

  // ─── A) Task Status Update ─────────────────────────────────────────

  it('updates task status to PAUSED after kill', async () => {
    setupTaskFile('001-005', 'EXECUTING');
    await runCommand(['kill', '001-005']);
    const task = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-001-005.json'), 'utf-8'));
    expect(task.status).toBe('PAUSED');
  });

  it('finds task with sprint prefix pattern', async () => {
    setupTaskFile('001-005', 'EXECUTING', 'sprint-055');
    await runCommand(['kill', '001-005']);
    const task = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-sprint-055-001-005.json'), 'utf-8'));
    expect(task.status).toBe('PAUSED');
  });

  it('warns but does not error when task file not found', async () => {
    await runCommand(['kill', '999-999']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Warning'));
    expect(mockKillWorker).toHaveBeenCalledWith('999-999');
  });

  // ─── B) Lock Cleanup ──────────────────────────────────────────────

  it('releases locks owned by killed worker', async () => {
    setupTaskFile('001-005', 'EXECUTING');
    setupLockFile('w-001-005', '001-005', 'src__file_ts.lock');
    await runCommand(['kill', '001-005']);
    expect(existsSync(join(mockRoot, '.locks', 'src__file_ts.lock'))).toBe(false);
  });

  it('preserves locks owned by other workers', async () => {
    setupTaskFile('001-005', 'EXECUTING');
    setupLockFile('w-001-005', '001-005', 'my.lock');
    setupLockFile('w-001-006', '001-006', 'other.lock');
    await runCommand(['kill', '001-005']);
    expect(existsSync(join(mockRoot, '.locks', 'my.lock'))).toBe(false);
    expect(existsSync(join(mockRoot, '.locks', 'other.lock'))).toBe(true);
  });

  it('does not error when locks directory does not exist', async () => {
    setupTaskFile('001-005', 'EXECUTING');
    await runCommand(['kill', '001-005']);
    // No error thrown
    expect(mockKillWorker).toHaveBeenCalledWith('001-005');
  });

  // ─── C) --all Flag ────────────────────────────────────────────────

  it('kills all EXECUTING tasks with --all', async () => {
    setupTaskFile('001-001', 'EXECUTING');
    setupTaskFile('001-002', 'EXECUTING');
    setupTaskFile('001-003', 'DONE');
    await runCommand(['kill', '--all']);
    expect(mockKillWorker).toHaveBeenCalledTimes(2);
    const t1 = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-001-001.json'), 'utf-8'));
    const t2 = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-001-002.json'), 'utf-8'));
    const t3 = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-001-003.json'), 'utf-8'));
    expect(t1.status).toBe('PAUSED');
    expect(t2.status).toBe('PAUSED');
    expect(t3.status).toBe('DONE');
  });

  it('kills CLAIMED tasks with --all', async () => {
    setupTaskFile('001-001', 'CLAIMED');
    await runCommand(['kill', '--all']);
    expect(mockKillWorker).toHaveBeenCalledWith('001-001');
    const t = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-001-001.json'), 'utf-8'));
    expect(t.status).toBe('PAUSED');
  });

  it('reports no active workers with --all on empty tasks dir', async () => {
    mkdirSync(join(mockRoot, '.tasks'), { recursive: true });
    await runCommand(['kill', '--all']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active'));
    expect(mockKillWorker).not.toHaveBeenCalled();
  });

  it('reports no active workers when tasks dir does not exist', async () => {
    await runCommand(['kill', '--all']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active'));
  });

  // ─── D) Prompt Cleanup ────────────────────────────────────────────

  it('cleans prompt files for the killed task', async () => {
    setupTaskFile('001-005', 'EXECUTING');
    setupPromptFile('001-005');
    await runCommand(['kill', '001-005']);
    expect(existsSync(join(mockRoot, '.tasks', '.prompt-001-005.txt'))).toBe(false);
  });

  // ─── E) Error Handling ────────────────────────────────────────────

  it('shows TmuxError message for non-existent worker', async () => {
    mockKillWorker.mockImplementation(() => { throw new TmuxError('no such pane'); });
    await runCommand(['kill', '999-999']);
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('not found'),
    }));
    expect(process.exitCode).toBe(1);
  });

  it('kill + lock cleanup is idempotent (2nd run safe)', async () => {
    setupTaskFile('001-005', 'EXECUTING');
    setupLockFile('w-001-005', '001-005', 'my.lock');
    await runCommand(['kill', '001-005']);
    // Second run: task already PAUSED, locks already gone, worker already dead
    mockKillWorker.mockImplementation(() => { throw new TmuxError('no such pane'); });
    process.exitCode = undefined;
    await runCommand(['kill', '001-005']);
    const task = JSON.parse(readFileSync(join(mockRoot, '.tasks', 'task-001-005.json'), 'utf-8'));
    expect(task.status).toBe('PAUSED');
  });
});
