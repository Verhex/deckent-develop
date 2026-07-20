import { getLegacyModelMigration } from './model-registry.js';

export type ModelConfigLayer = 'global' | 'project' | 'partial' | 'migration';

export interface ModelConfigAliasChange {
  layer: ModelConfigLayer;
  path: string;
  from: string;
  to: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function migrateField(
  object: Record<string, unknown>,
  key: string,
  path: string,
  layer: ModelConfigLayer,
  changes: ModelConfigAliasChange[],
): void {
  const value = object[key];
  if (typeof value !== 'string') return;
  const canonical = getLegacyModelMigration(value);
  if (!canonical) return;
  object[key] = canonical;
  changes.push({ layer, path, from: value, to: canonical });
}

/**
 * Canonicalize model aliases in one authored config layer. The input is never
 * mutated and only documented model-bearing config fields are inspected.
 */
export function canonicalizeModelConfigAliases(
  input: Readonly<Record<string, unknown>>,
  layer: ModelConfigLayer,
): { config: Record<string, unknown>; changes: ModelConfigAliasChange[] } {
  const config = structuredClone(input) as Record<string, unknown>;
  const changes: ModelConfigAliasChange[] = [];

  migrateField(config, 'brain_model', 'brain_model', layer, changes);
  migrateField(config, 'default_model', 'default_model', layer, changes);
  migrateField(config, 'native_model', 'native_model', layer, changes);

  const botAgent = config['bot_agent'];
  if (isPlainObject(botAgent)) {
    migrateField(botAgent, 'model', 'bot_agent.model', layer, changes);
  }

  const modes = config['modes'];
  if (isPlainObject(modes)) {
    for (const [modeName, modeValue] of Object.entries(modes)) {
      if (!isPlainObject(modeValue)) continue;
      migrateField(modeValue, 'brain_model', `modes.${modeName}.brain_model`, layer, changes);
      migrateField(modeValue, 'default_model', `modes.${modeName}.default_model`, layer, changes);
    }
  }

  return { config, changes };
}

export function hasLegacyModelConfigAliases(input: Readonly<Record<string, unknown>>): boolean {
  return canonicalizeModelConfigAliases(input, 'partial').changes.length > 0;
}
