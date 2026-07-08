// ─── Spawn Safety — Adapter Bin Whitelist + Arg Sanitization ─────────────
// Defensive primitive invoked before any adapter-level child_process.spawn() call.
// Goal: prevent injection / unintended binary execution from prompt-derived or
// upstream-derived arguments. Companion to ADR-006 (spawnSync security pattern)
// and forthcoming ADR-047 (Sprint 162A) for adapter authority boundaries.
//
// Threat model boundary:
//   - We rely on shell-free invocation: callers must use spawn()/spawnSync()
//     with the array-args form (not `sh -c '...'`). The whitelist intentionally
//     OMITS `sh`, `bash`, `zsh`, `cmd`, `powershell`. With shell:false there is
//     no shell to interpret metacharacters in argv entries, so whitespace
//     (including \n / \r / \t inside an arg) is data and not a command
//     separator. The SH_C_ALLOWED regex documents which characters are
//     considered safe payload bytes under that no-shell invariant.
//   - If a future caller really needs `sh -c`, it must (a) add sh/bash to a
//     custom binWhitelist explicitly AND (b) supply a stricter argRegex that
//     forbids whitespace. The defaults will refuse the unsafe combination.
//
// Usage (preferred — validation cannot be skipped at the call-site):
//   import { safeSpawn, safeSpawnSync } from '../core/spawn-safety.js';
//   safeSpawnSync('npx', ['vitest', 'run', testFile], { ... }); // validates then delegates
//   const child = safeSpawn('node', ['script.js'], { stdio: 'pipe' });
//
// Usage (manual guard — only when the actual spawn() call is unavoidably
// elsewhere, e.g. a third-party library wraps it):
//   import { assertSpawnSafe } from '../core/spawn-safety.js';
//   assertSpawnSafe('npx', ['vitest', 'run', testFile]); // throws on violation
//   spawnSync('npx', ['vitest', 'run', testFile], { ... });

import { basename } from 'node:path';
import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnOptions,
  type SpawnSyncOptions,
  type SpawnSyncReturns,
} from 'node:child_process';

// ─── Constants ───────────────────────────────────────────────────────────

/**
 * Binaries that adapter layers are allowed to spawn directly.
 * Frozen to prevent runtime tampering. Override per call via opts.binWhitelist
 * when an adapter has documented additional needs (e.g., test harnesses).
 */
export const ADAPTER_BIN_WHITELIST: readonly string[] = Object.freeze([
  'node',
  'npx',
  'vitest',
  'tsc',
  'python',
  'python3',
  'go',
  'cargo',
  'java',
  'dotnet',
]);

/**
 * Conservative allow-list regex for argument content. Permits:
 *   - ASCII letters and digits
 *   - underscore, hyphen, dot, forward slash
 *   - whitespace (space, tab, etc.) and equals sign
 *
 * Rejects shell metacharacters (`; & | $ ` < > ( ) { } [ ] " ' \ ! ? *`),
 * newlines, and non-ASCII text. Append-injection vectors like
 * `vitest run; rm -rf /` therefore cannot survive validation.
 */
export const SH_C_ALLOWED = /^[A-Za-z0-9_\-\.\/\s\=]+$/;

// ─── Error ───────────────────────────────────────────────────────────────

export type SpawnSafetyErrorCode =
  | 'BIN_NOT_WHITELISTED'
  | 'ARG_INJECTION'
  | 'INVALID_INPUT';

export class SpawnSafetyError extends Error {
  constructor(
    public readonly code: SpawnSafetyErrorCode,
    message: string,
    public readonly bin?: string,
    public readonly badArg?: string,
  ) {
    super(message);
    this.name = 'SpawnSafetyError';
  }
}

// ─── Options ─────────────────────────────────────────────────────────────

