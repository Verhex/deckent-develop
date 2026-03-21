import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  GLOBAL_CONFIG_PATH,
  GLOBAL_CREDENTIALS_DIR,
  GLOBAL_DECKENT_DIR,
} from './constants.js';
import type { DeckentConfig } from './types.js';
import { deepMerge } from './config.js';

// ─── Global Config Utilities ────────────────────────────────────────

/**
 * Ensures ~/.deckent/ and ~/.deckent/credentials/ directories exist.
 * Creates them recursively if they don't exist. Idempotent.
 */
export function ensureGlobalDir(): void {
  if (!existsSync(GLOBAL_DECKENT_DIR)) {
    mkdirSync(GLOBAL_DECKENT_DIR, { recursive: true });
  }
  if (!existsSync(GLOBAL_CREDENTIALS_DIR)) {
    mkdirSync(GLOBAL_CREDENTIALS_DIR, { recursive: true });
  }
}

/**
 * Reads ~/.deckent/config.json and returns parsed config.
 * Returns null if the file does not exist.
 * Throws on malformed JSON.
 */
export function readGlobalConfig(): Partial<DeckentConfig> | null {
  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    return null;
  }

  const content = readFileSync(GLOBAL_CONFIG_PATH, 'utf-8');
  try {
    return JSON.parse(content) as Partial<DeckentConfig>;
  } catch {
    throw new Error(
      `Malformed JSON in global config "${GLOBAL_CONFIG_PATH}". Please fix or delete the file.`,
    );
  }
}

/**
 * Writes a partial config to ~/.deckent/config.json.
 * Calls ensureGlobalDir() first to guarantee the directory exists.
 */
export function writeGlobalConfig(config: Partial<DeckentConfig>): void {
  ensureGlobalDir();
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Merges global config into project config. Project config takes priority.
 * Uses deepMerge: nested objects are merged recursively, project overrides global.
 */
export function mergeWithProjectConfig(
  projectConfig: DeckentConfig,
  globalConfig: Partial<DeckentConfig>,
): DeckentConfig {
  // First apply global onto project (as base), then project overrides on top
  const withGlobal = deepMerge(projectConfig, globalConfig);
  return deepMerge(withGlobal, projectConfig);
}

/**
 * Returns the global config file path (~/.deckent/config.json).
 */
export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG_PATH;
}

/**
 * Checks whether the global config file exists.
 */
export function isGlobalConfigPresent(): boolean {
  return existsSync(GLOBAL_CONFIG_PATH);
}
