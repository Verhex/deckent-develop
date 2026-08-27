import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerAutonomous } from '../../../src/cli/commands/autonomous.js';

describe('autonomous command surface', () => {
  it('registers mission as a canonical autonomous subcommand', () => {
    const program = new Command();
    registerAutonomous(program);
    const autonomous = program.commands.find((command) => command.name() === 'autonomous');
    const mission = autonomous?.commands.find((command) => command.name() === 'mission');

    expect(mission).toBeDefined();
    expect(mission?.commands.some((command) => command.name() === 'create-list')).toBe(true);
  });
});
