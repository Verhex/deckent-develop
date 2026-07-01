// ═══ Tool Scope Gate ════════════════════════════════════════════════
// Pure, realpath-based containment gate for TOOL-SCOPE enforcement
// (pivot-P0 "scope'u prompt yerine TOOL ile çöz" — Sprint 352 Task 352-010).
//
// Mirrors the realpath-based scope-containment algorithm introduced in
// src/orchestra/authority-enforcer.ts (ADR-G-017 SYMLINK-AUTHORITY-WIRE): a
// symlink placed inside scope that resolves outside the scope root is
// rejected on its REAL path, not just nominal-string-matched.
//
// This module intentionally does NOT import src/orchestra/authority-enforcer.ts.
// ADR-D-004 C1 forbids core/ importing upward from orchestra/, and this
// module's write scope for Task 352-010 does not include
// src/orchestra/authority-enforcer.ts — there is no ADR-compliant way to
// both "import from it" and "not write to it" at once. The containment
// algorithm below is re-implemented as the intended canonical home; a
// follow-up task (with write access to src/orchestra/authority-enforcer.ts)
// should refactor it to import from this module and delete its local copy.
//
// Advisory→enforce ready (ADR-G-020 V1→V2): `mode` defaults to 'advisory'.
// In 'advisory' mode a scope violation is surfaced (`violation: true`) but
// never blocks (`allowed` stays true) — this stays a pure decision function
// with no logging/IO side effect; a future worker-tool seam decides whether
// and how to log `violation`. In 'enforce' mode a violation blocks
// (`allowed: false`). The default must never be 'enforce'.

import { normalize, join, dirname, basename } from 'node:path';
import { realpathSync } from 'node:fs';

// ─── Types ───────────────────────────────────────────────────────────

/** Enforcement mode — 'advisory' never blocks, 'enforce' blocks on violation. */
export type ScopeGateMode = 'advisory' | 'enforce';

/** Which part of the declared scope produced an `allowed` decision. */
export type ScopeGateMatchedVia = 'filesWrite' | 'filesRead' | 'directory';

/** Scope declaration a gate is built from — mirrors core/task-types.ts TaskScope fields. */
export interface ScopeGateInput {
  directories?: string[];
  filesWrite?: string[];
  filesRead?: string[];
}

export interface CreateScopeGateOptions {
  /** Project root used to resolve realpaths. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Defaults to 'advisory' — never default to 'enforce'. */
  mode?: ScopeGateMode;
}

/** Result of a single checkWrite/checkRead call. */
export interface ScopeGateResult {
  /** Actionable decision after `mode` is applied. */
  allowed: boolean;
  /** Raw scope-containment verdict, independent of `mode`. */
  violation: boolean;
  reason: string;
  mode: ScopeGateMode;
  matchedVia?: ScopeGateMatchedVia;
  matchedPattern?: string;
}

export interface ScopeGate {
  readonly mode: ScopeGateMode;
  checkWrite(target: string): ScopeGateResult;
  checkRead(target: string): ScopeGateResult;
}

// ─── Path helpers ────────────────────────────────────────────────────

function normalizePath(p: string): string {
  return normalize(p).split('\\').join('/').replace(/\/$/, '');
}

/**
 * Resolve the canonical real path of `absolutePath`.
 *
 * A target that does not exist yet (e.g. a new file about to be created) has
 * no realpath of its own — this walks up to the nearest existing ancestor,
 * resolves that, and rejoins the missing tail so new-file creation within
 * scope is not rejected.
 *
 * Returns `null` when the path cannot be safely resolved (symlink cycle —
 * ELOOP — or no existing ancestor found at all). Callers MUST treat `null`
 * as "does not match" (fail-closed), never as "matches everything".
 */
function resolveRealPath(absolutePath: string): string | null {
  let current = normalize(absolutePath);
  const missingTail: string[] = [];

  while (true) {
    try {
      const real = realpathSync(current);
      const resolved = missingTail.length > 0
        ? join(real, ...[...missingTail].reverse())
        : real;
      return normalizePath(resolved);
    } catch (err: unknown) {
      const code = err instanceof Error && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;

      // Symlink cycle — unresolvable, fail closed rather than guess.
      if (code === 'ELOOP') return null;

      const parent = dirname(current);
      if (parent === current) return null; // reached filesystem root — unresolvable

      missingTail.push(basename(current));
      current = parent;
    }
  }
}

interface ContainmentMatch {
  within: boolean;
  matchedVia?: ScopeGateMatchedVia;
  matchedPattern?: string;
}

interface ExactMatchList {
  via: ScopeGateMatchedVia;
  files: string[];
}

