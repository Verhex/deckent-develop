import type { Command } from 'commander';
import { print } from '../helpers/output.js';

export function registerOnboard(program: Command): void {
  program
    .command('onboard')
    .description('Run the onboarding wizard')
    .action(() => {
      print('Onboarding wizard not yet implemented. Use: deckent init');
    });
}
