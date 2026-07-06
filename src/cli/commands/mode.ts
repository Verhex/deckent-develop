import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DeckentConfig } from '../../core/types.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { loadConfig, saveGlobalConfig, loadGlobalConfig } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

const VALID_STYLES = ['sprint', 'task', 'process'] as const;
type DeckentStyle = (typeof VALID_STYLES)[number];

function isValidStyle(value: string): value is DeckentStyle {
  return (VALID_STYLES as readonly string[]).includes(value);
}

/**
 * Read project config JSON (raw, no merge).
 */
function readProjectConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Write a key to project config JSON.
 */
function setProjectConfigValue(configPath: string, key: string, value: unknown): void {
  const config = readProjectConfig(configPath);
  config[key] = value;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}


/**
 * RUN-RENAME dilim-1 (Alperen 2026-07-06, ADR-G-024 MODE-RENAME): display-only
 * bridge — the stored style value stays 'sprint' (enum untouched, backward-
 * compatible); every human surface presents it as "run (sprint)" during the
 * transition. Pure + exported for tests and other surfaces.
 */
export function bridgeStyleLabel(style: string): string {
  return style === 'sprint' ? 'run (sprint)' : style;
}

export function registerMode(program: Command): void {
  const lang = getLanguage(undefined);

  const mode = program
    .command('mode')
    .description(getMessage('mode.group_desc', lang))
    .addHelpText('after', `\n${getMessage('mode.rename_note', lang)}\n`);

  mode
    .command('show')
    .description(getMessage('mode.show_desc', lang))
    .action(async () => {
      try {
        const root = resolveProjectRoot();
        const config = await loadConfig(root);
        const style = (config as unknown as Record<string, unknown>).deckent_style ?? 'sprint';
        print(`Current: ${style}`);
        // RUN-RENAME bridge line (display-only; the pinned line above is unchanged).
        const bridged = bridgeStyleLabel(String(style));
        if (bridged !== String(style)) print(`Bridge: ${bridged}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  mode
    .command('sprint')
    .description(getMessage('mode.sprint_desc', lang))
    .action(async () => {
      try {
        const root = resolveProjectRoot();
        const configPath = join(root, PROJECT_CONFIG_PATH);
        setProjectConfigValue(configPath, 'deckent_style', 'sprint');
        print('\u2713 Switched to sprint mode (project override)');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  mode
    .command('run')
    .description(getMessage('mode.run_desc', lang))
    .action(async () => {
      try {
        const root = resolveProjectRoot();
        const configPath = join(root, PROJECT_CONFIG_PATH);
        // Write-time alias: 'run' maps to the stored 'sprint' value (enum untouched).
        setProjectConfigValue(configPath, 'deckent_style', 'sprint');
        print(getMessage('mode.run_switched', lang));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  mode
    .command('task')
    .description(getMessage('mode.task_desc', lang))
    .action(async () => {
      try {
        const root = resolveProjectRoot();
        const configPath = join(root, PROJECT_CONFIG_PATH);
        setProjectConfigValue(configPath, 'deckent_style', 'task');
        print('\u2713 Switched to task mode (project override)');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  mode
    .command('process')
    .description(getMessage('mode.process_desc', lang))
    .action(async () => {
      try {
        const root = resolveProjectRoot();
        const configPath = join(root, PROJECT_CONFIG_PATH);
        setProjectConfigValue(configPath, 'deckent_style', 'process');
        print('\u2713 Switched to process mode (project override)');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  mode
    .command('auto')
    .description(getMessage('mode.auto_desc', lang))
    .action(async () => {
      try {
        const root = resolveProjectRoot();
        const hasGitRepo = existsSync(join(root, '.git'));
        const hasDirectives = existsSync(join(root, 'DIRECTIVES.md'));
        const inferredStyle: DeckentStyle = (hasGitRepo && hasDirectives) ? 'sprint' : 'task';
        const configPath = join(root, PROJECT_CONFIG_PATH);
        setProjectConfigValue(configPath, 'deckent_style', inferredStyle);
        print(`\u2713 Auto-detected: ${inferredStyle} (git=${hasGitRepo}, directives=${hasDirectives})`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  mode
    .command('global <style>')
    .description(getMessage('mode.global_desc', lang))
    .action(async (style: string) => {
      try {
        if (!isValidStyle(style)) {
          printError(new Error(`Invalid style: "${style}". Must be "sprint" or "task".`));
          process.exitCode = 1;
          return;
        }
        const existing = (await loadGlobalConfig()) ?? {};
        (existing as Record<string, unknown>).deckent_style = style;
        await saveGlobalConfig(existing as Partial<DeckentConfig>);
        print(`\u2713 Global default set: ${style}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
