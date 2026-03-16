import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DeckentConfig } from '../../core/types.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { loadConfig, validatePartialConfig, ConfigValidationError } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerConfig(program: Command): void {
  const cmd = program
    .command('config')
    .description('Show or modify project configuration')
    .action(async () => {
      try {
        const config = await loadConfig(resolveProjectRoot());
        print(JSON.stringify(config, null, 2));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      const root = resolveProjectRoot();
      const configPath = join(root, PROJECT_CONFIG_PATH);

      try {
        let existing: Partial<DeckentConfig> = {};
        if (existsSync(configPath)) {
          existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Partial<DeckentConfig>;
        }

        // Parse value: try JSON first, fallback to string
        let parsed: unknown = value;
        try {
          parsed = JSON.parse(value);
        } catch {
          // keep as string
        }

        // Simple top-level keys only
        (existing as Record<string, unknown>)[key] = parsed;

        validatePartialConfig(existing);
        writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
        print(`Set ${key} = ${JSON.stringify(parsed)}`);
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          printError(new Error(`Invalid config: ${error.errors.join(', ')}`));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });
}
