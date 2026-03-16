import type { Command } from 'commander';
import { print } from '../helpers/output.js';

export function registerPlugin(program: Command): void {
  const cmd = program
    .command('plugin')
    .description('Manage plugins');

  cmd
    .command('install <name>')
    .description('Install a plugin')
    .action((name: string) => {
      print(`Plugin system not yet implemented. Cannot install "${name}".`);
    });

  cmd
    .command('list')
    .description('List installed plugins')
    .action(() => {
      print('Plugin system not yet implemented.');
    });
}
