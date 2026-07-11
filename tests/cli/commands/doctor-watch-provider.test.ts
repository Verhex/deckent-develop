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

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  spawn: vi.fn().mockReturnValue({ on: vi.fn() }),
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
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

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/constants.js', () => ({
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  DASHBOARD_FILE: '.dashboard',
  TASKS_DIR: '.tasks',
}));

// R4-SPRINTID (Sprint 318): watch.ts resolves current sprint via canonical
// core/event-stream.getCurrentSprintId. Mock it (default null = no stale-sprint
// warning) so --follow attach path is exercised cleanly.
vi.mock('../../../src/core/event-stream.js', () => ({
  getCurrentSprintId: vi.fn(() => null),
}));

import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { attachToWorkerPane } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import {
  registerWatch,
  getTaskProvider,
  watchSubprocessLog,
} from '../../../src/cli/commands/watch.js';

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

describe('watch — subprocess log viewer (B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}');
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('getTaskProvider returns "claude" when task file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const provider = getTaskProvider('/mock/root', '059-001');
    expect(provider).toBe('claude');
  });

  it('getTaskProvider returns provider from task JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ provider: 'codex' }));
    const provider = getTaskProvider('/mock/root', '059-002');
    expect(provider).toBe('codex');
  });

  it('getTaskProvider returns "claude" as fallback when provider missing in task JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ model: 'sonnet' }));
    const provider = getTaskProvider('/mock/root', '059-003');
    expect(provider).toBe('claude');
  });

  it('getTaskProvider returns "gemini" when task uses gemini', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ provider: 'gemini' }));
    const provider = getTaskProvider('/mock/root', '059-004');
    expect(provider).toBe('gemini');
  });

  it('watchSubprocessLog shows "not found" message when log file missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    watchSubprocessLog('/mock/root', '059-005');
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('not found')
    );
  });

  it('watchSubprocessLog spawns tail -f on log file when it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    watchSubprocessLog('/mock/root', '059-006');
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'tail',
      expect.arrayContaining(['-f', expect.stringContaining('task-059-006.log')]),
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('watchSubprocessLog prints tailing message before spawning', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    watchSubprocessLog('/mock/root', '059-007');
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('task-059-007.log')
    );
  });

  it('--follow uses subprocess log viewer for codex provider task', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const ps = p as string;
      if (ps.includes('task-059-008.json')) return JSON.stringify({ provider: 'codex', sprintId: 'sprint-059' });
      if (ps.includes('config.json')) return JSON.stringify({ last_sprint_id: 'sprint-059' });
      return '{}';
    });
    await runCommand(['watch', '--follow', '059-008']);
    // Should not call attachToWorkerPane (tmux) for codex provider
    expect(vi.mocked(attachToWorkerPane)).not.toHaveBeenCalled();
  });

  it('--follow uses tmux attachToWorkerPane for claude provider task', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const ps = p as string;
      if (ps.includes('task-059-009.json')) return JSON.stringify({ provider: 'claude', sprintId: 'sprint-059' });
      if (ps.includes('config.json')) return JSON.stringify({ last_sprint_id: 'sprint-059' });
      return '{}';
    });
    await runCommand(['watch', '--follow', '059-009']);
    expect(vi.mocked(attachToWorkerPane)).toHaveBeenCalledWith('059-009');
  });

  it('--follow uses subprocess log viewer for gemini provider task', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const ps = p as string;
      if (ps.includes('task-059-010.json')) return JSON.stringify({ provider: 'gemini', sprintId: 'sprint-059' });
      if (ps.includes('config.json')) return JSON.stringify({ last_sprint_id: 'sprint-059' });
      return '{}';
    });
    await runCommand(['watch', '--follow', '059-010']);
    expect(vi.mocked(attachToWorkerPane)).not.toHaveBeenCalled();
  });

  it('watchSubprocessLog handles spawn error gracefully', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const mockOn = vi.fn((event: string, cb: (err: Error) => void) => {
      if (event === 'error') cb(new Error('tail not found'));
    });
    vi.mocked(spawn).mockReturnValue({ on: mockOn } as unknown as ReturnType<typeof spawn>);
    watchSubprocessLog('/mock/root', '059-011');
    expect(vi.mocked(printError)).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('tail not found') })
    );
  });
});

describe('doctor — provider-aware tmux check integration', () => {
  it('checkTmux is exported and respects provider list', async () => {
    const { checkTmux } = await import('../../../src/cli/commands/doctor.js');
    // When provider list has only non-claude providers, tmux is optional
    const { spawnSync } = await import('node:child_process');
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkTmux(['codex']);
    expect(check.required).toBe(false);
    expect(check.passed).toBe(false);
  });

  it('tmux required when no providers given (default)', async () => {
    const { checkTmux } = await import('../../../src/cli/commands/doctor.js');
    const { spawnSync } = await import('node:child_process');
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    const check = checkTmux();
    expect(check.required).toBe(true);
  });
});
