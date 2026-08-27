import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerConfirmationsCommand(program: Command): void {
  program.command('confirmations [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.confirmations', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'approvals');
    if (!target) throw new Error('Replacement command is not registered: approvals');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
