import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerAutonomousMission(program: Command): void {
  program.command('autonomous-mission [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.autonomous_mission', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'autonomous');
    if (!target) throw new Error('Replacement command is not registered: autonomous');
      target = target.commands.find((candidate) => candidate.name() === 'mission');
      if (!target) throw new Error('Replacement command is not registered: mission');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
