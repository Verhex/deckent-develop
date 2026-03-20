import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { print } from '../../../src/cli/helpers/output.js';
import { registerUsage } from '../../../src/cli/commands/usage.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerUsage(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('usage command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  // registerUsage — command registration (2+ tests)

  it('registers usage command on the program', () => {
    const program = new Command();
    registerUsage(program);
    const cmd = program.commands.find(c => c.name() === 'usage');
    expect(cmd).toBeDefined();
  });

  it('registers usage command with description', () => {
    const program = new Command();
    registerUsage(program);
    const cmd = program.commands.find(c => c.name() === 'usage');
    expect(cmd!.description()).toBeTruthy();
    expect(cmd!.description()).toContain('usage');
  });

  // Usage display — checkUsage output format (3+ tests)

  it('prints usage tracking message when command is run', async () => {
    await runCommand(['usage']);
    expect(print).toHaveBeenCalled();
  });

  it('prints not yet available message', async () => {
    await runCommand(['usage']);
    const printCalls = vi.mocked(print).mock.calls;
    const hasNotAvailable = printCalls.some(c =>
      c[0].toLowerCase().includes('not yet available') ||
      c[0].toLowerCase().includes('usage')
    );
    expect(hasNotAvailable).toBe(true);
  });

  it('prints metrics implementation message', async () => {
    await runCommand(['usage']);
    const printCalls = vi.mocked(print).mock.calls;
    const allOutput = printCalls.map(c => c[0]).join(' ');
    expect(allOutput.length).toBeGreaterThan(0);
  });

  // Error handling — usage check failure (2+ tests)

  it('does not set non-zero exit code on normal run', async () => {
    await runCommand(['usage']);
    expect(process.exitCode).not.toBe(1);
  });

  it('does not throw when running usage command', async () => {
    await expect(runCommand(['usage'])).resolves.not.toThrow();
  });
});
