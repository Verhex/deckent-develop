// src/cli/repl/config-entries.ts
// ═══ TERMINAL-PICKER-004 / TERMINAL-SESSION-AUTHORITY-001 — config picker entries ═══
//
// The `/config` menu's data: CONFIG_METADATA as picker entries with the
// project-level current value, plus the CLI's value-text rule. Ink-free on
// purpose — the readline loop (entry.ts) builds the same entries for its
// numbered `/config` lists, so both surfaces show ONE set of keys/values.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigHelp, listConfigByCategory, VALID_PROVIDERS } from '../../core/config.js';
import { getNestedValue } from '../../core/config-migration.js';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';
import type { ConfigKeyEntry } from './picker-specs.js';

/** The raw project config (what `/config` and `deckent config set` write),
 *  read fresh on every menu open; `{}` when absent/broken. */
export function readProjectConfigRaw(root: string): Record<string, unknown> {
  const path = join(root, PROJECT_CONFIG_PATH);
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown> : {}; } catch { return {}; }
}

/** CONFIG_METADATA as picker entries: every key of every category with its
 *  type/default, the project-level current value, and the options when
 *  enumerable — provider-typed keys widened to VALID_PROVIDERS (the
 *  validation authority). */
export function buildConfigEntries(root: string): ConfigKeyEntry[] {
  const raw = readProjectConfigRaw(root);
  const entries: ConfigKeyEntry[] = [];
  for (const keys of Object.values(listConfigByCategory())) {
    for (const key of keys) {
      const meta = getConfigHelp(key);
      if (!meta) continue;
      const providerTyped = key.endsWith('_provider') && meta.options !== undefined && meta.options.every((o) => (VALID_PROVIDERS as readonly string[]).includes(o));
      const options = providerTyped ? [...VALID_PROVIDERS] : meta.options;
      entries.push({
        key,
        category: meta.category,
        type: meta.type,
        ...(options ? { options } : {}),
        defaultValue: meta.default,
        current: key.includes('.') ? getNestedValue(raw, key) : raw[key],
      });
    }
  }
  return entries;
}

/** The CLI's value rule for `config set`: JSON first, else the raw string. */
export function parseConfigValueText(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}
