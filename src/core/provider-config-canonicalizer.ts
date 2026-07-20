/**
 * Canonicalize legacy flat provider aliases inside one authored config layer.
 *
 * Defaults and environment overrides are deliberately absent from this module:
 * only values authored in the same raw layer may conflict. The operation is
 * transactional — a conflict is detected before a cloned result is changed.
 */

export type ProviderConfigLayer = 'global' | 'project' | 'partial' | 'migration';
export type ProviderAliasSlot = 'brain' | 'worker' | 'fallback' | 'overrides';

export interface ProviderAliasConflict {
  layer: ProviderConfigLayer;
  slot: ProviderAliasSlot;
  flatKey: string;
  groupedKey: string;
  flatValue: unknown;
  groupedValue: unknown;
}

export interface ProviderAliasChange {
  kind: 'promoted' | 'deduplicated';
  slot: ProviderAliasSlot;
  flatKey: string;
  groupedKey: string;
}

export class ProviderConfigAliasConflictError extends Error {
  public readonly code = 'DECKENT_PROVIDER_CONFIG_ALIAS_CONFLICT';

  constructor(public readonly conflict: ProviderAliasConflict) {
    // Stable machine-readable text only. CLI surfaces localize this typed error.
    super('DECKENT_PROVIDER_CONFIG_ALIAS_CONFLICT');
    this.name = 'ProviderConfigAliasConflictError';
  }
}

const PROVIDER_ALIASES: ReadonlyArray<{
  slot: ProviderAliasSlot;
  flatKey: string;
  groupedKey: string;
}> = [
  { slot: 'brain', flatKey: 'brain_provider', groupedKey: 'brain' },
  { slot: 'worker', flatKey: 'worker_provider', groupedKey: 'worker' },
  { slot: 'fallback', flatKey: 'fallback_provider', groupedKey: 'fallback' },
  { slot: 'overrides', flatKey: 'provider_overrides', groupedKey: 'overrides' },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]));
}

export function canonicalizeProviderConfigAliases(
  input: Readonly<Record<string, unknown>>,
  layer: ProviderConfigLayer,
): { config: Record<string, unknown>; changes: ProviderAliasChange[] } {
  const groupedValue = input['providers'];
  const grouped = isPlainObject(groupedValue) ? groupedValue : undefined;

  // An invalid authored `providers` shape belongs to normal config validation.
  // Replacing it here would hide that invalid input and manufacture precedence.
  if (groupedValue !== undefined && grouped === undefined) {
    return { config: structuredClone(input), changes: [] };
  }

  for (const alias of PROVIDER_ALIASES) {
    const flatPresent = input[alias.flatKey] !== undefined;
    const groupedPresent = grouped?.[alias.groupedKey] !== undefined;
    if (flatPresent && groupedPresent && !valuesEqual(input[alias.flatKey], grouped?.[alias.groupedKey])) {
      throw new ProviderConfigAliasConflictError({
        layer,
        slot: alias.slot,
        flatKey: alias.flatKey,
        groupedKey: `providers.${alias.groupedKey}`,
        flatValue: structuredClone(input[alias.flatKey]),
        groupedValue: structuredClone(grouped?.[alias.groupedKey]),
      });
    }
  }

  const config = structuredClone(input) as Record<string, unknown>;
  let canonicalProviders = isPlainObject(config['providers'])
    ? config['providers'] as Record<string, unknown>
    : undefined;
  const changes: ProviderAliasChange[] = [];

  for (const alias of PROVIDER_ALIASES) {
    const flatPresent = config[alias.flatKey] !== undefined;
    if (!flatPresent) continue;
    const groupedPresent = canonicalProviders?.[alias.groupedKey] !== undefined;
    if (!canonicalProviders) {
      canonicalProviders = {};
      config['providers'] = canonicalProviders;
    }
    if (!groupedPresent) canonicalProviders[alias.groupedKey] = config[alias.flatKey];
    delete config[alias.flatKey];
    changes.push({
      kind: groupedPresent ? 'deduplicated' : 'promoted',
      slot: alias.slot,
      flatKey: alias.flatKey,
      groupedKey: `providers.${alias.groupedKey}`,
    });
  }

  return { config, changes };
}
