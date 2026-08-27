import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
export { findLatestSprintLog, parseSprintLog, parseSprintNumber, parseRetroLearnings, extractGoalFromDirectives, extractGoalFromSprintLog, buildExplainOutput, formatDuration } from './retro.js';

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerExplain(program: Command): void {
  program.command('explain [args...]').allowUnknownOption(true)
    // MCP cli-shared description-bağı bu anahtarı okur (parity-gate 702-005 bulgusu).
    .description(getMessage('cli.explain.desc', getLanguage(undefined))).action(async (args: string[]) => {
    print(getMessage('cli.batch.deprecated.explain', getLanguage(undefined)));
    let target = program.commands.find((candidate) => candidate.name() === 'retro');
    if (!target) throw new Error('Replacement command is not registered: retro');
    await target.parseAsync(['node', 'deckent', '--explain', ...args], { from: 'node' });
  });
}
