/**
 * Config Migration Helper
 *
 * Migrates old (minimal) config.json files to the new (full) format.
 * Preserves existing values — only adds missing fields with their defaults.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, basename } from 'node:path';
import { createDefaultConfig } from './config.js';
import { structuredLog } from './observability.js';
import type { DeckentConfig } from './types.js';
import type { ModelTier } from './model-equivalence.js';
import type { ProviderName } from './task-types.js';

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
  if (getMissingFields(existing).length > 0) return true;
  // Legacy mode names need migration
  const legacyModes = ['max_plan', 'max5x_plan', 'pro_plan'];
  if (typeof existing['mode'] === 'string' && legacyModes.includes(existing['mode'])) return true;
  const modes = existing['modes'] as Record<string, unknown> | undefined;
  if (modes && legacyModes.some(m => m in modes)) return true;
  // Sprint 150 Decision 3+4: duplicate keys present
  if (hasDuplicateKeys(existing)) return true;
  return false;
}

/**
 * Check whether a config has any duplicate keys that would be removed
 * by `removeDuplicateKeys` (Sprint 150 Decision 3+4). Non-destructive.
 */
export function hasDuplicateKeys(existing: Record<string, unknown>): boolean {
  if (existing['spawn_backend'] !== undefined && existing['claude_backend'] !== undefined) return true;
  const providers = existing['providers'] as Record<string, unknown> | undefined;
  if (providers) {
    if (providers['brain'] !== undefined && existing['brain_provider'] !== undefined) return true;
    if (providers['worker'] !== undefined && existing['worker_provider'] !== undefined) return true;
    if (providers['fallback'] !== undefined && existing['fallback_provider'] !== undefined) return true;
  }
  return false;
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

  // Rename legacy mode names to canonical names BEFORE checking missing fields
  const LEGACY_MODE_MAP: Record<string, string> = {
    max_plan: 'performance',
    max5x_plan: 'balanced',
    pro_plan: 'economic',
  };

  let legacyRenamed = false;

  // Migrate top-level mode field
  if (typeof existing['mode'] === 'string' && LEGACY_MODE_MAP[existing['mode']]) {
    existing['mode'] = LEGACY_MODE_MAP[existing['mode']];
    legacyRenamed = true;
  }

  // Migrate modes object keys
  const existingModes = existing['modes'] as Record<string, unknown> | undefined;
  if (existingModes) {
    for (const [oldName, newName] of Object.entries(LEGACY_MODE_MAP)) {
      if (oldName in existingModes) {
        if (!(newName in existingModes)) {
          existingModes[newName] = existingModes[oldName];
        }
        delete existingModes[oldName];
        legacyRenamed = true;
      }
    }
    // Remove usage_thresholds from all modes (Sprint 089 removal)
    for (const modeConfig of Object.values(existingModes)) {
      if (typeof modeConfig === 'object' && modeConfig !== null) {
        delete (modeConfig as Record<string, unknown>)['usage_thresholds'];
      }
    }
  }

  // Sprint 150 Decision 3+4: Remove duplicate keys (claude_backend, flat provider fields)
  // This is destructive — it DELETES keys from `existing`, so must run before getMissingFields.
  const removedDuplicates = removeDuplicateKeys(existing);

  const missingFields = getMissingFields(existing);

  if (missingFields.length === 0 && !legacyRenamed && removedDuplicates.length === 0) {
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

  try {
    const pruned = pruneConfigBackups(configPath, 3);
    if (pruned.length > 0) {
      structuredLog('info', 'config_backups_pruned', {
        configPath,
        kept: 3,
        removed: pruned.length,
      });
    }
  } catch (e) {
    structuredLog('warn', 'config_backups_prune_failed', {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return {
    migrated: true,
    addedFields: missingFields,
    backupPath,
  };
}

/**
 * Rotate timestamped config backups, keeping only the newest `keepCount`.
 * The legacy timestamp-less `{basename}.bak` snapshot is preserved — the
 * regex requires an ISO-8601 date suffix.
 */
export function pruneConfigBackups(
  configPath: string,
  keepCount: number = 3,
): string[] {
  const dir = dirname(configPath);
  const base = basename(configPath);
  const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedBase}\\.bak\\.\\d{4}-\\d{2}-\\d{2}T`);

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (e) {
    structuredLog('warn', 'prune_backups_readdir_failed', {
      dir,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }

  const backups = entries.filter((name) => pattern.test(name)).sort().reverse();

  if (backups.length <= keepCount) {
    return [];
  }

  const toDelete = backups.slice(keepCount);
  const deleted: string[] = [];

  for (const name of toDelete) {
    const fullPath = `${dir}/${name}`;
    try {
      unlinkSync(fullPath);
      deleted.push(fullPath);
    } catch (e) {
      structuredLog('warn', 'prune_backups_unlink_failed', {
        path: fullPath,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return deleted;
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

/**
 * Full migration: field-fill + v1→v2. Returns both the migrated config
 * and a detailed list of all changes (missing fields + v2 tier conversions).
 *
 * Use this instead of migrateConfigInMemory when you want v2 tier migration applied.
 */
export function migrateConfigFull(
  existing: Record<string, unknown>,
): { config: DeckentConfig; addedFields: string[]; v2Changes: string[] } {
  const defaults = createDefaultConfig() as unknown as Record<string, unknown>;
  const merged = { ...existing };

  // Apply v1→v2 migration (model_strategy + providers)
  const v2Result = migrateConfigV1ToV2(merged);

  const missingFields = getMissingFields(merged);

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
    v2Changes: v2Result.changes,
  };
}

// ─── V1 → V2 Migration ─────────────────────────────────────────────────────

/**
 * Map a v1 model name to a v2 ModelTier.
 * Used during config migration to convert brain_model / default_model to tier-based config.
 */
export function modelToTier(model: string): ModelTier {
  switch (model) {
    case 'opus':
    case 'gpt-5':
    case 'gemini-2.5-pro':
      return 'premium';
    case 'sonnet':
    case 'gpt-4.1':
    case 'o3':
    case 'gemini-2.5-flash':
      return 'standard';
    case 'haiku':
    case 'gpt-5-mini':
    case 'gpt-4.1-mini':
    case 'o4-mini':
    case 'gemini-2.0-flash':
      return 'economy';
    default:
      return 'standard'; // safe fallback
  }
}

/**
 * V2 model_strategy shape embedded in config.
 * Mirrors the ModelStrategy interface from mode-presets.ts (Task 4).
 * Kept as a plain object type here to avoid circular dependency.
 */
export interface ConfigModelStrategy {
  brain_tier?: ModelTier;
  worker_tier?: ModelTier;
  min_tier?: ModelTier;
  max_tier?: ModelTier;
  auto_upgrade?: boolean;
  auto_downgrade?: boolean;
}

/**
 * V2 providers shape embedded in config.
 */
export interface ConfigProviders {
  brain?: ProviderName;
  worker?: ProviderName;
  fallback?: ProviderName;
  overrides?: Record<string, ProviderName>;
}

/**
 * Apply v1 → v2 migration rules to a config object in-memory.
 *
 * Migration rules:
 * - haiku_allowed: false → model_strategy.min_tier = 'standard'
 * - haiku_allowed: true  → model_strategy.min_tier = 'economy'
 * - brain_model: X       → model_strategy.brain_tier = modelToTier(X)
 * - default_model: X     → model_strategy.worker_tier = modelToTier(X)
 * - brain_provider / worker_provider → providers.brain / providers.worker
 *
 * Old fields are PRESERVED for backward compatibility. New fields are ADDED.
 * If new fields already exist, they are NOT overwritten.
 */
export function migrateConfigV1ToV2(config: Record<string, unknown>): {
  migrated: boolean;
  changes: string[];
} {
  const changes: string[] = [];

  // ── model_strategy migration ──────────────────────────────────────

  const existingStrategy = (config['model_strategy'] ?? {}) as Record<string, unknown>;
  const strategy: ConfigModelStrategy = { ...existingStrategy } as ConfigModelStrategy;
  let strategyChanged = false;

  // Migrate active mode's fields (top-level mode → modes[mode])
  const activeMode = config['mode'] as string | undefined;
  const modes = config['modes'] as Record<string, Record<string, unknown>> | undefined;
  const activeModeConfig: Record<string, unknown> = (activeMode ? modes?.[activeMode] : undefined) ?? {};

  // Also check top-level fields for flat v1 configs
  const brainModel = (activeModeConfig['brain_model'] ?? config['brain_model']) as string | undefined;
  const defaultModel = (activeModeConfig['default_model'] ?? config['default_model']) as string | undefined;
  const haikuAllowed = activeModeConfig['haiku_allowed'] ?? config['haiku_allowed'];

  // brain_model → brain_tier
  if (brainModel && strategy.brain_tier === undefined) {
    strategy.brain_tier = modelToTier(brainModel);
    strategyChanged = true;
    changes.push(`brain_model '${brainModel}' → model_strategy.brain_tier '${strategy.brain_tier}'`);
  }

  // default_model → worker_tier
  if (defaultModel && strategy.worker_tier === undefined) {
    strategy.worker_tier = modelToTier(defaultModel);
    strategyChanged = true;
    changes.push(`default_model '${defaultModel}' → model_strategy.worker_tier '${strategy.worker_tier}'`);
  }

  // haiku_allowed → min_tier
  if (haikuAllowed !== undefined && strategy.min_tier === undefined) {
    strategy.min_tier = haikuAllowed === false ? 'standard' : 'economy';
    strategyChanged = true;
    changes.push(`haiku_allowed ${String(haikuAllowed)} → model_strategy.min_tier '${strategy.min_tier}'`);
  }

  if (strategyChanged) {
    config['model_strategy'] = strategy;
  }

  // ── providers migration ───────────────────────────────────────────

  const existingProviders = (config['providers'] ?? {}) as Record<string, unknown>;
  const providers: ConfigProviders = { ...existingProviders } as ConfigProviders;
  let providersChanged = false;

  const brainProvider = config['brain_provider'] as ProviderName | undefined;
  const workerProvider = config['worker_provider'] as ProviderName | undefined;
  const fallbackProvider = config['fallback_provider'] as ProviderName | undefined;

  if (brainProvider && providers.brain === undefined) {
    providers.brain = brainProvider;
    providersChanged = true;
    changes.push(`brain_provider '${brainProvider}' → providers.brain`);
  }

  if (workerProvider && providers.worker === undefined) {
    providers.worker = workerProvider;
    providersChanged = true;
    changes.push(`worker_provider '${workerProvider}' → providers.worker`);
  }

  if (fallbackProvider && providers.fallback === undefined) {
    providers.fallback = fallbackProvider;
    providersChanged = true;
    changes.push(`fallback_provider '${fallbackProvider}' → providers.fallback`);
  }

  if (providersChanged) {
    config['providers'] = providers;
  }

  return {
    migrated: changes.length > 0,
    changes,
  };
}

/**
 * Extended needsMigration that also checks for v1→v2 migration needs.
 * Performs a dry-run of v1→v2 migration on a shallow clone to determine
 * if any actual changes would be made.
 */
export function needsV2Migration(existing: Record<string, unknown>): boolean {
  // Already has v2 fields → no migration needed
  if (existing['model_strategy'] && existing['providers']) return false;

  // Dry-run: clone and check if migrateConfigV1ToV2 would actually change anything
  const clone = { ...existing };
  const result = migrateConfigV1ToV2(clone);
  return result.migrated;
}

// ─── V2 Duplicate Key Removal ─────────────────────────────────────────────

/**
 * Remove duplicate config keys per Alperen's 8-decision matrix (Sprint 150):
 *
 * Decision 3: If `spawn_backend` exists → delete `claude_backend` (duplicate + conflict)
 * Decision 4: If `providers.brain` exists → delete flat `brain_provider`
 *             If `providers.worker` exists → delete flat `worker_provider`
 *
 * Preserves: top-level `max_workers` (Decision 2), mode preset `max_workers` (Decision 1).
 *
 * @returns List of removed keys for audit trail
 */
export function removeDuplicateKeys(config: Record<string, unknown>): string[] {
  const removed: string[] = [];

  // Decision 3: claude_backend is duplicate when spawn_backend exists
  if (config['spawn_backend'] !== undefined && config['claude_backend'] !== undefined) {
    delete config['claude_backend'];
    removed.push('claude_backend');
  }

  // Decision 4: flat provider fields are duplicate when grouped providers exist
  const providers = config['providers'] as Record<string, unknown> | undefined;
  if (providers) {
    if (providers['brain'] !== undefined && config['brain_provider'] !== undefined) {
      delete config['brain_provider'];
      removed.push('brain_provider');
    }
    if (providers['worker'] !== undefined && config['worker_provider'] !== undefined) {
      delete config['worker_provider'];
      removed.push('worker_provider');
    }
    if (providers['fallback'] !== undefined && config['fallback_provider'] !== undefined) {
      delete config['fallback_provider'];
      removed.push('fallback_provider');
    }
  }

  if (removed.length > 0) {
    structuredLog('info', 'config_duplicate_keys_removed', { removed });
  }

  return removed;
}

// Collect leaf keys is exported for testing purposes
export { collectKeys, getNestedValue, setNestedValue };
