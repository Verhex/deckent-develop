import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DeckentConfig } from '../../core/types.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { loadConfig, validatePartialConfig, ConfigValidationError, deepMerge, CONFIG_METADATA, listConfigByCategory } from '../../core/config.js';
import { migrateConfig, setNestedValue, getNestedValue } from '../../core/config-migration.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { ErrorRegistry } from '../../core/errors.js';

/**
 * Strip JSON comments (block and line) from a string.
 */
function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/**
 * Export a config file's content. Strips comments and validates JSON.
 * If outputFile is given, writes to that file; otherwise prints to stdout.
 */
export function exportConfig(configPath: string, outputFile?: string): void {
  if (!existsSync(configPath)) {
    throw ErrorRegistry.createError('DECKENT_E020', { message: 'Config file not found: ' + configPath });
  }
  const raw = readFileSync(configPath, 'utf-8');
  const stripped = stripJsonComments(raw);
  // Validate that it's valid JSON
  JSON.parse(stripped);
  if (outputFile) {
    writeFileSync(outputFile, stripped);
  } else {
    print(stripped);
  }
}

/**
 * Import config from a JSON file, merging over existing config.
 * Supports JSON with comments (strips them before parsing).
 */
export function importConfig(importPath: string, configPath: string): void {
  if (!existsSync(importPath)) {
    throw ErrorRegistry.createError('DECKENT_E021', { message: 'Import file not found: ' + importPath });
  }
  const raw = readFileSync(importPath, 'utf-8');
  let importData: Record<string, unknown>;
  try {
    importData = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
  } catch {
    throw ErrorRegistry.createError('DECKENT_E022', { message: 'Invalid JSON in import file: ' + importPath });
  }
  validatePartialConfig(importData);

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      // Malformed existing config — start fresh
    }
  }

  const merged = deepMerge(existing, importData) as Record<string, unknown>;
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
}

export function registerConfig(program: Command): void {
  const cmd = program
    .command('config')
    .description('Show or modify project configuration')
    .option('--raw', 'Show raw project config without merging defaults')
    .action(async (opts: { raw?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const configPath = join(root, PROJECT_CONFIG_PATH);
        if (opts.raw) {
          if (!existsSync(configPath)) {
            print('{}');
            return;
          }
          const raw = readFileSync(configPath, 'utf-8');
          print(raw.trim());
        } else {
          // Auto-migrate project config before loading
          if (existsSync(configPath)) {
            try {
              const rawConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
              const { needsMigration: checkNeeds, migrateConfig: runMigrate } = await import('../../core/config-migration.js');
              if (checkNeeds(rawConfig)) {
                runMigrate(configPath, { dryRun: false });
              }
            } catch {
              // Auto-migration failure is non-fatal
            }
          }
          const config = await loadConfig(root);
          print(JSON.stringify(config, null, 2));
        }
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

        if (key.includes('.')) {
          setNestedValue(existing as Record<string, unknown>, key, parsed);
        } else {
          (existing as Record<string, unknown>)[key] = parsed;
        }

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

  cmd
    .command('get <key>')
    .description('Get a configuration value by key (supports dot notation)')
    .action(async (key: string) => {
      const root = resolveProjectRoot();
      try {
        const config = await loadConfig(root);
        const value = getNestedValue(config as unknown as Record<string, unknown>, key);
        if (value === undefined) {
          printError(new Error(`Key not found: ${key}`));
          process.exitCode = 1;
          return;
        }
        print(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('export [file]')
    .description('Export config to stdout or a file')
    .action((file?: string) => {
      const root = resolveProjectRoot();
      const configPath = join(root, PROJECT_CONFIG_PATH);
      try {
        exportConfig(configPath, file);
        if (file) {
          print(`Config exported to ${file}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  cmd
    .command('import <file>')
    .description('Import config from a JSON file')
    .action((file: string) => {
      const root = resolveProjectRoot();
      const configPath = join(root, PROJECT_CONFIG_PATH);
      try {
        importConfig(file, configPath);
        print(`Config imported from ${file}`);
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          printError(new Error(`Invalid config: ${error.errors.join(', ')}`));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('List all config parameters grouped by category')
    .action(() => {
      const grouped = listConfigByCategory();
      const categories = Object.keys(grouped).sort();
      for (const category of categories) {
        print(`\n${category}:`);
        const keys = grouped[category] ?? [];
        for (const key of keys) {
          const meta = CONFIG_METADATA[key];
          if (!meta) continue;
          const defVal = meta.default === undefined ? '' : meta.default === null ? ' (default: null)' : ` (default: ${JSON.stringify(meta.default)})`;
          print(`  ${key}${defVal} — ${meta.description}`);
        }
      }
    });

  cmd
    .command('keys')
    .description('List all config parameter keys')
    .action(() => {
      const keys = Object.keys(CONFIG_METADATA).sort();
      for (const key of keys) {
        print(key);
      }
    });

  cmd
    .command('migrate')
    .description('Migrate config.json to the latest full format (adds missing fields with defaults)')
    .option('--dry-run', 'Show what would be changed without modifying files')
    .action((opts: { dryRun?: boolean }) => {
      const root = resolveProjectRoot();
      const configPath = join(root, PROJECT_CONFIG_PATH);
      try {
        const result = migrateConfig(configPath, { dryRun: opts.dryRun });
        if (result.error) {
          printError(new Error(result.error));
          process.exitCode = 1;
          return;
        }
        if (!result.migrated) {
          print('Config is already up to date — no migration needed.');
          return;
        }
        if (opts.dryRun) {
          print(`[dry-run] Would add ${result.addedFields.length} missing field(s):`);
          for (const field of result.addedFields) {
            print(`  + ${field}`);
          }
        } else {
          print(`Migration complete. Added ${result.addedFields.length} field(s):`);
          for (const field of result.addedFields) {
            print(`  + ${field}`);
          }
          if (result.backupPath) {
            print(`Backup saved to: ${result.backupPath}`);
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
