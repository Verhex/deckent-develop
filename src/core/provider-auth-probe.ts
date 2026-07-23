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
// Grounded per-provider methods (verified against the installed CLI contracts):
//   - claude : `claude auth status --json`; only exit 0 + JSON `loggedIn === true`
//              proves a usable local session. Credential/API-key presence alone is
//              configuration evidence, not authentication proof.
//   - codex  : `codex login status` → prints "Not logged in" with EXIT 0 (live-
//              verified — exit code is NOT a signal, parse stdout) OR
//              configured API-key presence, which remains unverified.
//   - gemini : installed CLI exposes no auth-status subcommand. OAuth/API-key
//              presence is reported as present but authentication remains unknown.
//
// PSL-6-WIRE (Sprint 356, row 206): the original `{ state, detail }` shape only
// answers "logged in or not". It cannot tell "CLI/creds missing entirely" apart
// from "creds present but a session couldn't be confirmed" — both surface as
// generic buckets. `AuthProbeResult` is enriched with three optional fields that
// make that distinction explicit: `present` (was an auth artifact found at all),
// `authenticated` (was a usable session actually confirmed), `method`
// ('subscription' | 'api-key' | 'none' — HOW, when known). All three are honest
// tri-state (`'unknown'` when the probe genuinely cannot tell, e.g. a timeout —
// never guessed) and all three are OPTIONAL: `state`/`detail` are unchanged and
// every pre-existing caller/fixture that builds a bare `{ state, detail? }`
// literal (doctor.ts's failure fallback; tests/cli/health-snapshot.test.ts,
// doctor-auth-probe.test.ts, connect-wizard.test.ts, connect-cmd.test.ts) keeps
// compiling and behaving exactly as before.

