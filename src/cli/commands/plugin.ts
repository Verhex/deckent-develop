import { join } from 'node:path';
import type { Command } from 'commander';
import { loadPlugin, scanPlugins, createPlugin } from '../../core/plugin.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

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
      try {
        const root = resolveProjectRoot();
        const plugins = scanPlugins(root);
        if (plugins.length === 0) {
          print('No plugins installed.');
          return;
        }
        print(`${plugins.length} plugin(s) installed:`);
        for (const plugin of plugins) {
          print(`  ${plugin.manifest.name}@${plugin.manifest.version} — ${plugin.manifest.description}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('info <dir>')
    .description('Show plugin info')
    .action((dir: string) => {
      try {
        const plugin = loadPlugin(dir);
        print(`Name: ${plugin.manifest.name}`);
        print(`Version: ${plugin.manifest.version}`);
        print(`Description: ${plugin.manifest.description}`);
        print(`Entrypoint: ${plugin.manifest.entrypoint}`);
        print(`Directory: ${plugin.dir}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('create <name>')
    .description('Create a new plugin scaffold')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const pluginsDir = join(root, '.deckent', 'plugins');
        const plugin = await createPlugin(name, pluginsDir);
        print(`Plugin "${name}" created at ${plugin.dir}`);
        print(`  - manifest.json`);
        print(`  - SKILL.md`);
        print(`  - README.md`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
