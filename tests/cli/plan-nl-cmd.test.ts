import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn() }));

import { print } from '../../src/cli/helpers/output.js';
import { registerPlanNl } from '../../src/cli/commands/plan-nl.js';

describe('plan-nl command compatibility surface', () => {
  it('accepts arbitrary do arguments and forwards them without legacy planning or writes', async () => {
    const program = new Command();
    const action = vi.fn();
    program.command('do [args...]').allowUnknownOption(true).action(action);
    registerPlanNl(program);

    await program.parseAsync([
      'node', 'test', 'plan-nl', 'ship the widget exporter', '--run', '--force-scope',
    ]);

    expect(action).toHaveBeenCalledWith(
      ['ship the widget exporter', '--run', '--force-scope'],
      expect.anything(),
      expect.anything(),
    );
    expect(print).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
  });

  it('registers only the forwarding alias rather than legacy --write behavior', () => {
    const program = new Command();
    registerPlanNl(program);
    const command = program.commands.find((candidate) => candidate.name() === 'plan-nl');
    expect(command?.options).toHaveLength(0);
    expect(command?.registeredArguments[0]?.required).toBe(false);
    expect(command?.registeredArguments[0]?.variadic).toBe(true);
  });
});
