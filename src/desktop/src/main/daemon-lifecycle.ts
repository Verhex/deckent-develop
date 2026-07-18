/**
 * DESK-1 (born-496) — Electron-FREE daemon-lifecycle core for the desktop main
 * process (blueprint §2). Every I/O boundary (HTTP fetch, child_process.spawn,
 * pid liveness/start-token) is deps-injectable, so adopt-vs-spawn, spawn, and
 * health-poll are all testable with zero real network/process side effects —
 * only the `.deckent/serve-daemon.json` handshake file itself is touched, via
 * `daemon-meta-client.ts` (never re-implemented here).
 */
import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { ConnectionProfile, DaemonStatus } from '../shared/desktop-api.js';
import { readServeDaemonMeta, clearServeDaemonMeta } from './daemon-meta-client.js';
import { verifyPidOwnership } from '../../../core/pid-ownership.js';

/**
 * The minimal slice of `child_process.ChildProcess` this module actually
 * uses. `spawn`'s real type is a large stdio-shape-dependent overload set —
 * pinning to that here would make every injected test fake fight overload
 * resolution for no benefit, since we only ever read `pid`, call `unref()`,
 * and listen once for 'error'/'spawn'.
 */
export interface SpawnedChildLike {
  readonly pid?: number;
  unref(): void;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'spawn', listener: () => void): this;
}

function realSpawn(command: string, args: string[], options: SpawnOptions): SpawnedChildLike {
  return nodeSpawn(command, args, options);
}

export interface DaemonLifecycleDeps {
  /** Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Defaults to `node:child_process`'s `spawn`. */
  spawnImpl?: (command: string, args: string[], options: SpawnOptions) => SpawnedChildLike;
  /** Forwarded to `verifyPidOwnership`; defaults to `isPidAlive` (src/core/pid-liveness.ts). */
  isAlive?: (pid: number) => boolean;
  /** Forwarded to `verifyPidOwnership`; defaults to `processStartToken` (src/core/pid-ownership.ts). */
  startToken?: (pid: number) => string | null;
  /** `deckent` CLI binary to spawn; defaults to the PATH-resolved name. */
  deckentBin?: string;
  /** One-shot adopt-decision health-check timeout in ms (default 2000). */
  healthCheckTimeoutMs?: number;
}

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 2000;
const INITIAL_BACKOFF_MS = 50;
const MAX_BACKOFF_MS = 1000;

export type ConnectionAction = 'adopt' | 'spawn';

export interface SpawnDaemonResult {
  status: Extract<DaemonStatus, 'spawning' | 'error'>;
  pid?: number;
  apiToken?: string;
  errorKey?: string;
  errorVars?: Record<string, string>;
}

export interface PollHealthResult {
  status: Extract<DaemonStatus, 'connected' | 'error'>;
  errorKey?: string;
}

export interface ResolveTokensResult {
  apiToken?: string;
  terminalToken?: string;
}

/** Races `promise` against a timeout; the loser is left to settle unobserved. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Adopt-vs-spawn decision (blueprint §2a). Every uncertain branch — missing
 * meta, a dead/reused pid, a health mismatch, or a health-check timeout —
 * resolves to 'spawn': adopting a daemon we cannot positively verify would
 * silently hand a desktop session to the wrong process.
 */
