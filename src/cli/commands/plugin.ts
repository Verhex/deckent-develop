import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import { loadPlugin, scanPlugins, createPlugin, installPlugin, removePlugin, listPlugins } from '../../core/plugin.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerPlugin(program: Command): void {
  const cmd = program
    .command('plugin')
    .description('Manage plugins');

  // ─── plugin install ─────────────────────────────────────────────
  cmd
    .command('install <source>')
    .description('Install a plugin from npm, git URL, or local path')
    .option('--force', 'Overwrite existing plugin')
    .action(async (source: string, _opts: { force?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const pluginsDir = join(root, '.deckent', 'plugins');
        // installPlugin handles conflict detection internally (throws PluginError if already installed)
        const plugin = await installPlugin(source, pluginsDir);
        print(`Plugin "${plugin.manifest.name}@${plugin.manifest.version}" installed successfully.`);
        print(`  Location: ${plugin.dir}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── plugin remove ──────────────────────────────────────────────
  cmd
    .command('remove <name>')
    .description('Remove an installed plugin')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const pluginsDir = join(root, '.deckent', 'plugins');
        const removed = removePlugin(name, pluginsDir);
        if (!removed) {
          print(`Plugin "${name}" not found.`);
          process.exitCode = 1;
          return;
        }
        print(`Plugin "${name}" removed.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── plugin update ──────────────────────────────────────────────
  cmd
    .command('update <source>')
    .description('Update a plugin (remove existing and re-install from source)')
    .action(async (source: string) => {
      try {
        const root = resolveProjectRoot();
        const pluginsDir = join(root, '.deckent', 'plugins');

        // Install with force (removes existing first via installPlugin internals)
        const plugin = await installPlugin(source, pluginsDir);
        print(`Plugin "${plugin.manifest.name}@${plugin.manifest.version}" updated successfully.`);
        print(`  Location: ${plugin.dir}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── plugin list ────────────────────────────────────────────────
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
          // Entrypoint validation: warn if entrypoint file is missing
          const entrypointPath = join(plugin.dir, plugin.manifest.entrypoint);
          const entrypointOk = existsSync(entrypointPath);
          const statusBadge = entrypointOk ? '' : ' [WARNING: entrypoint missing]';
          print(`  ${plugin.manifest.name}@${plugin.manifest.version} — ${plugin.manifest.description}${statusBadge}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── plugin info ────────────────────────────────────────────────
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

        // Entrypoint validation
        const entrypointPath = join(plugin.dir, plugin.manifest.entrypoint);
        if (!existsSync(entrypointPath)) {
          print(`WARNING: Entrypoint file "${plugin.manifest.entrypoint}" does not exist at ${entrypointPath}`);
        } else {
          print(`Entrypoint: OK`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── plugin create ──────────────────────────────────────────────
  cmd
    .command('create <name>')
    .description('Create a new plugin scaffold')
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const pluginsDir = join(root, '.deckent', 'plugins');

        // Conflict detection: check if plugin directory already exists
        const pluginDir = join(pluginsDir, name);
        if (existsSync(pluginDir)) {
          const existing = listPlugins(pluginsDir);
          const conflict = existing.find(p => p.manifest.name === name);
          print(`Plugin "${name}" is already installed${conflict ? ` at ${conflict.dir}` : ''}.`);
          process.exitCode = 1;
          return;
        }

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
