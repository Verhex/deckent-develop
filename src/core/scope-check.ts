// ═══ Scope Check ═══════════════════════════════════════════════════════
// Realpath-based scope-containment primitive (ADR-G-017 SYMLINK-AUTHORITY-WIRE).
//
// Single source of truth for `isWithinScope` / `resolveContainment` /
// `resolveRealPath` — previously duplicated in src/orchestra/authority-enforcer.ts
// and src/core/tool-scope-gate.ts (Sprint 352 Task 352-010 left the duplicate as
// tracked debt; this module dissolves it, mirroring the messages→core precedent
// from ADR-D-004 D004-W9).
//
// Lives in core/ so both consumers resolve correctly under ADR-D-004 C1
// (core/ MUST NOT import orchestra/): orchestra/authority-enforcer.ts imports
// this module downward (orchestra → core, allowed); core/tool-scope-gate.ts
// imports it as a same-layer sibling.
//
// Plain path-normalize/prefix-match is the ADR-rejected method for scope
// containment: a symlink placed inside a declared scope that resolves outside
// the scope root passes a pure string comparison. The functions below resolve
// the REAL filesystem path of both the target and every scope root before
// comparing, closing that gap.

import { normalize, join, dirname, basename } from 'node:path';
import { realpathSync } from 'node:fs';

// ─── Types ───────────────────────────────────────────────────────────

/** Which part of a declared scope produced an `allowed`/`within` match. */
export type ScopeMatchVia = 'filesWrite' | 'filesRead' | 'directory';

/** Result of a realpath-based scope containment check. */
export interface ScopeContainmentResult {
  within: boolean;
  matchedVia?: ScopeMatchVia;
  matchedPattern?: string;
}

/** One exact-match file list to check against, labeled by which scope field it came from. */
export interface ScopeExactMatchList {
  via: ScopeMatchVia;
  files: string[];
}

// ─── Path helpers ────────────────────────────────────────────────────

/** Normalize a path for consistent matching (forward slashes, no trailing slash). */
export function normalizePath(p: string): string {
  return normalize(p).split('\\').join('/').replace(/\/$/, '');
}

/**
 * Resolve the canonical real path of `absolutePath`.
 *
 * A target that does not exist yet (e.g. a new file the worker is about to
 * create) has no realpath of its own — this walks up to the nearest existing
 * ancestor, resolves that, and rejoins the missing tail so new-file creation
 * within scope is not rejected.
 *
 * Returns `null` when the path cannot be safely resolved (symlink cycle —
 * ELOOP — or no existing ancestor found at all). Callers MUST treat `null`
 * as "does not match" (fail-closed), never as "matches everything".
 */
export function resolveRealPath(absolutePath: string): string | null {
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
export function resolveContainment(
  target: string,
  projectRoot: string,
  directories: string[],
  exactLists: ScopeExactMatchList[],
): ScopeContainmentResult {
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

/**
 * Check whether `target` (relative to `projectRoot`) is contained within the
 * worker's assigned scope. Convenience wrapper over `resolveContainment` that
 * matches the two-array (`scopeDirectories`, `scopeFilesWrite`) shape used by
 * the worker authority check in `src/orchestra/authority-enforcer.ts`.
 *
 * `scopeFilesWrite` entries authorize one exact file by nominal name (there
 * is no sub-boundary to nest inside); the realpath check instead guards
 * against that exact assigned file having been replaced by a symlink that
 * escapes the project root entirely (a planted-symlink / TOCTOU attack —
 * comparing the target's realpath to the *same* entry's realpath would be
 * circular when the two nominal strings are identical).
 */
export function isWithinScope(
  target: string,
  projectRoot: string,
  scopeDirectories: string[],
  scopeFilesWrite: string[],
): ScopeContainmentResult {
  return resolveContainment(target, projectRoot, scopeDirectories, [
    { via: 'filesWrite', files: scopeFilesWrite },
  ]);
}
