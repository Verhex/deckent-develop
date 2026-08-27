import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerCheckpoint(program: Command): void {
  program.command('checkpoint [args...]').allowUnknownOption(true)
    // MCP cli-shared description-bağı bu anahtarı okur (parity-gate 702-005 bulgusu).
    .description(getMessage('cli.checkpoint.desc', getLanguage(undefined))).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.checkpoint', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'approvals');
    if (!target) throw new Error('Replacement command is not registered: approvals');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
