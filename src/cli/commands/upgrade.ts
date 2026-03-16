import type { Command } from 'commander';
import { print } from '../helpers/output.js';

export function registerUpgrade(program: Command): void {
  program
    .command('upgrade')
    .description('Self-update deckent')
    .action(() => {
      print('Self-update not yet implemented. Use: npm update -g deckent');
    });
}
