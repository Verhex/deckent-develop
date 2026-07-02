// ═══ session-registry — REPL çok-oturum kayıt-defteri (Sıra-65 F7-MULTISESSION) ═══
//
// Disk-backed registry of concurrently-running REPL sessions for THIS project,
// at `.deckent/settings/repl-sessions.json` (SETTINGS_DIR). Feeds two follow-up
// surfaces (wire TBD, out of scope here): the `/resume` picker (which sessions
// are live right now) and a "4+ parallel sessions" usage-cost warning. Each
// session is identified by its own OS pid — registerSession() records
// {pid, startedAt, tty}; cleanupStale() drops entries whose pid is no longer
// alive (isPidAlive from core/pid-liveness.ts, injectable for hermetic
// fake-pid-probe tests). Pure data core — like session-resume.ts, it never
// formats a user-facing string, so no i18n dependency.
//
// Multi-writer atomicity: every mutating call re-reads the full file, applies
// its change, and writes via tmp-file + rename (same pattern as
// approval-allowscope.ts / connectors/gateway/session-registry.ts) — so N
// concurrent REPL processes each registering their own session never clobber
// each other's entries, because each write starts from the latest on-disk
// state rather than a stale in-memory copy.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { SETTINGS_DIR } from '../../core/constants.js';
import { isPidAlive } from '../../core/pid-liveness.js';

/** Project-root-relative path to the persisted session registry. */
export const SESSIONS_FILE = join(SETTINGS_DIR, 'repl-sessions.json');

export interface ReplSession {
  readonly pid: number;
  /** ISO 8601 UTC timestamp. */
  readonly startedAt: string;
  /** tty device identity as supplied by the caller at registration time (e.g. `/dev/pts/3`), or null when unknown. */
  readonly tty: string | null;
}

export interface SessionRegistryOptions {
  /** Absolute path override (tests). Default: `<projectRoot>/.deckent/settings/repl-sessions.json`. */
  filePath?: string;
  /** Clock seam (tests). Default: real ISO now. */
  now?: () => string;
  /** Liveness seam (tests) — fake-pid-probe. Default: isPidAlive. */
  isAlive?: (pid: number) => boolean;
}

function resolvePath(projectRoot: string, opts: SessionRegistryOptions): string {
  return opts.filePath ?? join(projectRoot, SESSIONS_FILE);
}

function isReplSessionLike(entry: unknown): entry is { pid: number; startedAt: string; tty?: unknown } {
  if (entry === null || typeof entry !== 'object') return false;
  const candidate = entry as { pid?: unknown; startedAt?: unknown };
  return typeof candidate.pid === 'number' && typeof candidate.startedAt === 'string';
}

/** Fail-soft load: missing file, corrupt JSON, non-array top level, or malformed entries all yield []. */
function loadSessions(filePath: string): ReplSession[] {
  if (!existsSync(filePath)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(raw)) return [];
    const sessions: ReplSession[] = [];
    for (const entry of raw) {
      if (!isReplSessionLike(entry)) continue;
      sessions.push({
        pid: entry.pid,
        startedAt: entry.startedAt,
        tty: typeof entry.tty === 'string' ? entry.tty : null,
      });
    }
    return sessions;
  } catch {
    return [];
  }
}

/** Atomic write — tmp file + rename, best-effort unlink of the tmp file on a failed rename. */
function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — the rename error below is what the caller needs.
    }
    throw err;
  }
}

/**
 * Register (or refresh) a session entry for `pid`. Re-reads the latest
 * on-disk state first, so concurrent registrations from sibling REPL
 * processes never clobber each other (last-write-wins per pid, not
 * per-process in-memory state). Re-registering the same pid replaces its
 * prior entry (fresh startedAt/tty) rather than duplicating it.
 */
export function registerSession(
  projectRoot: string,
  pid: number,
  tty: string | null,
  opts: SessionRegistryOptions = {},
): ReplSession {
  const filePath = resolvePath(projectRoot, opts);
  const now = opts.now ?? ((): string => new Date().toISOString());
  const session: ReplSession = { pid, startedAt: now(), tty };

  const sessions = loadSessions(filePath).filter((s) => s.pid !== pid);
  sessions.push(session);
  atomicWriteJson(filePath, sessions);
  return session;
}

/**
 * List registered sessions. Alive-only by default (isPidAlive, injectable
 * via `opts.isAlive`); pass `{ includeDead: true }` to see the raw on-disk
 * set without a liveness filter (diagnostic use).
 */
export function listActive(
  projectRoot: string,
  opts: SessionRegistryOptions & { includeDead?: boolean } = {},
): ReplSession[] {
  const filePath = resolvePath(projectRoot, opts);
  const isAlive = opts.isAlive ?? isPidAlive;
  const sessions = loadSessions(filePath);
  return opts.includeDead === true ? sessions : sessions.filter((s) => isAlive(s.pid));
}

/**
 * Drop every session whose pid is no longer alive and persist the pruned
 * set. Returns the removed entries. Skips the write entirely when nothing
 * was stale, to avoid a gratuitous atomic-write cycle on every call.
 */
export function cleanupStale(
  projectRoot: string,
  opts: SessionRegistryOptions = {},
): ReplSession[] {
  const filePath = resolvePath(projectRoot, opts);
  const isAlive = opts.isAlive ?? isPidAlive;
  const sessions = loadSessions(filePath);
  const live = sessions.filter((s) => isAlive(s.pid));
  const stale = sessions.filter((s) => !isAlive(s.pid));
  if (stale.length > 0) atomicWriteJson(filePath, live);
  return stale;
}
