import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerAttach(program: Command): void {
  program.command('attach [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.attach', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'watch');
    if (!target) throw new Error('Replacement command is not registered: watch');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
