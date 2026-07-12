import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  attach: vi.fn(),
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

import { isSessionActive, attach, TmuxError } from '../../../src/orchestra/tmux.js';
import { printError } from '../../../src/cli/helpers/output.js';
import { loadConfig } from '../../../src/core/config.js';
import { registerAttach } from '../../../src/cli/commands/attach.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerAttach(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('attach command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en' } as any);
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers attach command on program', () => {
    const program = new Command();
    registerAttach(program);
    const cmd = program.commands.find(c => c.name() === 'attach');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('Attach to the tmux');
  });

  it('calls attach() when session is active', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    expect(isSessionActive).toHaveBeenCalled();
    expect(attach).toHaveBeenCalled();
  });

  it('checks if session is active before attaching', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    expect(isSessionActive).toHaveBeenCalledBefore(vi.mocked(attach) as any);
  });

  it('prints error and sets exitCode=1 when no session is active', async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['attach']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('handles TmuxError with error message and exitCode=1', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    const tmuxError = new TmuxError('tmux session lost');
    vi.mocked(attach).mockImplementation(() => { throw tmuxError; });
    await runCommand(['attach']);
    expect(printError).toHaveBeenCalledWith(tmuxError);
    expect(process.exitCode).toBe(1);
  });

  it('rethrows non-TmuxError exceptions', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    const genericError = new Error('generic error');
    vi.mocked(attach).mockImplementation(() => { throw genericError; });
    let caught: any = null;
    try {
      const program = new Command();
      program.exitOverride();
      registerAttach(program);
      await program.parseAsync(['node', 'test', 'attach']);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
  });

  it('does not set exitCode when attach succeeds', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    expect(process.exitCode).toBeUndefined();
  });

  it('shows English no-session message when language is en', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'en' } as any);
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['attach']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No active session. Run `deckent start` first.' })
    );
  });

  it('shows Turkish no-session message when language is tr', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ language: 'tr' } as any);
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['attach']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Aktif oturum yok. Önce `deckent start` çalıştırın.' })
    );
  });

  it('falls back to English when config load fails', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('config error'));
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['attach']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'No active session. Run `deckent start` first.' })
    );
  });

  it('calls loadConfig with project root', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    expect(loadConfig).toHaveBeenCalledWith('/mock/root');
  });
});
