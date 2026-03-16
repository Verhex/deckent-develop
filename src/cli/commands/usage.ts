import type { Command } from 'commander';
import { print } from '../helpers/output.js';

export function registerUsage(program: Command): void {
  program
    .command('usage')
    .description('Show usage metrics')
    .action(() => {
      print('Usage tracking not yet available.');
      print('Metrics will be displayed here once sprint telemetry is implemented.');
    });
}
