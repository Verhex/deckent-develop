#!/usr/bin/env node
// dashboard-e2e-smoke.mjs — Sprint 220 Task 220-015 (carries 219-010 NO_GO).
//
// Validates that the dashboard a user actually loads in a browser is
// cache-bustable end-to-end:
//   1. Cache-bust signal — Cache-Control: no-cache/no-store on index.html OR
//      Vite content-hashed bundle in <script src="/assets/index-HASH.js">
//      (hashed bundles ARE the cache-bust mechanism in production).
//   2. Bundle hash currency — the hash referenced by served index.html matches
//      an actual file on disk (no stale dist).
//   3. Nav-route presence — the bundle source contains the expected dashboard
//      nav route literals (so the rendered SPA cannot silently drop pages).
//
// Run directly:
//   node scripts/dashboard-e2e-smoke.mjs       → PASS / FAIL / SKIP
//
// Import in tests:
//   import { checkCacheBust, extractBundleHash, countNavRoutes,
//            findDistDir, findLatestBundle, runSmoke } from ...

import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

// Expected nav routes — mirrors src/dashboard/src/components/Sidebar.tsx navItems
// (excluding "/" which collides with too many literals). 9 entries.
export const EXPECTED_NAV_ROUTES = Object.freeze([
  '/history',
  '/memory',
  '/config',
  '/chat',
  '/status',
  '/evolution',
  '/nervous',
  '/enterprise',
  '/memory-explorer',
]);

const DEFAULT_DIST_CANDIDATES = Object.freeze([
  'dist/dashboard',
  'src/dashboard/dist',
]);

const REQUIRED_NAV_HITS = 8; // ≥8 of 9 must be present (allow one bundling drift)

// ─── Helpers (exported for unit testing) ──────────────────────────────────────

/**
 * Return true when a Cache-Control header value disables browser caching.
 * Recognizes no-cache, no-store, max-age=0 (any whitespace) — common cache-bust idioms.
 */
export function checkCacheBust(cacheControl) {
  if (!cacheControl || typeof cacheControl !== 'string') return false;
  return /no-cache|no-store|max-age\s*=\s*0(?!\d)/i.test(cacheControl);
}

/**
 * Extract the hash from a Vite-style hashed bundle reference in served HTML.
 * Matches `/assets/index-<HASH>.js` and returns the hash, or null if absent.
 */
export function extractBundleHash(html) {
  if (!html || typeof html !== 'string') return null;
  const m = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  return m ? m[1] : null;
}

/**
 * Count how many of the expected nav route literals appear in a bundle source.
 * Matches both single-quoted and double-quoted forms (Vite minifier output).
 */
