import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

export function buildPlanNlIntent(goal: string): import('../../orchestra/directives-builder.js').DirectiveBuildIntent {
  return { goal } as import('../../orchestra/directives-builder.js').DirectiveBuildIntent;
}

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerPlanNl(program: Command): void {
  program.command('plan-nl [args...]').allowUnknownOption(true).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.plan_nl', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'do');
    if (!target) throw new Error('Replacement command is not registered: do');
    await target.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  });
}
