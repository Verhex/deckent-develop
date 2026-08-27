import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerRemember(program: Command): void {
  program.command('remember [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.remember', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'memory');
    if (!target) throw new Error('Replacement command is not registered: memory');
      target = target.commands.find((candidate) => candidate.name() === 'remember');
      if (!target) throw new Error('Replacement command is not registered: remember');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
