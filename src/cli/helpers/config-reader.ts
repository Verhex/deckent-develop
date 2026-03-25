import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_CONFIG_PATH } from '../../core/constants.js';

/**
 * Read the language setting from .deckent/config.json.
 * Falls back to 'en' if the config is missing, unreadable, or has no language field.
 */
export function getLangFromConfig(root: string): string {
  try {
    const configPath = join(root, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { language?: string };
      return config.language ?? 'en';
    }
  } catch {
    // fallback
  }
  return 'en';
}