export async function decideConnectionAction(
  profile: ConnectionProfile,
  deps: DaemonLifecycleDeps = {},
): Promise<ConnectionAction> {
  const meta = readServeDaemonMeta(profile.projectPath);
  if (!meta) return 'spawn';

  const ownership = verifyPidOwnership({ pid: meta.pid, startToken: meta.startToken }, deps);
  if (ownership === 'dead' || ownership === 'reused') {
    clearServeDaemonMeta(profile.projectPath);
    return 'spawn';
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.healthCheckTimeoutMs ?? DEFAULT_HEALTH_CHECK_TIMEOUT_MS;
  try {
    const res = await withTimeout(fetchImpl(`http://${meta.host}:${meta.port}/health`), timeoutMs);
    if (res.status !== 200) return 'spawn';
    const body = (await res.json()) as { projectRoot?: unknown };
    return body.projectRoot === profile.projectPath ? 'adopt' : 'spawn';
  } catch {
    return 'spawn';
  }
}

/**
 * Spawn a fresh daemon for `profile` (blueprint §2b). The api token is
 * generated HERE and handed to the child via env — zero daemon-side change
 * is needed since `resolveAuthToken` (src/api/auth.ts) already prioritizes an
 * explicit config token over `DECKENT_API_TOKEN`, falling back to the env var
 * otherwise. `spawn()` does not throw synchronously on launch failure (e.g.
 * ENOENT) — it emits an async 'error' event — so this resolves via the
 * child's real 'spawn'/'error' events rather than a try/catch.
 */
export function spawnDaemon(profile: ConnectionProfile, deps: DaemonLifecycleDeps = {}): Promise<SpawnDaemonResult> {
  const spawnImpl = deps.spawnImpl ?? realSpawn;
  const apiToken = randomBytes(32).toString('hex');

  const child = spawnImpl(deps.deckentBin ?? 'deckent', ['serve', '--port', String(profile.port)], {
    cwd: profile.projectPath,
    detached: true,
    // 'ignore' on ALL fds: a detached+unref'd child with piped stdout/stderr
    // and no consumer grows an unbounded write buffer while the shell lives,
    // and after the shell quits the orphan's next write hits a closed pipe →
    // EPIPE — crashing exactly the daemon orphanShutdownOnQuit:false is meant
    // to keep alive. Log capture, if ever wanted, must be a file redirect.
    stdio: 'ignore',
    // DT-1 «Telsiz» (583 tasarım-turu): a daemon the Desktop ITSELF spawns is
    // the operator's own control plane — the SURF-7 control-mutation ratchet
    // opens via its env twin (same N5 pattern: global default stays OFF; the
    // interactive owner flips it for its own tree). An ADOPTED daemon keeps
    // whatever its operator configured — the Telsiz shows an honest
    // precondition band when the gate answers 403.
    env: { ...process.env, DECKENT_API_TOKEN: apiToken, DECKENT_CONTROL_MUTATIONS: '1' },
  });
  child.unref();

  return new Promise<SpawnDaemonResult>((resolve) => {
    child.once('error', (err: Error) => {
      resolve({ status: 'error', errorKey: 'desktop.daemon.spawn_failed', errorVars: { message: err.message } });
    });
    child.once('spawn', () => {
      resolve({ status: 'spawning', pid: child.pid, apiToken });
    });
  });
}

/**
 * Poll `GET /health` with exponential backoff until 200 or `timeoutMs`
 * elapses (blueprint §2c). Each attempt is itself capped at the remaining
 * time budget so one hanging `fetchImpl` call can never blow through the
 * overall deadline.
 */
export async function pollHealth(
  host: string,
  port: number,
  timeoutMs: number,
  deps: DaemonLifecycleDeps = {},
): Promise<PollHealthResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const start = Date.now();
  let backoff = INITIAL_BACKOFF_MS;

  for (;;) {
    const remaining = timeoutMs - (Date.now() - start);
    if (remaining <= 0) {
      return { status: 'error', errorKey: 'desktop.daemon.health_timeout' };
    }

    try {
      const res = await withTimeout(fetchImpl(`http://${host}:${port}/health`), remaining);
      if (res.status === 200) return { status: 'connected' };
    } catch {
      // not listening yet (or this attempt itself timed out) — keep polling
    }

    const afterAttempt = timeoutMs - (Date.now() - start);
    if (afterAttempt <= 0) {
      return { status: 'error', errorKey: 'desktop.daemon.health_timeout' };
    }

    await sleep(Math.min(backoff, afterAttempt));
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }
}

/**
 * Read apiToken/terminalToken from the handshake file — the SAME lookup for
 * both the adopt path and the just-spawned-then-polled path (blueprint §2d),
 * so callers never branch on how the connection was established.
 */
export function resolveTokens(projectPath: string, _deps: DaemonLifecycleDeps = {}): ResolveTokensResult {
  // _deps is accepted-but-unused: kept for call-signature parity with the
  // other three lifecycle functions (a single deps object flows through the
  // whole adopt/spawn/poll/resolve pipeline from the caller's perspective).
  const meta = readServeDaemonMeta(projectPath);
  if (!meta) return {};
  return { apiToken: meta.apiToken, terminalToken: meta.terminalToken };
}
