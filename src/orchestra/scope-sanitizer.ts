// ─── Scope Sanitizer ─────────────────────────────────────────────────
// Filters invalid, dangerous, or noisy paths from task scope filesWrite.
// Sprint 145 evidence: T-145-001 wrote to "config.json" and "dist/cli/entry.js"

import { posix, win32 } from 'node:path';

import { debugLog } from '../core/utils.js';

export interface SanitizeResult {
  filesWrite: string[];
  warnings: string[];
  rejected: string[];
}

export interface SanitizeReadResult {
  filesRead: string[];
  warnings: string[];
  rejected: string[];
}

function isAbsoluteScopePath(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:/u.test(path);
}

function hasTraversalSegment(path: string): boolean {
  return path.split(/[\\/]/u).includes('..');
}

function hasGlobSyntax(path: string): boolean {
  return /[*?\[\]{}]/u.test(path);
}

function hasControlCharacter(path: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(path);
}

// ─── Code Snippet False Positive Filters (Sprint 149) ──────────────

/** Placeholder filenames commonly used in code examples */
const PLACEHOLDER_NAMES = new Set(['foo', 'bar', 'baz', 'qux', 'example', 'test']);

/** Known real dotfiles that should NOT be filtered as JS access patterns */
const KNOWN_DOTFILES = new Set([
  '.gitignore', '.npmignore', '.editorconfig', '.npmrc', '.env',
  '.eslintrc', '.prettierrc', '.dockerignore', '.nvmrc', '.node-version',
  '.browserslistrc', '.babelrc', '.stylelintrc', '.huskyrc',
]);

/**
 * Check if a shallow path uses a placeholder filename (foo.ts, src/foo.ts).
 * Deep, intent-qualified targets may legitimately use conventional names (for
 * example `deneme/task-001/example.test.ts`). Fenced-code extraction is handled
 * earlier; silently deleting that exact authored target breaks new-file tasks.
 */
export function isPlaceholderPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length >= 3) return false;
  const basename = segments.at(-1) ?? '';
  // Strip all extensions: "foo.test.ts" → "foo"
  const base = basename.split('.')[0] ?? '';
  return PLACEHOLDER_NAMES.has(base.toLowerCase());
}

/**
 * Check if a string looks like a JS property access (.directories, .some, .length)
 * rather than a real file path. Only matches dot-prefixed single words with no
 * file extension, hyphens, or directory separators. Known dotfiles are excluded.
 */
export function isJsAccessPattern(path: string): boolean {
  // Must start with dot, be a single word, no slashes (not a directory path)
  if (path.includes('/') || path.includes('\\')) return false;
  // Known dotfiles are real files
  if (KNOWN_DOTFILES.has(path.toLowerCase())) return false;
  // Match: .someWord (camelCase or lowercase, letters only, no hyphens/digits)
  return /^\.[a-z][a-zA-Z]*$/.test(path);
}

/** A real file extension is alpha-led (".ts", ".md"); a trailing digit/symbol run is not. */
const REAL_EXTENSION_RE = /\.[A-Za-z][A-Za-z0-9]*$/;

/**
 * born-675 — does a BARE (no `/`/`\`) filename look like a genuine compound-name file
 * (`soul.default.md`, `a.b.c.ts`) rather than a plain single-extension name (`init.ts`)?
 * Live case: `src/agent/assets/soul.default.md` reached sanitizeScope reduced to a bare
 * fragment upstream, and Rule 5 silently dropped it as "just needs a directory prefix"
 * — real, identifiable multi-part basenames are distinctive enough to be worth
 * preserving even without their directory context; a plain `word.ext` bare name is not
 * (still genuinely unqualified, still dropped — see Rule 5).
 */
export function hasMultiDotBasename(path: string): boolean {
  if (path.includes('/') || path.includes('\\')) return false;
  const dotCount = (path.match(/\./g) ?? []).length;
  return dotCount >= 2 && REAL_EXTENSION_RE.test(path);
}

