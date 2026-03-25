import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

import { ensureDeckentImport } from '../../src/core/utils.js';

describe('CLI: deckent sync', () => {
  let program: Command;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    program = new Command();
    program.exitOverride();

    const { registerSync } = await import('../../src/cli/commands/sync.js');
    registerSync(program);
  });

  it('errors when DECKENT.md does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(process.exitCode).toBe(1);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('calls ensureDeckentImport for CLAUDE.md and AGENTS.md when DECKENT.md exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: 'true\n', stderr: '', pid: 1, output: [], signal: null,
    });

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'));
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
  });

  it('does not set error exitCode when DECKENT.md exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: 'true\n', stderr: '', pid: 1, output: [], signal: null,
    });

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(process.exitCode).toBeUndefined();
  });
});
