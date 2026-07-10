/**
 * Serve-Daemon Meta — DESK-1 (born-496, ADR-G-033) daemon handshake file.
 *
 * `deckent serve` writes `<projectRoot>/.deckent/serve-daemon.json` on startup so
 * a desktop shell (or any local client) can make the adopt-vs-spawn decision:
 *   1. read this file → missing ⇒ spawn;
 *   2. `verifyPidOwnership({pid, startToken})` (src/core/pid-ownership.ts) →
 *      'dead'/'reused' ⇒ stale, clear + spawn;
 *   3. `GET /health` liveness + projectRoot identity ⇒ adopt (reuse the tokens
 *      below — the daemon process still holds them in memory).
 *
 * SECURITY: the file carries live credentials (API + terminal tokens) → written
 * atomically (temp + rename, same pattern as sprint-pid-manager's atomicWriteSync)
 * with mode 0600, and it is gitignored. It deliberately lives per-project (not in
 * ~/.deckent) so multiple projects can run daemons side by side.
 *
 * Best-effort lifecycle: written after the server starts listening, cleared in the
 * SIGINT/SIGTERM cleanup path. A crash can leave a stale file — that is fine by
 * design: readers MUST treat it as a hint and re-verify via pid-ownership + /health
 * (steps 2-3), never as proof of a live daemon.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DECKENT_DIR, DECKENT_VERSION } from '../core/constants.js';
import { processStartToken } from '../core/pid-ownership.js';
import { createDebugLog } from '../core/debug-log.js';

const debug = createDebugLog('serve-daemon-meta');

/**
 * Local minimal JSON reader — deliberately NOT core/utils.readJsonSafe: that
 * import drags the whole core/types → config-types → connectors type-hub into
 * every consumer's typecheck program, which breaks the desktop shell's
 * DOM-lib tsconfig on unrelated files (sprint-392 xfix root-cause,
 * --explainFiles-traced). This module must stay a leaf: node builtins +
 * constants + pid-ownership + debug-log only.
 */
function readJsonFileSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

/** Repo-relative path of the daemon handshake file. */
export const SERVE_DAEMON_META_PATH = join(DECKENT_DIR, 'serve-daemon.json');

export interface ServeDaemonMeta {
  pid: number;
  /** Pid-reuse-safe ownership token (src/core/pid-ownership.ts processStartToken). */
  startToken: string | null;
  startedAt: string;
  host: string;
  port: number;
  /** Absolute project root this daemon serves — adopt only on exact match. */
  projectRoot: string;
  /** Effective /api/* bearer token (absent ⇒ auth disabled on this daemon). */
  apiToken?: string;
  /** Embedded web-terminal session token (absent ⇒ terminal disabled). */
  terminalToken?: string;
  terminalEnabled: boolean;
  version: string;
}

/** Inputs the caller (serve.ts) must supply; pid/startToken/startedAt/version are stamped here. */
export type ServeDaemonMetaInput = Omit<ServeDaemonMeta, 'pid' | 'startToken' | 'startedAt' | 'version'>;

/**
 * Atomically write the handshake file (temp + rename, mode 0600). Throws on
 * failure — the caller decides whether that is fatal (serve.ts treats it as a
 * non-fatal warn: the daemon is still fully usable without the desktop handshake).
 */
export function writeServeDaemonMeta(projectRoot: string, input: ServeDaemonMetaInput): ServeDaemonMeta {
  const meta: ServeDaemonMeta = {
    pid: process.pid,
    startToken: processStartToken(process.pid),
    startedAt: new Date().toISOString(),
    version: DECKENT_VERSION,
    ...input,
  };
  const target = join(projectRoot, SERVE_DAEMON_META_PATH);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(meta, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // Re-assert the mode: writeFileSync's `mode` is masked by the process umask,
  // and the file carries live tokens — 0600 must hold regardless of umask.
  chmodSync(tmp, 0o600);
  renameSync(tmp, target);
  return meta;
}

/**
 * Read the handshake file. Returns null when absent, unparsable, or missing the
 * minimal shape (pid + port + projectRoot) — callers never see a half-formed meta.
 */
export function readServeDaemonMeta(projectRoot: string): ServeDaemonMeta | null {
  const raw = readJsonFileSafe<ServeDaemonMeta>(join(projectRoot, SERVE_DAEMON_META_PATH));
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.pid !== 'number' || typeof raw.port !== 'number' || typeof raw.projectRoot !== 'string') {
    return null;
  }
  return raw;
}

/** Best-effort removal (shutdown path). Never throws. */
export function clearServeDaemonMeta(projectRoot: string): void {
  try {
    unlinkSync(join(projectRoot, SERVE_DAEMON_META_PATH));
  } catch (e) {
    debug.debug(`clear: ${e instanceof Error ? e.message : String(e)}`);
  }
}
