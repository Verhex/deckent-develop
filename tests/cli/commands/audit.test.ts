import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerAudit } from '../../../src/cli/commands/audit.js';

describe('audit command surface', () => {
  it('registers the canonical verify subcommand with its JSON output option', () => {
    const program = new Command();
    registerAudit(program);
    const audit = program.commands.find((command) => command.name() === 'audit');
    const verify = audit?.commands.find((command) => command.name() === 'verify');

    expect(verify).toBeDefined();
    expect(verify?.options.some((option) => option.long === '--json')).toBe(true);
  });
});
