/**
 * Config Migration Helper
 *
 * Migrates old (minimal) config.json files to the new (full) format.
 * Preserves existing values — only adds missing fields with their defaults.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createDefaultConfig } from './config.js';
import type { DeckentConfig } from './types.js';

export interface MigrationResult {
  /** Whether any fields were added */
  migrated: boolean;
  /** Fields that were added during migration */
  addedFields: string[];
  /** Path to the backup file (if created) */
  backupPath: string | null;
  /** Error message if migration failed */
  error?: string;
}

/**
 * Collect all leaf key paths of a plain object.
 * e.g. { a: { b: 1 }, c: 2 } → ['a.b', 'c']
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      keys.push(...collectKeys(val as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Get a nested value from an object by dot-separated path.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested value in an object by dot-separated path.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    if (typeof current[part] !== 'object' || current[part] === null || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1] as string;
  current[lastPart] = value;
}

/**
 * Determine which fields are missing from an existing config relative to defaults.
 * Checks top-level keys and also mode-level keys within the `modes` object.
 * Returns a list of missing top-level field names (and `modes.<mode>.<field>` paths).
 *
 * Fields added since sprint-066 that old configs will receive on migration:
 * - routing_engine: 'v1' (routing engine version, added sprint-066)
 */
export function getMissingFields(existing: Record<string, unknown>): string[] {
  const defaults = createDefaultConfig() as unknown as Record<string, unknown>;
  const missing: string[] = [];

  for (const key of Object.keys(defaults)) {
    // Skip fields whose default is undefined — they're truly optional and
    // won't appear in JSON (JSON.stringify omits undefined values).
    if (defaults[key] === undefined) continue;

    if (key === 'modes') {
      // Check mode-level fields within each mode
      const defaultModes = defaults['modes'] as Record<string, Record<string, unknown>>;
      const existingModes = (existing['modes'] ?? {}) as Record<string, Record<string, unknown>>;
      for (const modeName of Object.keys(defaultModes)) {
        const defaultMode = defaultModes[modeName] ?? {};
        const existingMode = existingModes[modeName] ?? {};
        for (const modeKey of Object.keys(defaultMode)) {
          if (defaultMode[modeKey] === undefined) continue;
          if (!(modeKey in existingMode)) {
            missing.push(`modes.${modeName}.${modeKey}`);
          } else {
            // Check nested sub-fields for plain objects
            const defaultVal = defaultMode[modeKey];
            const existingVal = existingMode[modeKey];
            if (
              typeof defaultVal === 'object' && defaultVal !== null && !Array.isArray(defaultVal) &&
              typeof existingVal === 'object' && existingVal !== null && !Array.isArray(existingVal)
            ) {
              const defaultSubObj = defaultVal as Record<string, unknown>;
              const existingSubObj = existingVal as Record<string, unknown>;
              for (const subKey of Object.keys(defaultSubObj)) {
                if (defaultSubObj[subKey] === undefined) continue;
                if (!(subKey in existingSubObj)) {
                  missing.push(`modes.${modeName}.${modeKey}.${subKey}`);
                }
              }
            }
          }
        }
      }
      continue;
    }

    if (!(key in existing)) {
      missing.push(key);
    }
  }

  return missing;
}

/**
 * Check whether a config file needs migration (has missing fields).
 */
export function needsMigration(existing: Record<string, unknown>): boolean {
  return getMissingFields(existing).length > 0;
}

/**
 * Migrate a config.json file to the full format.
 *
 * - Reads existing config from `configPath`
 * - Fills in any missing fields using `createDefaultConfig()` defaults
 * - Creates a backup at `configPath.bak` before writing
 * - Preserves all existing values
 *
 * @param configPath - Absolute path to the config.json file
 * @param options.dryRun - If true, don't write anything; just report what would change
 * @returns MigrationResult describing what was done
 */
export function migrateConfig(
  configPath: string,
  options: { dryRun?: boolean } = {},
): MigrationResult {
  const { dryRun = false } = options;

  if (!existsSync(configPath)) {
    return {
      migrated: false,
      addedFields: [],
      backupPath: null,
      error: `Config file not found: ${configPath}`,
    };
  }

  let existing: Record<string, unknown>;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return {
      migrated: false,
      addedFields: [],
      backupPath: null,
      error: `Failed to parse config JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const missingFields = getMissingFields(existing);

  if (missingFields.length === 0) {
    return {
      migrated: false,
      addedFields: [],
      backupPath: null,
    };
  }

  if (dryRun) {
    return {
      migrated: true,
      addedFields: missingFields,
      backupPath: null,
    };
  }

  // Create timestamped backup before modifying
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.bak.${timestamp}`;
  copyFileSync(configPath, backupPath);

  // Merge: existing values preserved, only missing fields added from defaults
  const defaults = createDefaultConfig() as unknown as Record<string, unknown>;
  const merged = { ...existing };

  for (const field of missingFields) {
    if (field.startsWith('modes.')) {
      // Nested mode field: modes.<modeName>.<fieldName>
      setNestedValue(merged, field, getNestedValue(defaults, field));
    } else {
      const defaultValue = defaults[field];
      // Write undefined as null in JSON (so users can see the field exists)
      merged[field] = defaultValue === undefined ? null : defaultValue;
    }
  }

  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');

  return {
    migrated: true,
    addedFields: missingFields,
    backupPath,
  };
}

/**
 * Migrate a config object in-memory (no file I/O).
 * Used for testing and programmatic use.
 *
 * @param existing - The existing config (may be partial)
 * @returns The migrated config with all default fields filled in
 */
export function migrateConfigInMemory(
  existing: Record<string, unknown>,
): { config: DeckentConfig; addedFields: string[] } {
  const defaults = createDefaultConfig() as unknown as Record<string, unknown>;
  const missingFields = getMissingFields(existing);
  const merged = { ...existing };

  for (const field of missingFields) {
    if (field.startsWith('modes.')) {
      setNestedValue(merged, field, getNestedValue(defaults, field));
    } else {
      const defaultValue = defaults[field];
      merged[field] = defaultValue === undefined ? null : defaultValue;
    }
  }

  return {
    config: merged as unknown as DeckentConfig,
    addedFields: missingFields,
  };
}

// Collect leaf keys is exported for testing purposes
export { collectKeys, getNestedValue, setNestedValue };