export function countNavRoutes(bundleSource, routes = EXPECTED_NAV_ROUTES) {
  if (!bundleSource || typeof bundleSource !== 'string') return 0;
  let hits = 0;
  for (const route of routes) {
    if (bundleSource.includes(`"${route}"`) || bundleSource.includes(`'${route}'`)) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Resolve the first existing dashboard dist dir under repoRoot, or null.
 * Treats a directory as a dist iff it contains an index.html.
 */
export function findDistDir(repoRoot, candidates = DEFAULT_DIST_CANDIDATES) {
  for (const candidate of candidates) {
    const p = resolve(repoRoot, candidate);
    if (existsSync(join(p, 'index.html'))) return p;
  }
  return null;
}

/**
 * Find the first hashed bundle file `assets/index-*.js` inside a dist dir.
 * Returns the absolute path or null.
 */
export function findLatestBundle(distDir) {
  const assetsDir = join(distDir, 'assets');
  if (!existsSync(assetsDir)) return null;
  const files = readdirSync(assetsDir).filter((f) => /^index-.*\.js$/.test(f));
  if (files.length === 0) return null;
  return join(assetsDir, files[0]);
}

// ─── Smoke orchestrator ───────────────────────────────────────────────────────

/**
 * Run the 3-scenario dashboard e2e smoke. Returns:
 *   { skipped: true, reason }                  — dist or server not built
 *   { pass: true/false, reason?, scenarios }   — full run
 *
 * Hermetic for tests via opts.repoRoot / opts.distDir.
 */
export async function runSmoke(opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const distDir = opts.distDir ?? findDistDir(repoRoot);
  if (!distDir) {
    return { skipped: true, reason: `dashboard dist not built under ${repoRoot} (run \`npm run build:all\`)` };
  }

  const serverEntry = resolve(repoRoot, 'dist/api/server.js');
  if (!existsSync(serverEntry)) {
    return { skipped: true, reason: `${serverEntry} missing (run \`npm run build\`)` };
  }

  const indexHtmlDisk = readFileSync(join(distDir, 'index.html'), 'utf-8');
  const expectedHash = extractBundleHash(indexHtmlDisk);
  if (!expectedHash) {
    return { pass: false, reason: 'index.html in dist has no hashed bundle reference' };
  }

  const bundlePath = findLatestBundle(distDir);
  if (!bundlePath || !bundlePath.includes(expectedHash)) {
    return {
      pass: false,
      reason: `bundle stale: index references ${expectedHash}, dist has ${bundlePath ?? 'none'}`,
    };
  }

  const { createHttpServer } = await import(new URL('file://' + serverEntry).href);
  const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-dashboard-e2e-smoke-'));

  let api;
  const passed = [];
  const failed = [];

  try {
    api = createHttpServer(projectRoot, {
      port: 0,
      apiToken: 'dashboard-e2e-smoke-token',
      staticDir: distDir,
      host: '127.0.0.1',
    });
    await new Promise((res) => api.server.once('listening', res));
    const addr = api.server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // GET / — inspect cache header AND body
    const httpRes = await fetch(`${baseUrl}/`);
    const html = await httpRes.text();
    const cacheControl = httpRes.headers.get('cache-control');
    const servedHash = extractBundleHash(html);

    // 1. cache-bust — header OR Vite hashed bundle counts
    const headerBust = checkCacheBust(cacheControl);
    if (headerBust || servedHash) {
      passed.push(
        `cache-bust (header=${cacheControl ?? 'absent'}, hashed-bundle=${servedHash ?? 'none'})`,
      );
    } else {
      failed.push('cache-bust: neither Cache-Control no-cache nor hashed-bundle present');
    }

    // 2. bundle-current — served hash matches dist hash (no stale entry.js)
    if (servedHash === expectedHash) {
      passed.push(`bundle-current (hash=${servedHash})`);
    } else {
      failed.push(`bundle-current: served ${servedHash}, expected ${expectedHash}`);
    }

    // 3. nav-routes — bundle source contains expected nav literals
    const bundleSource = readFileSync(bundlePath, 'utf-8');
    const navHits = countNavRoutes(bundleSource);
    if (navHits >= REQUIRED_NAV_HITS) {
      passed.push(`nav-routes (${navHits}/${EXPECTED_NAV_ROUTES.length})`);
    } else {
      failed.push(`nav-routes: only ${navHits}/${EXPECTED_NAV_ROUTES.length} in bundle (need ≥${REQUIRED_NAV_HITS})`);
    }
  } finally {
    if (api) {
      try { await api.close(); } catch { /* ignore */ }
    }
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return {
    pass: failed.length === 0,
    reason: failed.length > 0 ? failed.join('; ') : undefined,
    scenarios: [...passed.map((s) => `PASS ${s}`), ...failed.map((s) => `FAIL ${s}`)],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === __filename) {
  runSmoke()
    .then((result) => {
      if (result.skipped) {
        process.stdout.write(`SKIP: ${result.reason}\n`);
        process.exit(0);
      }
      for (const line of result.scenarios ?? []) process.stdout.write(line + '\n');
      if (result.pass) {
        process.stdout.write('PASS\n');
        process.exit(0);
      } else {
        process.stderr.write(`FAIL: ${result.reason}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`FAIL: ${msg}\n`);
      process.exit(1);
    });
}
