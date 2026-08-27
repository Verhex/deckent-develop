import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerMemory } from '../../../src/cli/commands/memory.js';

describe('memory command surface', () => {
  it('registers recall and remember as canonical memory subcommands', () => {
    const program = new Command();
    registerMemory(program);
    const memory = program.commands.find((command) => command.name() === 'memory');

    expect(memory?.commands.map((command) => command.name())).toContain('recall');
    expect(memory?.commands.map((command) => command.name())).toContain('remember');
  });
});
