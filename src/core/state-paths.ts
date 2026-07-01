import { homedir } from 'node:os';
import { join } from 'node:path';

import { DECKENT_DIR, BRAIN_DIR } from './constants.js';

/**
 * STATE-RESOLVER (ADR-D-002 W3-precondition; ADR-G-001 global-install;
 * ADR-G-017 multi-project isolation).
 *
 * Single env-aware primitive for resolving deckent's state roots
 * (`.deckent`, `.brain`) instead of the ~150 existing call-sites that
 * hardcode `join(root, '.deckent')` / `join(root, '.brain')` directly.
 *
 * Precedence (highest → lowest), read at CALL TIME (never cached at
 * module load, so tests and CI can flip env vars between calls):
 *   1. Explicit env override — `DECKENT_HOME` / `BRAIN_HOME`.
 *   2. Project-local — `<projectRoot>/.deckent` / `<projectRoot>/.brain`
 *      (today's convention; preserved as the default when a project
 *      root is known and no env override is set).
 *   3. Global-install fallback — `os.homedir()/.deckent` /
 *      `os.homedir()/.brain` (used when no projectRoot is given).
 *
 * Migration pattern for existing call-sites (NOT done in this task —
 * follow-up work, see ADR-D-002 STATE-RESOLVER work-item):
 *
 *   // before
 *   import { join } from 'node:path';
 *   const configPath = join(projectRoot, '.deckent', 'config.json');
 *   const dbPath = join(projectRoot, '.brain', 'memory.db');
 *
 *   // after
 *   import { deckentPath, brainPath } from './state-paths.js';
 *   const configPath = deckentPath(projectRoot, 'config.json');
 *   const dbPath = brainPath(projectRoot, 'memory.db');
 *
 * A call-site with no meaningful project root (e.g. a global-scope
 * helper) migrates by omitting `projectRoot`:
 *
 *   // before
 *   import { homedir } from 'node:os';
 *   const globalConfig = join(homedir(), '.deckent', 'config.json');
 *
 *   // after
 *   const globalConfig = deckentPath(undefined, 'config.json');
 */

const DECKENT_HOME_ENV = 'DECKENT_HOME';
const BRAIN_HOME_ENV = 'BRAIN_HOME';

function resolveHome(envVar: string, dirName: string, projectRoot?: string): string {
  const envOverride = process.env[envVar];
  if (envOverride) {
    return envOverride;
  }
  if (projectRoot) {
    return join(projectRoot, dirName);
  }
  return join(homedir(), dirName);
}

export function resolveDeckentHome(projectRoot?: string): string {
  return resolveHome(DECKENT_HOME_ENV, DECKENT_DIR, projectRoot);
}

export function resolveBrainHome(projectRoot?: string): string {
  return resolveHome(BRAIN_HOME_ENV, BRAIN_DIR, projectRoot);
}

export function deckentPath(projectRoot: string | undefined, ...segments: string[]): string {
  return join(resolveDeckentHome(projectRoot), ...segments);
}

export function brainPath(projectRoot: string | undefined, ...segments: string[]): string {
  return join(resolveBrainHome(projectRoot), ...segments);
}