/**
 * Bare `.<token>` fragments that are EXTENSIONS, not files. Rule 4 exists to drop
 * these (a directive line yielding a lone ".ts"/".md" is noise); every OTHER bare
 * dot-led name is a real repo-root dotfile. Token class, not a filename list.
 */
const BARE_EXTENSION_TOKENS = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs',
  'md', 'mdx', 'json', 'jsonc', 'txt', 'yaml', 'yml', 'toml', 'ini',
  'css', 'scss', 'html', 'sh', 'py', 'rs', 'go',
  'test', 'spec', 'lock', 'map', 'snap',
]);

/**
 * row 3312 (d) — is this a repo-root DOTFILE (`.dockerignore`, `.npmrc`,
 * `.secrets-baseline`) rather than a bare extension fragment (`.ts`, `.md`)?
 *
 * Rule 4 used to drop every `^\.[a-zA-Z0-9]+$` token, which fires on
 * `.dockerignore` just as hard as on `.ts` — and it fires BEFORE Rule 5, so the
 * `trackedRootFiles` vouch never got a chance to speak. The class is decided by
 * the token body: a known bare extension is a fragment, anything else is a file.
 * Deciding it from the token alone (not from a caller-supplied vouch) is what
 * makes plan-time and render-time sanitization agree byte-for-byte.
 */
export function isRootDotfileToken(path: string): boolean {
  if (path.includes('/') || path.includes('\\')) return false;
  if (!path.startsWith('.') || path.length < 2) return false;
  const body = path.slice(1);
  if (body.includes('.')) return false; // ".a.b" — handled by hasMultiDotBasename
  if (BARE_EXTENSION_TOKENS.has(body.toLowerCase())) return false;
  return /^[A-Za-z][\w-]*$/.test(body);
}

/**
 * row 3312 (c)/(d) — is this a bare, extension-less repo-root FILE (`Dockerfile`,
 * `Makefile`, `LICENSE`, `NOTICE`) rather than a directory?
 *
 * Directory tokens in a scope list are conventionally lowercase (`src`, `tests`)
 * or slash-qualified; an uppercase-initial bare token with no extension is a root
 * file. Evidence: task JSON carrying a phantom `Dockerfile/` directory, and a
 * granted `Dockerfile` silently dropped by Rule 5 at render time. Misreading a
 * capitalized directory as a file NARROWS authority (one exact path instead of a
 * subtree) — it can never grant something the operator did not write.
 */
export function isBareRootFileToken(path: string): boolean {
  if (path.includes('/') || path.includes('\\')) return false;
  if (path.includes('.')) return false;
  return /^[A-Z][\w-]*$/.test(path);
}

/**
 * Shared file-vs-directory classifier for a scope token — the reader-side mirror
 * of `normalizeScopeDir` in `directives-builder.ts` (writer side). A final segment
 * carrying a real extension is a file; a root dotfile or an uppercase-initial
 * extension-less bare token is a file; everything else is a directory.
 *
 * row 3312 (c): the `Scope:`/`Kapsam:` label parser appended a slash to EVERY
 * entry, so `README.md` became the phantom directory `README.md/` and the file it
 * named never became write authority at all.
 */
export function isFileScopeToken(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed || trimmed.endsWith('/') || trimmed.endsWith('\\')) return false;
  const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const lastSegment = trimmed.slice(lastSep + 1);
  if (!lastSegment || lastSegment === '.' || lastSegment === '..') return false;
  if (REAL_EXTENSION_RE.test(lastSegment) && !lastSegment.startsWith('.')) return true;
  return isRootDotfileToken(trimmed) || isBareRootFileToken(trimmed);
}

