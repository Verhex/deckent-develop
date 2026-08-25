import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';

/** Strike-5 (2026-08-25): config.json yazımı DAİMA tmp+rename — eşzamanlı okuyucu asla yarım dosya görmez. */
function writeConfigFileAtomic(configPath: string, contents: string): void {
  const tmpPath = `${configPath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, contents);
  renameSync(tmpPath, configPath);
}
import { join } from 'node:path';
import type { Command } from 'commander';
import type { DeckentConfig } from '../../core/types.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import { loadConfig, validatePartialConfig, ConfigValidationError, deepMerge, CONFIG_METADATA, listConfigByCategory } from '../../core/config.js';
import { migrateConfig, setNestedValue, getNestedValue } from '../../core/config-migration.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { ErrorRegistry } from '../../core/errors.js';
import { cliContractMessage, bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';

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
  writeConfigFileAtomic(configPath, JSON.stringify(merged, null, 2) + '\n');
}

export function registerConfig(program: Command): void {
  const helpLang = getLanguage(undefined);
  const cmd = program
    .command('config')
    .description(getMessage('cli.config.desc', getLanguage(undefined)))
    .option('--raw', cliContractMessage('cliContract.config.opt.raw', helpLang))
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

  bindArgumentDescriptions(cmd.command('set <key> <value>'), helpLang, { key: 'cliContract.config.arg.key', value: 'cliContract.config.arg.value' })
    .description(getMessage('cli.config.set.desc', getLanguage(undefined)))
    .action(async (key: string, value: string) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
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
        writeConfigFileAtomic(configPath, JSON.stringify(existing, null, 2) + '\n');
        print(getMessage('config.set', lang, { key, value: JSON.stringify(parsed) }));
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          printError(new Error(getMessage('config.invalid', lang, { errors: error.errors.join(', ') })));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });

  bindArgumentDescriptions(cmd.command('get <key>'), helpLang, { key: 'cliContract.config.arg.key' })
    .description(getMessage('cli.config.get.desc', getLanguage(undefined)))
    .action(async (key: string) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      try {
        const config = await loadConfig(root);
        const value = getNestedValue(config as unknown as Record<string, unknown>, key);
        if (value === undefined) {
          printError(new Error(getMessage('config.key_not_found', lang, { key })));
          process.exitCode = 1;
          return;
        }
        print(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  bindArgumentDescriptions(cmd.command('export [file]'), helpLang, { file: 'cliContract.config.arg.export_file' })
    .description(getMessage('cli.config.export.desc', getLanguage(undefined)))
    .action((file?: string) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const configPath = join(root, PROJECT_CONFIG_PATH);
      try {
        exportConfig(configPath, file);
        if (file) {
          print(getMessage('config.exported', lang, { path: file }));
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  bindArgumentDescriptions(cmd.command('import <file>'), helpLang, { file: 'cliContract.config.arg.import_file' })
    .description(getMessage('cli.config.import.desc', getLanguage(undefined)))
    .action((file: string) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const configPath = join(root, PROJECT_CONFIG_PATH);
      try {
        importConfig(file, configPath);
        print(getMessage('config.imported', lang, { path: file }));
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          printError(new Error(getMessage('config.invalid', lang, { errors: error.errors.join(', ') })));
        } else {
          printError(error);
        }
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description(getMessage('cli.config.list.desc', getLanguage(undefined)))
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
    .description(getMessage('cli.config.keys.desc', getLanguage(undefined)))
    .action(() => {
      const keys = Object.keys(CONFIG_METADATA).sort();
      for (const key of keys) {
        print(key);
      }
    });

  cmd
    .command('migrate')
    .description(getMessage('cli.config.migrate.desc', getLanguage(undefined)))
    .option('--dry-run', cliContractMessage('cliContract.config.opt.dry_run', helpLang))
    .action((opts: { dryRun?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const configPath = join(root, PROJECT_CONFIG_PATH);
      try {
        const result = migrateConfig(configPath, { dryRun: opts.dryRun });
        if (result.error) {
          printError(new Error(result.error));
          process.exitCode = 1;
          return;
        }
        if (!result.migrated) {
          print(getMessage('config.migrate_up_to_date', lang));
          return;
        }
        if (opts.dryRun) {
          print(getMessage('config.migrate_dry_run', lang, { count: String(result.addedFields.length) }));
          for (const field of result.addedFields) {
            print(`  + ${field}`);
          }
          // CFG-1: surface legacy → canonical renames (e.g. mode: pro_plan → economic)
          // so a rename-only migration is not reported as a bare "Added 0 field(s)".
          for (const rename of result.renamedFields ?? []) {
            print(`  ~ ${rename}`);
          }
        } else {
          print(getMessage('config.migrate_complete', lang, { count: String(result.addedFields.length) }));
          for (const field of result.addedFields) {
            print(`  + ${field}`);
          }
          for (const rename of result.renamedFields ?? []) {
            print(`  ~ ${rename}`);
          }
          if (result.backupPath) {
            print(getMessage('config.migrate_backup', lang, { path: result.backupPath }));
          }
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
