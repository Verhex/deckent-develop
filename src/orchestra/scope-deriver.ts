// ─── Scope Auto-Derivation (Sprint 196 WP-3) ────────────────────────────────
// Infers test file paths from scope.filesWrite to prevent boundary violations
// caused by missing test directory entries in DIRECTIVES (Sprint 195 195-001/002).

export interface DerivedTestScope {
  extraFiles: string[];
  extraDirs: string[];
}

/**
 * Derive test file paths from a list of filesWrite paths.
 *
 * Heuristics:
 * - `src/X/Y.ts`    → `tests/X/Y.test.ts`, `tests/X/Y-edge.test.ts`, `tests/X/Y-split.test.ts`
 * - `src/X.ts`      → `tests/X.test.ts`, `tests/X-edge.test.ts`, `tests/X-split.test.ts`
 * - `scripts/X.mjs` → `tests/scripts/X.test.ts`
 * - `scripts/X.ts`  → `tests/scripts/X.test.ts`
 * - `docs/X.md`     → (none — doc-only, no test needed)
 *
 * Returns only path strings; does not check file existence.
 * The caller is responsible for idempotency (filter against existing scope.filesWrite).
 */
export function deriveTestScope(filesWrite: string[]): DerivedTestScope {
  const extraFiles: string[] = [];
  const extraDirSet = new Set<string>();

  for (const f of filesWrite) {
    if (f.startsWith('src/') && f.endsWith('.ts')) {
      // Remove src/ prefix and .ts suffix to get the relative path stem
      const stem = f.slice('src/'.length, -'.ts'.length);
      const mirror = `tests/${stem}.test.ts`;
      const edge = `tests/${stem}-edge.test.ts`;
      const split = `tests/${stem}-split.test.ts`;
      extraFiles.push(mirror, edge, split);
      // Add parent test dir
      const lastSlash = stem.lastIndexOf('/');
      if (lastSlash >= 0) {
        extraDirSet.add(`tests/${stem.slice(0, lastSlash + 1)}`);
      } else {
        extraDirSet.add('tests/');
      }
    } else if (f.startsWith('scripts/') && (f.endsWith('.mjs') || f.endsWith('.ts'))) {
      const basename = f.slice('scripts/'.length);
      // Strip extension
      const stem = basename.replace(/\.(mjs|ts)$/, '');
      extraFiles.push(`tests/scripts/${stem}.test.ts`);
      extraDirSet.add('tests/scripts/');
    }
    // docs/* → no test files needed
  }

  return {
    extraFiles,
    extraDirs: Array.from(extraDirSet),
  };
}