import { spawn as nodeSpawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Providers this probe understands. Anything else → 'unknown'. */
export type AuthProbeProvider = 'claude' | 'codex' | 'gemini';

/** Tri-state login result. */
export type AuthProbeState = 'logged-in' | 'logged-out' | 'unknown';

/** How a provider is authenticated. 'none' when not authenticated OR the method can't be confirmed. */
export type AuthProbeMethod = 'subscription' | 'api-key' | 'none';

export interface AuthProbeResult {
  /** Real session state — distinct from "binary installed". */
  state: AuthProbeState;
  /** Static English diagnostic (NEVER a secret value). Used by doctor (Task 6). */
  detail?: string;
  /**
   * Was an auth artifact (env key, credentials/oauth file, or a definitive CLI
   * answer) found at all — independent of whether it proves a valid session.
   * 'unknown' ONLY when the probe itself could not tell (e.g. timeout). Optional
   * for backward-compat with pre-existing `{ state, detail? }` call sites.
   */
  present?: boolean | 'unknown';
  /**
   * Was a USABLE session actually confirmed. 'unknown' whenever validity can't
   * be honestly determined (malformed file, indeterminate CLI output, timeout)
   * — never guessed. Optional for the same backward-compat reason as `present`.
   */
  authenticated?: boolean | 'unknown';
  /** How authentication happened, when known/true; 'none' otherwise. Optional, same reason. */
  method?: AuthProbeMethod;
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

function configuredApiKey(): AuthProbeResult {
  return {
    state: 'unknown',
    detail: 'API key configured; validity requires a provider request',
    present: true,
    authenticated: 'unknown',
    method: 'api-key',
  };
}

// ─── claude ────────────────────────────────────────────────────────────────

/**
 * Claude session truth comes from the CLI's structured local status contract.
 * Raw output may contain account metadata, so only the exact status fields are
 * projected and the raw envelope is never returned.
 */
async function probeClaude(
  spawnImpl: AuthProbeSpawnImpl,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<AuthProbeResult> {
  if (envValue(env, 'ANTHROPIC_API_KEY')) {
    return configuredApiKey();
  }

  const res = await spawnImpl('claude', ['auth', 'status', '--json'], { timeoutMs });
  if (res.spawnError) {
    return {
      state: 'unknown',
      detail: 'claude CLI not available',
      present: false,
      authenticated: 'unknown',
      method: 'none',
    };
  }
  if (res.timedOut) {
    return {
      state: 'unknown',
      detail: 'claude auth status timed out',
      present: 'unknown',
      authenticated: 'unknown',
      method: 'none',
    };
  }
  if (res.status !== 0) {
    return {
      state: 'unknown',
      detail: 'claude auth status exited with non-zero status',
      present: true,
      authenticated: 'unknown',
      method: 'none',
    };
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(res.stdout) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid envelope');
    parsed = value as Record<string, unknown>;
  } catch {
    return {
      state: 'unknown',
      detail: 'claude auth status returned unparseable JSON',
      present: true,
      authenticated: 'unknown',
      method: 'none',
    };
  }

  if (parsed['loggedIn'] === false) {
    return {
      state: 'logged-out',
      detail: 'claude auth status reports logged out',
      present: true,
      authenticated: false,
      method: 'none',
    };
  }
  if (parsed['loggedIn'] !== true) {
    return {
      state: 'unknown',
      detail: 'claude auth status omitted an exact loggedIn boolean',
      present: true,
      authenticated: 'unknown',
      method: 'none',
    };
  }

  const authMethod = parsed['authMethod'];
  const method: AuthProbeMethod = authMethod === 'api_key'
    ? 'api-key'
    : authMethod === 'claude.ai' ? 'subscription' : 'none';
  return {
    state: 'logged-in',
    detail: method === 'none'
      ? 'claude auth status confirms login with an unclassified method'
      : 'claude auth status confirms login',
    present: true,
    authenticated: true,
    method,
  };
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
    return configuredApiKey();
  }

  const res = await spawnImpl('codex', ['login', 'status'], { timeoutMs });
  if (res.spawnError) {
    return {
      state: 'unknown',
      detail: 'codex CLI not available',
      present: false,
      authenticated: false,
      method: 'none',
    };
  }
  if (res.timedOut) {
    return {
      state: 'unknown',
      detail: 'auth probe timed out',
      present: 'unknown',
      authenticated: 'unknown',
      method: 'none',
    };
  }

  const out = res.stdout ?? '';
  if (CODEX_LOGGED_OUT.test(out)) {
    return {
      state: 'logged-out',
      detail: 'codex login status: not logged in — run: codex login',
      present: true,
      authenticated: false,
      method: 'none',
    };
  }
  if (CODEX_LOGGED_IN.test(out)) {
    return {
      state: 'logged-in',
      detail: 'codex login status: logged in',
      present: true,
      authenticated: true,
      method: 'subscription',
    };
  }
  return {
    state: 'unknown',
    detail: 'codex login status: indeterminate output',
    present: true,
    authenticated: 'unknown',
    method: 'none',
  };
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
    return configuredApiKey();
  }

  const credPath = join(home, '.gemini', 'oauth_creds.json');
  let raw: string;
  try {
    raw = readFile(credPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') {
      return {
        state: 'unknown',
        detail: 'oauth credentials could not be inspected',
        present: 'unknown',
        authenticated: 'unknown',
        method: 'none',
      };
    }
    return {
      state: 'logged-out',
      detail: 'no oauth creds — run: gemini (then /auth)',
      present: false,
      authenticated: false,
      method: 'none',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      state: 'unknown',
      detail: 'oauth creds present but unparseable',
      present: true,
      authenticated: 'unknown',
      method: 'none',
    };
  }

  const token = (parsed as { access_token?: unknown } | null)?.access_token;
  const hasToken = typeof token === 'string' && token.length > 0;
  return hasToken
    ? {
        state: 'unknown',
        detail: 'oauth session configured; installed Gemini CLI has no auth-status contract',
        present: true,
        authenticated: 'unknown',
        method: 'subscription',
      }
    : {
        state: 'logged-out',
        detail: 'oauth creds present but no access token',
        present: true,
        authenticated: false,
        method: 'none',
      };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Probe whether a provider is ACTUALLY logged in (distinct from "CLI installed").
 *
 * Cheap and provider-call-free: Claude and Codex use their bounded local status
 * contracts; Gemini can only report credential presence because its installed CLI
 * has no auth-status subcommand. Never logs or returns raw status/account metadata
 * or secret values. Returns 'unknown' whenever validity cannot be proven.
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
      return probeClaude(spawnImpl, env, timeoutMs);
    case 'codex':
      return probeCodex(spawnImpl, env, timeoutMs);
    case 'gemini':
      return probeGemini(readFile, env, home);
    default:
      return {
        state: 'unknown',
        detail: `unsupported provider: ${String(provider)}`,
        present: 'unknown',
        authenticated: 'unknown',
        method: 'none',
      };
  }
}
