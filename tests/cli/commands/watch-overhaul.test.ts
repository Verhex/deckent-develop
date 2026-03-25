import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return {
    ...original,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('../../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  createWatchLayout: vi.fn(),
  attachToWorkerPane: vi.fn(),
  TmuxError: class TmuxError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TmuxError';
    }
  },
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/constants.js', () => ({
  DASHBOARD_FILE: '.dashboard',
  TASKS_DIR: '.tasks',
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
}));

import { existsSync, readFileSync } from 'node:fs';
import { isSessionActive, createWatchLayout, attachToWorkerPane, TmuxError } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerWatch, cleanupWatchWindow } from '../../../src/cli/commands/watch.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerWatch(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander may throw
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('watch command — overhaul', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}');
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers watch command', () => {
    const program = new Command();
    registerWatch(program);
    expect(program.commands.find(c => c.name() === 'watch')).toBeDefined();
  });

  it('creates watch layout when no --follow', async () => {
    await runCommand(['watch']);
    expect(createWatchLayout).toHaveBeenCalled();
  });

  it('attaches to worker pane when --follow is given', async () => {
    vi.mocked(attachToWorkerPane).mockImplementation(() => {});
    await runCommand(['watch', '--follow', '057-001']);
    expect(attachToWorkerPane).toHaveBeenCalledWith('057-001');
  });

  it('sets exitCode=1 when no dashboard file', async () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) =>
      !(p as string).endsWith('.dashboard')
    );
    await runCommand(['watch']);
    expect(process.exitCode).toBe(1);
    expect(printError).toHaveBeenCalled();
  });

  it('sets exitCode=1 when no tmux session', async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['watch']);
    expect(process.exitCode).toBe(1);
    expect(printError).toHaveBeenCalled();
  });

  it('I) shows hint when worker window not found (TmuxError)', async () => {
    vi.mocked(attachToWorkerPane).mockImplementation(() => {
      throw new TmuxError('Worker window w-057-999 not found');
    });
    // Mock task file doesn't exist
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const ps = p as string;
      return !ps.includes('task-057-999');
    });
    await runCommand(['watch', '--follow', '057-999']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Hint:') })
    );
    expect(process.exitCode).toBe(1);
  });

  it('I) shows "Worker finished" hint when result file exists', async () => {
    vi.mocked(attachToWorkerPane).mockImplementation(() => {
      throw new TmuxError('Worker window not found');
    });
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const ps = p as string;
      return ps.endsWith('.dashboard') || ps.endsWith('.result');
    });
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      if ((p as string).endsWith('.result')) return JSON.stringify({ selfAssessment: 'DONE' });
      return '{}';
    });
    await runCommand(['watch', '--follow', '057-001']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Worker finished') })
    );
  });

  it('J) warns when task is from a different sprint', async () => {
    vi.mocked(attachToWorkerPane).mockImplementation(() => {});
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const ps = p as string;
      if (ps.endsWith('task-057-001.json')) return JSON.stringify({ sprintId: 'sprint-050', status: 'DONE', provider: 'claude' });
      if (ps.endsWith('config.json')) return JSON.stringify({ last_sprint_id: 'sprint-057' });
      return '{}';
    });
    await runCommand(['watch', '--follow', '057-001']);
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining('sprint-050')
    );
  });

  it('H) cleanupWatchWindow is exported and callable', () => {
    // Should not throw even when tmux not available
    expect(() => cleanupWatchWindow()).not.toThrow();
  });
});
