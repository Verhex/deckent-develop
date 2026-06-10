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

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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
    // Skip dashboard (separate build pipeline)
    if (entry === 'dashboard') continue;
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
  }

  // Sprint 154 A2.F6/A3.F1 fix: tsc does not propagate Unix mode bits, so dist/ bin
  // files end up -rw-r--r-- (644) and `npx deckent` fails with EACCES. Restore +x.
  const chmodCount = ensureBinExecutable(ROOT);
  if (chmodCount > 0) {
    console.log(`copy-assets: chmod +x ${chmodCount} bin file${chmodCount === 1 ? '' : 's'}`);
  }
}