/**
 * Check whether `target` (relative to `projectRoot`) is contained within a
 * declared scope, resolving the REAL path of the target and of every scope
 * root first — a symlink inside scope whose real target escapes the scope
 * root is rejected even though its nominal path matched.
 *
 * `exactLists` entries authorize one exact file by nominal name; the realpath
 * check guards against that exact file having been replaced by a symlink
 * that escapes the project root (a planted-symlink / TOCTOU attack).
 * `directories` entries are containment boundaries: the target's real path
 * must resolve inside the directory's own real path.
 */
function resolveContainment(
  target: string,
  projectRoot: string,
  directories: string[],
  exactLists: ExactMatchList[],
): ContainmentMatch {
  const realTarget = resolveRealPath(join(projectRoot, target));
  if (realTarget === null) return { within: false };

  const normalizedTarget = normalizePath(target);
  const realProjectRoot = resolveRealPath(projectRoot);
  const rootWithSlash = realProjectRoot !== null
    ? (realProjectRoot.endsWith('/') ? realProjectRoot : `${realProjectRoot}/`)
    : null;

  if (realProjectRoot !== null && rootWithSlash !== null) {
    for (const { via, files } of exactLists) {
      const match = files.find((f) => normalizePath(f) === normalizedTarget);
      if (match === undefined) continue;
      if (realTarget === realProjectRoot || realTarget.startsWith(rootWithSlash)) {
        return { within: true, matchedVia: via, matchedPattern: match };
      }
      // Nominal match, but the real path escapes the project root — fall
      // through to directories rather than accept an escaped path.
    }
  }

  for (const dir of directories) {
    const realDir = resolveRealPath(join(projectRoot, dir));
    if (realDir === null) continue;
    const dirWithSlash = realDir.endsWith('/') ? realDir : `${realDir}/`;
    if (realTarget === realDir || realTarget.startsWith(dirWithSlash)) {
      return { within: true, matchedVia: 'directory', matchedPattern: dir };
    }
  }

  return { within: false };
}

// ─── Gate factory ────────────────────────────────────────────────────

function applyMode(
  match: ContainmentMatch,
  target: string,
  action: 'write' | 'read',
  mode: ScopeGateMode,
): ScopeGateResult {
  if (match.within) {
    const via = match.matchedVia ?? 'directory';
    const reason = via === 'directory'
      ? `${target} is within scope directory ${match.matchedPattern}`
      : `${target} is in scope ${via}`;
    return {
      allowed: true,
      violation: false,
      reason,
      mode,
      matchedVia: match.matchedVia,
      matchedPattern: match.matchedPattern,
    };
  }

  return {
    allowed: mode === 'advisory',
    violation: true,
    reason: `${target} is outside assigned ${action} scope (TOOL-SCOPE, realpath-resolved)`,
    mode,
  };
}

/**
 * Build a pure scope gate from a task's declared scope.
 *
 * `checkWrite` allows a target matched via `scope.filesWrite` (exact file) or
 * `scope.directories` (prefix containment). `checkRead` additionally accepts
 * `scope.filesRead` (write access implies read access). A target matched by
 * neither is a `violation` — fail-closed, including when no scope was
 * declared at all.
 *
 * `mode: 'advisory'` (the default) never blocks — `allowed` stays `true` even
 * on `violation: true`; the caller is expected to log the violation. Passing
 * `mode: 'enforce'` makes `allowed` mirror `violation` (blocks on scope
 * escape). This function performs no IO or logging of its own.
 */
export function createScopeGate(scope: ScopeGateInput, options: CreateScopeGateOptions = {}): ScopeGate {
  const mode: ScopeGateMode = options.mode ?? 'advisory';
  const projectRoot = options.projectRoot ?? process.cwd();
  const directories = scope.directories ?? [];
  const filesWrite = scope.filesWrite ?? [];
  const filesRead = scope.filesRead ?? [];

  return {
    mode,
    checkWrite(target: string): ScopeGateResult {
      const match = resolveContainment(target, projectRoot, directories, [
        { via: 'filesWrite', files: filesWrite },
      ]);
      return applyMode(match, target, 'write', mode);
    },
    checkRead(target: string): ScopeGateResult {
      const match = resolveContainment(target, projectRoot, directories, [
        { via: 'filesRead', files: filesRead },
        { via: 'filesWrite', files: filesWrite },
      ]);
      return applyMode(match, target, 'read', mode);
    },
  };
}

// ─── Exports for testing ─────────────────────────────────────────────

/** Exposed for unit testing — do not use directly in production code. */
export const _testing = {
  normalizePath,
  resolveRealPath,
  resolveContainment,
};
