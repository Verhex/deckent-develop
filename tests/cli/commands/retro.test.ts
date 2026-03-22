import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, existsSync } from 'node:fs';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerRetro } from '../../../src/cli/commands/retro.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRetro(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('retro command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers retro command', () => {
    const program = new Command();
    registerRetro(program);
    const cmd = program.commands.find(c => c.name() === 'retro');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('retrospective');
  });

  it('prints message when retrospective file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No retrospective found'));
  });

  it('prints retrospective content when file exists and has content', async () => {
    const content = '## Sprint 001\n- Task completed\n- Results: DONE';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(content);
    await runCommand(['retro']);
    // Now shows rich summary by default (use --raw for original content)
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Sprint Retrospective'));
  });

  it('prints raw content with --raw flag', async () => {
    const content = '## Sprint 001\n- Task completed\n- Results: DONE';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(content);
    await runCommand(['retro', '--raw']);
    expect(print).toHaveBeenCalledWith(content);
  });

  it('prints empty file message when file exists but is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith('Retrospective file is empty.');
  });

  it('prints empty file message when file contains only whitespace', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('   \n  \n  ');
    await runCommand(['retro']);
    expect(print).toHaveBeenCalledWith('Retrospective file is empty.');
  });

  it('resolves project root and constructs correct path', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['retro']);
    expect(existsSync).toHaveBeenCalledWith(expect.stringContaining('/mock/root'));
  });

  it('does not exit with error code on success', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('## Retro');
    await runCommand(['retro']);
    expect(process.exitCode).not.toBe(1);
  });
});
