import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerOutput(program: Command, _deps?: unknown): void {
  program.command('output [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.output', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'watch');
    if (!target) throw new Error('Replacement command is not registered: watch');
    await target.parseAsync(['node', 'deckent', '--logs', ...args], { from: 'node' });
  });
}
