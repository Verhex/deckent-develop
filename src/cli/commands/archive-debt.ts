import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerArchiveDebt(program: Command): void {
  program.command('archive-debt [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.archive_debt', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'status');
    if (!target) throw new Error('Replacement command is not registered: status');
    await target.parseAsync(['node', 'deckent', '--debt', ...args], { from: 'node' });
  });
}
