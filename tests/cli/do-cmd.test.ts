import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn() }));

import { printError } from '../../src/cli/helpers/output.js';
import { registerDo } from '../../src/cli/commands/do.js';

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDo(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit.
  }
}

describe('do command contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('registers the canonical planning and execution options', () => {
    const program = new Command();
    registerDo(program);
    const cmd = program.commands.find((candidate) => candidate.name() === 'do');
    expect(cmd).toBeDefined();
    expect(cmd!.options.map((option) => option.long)).toEqual(expect.arrayContaining([
      '--run', '--yes', '--force-scope', '--write-allowlist',
    ]));
    expect(cmd!.registeredArguments[0]!.required).toBe(true);
  });

  it('rejects whitespace-only goals through the localized catalog before planning', async () => {
    await runCommand(['do', '   ']);
    expect(printError).toHaveBeenCalledWith('do: goal must not be empty');
    expect(process.exitCode).toBe(1);
  });
});
