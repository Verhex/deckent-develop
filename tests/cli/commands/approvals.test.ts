import { Command } from 'commander';
import { describe, expect, it } from 'vitest';

import { registerApprovalsCommand } from '../../../src/cli/commands/approvals.js';

describe('approvals command registration', () => {
  it('advertises the catalog-backed class filter on list only', () => {
    const program = new Command();
    registerApprovalsCommand(program);

    const approvals = program.commands.find(command => command.name() === 'approvals');
    const list = approvals?.commands.find(command => command.name() === 'list');
    const decide = approvals?.commands.find(command => command.name() === 'decide');

    expect(list?.options.map(option => option.flags)).toContain('--class <name>');
    expect(list?.options.find(option => option.flags === '--class <name>')?.description)
      .toBe('Filter the federated inbox by class');
    expect(decide?.options.map(option => option.flags)).not.toContain('--class <name>');
  });
});
