/**
 * DESK-B2 (born-496 §392-002) — connection-profiles.json CRUD store.
 *
 * Persists the user's saved daemon connection profiles (see
 * ../shared/desktop-api.ts's `connectionProfileSchema` — the SSOT schema,
 * never duplicated here) to a single JSON file. Default location is
 * `~/.deckent/desktop/connection-profiles.json`, but every entry point takes
 * an explicit `baseDir` so tests (and any future multi-root need) never
 * touch the real home directory.
 *
 * Deliberately Electron-free (plain node:fs/os/path/crypto) — this module is
 * unit-tested from vitest.desktop.config.ts, not the Playwright e2e harness.
 *
 * Write safety mirrors src/api/serve-daemon-meta.ts: atomic temp+rename with
 * an explicit chmod re-assert (writeFileSync's `mode` is masked by the
 * process umask). The file stores no token (a profile only ever describes
 * *how* to reach a daemon — see desktop-api.ts's doc comment on
 * connectionProfileSchema) but 0600 still applies: its contents are
 * user-habit data (project paths, hosts, ports) worth keeping private.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { connectionProfileSchema, type ConnectionProfile } from '../shared/desktop-api';

/** Default profile-store root: `~/.deckent/desktop/`. */
export const DEFAULT_CONNECTION_PROFILE_STORE_DIR = join(homedir(), '.deckent', 'desktop');

const PROFILES_FILE_NAME = 'connection-profiles.json';

export interface ConnectionProfileListResult {
  profiles: ConnectionProfile[];
  /** Entries present in the file that failed connectionProfileSchema validation and were dropped. */
  invalidDropped: number;
  /** True when the file existed but its contents were not a valid JSON array — treated as empty, never thrown. */
  corrupted: boolean;
}

/** What a caller supplies to add() — id + createdAt are stamped by the store itself. */
export type ConnectionProfileInput = Omit<ConnectionProfile, 'id' | 'createdAt'>;

export interface ConnectionProfileStore {
  readonly filePath: string;
  list(): ConnectionProfileListResult;
  get(id: string): ConnectionProfile | undefined;
  add(input: ConnectionProfileInput): ConnectionProfile;
  remove(id: string): boolean;
}

export interface ConnectionProfileStoreOptions {
  /** Root directory holding connection-profiles.json. Defaults to ~/.deckent/desktop. */
  baseDir?: string;
}

function readProfilesFile(filePath: string): ConnectionProfileListResult {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { profiles: [], invalidDropped: 0, corrupted: false };
    }
    console.warn(
      `[connection-profile-store] read failed for ${filePath}: ${e instanceof Error ? e.message : String(e)} — treating as empty.`
    );
    return { profiles: [], invalidDropped: 0, corrupted: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(
      `[connection-profile-store] ${filePath} is not valid JSON — treating as empty. (${e instanceof Error ? e.message : String(e)})`
    );
    return { profiles: [], invalidDropped: 0, corrupted: true };
  }

  if (!Array.isArray(parsed)) {
    console.warn(`[connection-profile-store] ${filePath} does not contain a JSON array — treating as empty.`);
    return { profiles: [], invalidDropped: 0, corrupted: true };
  }

  const profiles: ConnectionProfile[] = [];
  let invalidDropped = 0;
  for (const entry of parsed) {
    const result = connectionProfileSchema.safeParse(entry);
    if (result.success) {
      profiles.push(result.data);
    } else {
      invalidDropped++;
    }
  }
  if (invalidDropped > 0) {
    console.warn(
      `[connection-profile-store] dropped ${invalidDropped} schema-invalid entr${invalidDropped === 1 ? 'y' : 'ies'} from ${filePath}`
    );
  }
  return { profiles, invalidDropped, corrupted: false };
}

/** Atomic temp+rename write, mode 0600 (same pattern as src/api/serve-daemon-meta.ts). */
function writeProfilesFile(filePath: string, baseDir: string, profiles: ConnectionProfile[]): void {
  mkdirSync(baseDir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(profiles, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // Re-assert the mode: writeFileSync's `mode` is masked by the process umask.
  chmodSync(tmp, 0o600);
  renameSync(tmp, filePath);
}

/**
 * Create a connection-profile store rooted at `options.baseDir` (default
 * `~/.deckent/desktop`). Every operation re-reads the file from disk — this
 * is a low-frequency, human-driven CRUD surface (a handful of saved
 * connections), not a hot path, so no in-memory cache is worth the added
 * multi-process-staleness risk.
 */
export function createConnectionProfileStore(options: ConnectionProfileStoreOptions = {}): ConnectionProfileStore {
  const baseDir = options.baseDir ?? DEFAULT_CONNECTION_PROFILE_STORE_DIR;
  const filePath = join(baseDir, PROFILES_FILE_NAME);

  return {
    filePath,

    list(): ConnectionProfileListResult {
      return readProfilesFile(filePath);
    },

    get(id: string): ConnectionProfile | undefined {
      return readProfilesFile(filePath).profiles.find((p) => p.id === id);
    },

    add(input: ConnectionProfileInput): ConnectionProfile {
      const { profiles } = readProfilesFile(filePath);
      const profile: ConnectionProfile = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      // Fail fast on a caller bug (e.g. an out-of-range port) instead of persisting a
      // record that only readProfilesFile's silent-drop path would ever surface again.
      connectionProfileSchema.parse(profile);
      writeProfilesFile(filePath, baseDir, [...profiles, profile]);
      return profile;
    },

    remove(id: string): boolean {
      const { profiles } = readProfilesFile(filePath);
      const next = profiles.filter((p) => p.id !== id);
      if (next.length === profiles.length) return false;
      writeProfilesFile(filePath, baseDir, next);
      return true;
    },
  };
}
