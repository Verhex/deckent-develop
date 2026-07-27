// scripts/clean.mjs — clean dist/ EXCEPT the vite-built dashboard bundle.
//
// Footgun this closes: the old `clean` was `rm -rf dist`, so a plain
// `npm run build` (tsc + copy-assets, NO dashboard) WIPED dist/dashboard and
// left `deckent serve` with no static files ("Bundled dashboard not found").
// Only `build:dashboard`/`build:all` regenerate it, so every TS-only build broke
// the served dashboard until the next full build.
//
// Fix: a TS-only `npm run build` now preserves dist/dashboard (kept from the last
// `build:all`), so serve keeps working. `build:all` runs this clean too, then
// rebuilds the dashboard on top — so the full build is byte-identical to before.
//
// Portable (node fs, no shell) to match copy-assets.mjs / build-dashboard.mjs.

import {
  existsSync,
  lstatSync,
  realpathSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_FILE = realpathSync.native(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(dirname(SOURCE_FILE), '..');
const PRESERVE = new Set(['dashboard']);

function codedError(code, target) {
  const error = new Error(`${code}:${target}`);
  error.code = code;
  return error;
}

function canonicalDirectory(directory) {
  const absolute = resolve(directory);
  return existsSync(absolute) ? realpathSync.native(absolute) : absolute;
}

function comparableEntryPath(entryPath) {
  const canonical = canonicalDirectory(entryPath);
  return process.platform === 'win32'
    ? canonical.toLocaleLowerCase('en-US')
    : canonical;
}

function isWithin(candidate, root) {
  const rel = relative(root, candidate);
  const escapesRoot = rel === '..' || rel.startsWith(`..${sep}`);
  return rel === '' || (!escapesRoot && !isAbsolute(rel));
}

function isPreservedEntry(physicalDist, entry) {
  if (PRESERVE.has(entry)) return true;
  const canonicalName = entry.toLocaleLowerCase('en-US');
  if (!PRESERVE.has(canonicalName)) return false;
  const canonicalPath = join(physicalDist, canonicalName);
  if (!existsSync(canonicalPath)) return false;
  return realpathSync.native(join(physicalDist, entry))
    === realpathSync.native(canonicalPath);
}

function testHermeticityEnabled() {
  return process.env.DECKENT_TEST_HERMETICITY === '1'
    || process.env.VITEST === 'true';
}

/**
 * Clean only the physical repository that owns this script.
 * No caller-controlled path participates in destructive authority.
 *
 * @returns {{ removed: number, preserved: string[], distDir: string }}
 */
export function cleanDist() {
  const rootDir = SOURCE_ROOT;
  const distDir = join(rootDir, 'dist');

  if (!isWithin(distDir, rootDir)) {
    throw codedError('E_CLEAN_DIST_BOUNDARY', distDir);
  }
  if (testHermeticityEnabled() && rootDir === SOURCE_ROOT) {
    throw codedError('E_HERMETIC_DIST_CLEAN', distDir);
  }
  if (!existsSync(distDir)) {
    return { removed: 0, preserved: [], distDir };
  }

  const distStats = lstatSync(distDir);
  if (distStats.isSymbolicLink()) {
    throw codedError('E_CLEAN_DIST_SYMLINK', distDir);
  }
  if (!distStats.isDirectory()) {
    throw codedError('E_CLEAN_DIST_NOT_DIRECTORY', distDir);
  }

  const physicalDist = realpathSync.native(distDir);
  if (dirname(physicalDist) !== rootDir) {
    throw codedError('E_CLEAN_DIST_BOUNDARY', physicalDist);
  }

  const entries = readdirSync(physicalDist).sort();
  const preservedEntries = new Set();
  const preserved = [];
  for (const entry of entries) {
    if (isPreservedEntry(physicalDist, entry)) {
      const preservedPath = join(physicalDist, entry);
      const preservedStats = lstatSync(preservedPath);
      if (preservedStats.isSymbolicLink()) {
        throw codedError('E_CLEAN_PRESERVED_SYMLINK', preservedPath);
      }
      if (!preservedStats.isDirectory()) {
        throw codedError('E_CLEAN_PRESERVED_NOT_DIRECTORY', preservedPath);
      }
      const physicalPreserved = realpathSync.native(preservedPath);
      if (dirname(physicalPreserved) !== physicalDist) {
        throw codedError('E_CLEAN_PRESERVED_BOUNDARY', physicalPreserved);
      }
      preservedEntries.add(entry);
      preserved.push(entry);
    }
  }

  let removed = 0;
  for (const entry of entries) {
    if (preservedEntries.has(entry)) continue;
    rmSync(join(physicalDist, entry), { recursive: true, force: true });
    removed += 1;
  }

  return { removed, preserved, distDir: physicalDist };
}

const invokedDirectly =
  process.argv[1]
  && comparableEntryPath(fileURLToPath(import.meta.url)) === comparableEntryPath(process.argv[1]);

if (invokedDirectly) {
  try {
    const { removed } = cleanDist();
    process.stdout.write(
      `[clean] dist cleaned — ${removed} entr${removed === 1 ? 'y' : 'ies'} removed, dist/dashboard preserved\n`,
    );
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'E_CLEAN_DIST_UNKNOWN';
    process.stderr.write(`[clean] ${code}\n`);
    process.exitCode = 1;
  }
}
