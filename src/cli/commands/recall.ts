import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerRecall(program: Command): void {
  program.command('recall [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.recall', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'memory');
    if (!target) throw new Error('Replacement command is not registered: memory');
      target = target.commands.find((candidate) => candidate.name() === 'recall');
      if (!target) throw new Error('Replacement command is not registered: recall');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
