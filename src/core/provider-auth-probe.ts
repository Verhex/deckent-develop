// ─── Provider Auth Probe (PSL-6, Sprint 270) ────────────────────────────────
//
// "CLI present ≠ logged in." The provider adapters' detect* functions treat a
// working `<cli> --version` as `authMethod: 'session'` / `authStatus: 'ok'`
// (GAP-4 — see src/providers/claude.ts:287, gemini.ts:381, codex.ts:232). That
// answers "is the binary installed?", NOT "is there a usable session?". This
// module adds a CHEAP, network-free (or single-call) probe that reports the real
// login state so `deckent doctor` can say "CLI present but NOT logged in".
//
// Doctor wiring is Task 6 (270-006) — this module is the core probe only.
//
// Design constraints:
//   - Node builtins only (ADR-010, no new runtime deps); ESM `.js` imports.
//   - Async spawn only (NO spawnSync — event loop + hermetic test rule).
//   - Every external seam is injectable (spawnImpl / readFileImpl / env / homeDir)
//     so tests run with zero real network, filesystem, or subprocess access.
//   - SECRET SAFETY: token/credential VALUES are never read into `detail`, never
//     logged, never returned. `detail` carries only static English diagnostics.
//   - Honesty: when a provider's login state genuinely cannot be determined
//     (timeout, missing CLI, malformed creds, unsupported provider) → 'unknown'.
//     We do NOT invent a confident answer (task directive: "emin olamadığın
//     provider'da 'unknown' dön — UYDURMA").
//
// Grounded per-provider methods (verified live on a dev box / documented CLI layout):
//   - claude : `~/.claude/.credentials.json` → claudeAiOauth.accessToken (live-
//              verified shape) OR `ANTHROPIC_API_KEY` env. File-based, no network.
//   - codex  : `codex login status` → prints "Not logged in" with EXIT 0 (live-
//              verified — exit code is NOT a signal, parse stdout) OR
//              `OPENAI_API_KEY`/`DECKENT_OPENAI_API_KEY` env.
//   - gemini : `~/.gemini/oauth_creds.json` → access_token (documented gemini-cli
//              OAuth layout) OR `GEMINI_API_KEY`/`GOOGLE_API_KEY` env.

import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Providers this probe understands. Anything else → 'unknown'. */
export type AuthProbeProvider = 'claude' | 'codex' | 'gemini';

/** Tri-state login result. */
export type AuthProbeState = 'logged-in' | 'logged-out' | 'unknown';

export interface AuthProbeResult {
  /** Real session state — distinct from "binary installed". */
  state: AuthProbeState;
  /** Static English diagnostic (NEVER a secret value). Used by doctor (Task 6). */
  detail?: string;
}

/** Minimal, secret-free result of a probe subprocess. `stdout` is parsed, never logged. */
export interface AuthProbeSpawnResult {
  /** Exit code, or null when the process did not exit normally. */
  status: number | null;
  /** Combined stdout+stderr text — scanned for login keywords only. */
  stdout: string;
  /** True when the probe was killed by the timeout. */
  timedOut: boolean;
  /** True when the binary could not be spawned at all (ENOENT etc.). */
  spawnError?: boolean;
}

/** Injectable async spawn — resolves (never rejects) with an {@link AuthProbeSpawnResult}. */
export type AuthProbeSpawnImpl = (
  command: string,
  args: readonly string[],
  opts: { timeoutMs: number },
) => Promise<AuthProbeSpawnResult>;

/** Injectable file reader — must throw (like fs) when the path is absent. */
export type AuthProbeReadFile = (path: string) => string;

