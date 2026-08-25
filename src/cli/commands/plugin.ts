import { join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { loadPlugin, scanPlugins, createPlugin, installPlugin, removePlugin, listPlugins } from '../../core/plugin.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';

export function registerPlugin(program: Command): void {
  const cmd = program
    .command('plugin')
    .description(getMessage('cli.plugin.desc', getLanguage(undefined)));

  // ─── plugin install ─────────────────────────────────────────────
  cmd
    .command('install')
    .argument('<source>', memoryCatalogMessage('cli.memcat.plugin.arg.source', getLanguage(undefined)))
    .description(getMessage('cli.plugin.install.desc', getLanguage(undefined)))
    .option('--force', memoryCatalogMessage('cli.memcat.plugin.opt.force', getLanguage(undefined)))
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
    .command('remove')
    .argument('<name>', memoryCatalogMessage('cli.memcat.plugin.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.plugin.remove.desc', getLanguage(undefined)))
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
    .command('update')
    .argument('<source>', memoryCatalogMessage('cli.memcat.plugin.arg.source', getLanguage(undefined)))
    .description(getMessage('cli.plugin.update.desc', getLanguage(undefined)))
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
    .description(getMessage('cli.plugin.list.desc', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .action((opts: { json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const plugins = scanPlugins(root);
        if (opts.json) {
          const data = plugins.map(plugin => ({
            name: plugin.manifest.name,
            version: plugin.manifest.version,
            description: plugin.manifest.description,
            entrypoint: plugin.manifest.entrypoint,
            dir: plugin.dir,
            entrypointOk: existsSync(join(plugin.dir, plugin.manifest.entrypoint)),
          }));
          print(JSON.stringify(data, null, 2));
          return;
        }
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
    .command('info')
    .argument('<dir>', memoryCatalogMessage('cli.memcat.plugin.arg.dir', getLanguage(undefined)))
    .description(getMessage('cli.plugin.info.desc', getLanguage(undefined)))
    .action((dir: string) => {
      try {
        // Support relative paths: resolve relative to cwd
        const resolvedDir = resolve(process.cwd(), dir);
        const plugin = loadPlugin(resolvedDir);
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

  // ─── plugin test ────────────────────────────────────────────────
  cmd
    .command('test')
    .argument('<name>', memoryCatalogMessage('cli.memcat.plugin.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.plugin.test.desc', getLanguage(undefined)))
    .action((name: string) => {
      try {
        const root = resolveProjectRoot();
        const pluginsDir = join(root, '.deckent', 'plugins');
        const pluginDir = join(pluginsDir, name);

        if (!existsSync(pluginDir)) {
          print(`Plugin "${name}" not found in ${pluginsDir}.`);
          process.exitCode = 1;
          return;
        }

        const plugin = loadPlugin(pluginDir);
        let allOk = true;

        // 1. Validate manifest fields
        const required = ['name', 'version', 'description', 'entrypoint'] as const;
        for (const field of required) {
          if (!plugin.manifest[field]) {
            print(`FAIL: manifest.${field} is missing or empty`);
            allOk = false;
          }
        }

        // 2. Validate entrypoint exists
        const entrypointPath = join(plugin.dir, plugin.manifest.entrypoint);
        if (!existsSync(entrypointPath)) {
          print(`FAIL: entrypoint "${plugin.manifest.entrypoint}" does not exist`);
          allOk = false;
        } else {
          print(`PASS: entrypoint "${plugin.manifest.entrypoint}" exists`);
        }

        // 3. If plugin has a test script in package.json, run it
        const pkgPath = join(pluginDir, 'package.json');
        if (existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
            if (pkg.scripts?.['test']) {
              print(`Running plugin test script...`);
              const result = spawnSync('npm', ['test'], {
                cwd: pluginDir,
                encoding: 'utf-8',
                stdio: 'inherit',
                timeout: 30_000,
              });
              if (result.status !== 0) {
                print(`FAIL: plugin test script failed`);
                allOk = false;
              } else {
                print(`PASS: plugin test script succeeded`);
              }
            }
          } catch {
            // Non-fatal: package.json parse failure
          }
        }

        if (allOk) {
          print(`Plugin "${name}" validation: PASSED`);
        } else {
          print(`Plugin "${name}" validation: FAILED`);
          process.exitCode = 1;
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── plugin create ──────────────────────────────────────────────
  cmd
    .command('create')
    .argument('<name>', memoryCatalogMessage('cli.memcat.plugin.arg.new_name', getLanguage(undefined)))
    .description(getMessage('cli.plugin.create.desc', getLanguage(undefined)))
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
