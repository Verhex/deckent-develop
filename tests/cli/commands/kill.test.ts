import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
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

vi.mock('../../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

import { killWorker, TmuxError } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { loadConfig } from '../../../src/core/config.js';
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

// ─── Tests ───────────────────────────────────────────────────────────

describe('kill command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en' } as any);
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers kill command with taskId argument', () => {
    const program = new Command();
    registerKill(program);
    const cmd = program.commands.find(c => c.name() === 'kill');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('Kill a running worker');
  });

  it('requires taskId argument (or --all flag)', async () => {
    await runCommand(['kill']);
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('taskId is required'),
    }));
    expect(process.exitCode).toBe(1);
  });

  it('calls killWorker with the provided taskId', async () => {
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '024-005']);
    expect(killWorker).toHaveBeenCalledWith('024-005');
  });

  it('prints success message when worker is killed', async () => {
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '024-005']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('024-005'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('killed'));
  });

  it('handles TmuxError with custom message and exitCode=1', async () => {
    vi.mocked(killWorker).mockImplementation(() => {
      throw new TmuxError('no such pane');
    });
    await runCommand(['kill', '024-005']);
    expect(printError).toHaveBeenCalled();
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('not found'),
    }));
    expect(process.exitCode).toBe(1);
  });

  it('does not set exitCode when worker is successfully killed', async () => {
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '024-005']);
    expect(process.exitCode).toBeUndefined();
  });

  it('rethrows non-TmuxError exceptions', async () => {
    vi.mocked(killWorker).mockImplementation(() => {
      throw new Error('permission denied');
    });
    let caught: any = null;
    try {
      const program = new Command();
      program.exitOverride();
      registerKill(program);
      await program.parseAsync(['node', 'test', 'kill', '024-005']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toContain('permission denied');
  });

  it('passes correct taskId format to killWorker', async () => {
    vi.mocked(killWorker).mockImplementation(() => {});
    const taskId = '001-042';
    await runCommand(['kill', taskId]);
    expect(killWorker).toHaveBeenCalledWith(taskId);
  });

  it('uses English success message when language is en', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en' } as any);
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '001-001']);
    expect(print).toHaveBeenCalledWith('Worker for task 001-001 killed.');
  });

  it('uses Turkish success message when language is tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'tr' } as any);
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '001-001']);
    expect(print).toHaveBeenCalledWith('001-001 görevi için worker durduruldu.');
  });

  it('uses English not-found message when language is en', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en' } as any);
    vi.mocked(killWorker).mockImplementation(() => {
      throw new TmuxError('no such pane');
    });
    await runCommand(['kill', '001-001']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Worker not found: 001-001' })
    );
  });

  it('uses Turkish not-found message when language is tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'tr' } as any);
    vi.mocked(killWorker).mockImplementation(() => {
      throw new TmuxError('no such pane');
    });
    await runCommand(['kill', '001-001']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Worker bulunamadı: 001-001' })
    );
  });

  it('falls back to English when config load fails', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config error'));
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '001-001']);
    expect(print).toHaveBeenCalledWith('Worker for task 001-001 killed.');
  });

  it('calls loadConfig with project root', async () => {
    vi.mocked(killWorker).mockImplementation(() => {});
    await runCommand(['kill', '001-001']);
    expect(loadConfig).toHaveBeenCalledWith('/mock/root');
  });
});