export interface AuthProbeOptions {
  /** Async spawn seam (codex CLI probe). Defaults to a real `child_process.spawn`. */
  spawnImpl?: AuthProbeSpawnImpl;
  /** Per-probe timeout in ms (default 5000). */
  timeoutMs?: number;
  /** File-read seam (claude/gemini credential files). Defaults to `fs.readFileSync`. */
  readFileImpl?: AuthProbeReadFile;
  /** Environment seam. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** HOME dir seam. Defaults to `os.homedir()`. */
  homeDir?: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Default async spawn used by the codex probe. Resolves (never rejects) with a
 * secret-free {@link AuthProbeSpawnResult}; on a spawn error / timeout it reports
 * `spawnError` / `timedOut` so the caller maps to 'unknown'. No spawnSync.
 */
const defaultSpawnImpl: AuthProbeSpawnImpl = (command, args, { timeoutMs }) =>
  new Promise<AuthProbeSpawnResult>((resolve) => {
    let settled = false;
    const done = (r: AuthProbeSpawnResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    let child: ReturnType<typeof nodeSpawn>;
    try {
      child = nodeSpawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve({ status: null, stdout: '', timedOut: false, spawnError: true });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', () => done({ status: null, stdout: '', timedOut: false, spawnError: true }));
    child.on('close', (code) =>
      done({ status: code, stdout: `${stdout}\n${stderr}`, timedOut }),
    );
  });

const defaultReadFile: AuthProbeReadFile = (path) => readFileSync(path, 'utf-8');

/** Non-empty trimmed env value, or undefined. */
function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key];
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

// ─── claude ────────────────────────────────────────────────────────────────

/**
 * Claude session = OAuth credentials managed by the CLI at
 * `~/.claude/.credentials.json` (`claudeAiOauth.accessToken`), OR an
 * `ANTHROPIC_API_KEY` for API auth. Both checks are local — no network.
 */
function probeClaude(
  readFile: AuthProbeReadFile,
  env: NodeJS.ProcessEnv,
  home: string,
): AuthProbeResult {
  if (envValue(env, 'ANTHROPIC_API_KEY')) {
    return { state: 'logged-in', detail: 'ANTHROPIC_API_KEY set (api auth)' };
  }

  const credPath = join(home, '.claude', '.credentials.json');
  let raw: string;
  try {
    raw = readFile(credPath);
  } catch {
    return { state: 'logged-out', detail: 'no credentials file — run: claude (then /login)' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'unknown', detail: 'credentials file present but unparseable' };
  }

  // Presence of a non-empty accessToken ⇒ a session exists (the CLI auto-refreshes
  // via refreshToken). We read only its TYPE/presence — never its value.
  const oauth = (parsed as { claudeAiOauth?: { accessToken?: unknown } } | null)?.claudeAiOauth;
  const hasToken = typeof oauth?.accessToken === 'string' && oauth.accessToken.length > 0;
  return hasToken
    ? { state: 'logged-in', detail: 'session credentials present' }
    : { state: 'logged-out', detail: 'credentials file present but no session token' };
}

// ─── codex ───────────────────────────────────────────────────────────────────

const CODEX_LOGGED_OUT = /not\s+logged\s+in|not\s+authenticated|logged\s+out/i;
const CODEX_LOGGED_IN = /logged\s+in|authenticated/i;

/**
 * Codex session via `codex login status` (a real subcommand). NOTE: it exits 0
 * even when logged out and prints "Not logged in", so we parse stdout — and the
 * logged-OUT pattern is tested FIRST because "Not logged in" also matches the
 * logged-in substring. `OPENAI_API_KEY` short-circuits (no subprocess).
 */
async function probeCodex(
  spawnImpl: AuthProbeSpawnImpl,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<AuthProbeResult> {
  if (envValue(env, 'OPENAI_API_KEY') ?? envValue(env, 'DECKENT_OPENAI_API_KEY')) {
    return { state: 'logged-in', detail: 'OPENAI_API_KEY set (api auth)' };
  }

  const res = await spawnImpl('codex', ['login', 'status'], { timeoutMs });
  if (res.spawnError) {
    return { state: 'unknown', detail: 'codex CLI not available' };
  }
  if (res.timedOut) {
    return { state: 'unknown', detail: 'auth probe timed out' };
  }

  const out = res.stdout ?? '';
  if (CODEX_LOGGED_OUT.test(out)) {
    return { state: 'logged-out', detail: 'codex login status: not logged in — run: codex login' };
  }
  if (CODEX_LOGGED_IN.test(out)) {
    return { state: 'logged-in', detail: 'codex login status: logged in' };
  }
  return { state: 'unknown', detail: 'codex login status: indeterminate output' };
}

// ─── gemini ──────────────────────────────────────────────────────────────────

/**
 * Gemini session via the documented gemini-cli OAuth file
 * `~/.gemini/oauth_creds.json` (`access_token`), OR a `GEMINI_API_KEY` /
 * `GOOGLE_API_KEY` for API auth. File-based — no network. (This layout is
 * documented for gemini-cli but was not live-verifiable in this environment;
 * a malformed file therefore yields 'unknown', not a confident answer.)
 */
function probeGemini(
  readFile: AuthProbeReadFile,
  env: NodeJS.ProcessEnv,
  home: string,
): AuthProbeResult {
  if (
    envValue(env, 'GEMINI_API_KEY') ??
    envValue(env, 'GOOGLE_API_KEY') ??
    envValue(env, 'DECKENT_GOOGLE_API_KEY')
  ) {
    return { state: 'logged-in', detail: 'GEMINI/GOOGLE API key set (api auth)' };
  }

  const credPath = join(home, '.gemini', 'oauth_creds.json');
  let raw: string;
  try {
    raw = readFile(credPath);
  } catch {
    return { state: 'logged-out', detail: 'no oauth creds — run: gemini (then /auth)' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'unknown', detail: 'oauth creds present but unparseable' };
  }

  const token = (parsed as { access_token?: unknown } | null)?.access_token;
  const hasToken = typeof token === 'string' && token.length > 0;
  return hasToken
    ? { state: 'logged-in', detail: 'oauth session present' }
    : { state: 'logged-out', detail: 'oauth creds present but no access token' };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Probe whether a provider is ACTUALLY logged in (distinct from "CLI installed").
 *
 * Cheap and network-free: claude/gemini read a local credentials file or env;
 * codex makes a single local `codex login status` call. Never reads, logs, or
 * returns any secret value. Returns 'unknown' whenever the state cannot be
 * honestly determined (timeout, missing CLI, malformed creds, unknown provider).
 *
 * @param provider 'claude' | 'codex' | 'gemini' (any other value → 'unknown').
 * @param opts     Injectable seams (spawnImpl / readFileImpl / env / homeDir / timeoutMs)
 *                 for hermetic testing; all default to real implementations.
 */
export async function probeProviderAuth(
  provider: AuthProbeProvider | string,
  opts: AuthProbeOptions = {},
): Promise<AuthProbeResult> {
  const env = opts.env ?? process.env;
  const home = opts.homeDir ?? homedir();
  const readFile = opts.readFileImpl ?? defaultReadFile;
  const spawnImpl = opts.spawnImpl ?? defaultSpawnImpl;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  switch (provider) {
    case 'claude':
      return probeClaude(readFile, env, home);
    case 'codex':
      return probeCodex(spawnImpl, env, timeoutMs);
    case 'gemini':
      return probeGemini(readFile, env, home);
    default:
      return { state: 'unknown', detail: `unsupported provider: ${String(provider)}` };
  }
}
