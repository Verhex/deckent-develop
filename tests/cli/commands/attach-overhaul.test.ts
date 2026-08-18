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
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn((key: string) => `msg:${key}`),
  getLanguage: () => 'en',
  resolveLanguage: () => 'en',
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: 'w-001: w-001\nwatch: watch\n', stderr: '' }),
}));

import { isSessionActive, attach } from '../../../src/orchestra/tmux.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerAttach } from '../../../src/cli/commands/attach.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerAttach(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride may throw
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('attach command — overhaul', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    delete process.env['TMUX'];
  });
  afterEach(() => {
    process.exitCode = undefined;
    delete process.env['TMUX'];
  });

  it('registers attach command', () => {
    const program = new Command();
    registerAttach(program);
    expect(program.commands.find(c => c.name() === 'attach')).toBeDefined();
  });

  it('F) --list shows windows when session active', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    await runCommand(['attach', '--list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Deckent tmux windows'));
  });

  it('F) --list shows "No active session" when session inactive', async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['attach', '--list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No active'));
  });

  it('F) --list does not call attach()', async () => {
    vi.mocked(isSessionActive).mockReturnValue(true);
    await runCommand(['attach', '--list']);
    expect(attach).not.toHaveBeenCalled();
  });

  it('G) warns about nested tmux when TMUX env is set', async () => {
    process.env['TMUX'] = '/tmp/tmux-1000/default,123,0';
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('nested tmux'));
  });

  it('G) does not warn about nested tmux when TMUX env is not set', async () => {
    delete process.env['TMUX'];
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0] as string);
    const hasNestedWarning = calls.some(msg => msg.includes('nested'));
    expect(hasNestedWarning).toBe(false);
  });

  it('still attaches after nested tmux warning', async () => {
    process.env['TMUX'] = '/tmp/tmux-1000/default,123,0';
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attach).mockImplementation(() => {});
    await runCommand(['attach']);
    expect(attach).toHaveBeenCalled();
  });

  it('sets exitCode=1 when no session and not --list', async () => {
    vi.mocked(isSessionActive).mockReturnValue(false);
    await runCommand(['attach']);
    expect(process.exitCode).toBe(1);
    expect(printError).toHaveBeenCalled();
  });
});