/** Global protected filenames that workers should never write to */
const GLOBAL_PROTECTED = new Set([
  'config.json',
  'package.json',
  'tsconfig.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

/** F-1: root-DWELLING doc files a plan may legitimately CREATE in a repo that
 *  does not have them yet — a bare "README.md" in a sparse/new project is not
 *  an unqualified path, it IS the correct root location, but `trackedRootFiles`
 *  cannot vouch for a file that is not tracked yet. Bare names matching this
 *  predicate are preserved by Rule 5 instead of dropped (which SAN-1 would
 *  otherwise escalate to a plan-time BLOCK — the sparse-project path-sprawl
 *  class). GLOBAL_PROTECTED still wins via Rule 6 (package.json et al). */
const WELL_KNOWN_ROOT_FILES = new Set([
  'license', 'license.md', 'license.txt',
  'changelog.md', 'contributing.md', 'code_of_conduct.md',
  'security.md', 'notice', 'notice.md',
]);

function isWellKnownRootFile(path: string): boolean {
  const lower = path.toLowerCase();
  return WELL_KNOWN_ROOT_FILES.has(lower) || /^readme(-[a-z0-9]+)?\.(md|rst|txt)$/.test(lower);
}

/**
 * Sanitize a filesWrite array by removing invalid, dangerous, or noisy paths.
 *
 * Rules applied in order:
 * 1. Absolute paths → rejected
 * 2. Path traversal (..) → rejected
 * 3. dist/ prefix → removed
 * 4. Extension-only names (.ts, .md) → removed
 * 5. Unqualified filenames (no directory separator) → removed + warning,
 *    UNLESS the exact path is present in `trackedRootFiles` (a known git-tracked
 *    root file, e.g. README.md) — those are preserved. Rule 6 still wins: a
 *    GLOBAL_PROTECTED root file drops even if it is also in `trackedRootFiles`.
 *    ALSO preserved (silently, no warning — row 3312 (d)): a repo-root dotfile
 *    ({@link isRootDotfileToken}) and a bare extension-less root file
 *    ({@link isBareRootFileToken}) — both decided from the token alone, so a
 *    render-time re-sanitization without `trackedRootFiles` cannot re-narrow the
 *    plan-time result.
 *    ALSO preserved (silently, no warning — born-675): a bare filename with a
 *    multi-dot compound basename (`soul.default.md`, `a.b.c.ts`,
 *    {@link hasMultiDotBasename}) — a genuinely-unqualified single-extension name
 *    (`init.ts`) still drops as before.
 * 6. Global protected files → removed
 * 7. "(yeni)" suffix stripped
 * 8. Duplicate paths (case-insensitive) → deduped
 *
 * @param trackedRootFiles optional set of exact, git-tracked root filenames
 *   (e.g. `{'README.md', '.secrets-baseline'}`) that Rule 5 must not drop.
 *   Omit for prior behavior (all unqualified filenames warn+drop).
 */
export function sanitizeScope(
  filesWrite: string[],
  trackedRootFiles?: ReadonlySet<string>,
): SanitizeResult {
  const warnings: string[] = [];
  const rejected: string[] = [];
  const cleaned: string[] = [];

  for (const raw of filesWrite) {
    const path = raw.trim();
    if (!path) continue;

    // Rule 1: Absolute paths → reject
    if (isAbsoluteScopePath(path)) {
      rejected.push(path);
      continue;
    }

    // Rule 2: Path traversal → reject
    if (path.includes('..')) {
      rejected.push(path);
      continue;
    }

    // Rule 3: dist/ prefix → remove
    if (path.startsWith('dist/') || path.startsWith('dist\\')) {
      continue;
    }

    // Rule 4: Extension-only (e.g. ".ts", ".md") → remove. A real root dotfile
    // (`.dockerignore`, `.npmrc`) has the same shape but is a FILE — dropping it
    // here removed it from the worker's canonical write view before Rule 5's
    // root-file handling could preserve it (row 3312 (d), sprint-507-002).
    if (/^\.[a-zA-Z0-9]+$/.test(path) && !isRootDotfileToken(path)) {
      continue;
    }

    // Rule 9: JS property access pattern (.directories, .some, .length) → remove
    if (isJsAccessPattern(path)) {
      continue;
    }

    // Rule 10: Placeholder filenames (foo.ts, bar.js, example.test.ts) → remove
    if (isPlaceholderPath(path)) {
      continue;
    }

    // Rule 5: Unqualified filename (no / separator and not a dotfile pattern)
    // e.g. "init.ts" without "src/" prefix
    if (!path.includes('/') && !path.includes('\\')) {
      // Check if it's a global protected file first (rule 6 handles those,
      // and always wins over trackedRootFiles — see Rule 6 below)
      if (GLOBAL_PROTECTED.has(path.toLowerCase())) {
        // Rule 6 will handle this below
      } else if (trackedRootFiles?.has(path)) {
        // Known git-tracked root file (exact match) — preserve (sprint-397
        // evidence: README.md / README-TR.md / .secrets-baseline silently dropped)
      } else if (isWellKnownRootFile(path)) {
        // F-1: a root-dwelling doc file the plan legitimately CREATES (not
        // tracked yet, so trackedRootFiles cannot vouch) — preserve silently,
        // no warning: SAN-1 treats every sanitizeScope warning as a plan-time
        // BLOCK (same rationale as the multi-dot branch below).
      } else if (isRootDotfileToken(path) || isBareRootFileToken(path)) {
        // row 3312 (d): a root dotfile (`.dockerignore`) or a bare extension-less
        // root file (`Dockerfile`) — classified from the token itself, so the
        // render stage reaches the same verdict as plan-time even when no
        // `trackedRootFiles` vouch is available. Silent, for the same reason as
        // the branches above: SAN-1 reads any warning as a shrink-BLOCK.
      } else if (hasMultiDotBasename(path)) {
        // Compound-name file (soul.default.md, a.b.c.ts) that lost its directory
        // prefix upstream — preserve (born-675: silent-drop of a real file).
        // No warning: prompt-gate's SAN-1 lint treats every sanitizeScope warning
        // as a shrink-BLOCK regardless of final filesWrite membership, so warning
        // here on a path we are NOT dropping would be a false-positive BLOCK.
      } else {
        warnings.push(`Unqualified filename removed: "${path}" — needs directory prefix`);
        continue;
      }
    }

    // Rule 6: Global protected files → remove
    const basename = path.includes('/') ? path.split('/').pop()! : path;
    if (GLOBAL_PROTECTED.has(basename.toLowerCase()) && !path.includes('/')) {
      continue;
    }

    // Rule 7: Strip "(yeni)" suffix
    const stripped = path.replace(/\s*\(yeni\)\s*$/i, '').trim();

    cleaned.push(stripped);
  }

  // Rule 8: Dedupe (case-insensitive)
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of cleaned) {
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }

  if (warnings.length > 0 || rejected.length > 0) {
    debugLog('scope-sanitizer', `warnings=${warnings.length}, rejected=${rejected.length}`);
  }

  return { filesWrite: deduped, warnings, rejected };
}

/**
 * Sanitize an authored exact `filesRead` list without applying write-only
 * protections such as `GLOBAL_PROTECTED` or the unqualified-filename rule.
 * A root manifest (`package.json`, `tsconfig.json`, lockfiles) is a valid exact
 * read target even though workers must never receive write authority for it.
 *
 * Read targets remain file-exact and project-relative on every supported host:
 * POSIX/drive/UNC/device absolute paths, traversal segments, glob expressions,
 * control characters, and directory-shaped paths are rejected. Invalid authored
 * entries are reported rather than broadened to a directory fallback.
 */
export function sanitizeReadScope(filesRead: string[]): SanitizeReadResult {
  const warnings: string[] = [];
  const rejected: string[] = [];
  const cleaned: string[] = [];

  for (const raw of filesRead) {
    const path = raw.trim();
    if (!path) continue;
    if (isAbsoluteScopePath(path)
      || hasTraversalSegment(path)
      || hasGlobSyntax(path)
      || hasControlCharacter(path)
      || path.endsWith('/')
      || path.endsWith('\\')
      || path === '.') {
      rejected.push(path);
      continue;
    }
    cleaned.push(path);
  }

  const seen = new Set<string>();
  const files: string[] = [];
  for (const path of cleaned) {
    const key = path.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(path);
  }

  if (rejected.length > 0) {
    debugLog('scope-sanitizer:read', `rejected=${rejected.length}`);
  }
  return { filesRead: files, warnings, rejected };
}
