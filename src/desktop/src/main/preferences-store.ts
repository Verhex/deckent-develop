/**
 * D4-1 (SURF-4) — desktop preferences store: persists the user's watch
 * (theme) choice + custom semantic-token overrides across restarts.
 *
 * Deliberate clone of connection-profile-store.ts's proven pattern (the
 * plan's named precedent): plain node:fs (Electron-free, unit-tested from
 * vitest.desktop.config.ts), explicit `baseDir` for hermetic tests, atomic
 * temp+rename writes with a chmod 0600 re-assert, corrupt/invalid content
 * degrades to DEFAULT_PREFERENCES with a console.warn — never a throw on the
 * read path. Versioned: `version` is store-owned; a file with an unknown
 * version is treated as corrupt-safe (defaults) until a real migration is
 * written for a v2 (the hook is `migratePreferences`).
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PREFERENCES,
  DESKTOP_PREFERENCES_VERSION,
  desktopPreferencesSchema,
  type DesktopPreferences,
  type DesktopPreferencesInput,
} from '../shared/theme-tokens';

/** Same root as the connection-profile store: `~/.deckent/desktop/`. */
export const DEFAULT_PREFERENCES_STORE_DIR = join(homedir(), '.deckent', 'desktop');

const PREFERENCES_FILE_NAME = 'preferences.json';

export interface PreferencesReadResult {
  preferences: DesktopPreferences;
  /** True when the file existed but could not be used (bad JSON / schema /
   *  version) and DEFAULT_PREFERENCES was substituted. */
  corrupted: boolean;
}

export interface PreferencesStore {
  readonly filePath: string;
  get(): PreferencesReadResult;
  /** Merge `input` over the current preferences and persist atomically.
   *  Throws on schema-invalid input (fail fast on a caller bug). */
  set(input: DesktopPreferencesInput): DesktopPreferences;
}

export interface PreferencesStoreOptions {
  /** Root directory holding preferences.json. Defaults to ~/.deckent/desktop. */
  baseDir?: string;
}

/** Future-migration hook: v1 is current, so only v1 passes through. An
 *  unknown/older version returns null (treated as unusable → defaults) until
 *  a real migration lands here alongside a version bump. */
function migratePreferences(parsed: unknown): DesktopPreferences | null {
  const result = desktopPreferencesSchema.safeParse(parsed);
  if (result.success) return result.data;
  return null;
}

function readPreferencesFile(filePath: string): PreferencesReadResult {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { preferences: DEFAULT_PREFERENCES, corrupted: false };
    }
    console.warn(
      `[preferences-store] read failed for ${filePath}: ${e instanceof Error ? e.message : String(e)} — using defaults.`
    );
    return { preferences: DEFAULT_PREFERENCES, corrupted: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(
      `[preferences-store] ${filePath} is not valid JSON — using defaults. (${e instanceof Error ? e.message : String(e)})`
    );
    return { preferences: DEFAULT_PREFERENCES, corrupted: true };
  }

  const migrated = migratePreferences(parsed);
  if (migrated === null) {
    console.warn(`[preferences-store] ${filePath} failed schema/version validation — using defaults.`);
    return { preferences: DEFAULT_PREFERENCES, corrupted: true };
  }
  return { preferences: migrated, corrupted: false };
}

/** Atomic temp+rename write, mode 0600 (connection-profile-store pattern). */
function writePreferencesFile(filePath: string, baseDir: string, preferences: DesktopPreferences): void {
  mkdirSync(baseDir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(preferences, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // Re-assert the mode: writeFileSync's `mode` is masked by the process umask.
  chmodSync(tmp, 0o600);
  renameSync(tmp, filePath);
}

/**
 * Create a preferences store rooted at `options.baseDir` (default
 * `~/.deckent/desktop`). Every operation re-reads from disk — a single small
 * human-driven record, not a hot path (same reasoning as the profile store).
 */
export function createPreferencesStore(options: PreferencesStoreOptions = {}): PreferencesStore {
  const baseDir = options.baseDir ?? DEFAULT_PREFERENCES_STORE_DIR;
  const filePath = join(baseDir, PREFERENCES_FILE_NAME);

  return {
    filePath,

    get(): PreferencesReadResult {
      return readPreferencesFile(filePath);
    },

    set(input: DesktopPreferencesInput): DesktopPreferences {
      const current = readPreferencesFile(filePath).preferences;
      const next: DesktopPreferences = {
        version: DESKTOP_PREFERENCES_VERSION,
        watch: input.watch ?? current.watch,
        customTokens: input.customTokens ?? current.customTokens,
      };
      // Fail fast on a caller bug (unknown watch / bad hex) instead of
      // persisting a record only the silent-defaults path would surface.
      desktopPreferencesSchema.parse(next);
      writePreferencesFile(filePath, baseDir, next);
      return next;
    },
  };
}
