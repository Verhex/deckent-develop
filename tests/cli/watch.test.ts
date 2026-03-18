import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { existsSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn(),
  createWatchLayout: vi.fn(),
  attachToWorkerPane: vi.fn(),
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn(),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  sendKeys: vi.fn(),
  TmuxError: class TmuxError extends Error {
    command?: string;
    constructor(message: string, command?: string) {
      super(message);
      this.name = 'TmuxError';
      this.command = command;
    }
  },
}));

import { isSessionActive, createWatchLayout, attachToWorkerPane, TmuxError } from '../../src/orchestra/tmux.js';

describe('CLI: deckent watch', () => {
  let program: Command;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    program = new Command();
    program.exitOverride();

    const { registerWatch } = await import('../../src/cli/commands/watch.js');
    registerWatch(program);
  });

  it('errors when no active sprint (.dashboard missing)', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await program.parseAsync(['node', 'deckent', 'watch']);

    expect(process.exitCode).toBe(1);
    expect(createWatchLayout).not.toHaveBeenCalled();
  });

  it('errors when no tmux session', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isSessionActive).mockReturnValue(false);

    await program.parseAsync(['node', 'deckent', 'watch']);

    expect(process.exitCode).toBe(1);
    expect(createWatchLayout).not.toHaveBeenCalled();
  });

  it('creates watch layout when sprint is active', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isSessionActive).mockReturnValue(true);

    await program.parseAsync(['node', 'deckent', 'watch']);

    expect(createWatchLayout).toHaveBeenCalledWith(expect.any(String));
    expect(process.exitCode).toBeUndefined();
  });

  it('attaches to specific worker with --follow', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isSessionActive).mockReturnValue(true);

    await program.parseAsync(['node', 'deckent', 'watch', '--follow', '016-001']);

    expect(attachToWorkerPane).toHaveBeenCalledWith('016-001');
    expect(createWatchLayout).not.toHaveBeenCalled();
  });

  it('handles TmuxError from attachToWorkerPane gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(attachToWorkerPane).mockImplementation(() => {
      throw new TmuxError('Worker window w-999-001 not found');
    });

    await program.parseAsync(['node', 'deckent', 'watch', '--follow', '999-001']);

    expect(process.exitCode).toBe(1);
  });

  it('re-throws non-TmuxError errors', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(isSessionActive).mockReturnValue(true);
    vi.mocked(createWatchLayout).mockImplementation(() => {
      throw new TypeError('unexpected');
    });

    await expect(
      program.parseAsync(['node', 'deckent', 'watch']),
    ).rejects.toThrow('unexpected');
  });
});
