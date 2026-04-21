// ─── Scope Sanitizer ─────────────────────────────────────────────────
// Filters invalid, dangerous, or noisy paths from task scope filesWrite.
// Sprint 145 evidence: T-145-001 wrote to "config.json" and "dist/cli/entry.js"

import { debugLog } from '../core/utils.js';

export interface SanitizeResult {
  filesWrite: string[];
  warnings: string[];
  rejected: string[];
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
 * Check if a path uses a placeholder filename (foo.ts, bar.js, example.test.ts).
 * Only rejects exact base-name matches — composite names like foo-bar.ts are preserved.
 */
export function isPlaceholderPath(path: string): boolean {
  const basename = path.split('/').pop() ?? '';
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

/** Global protected filenames that workers should never write to */
const GLOBAL_PROTECTED = new Set([
  'config.json',
  'package.json',
  'tsconfig.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

/**
 * Sanitize a filesWrite array by removing invalid, dangerous, or noisy paths.
 *
 * Rules applied in order:
 * 1. Absolute paths → rejected
 * 2. Path traversal (..) → rejected
 * 3. dist/ prefix → removed
 * 4. Extension-only names (.ts, .md) → removed
 * 5. Unqualified filenames (no directory separator) → removed + warning
 * 6. Global protected files → removed
 * 7. "(yeni)" suffix stripped
 * 8. Duplicate paths (case-insensitive) → deduped
 */
export function sanitizeScope(filesWrite: string[]): SanitizeResult {
  const warnings: string[] = [];
  const rejected: string[] = [];
  const cleaned: string[] = [];

  for (const raw of filesWrite) {
    const path = raw.trim();
    if (!path) continue;

    // Rule 1: Absolute paths → reject
    if (path.startsWith('/')) {
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

    // Rule 4: Extension-only (e.g. ".ts", ".md") → remove
    if (/^\.[a-zA-Z0-9]+$/.test(path)) {
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
      // Check if it's a global protected file first (rule 6 handles those)
      if (GLOBAL_PROTECTED.has(path.toLowerCase())) {
        // Rule 6 will handle this below
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
