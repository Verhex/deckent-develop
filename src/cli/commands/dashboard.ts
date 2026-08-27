import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerDashboard(program: Command): void {
  program.command('dashboard [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.dashboard', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'status');
    if (!target) throw new Error('Replacement command is not registered: status');
    await target.parseAsync(['node', 'deckent', '--watch', ...args], { from: 'node' });
  });
}
