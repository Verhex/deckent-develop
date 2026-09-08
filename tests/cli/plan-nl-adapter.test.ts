import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';

vi.mock('../../src/cli/helpers/output.js', () => ({ print: vi.fn() }));

import { print } from '../../src/cli/helpers/output.js';
import { registerPlanNl } from '../../src/cli/commands/plan-nl.js';

describe('plan-nl deprecated forwarding alias', () => {
  it('forwards goal and execution flags unchanged to the canonical do command', async () => {
    const program = new Command();
    const received = vi.fn();
    program.command('do <goal>')
      .allowUnknownOption(true)
      .option('--run')
      .option('--yes')
      .action((goal, options) => received(goal, options.run, options.yes));
    registerPlanNl(program);

    await program.parseAsync([
      'node', 'test', 'plan-nl', 'ship the widget exporter', '--run', '--yes',
    ]);

    expect(received).toHaveBeenCalledWith('ship the widget exporter', true, true);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
  });

  it('fails honestly when the replacement command is not registered', async () => {
    const program = new Command();
    registerPlanNl(program);
    await expect(program.parseAsync(['node', 'test', 'plan-nl', 'goal']))
      .rejects.toThrow('Replacement command is not registered: do');
  });
});
