#!/usr/bin/env node
/**
 * Copy non-TS assets (JSON schemas, baseline data) from src/ to dist/.
 *
 * tsc only compiles .ts files — JSON, .md, and binary assets must be copied
 * separately. This script runs as part of `npm run build` via postbuild hook
 * and is also wired into CI (ci.yml build job).
 *
 * Sprint 141 Task 141-SAFE-01 — needed for runtime bundled baseline lookup.
 */

import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(import.meta.dirname ?? dirname(new URL(import.meta.url).pathname), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

/** File extensions to copy (non-TS assets). `.template` is read at runtime by
 *  docs-config.ts (seedDocsConfig) — without it `deckent init` silently falls
 *  back to an inline minimal docs.json. */
const ASSET_EXTENSIONS = ['.json', '.md', '.template'];

/** Bin entries from package.json — must have execute bit (Sprint 154 audit A2.F6/A3.F1). */
export const BIN_FILES = ['dist/cli/entry.js', 'dist/mcp/server.js'];
export const BUILD_IDENTITY_RELATIVE_PATH = 'dist/build-identity.json';

/**
 * Bind a compiled dist tree to the exact source checkout that produced it.
 * The distributable manifest contains only a one-way SHA-256 of the canonical
 * source root — never the build machine's absolute path.
 *
 * @param {string} root project root
 * @returns {string} written manifest path
 */
export function writeBuildIdentity(root) {
  const canonicalRoot = realpathSync.native(root);
  const pkg = JSON.parse(readFileSync(join(canonicalRoot, 'package.json'), 'utf-8'));
  if (pkg.name !== 'deckent') {
    throw new Error(`Cannot write Deckent build identity: package name is ${String(pkg.name)}`);
  }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('Cannot write Deckent build identity: package version is missing');
  }
  const manifest = {
    schemaVersion: 1,
    packageName: 'deckent',
    packageVersion: pkg.version,
    sourceRootSha256: createHash('sha256').update(canonicalRoot).digest('hex'),
  };
  const manifestPath = join(canonicalRoot, BUILD_IDENTITY_RELATIVE_PATH);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  return manifestPath;
}

/**
 * Ensure all BIN_FILES have execute bit (0o755).
 * Safe to call after bare `tsc` / `tsc --watch` which strips mode bits.
 * @param {string} [root] - project root directory (defaults to this file's parent)
 * @returns {number} count of files chmodded
 */
export function ensureBinExecutable(root) {
  const resolvedRoot = root ?? ROOT;
  let count = 0;
  for (const rel of BIN_FILES) {
    const p = join(resolvedRoot, rel);
    if (existsSync(p)) {
      chmodSync(p, 0o755);
      count++;
    }
  }
  return count;
}

function walk(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    // Skip dashboard + desktop (separate build pipelines — desktop would otherwise
    // leak its package.json/tsconfig/config manifests into dist/, born-496)
    if (entry === 'dashboard' || entry === 'desktop') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walk(full));
    } else if (ASSET_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const fixBinOnly = process.argv.includes('--fix-bin-only');

  if (!fixBinOnly) {
    let copied = 0;
    const assets = walk(SRC);
    for (const src of assets) {
      const rel = relative(SRC, src);
      const dst = join(DIST, rel);
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
      copied++;
    }

    if (copied === 0) {
      console.log('copy-assets: no assets to copy');
    } else {
      console.log(`copy-assets: copied ${copied} file${copied === 1 ? '' : 's'} to dist/`);
    }

    writeBuildIdentity(ROOT);
    console.log('copy-assets: wrote dist/build-identity.json');
  }

  // Sprint 154 A2.F6/A3.F1 fix: tsc does not propagate Unix mode bits, so dist/ bin
  // files end up -rw-r--r-- (644) and `npx deckent` fails with EACCES. Restore +x.
  const chmodCount = ensureBinExecutable(ROOT);
  if (chmodCount > 0) {
    console.log(`copy-assets: chmod +x ${chmodCount} bin file${chmodCount === 1 ? '' : 's'}`);
  }
}