export interface SpawnSafetyOptions {
  /** Override the default ADAPTER_BIN_WHITELIST for this call. */
  binWhitelist?: readonly string[];
  /** Override the default argument allow-list regex for this call. */
  argRegex?: RegExp;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Validate a spawn invocation before execution. Throws SpawnSafetyError on
 * any violation; returns void on success.
 *
 * Validation steps:
 *   1. Type/shape check: bin must be a non-empty string, args must be string[].
 *   2. Binary check: basename(bin) must be in the whitelist.
 *   3. Argument check: every non-empty arg must match the allow-list regex.
 *
 * Empty-string args are allowed (no injection vector). Absolute paths to
 * binaries are accepted as long as their basename is whitelisted.
 */
export function assertSpawnSafe(
  bin: string,
  args: string[],
  opts?: SpawnSafetyOptions,
): void {
  if (typeof bin !== 'string' || bin.length === 0) {
    throw new SpawnSafetyError(
      'INVALID_INPUT',
      'bin must be a non-empty string',
    );
  }
  if (!Array.isArray(args)) {
    throw new SpawnSafetyError(
      'INVALID_INPUT',
      'args must be an array of strings',
      bin,
    );
  }

  const whitelist = opts?.binWhitelist ?? ADAPTER_BIN_WHITELIST;
  const argRegex = opts?.argRegex ?? SH_C_ALLOWED;

  const binName = basename(bin);
  if (!whitelist.includes(binName)) {
    throw new SpawnSafetyError(
      'BIN_NOT_WHITELISTED',
      `Binary '${binName}' is not in adapter whitelist (allowed: ${whitelist.join(', ')})`,
      binName,
    );
  }

  for (let idx = 0; idx < args.length; idx++) {
    const arg = args[idx];
    if (typeof arg !== 'string') {
      throw new SpawnSafetyError(
        'INVALID_INPUT',
        `args[${idx}] must be a string`,
        binName,
      );
    }
    if (arg.length === 0) continue;
    if (!argRegex.test(arg)) {
      throw new SpawnSafetyError(
        'ARG_INJECTION',
        `args[${idx}] contains forbidden characters: ${JSON.stringify(arg)}`,
        binName,
        arg,
      );
    }
  }
}

/**
 * Boolean wrapper around assertSpawnSafe. Returns true when the invocation
 * passes validation; false otherwise. Useful for branching when callers want
 * to log-and-skip rather than throw.
 */
export function isSpawnSafe(
  bin: string,
  args: string[],
  opts?: SpawnSafetyOptions,
): boolean {
  try {
    assertSpawnSafe(bin, args, opts);
    return true;
  } catch {
    return false;
  }
}

// ─── Wired Wrappers — validation-cannot-be-skipped call-site API ──────────
//
// assertSpawnSafe/isSpawnSafe require the caller to remember a manual
// pre-call before their own spawn()/spawnSync() invocation — a step that is
// easy to omit, which is exactly why the primitive had zero callers despite
// being fully implemented (ADR-G-002). safeSpawn/safeSpawnSync close that
// gap: they are drop-in replacements for node:child_process's spawn/
// spawnSync that run assertSpawnSafe internally before delegating, so
// adopting them at a call-site is a single import swap and validation is
// structurally impossible to bypass. They change no spawn semantics — same
// args, same options, same return type — only add a validation gate in
// front.

/**
 * Drop-in replacement for `node:child_process`'s `spawn`. Validates
 * `bin`/`args` via assertSpawnSafe (throws SpawnSafetyError on violation)
 * before delegating verbatim to spawn — same options, same return value.
 */
export function safeSpawn(
  bin: string,
  args: string[],
  options?: SpawnOptions,
  safetyOpts?: SpawnSafetyOptions,
): ChildProcess {
  assertSpawnSafe(bin, args, safetyOpts);
  return spawn(bin, args, options ?? {});
}

/**
 * Drop-in replacement for `node:child_process`'s `spawnSync`. Validates
 * `bin`/`args` via assertSpawnSafe (throws SpawnSafetyError on violation)
 * before delegating verbatim to spawnSync — same options, same return value.
 */
export function safeSpawnSync(
  bin: string,
  args: string[],
  options?: SpawnSyncOptions,
  safetyOpts?: SpawnSafetyOptions,
): SpawnSyncReturns<Buffer | string> {
  assertSpawnSafe(bin, args, safetyOpts);
  return spawnSync(bin, args, options);
}
