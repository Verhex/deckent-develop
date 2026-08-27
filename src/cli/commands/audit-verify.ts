import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerAuditVerify(program: Command): void {
  program.command('audit-verify [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.audit_verify', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'audit');
    if (!target) throw new Error('Replacement command is not registered: audit');
      target = target.commands.find((candidate) => candidate.name() === 'verify');
      if (!target) throw new Error('Replacement command is not registered: verify');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
