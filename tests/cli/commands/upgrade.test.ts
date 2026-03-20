import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerUpgrade } from '../../../src/cli/commands/upgrade.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerUpgrade(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('upgrade command — registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers upgrade command on program', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    expect(cmd).toBeDefined();
  });

  it('upgrade command has a description', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    expect(cmd!.description()).toBeTruthy();
    expect(cmd!.description().length).toBeGreaterThan(0);
  });

  it('upgrade command name is "upgrade"', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    expect(cmd!.name()).toBe('upgrade');
  });
});

describe('upgrade command — version check / self-update message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints a message when upgrade command is run', async () => {
    await runCommand(['upgrade']);
    expect(print).toHaveBeenCalled();
  });

  it('printed message mentions npm', async () => {
    await runCommand(['upgrade']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.toLowerCase().includes('npm'))).toBe(true);
  });

  it('printed message mentions deckent', async () => {
    await runCommand(['upgrade']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.some(msg => msg.toLowerCase().includes('deckent'))).toBe(true);
  });

  it('print is called exactly once', async () => {
    await runCommand(['upgrade']);
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('upgrade command — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('does not set exitCode=1 on normal run', async () => {
    await runCommand(['upgrade']);
    expect(process.exitCode).toBeUndefined();
  });

  it('does not call printError on normal run', async () => {
    await runCommand(['upgrade']);
    expect(printError).not.toHaveBeenCalled();
  });

  it('handles print throwing without crashing the process', async () => {
    vi.mocked(print).mockImplementationOnce(() => { throw new Error('stdout closed'); });
    // Should not throw out of runCommand
    await expect(runCommand(['upgrade'])).resolves.toBeUndefined();
  });
});
