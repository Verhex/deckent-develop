import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerLimits } from '../../../src/cli/commands/limits.js';

describe('limits command contract', () => {
  it('registers every catalog-backed provider filter', () => {
    const program = new Command();
    registerLimits(program);
    const command = program.commands.find((entry) => entry.name() === 'limits');
    expect(command?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(['--claude', '--codex', '--cursor']),
    );
  });
});
