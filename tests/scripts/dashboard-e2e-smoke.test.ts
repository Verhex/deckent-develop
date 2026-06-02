/**
 * Sprint 220 Task 220-015 — dashboard-e2e-smoke unit tests.
 *
 * Hermetic: every test fixture lives in os.tmpdir() and is cleaned up in
 * afterEach. No real server boot, no real network — runSmoke is only exercised
 * via the dist-missing skip-guard so the suite is safe on a fresh checkout.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkCacheBust,
  extractBundleHash,
  countNavRoutes,
  findDistDir,
  findLatestBundle,
  runSmoke,
  EXPECTED_NAV_ROUTES,
} from '../../scripts/dashboard-e2e-smoke.mjs';

const fixtures: string[] = [];

function makeTmpDir(prefix = 'deckent-dashboard-e2e-smoke-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  fixtures.push(dir);
  return dir;
}

afterEach(() => {
  while (fixtures.length > 0) {
    const dir = fixtures.pop()!;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── 1. checkCacheBust ────────────────────────────────────────────────────────

describe('checkCacheBust — Cache-Control header parser', () => {
  it('returns true for no-cache, no-store, max-age=0 (the canonical cache-bust idioms)', () => {
    expect(checkCacheBust('no-cache')).toBe(true);
    expect(checkCacheBust('no-store')).toBe(true);
    expect(checkCacheBust('max-age=0')).toBe(true);
    expect(checkCacheBust('max-age = 0')).toBe(true);
    expect(checkCacheBust('no-store, must-revalidate')).toBe(true);
    expect(checkCacheBust('private, no-cache')).toBe(true);
  });

  it('returns false for caching directives or absent header', () => {
    expect(checkCacheBust('')).toBe(false);
    expect(checkCacheBust(null as unknown as string)).toBe(false);
    expect(checkCacheBust(undefined as unknown as string)).toBe(false);
    expect(checkCacheBust('max-age=3600')).toBe(false);
    expect(checkCacheBust('public, max-age=300')).toBe(false);
    expect(checkCacheBust('immutable')).toBe(false);
  });
});

// ─── 2. extractBundleHash ─────────────────────────────────────────────────────

describe('extractBundleHash — Vite hashed bundle parser', () => {
  it('extracts hash from typical Vite HTML output', () => {
    const html = '<script type="module" crossorigin src="/assets/index-Bvv-jAXZ.js"></script>';
    expect(extractBundleHash(html)).toBe('Bvv-jAXZ');
  });

  it('handles dist index.html shape with surrounding tags', () => {
    const html = `<!doctype html><html><head>
      <script type="module" crossorigin src="/assets/index-abc123.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/index-xyz789.css">
    </head></html>`;
    expect(extractBundleHash(html)).toBe('abc123');
  });

  it('returns null when no hashed bundle is referenced', () => {
    expect(extractBundleHash('<html>no bundle</html>')).toBeNull();
    expect(extractBundleHash('')).toBeNull();
    expect(extractBundleHash(null as unknown as string)).toBeNull();
  });
});

// ─── 3. countNavRoutes ────────────────────────────────────────────────────────

describe('countNavRoutes — bundle nav-link scanner', () => {
  it('counts double-quoted nav route literals', () => {
    const bundle = '["/history","/memory","/config","/chat"]';
    expect(countNavRoutes(bundle)).toBe(4);
  });

  it('counts single-quoted nav route literals', () => {
    const bundle = "['/history','/memory','/evolution','/nervous','/enterprise']";
    expect(countNavRoutes(bundle)).toBe(5);
  });

  it('counts all expected nav routes when all are present', () => {
    const bundle = EXPECTED_NAV_ROUTES.map((r) => `"${r}"`).join(',');
    expect(countNavRoutes(bundle)).toBe(EXPECTED_NAV_ROUTES.length);
  });

  it('returns 0 for empty / invalid input', () => {
    expect(countNavRoutes('')).toBe(0);
    expect(countNavRoutes(null as unknown as string)).toBe(0);
    expect(countNavRoutes('no routes here at all')).toBe(0);
  });
});

// ─── 4. findDistDir + findLatestBundle ────────────────────────────────────────

describe('findDistDir + findLatestBundle — dist resolution', () => {
  it('returns null when no dashboard dist exists under repoRoot (the dist-yok skip path)', () => {
    const empty = makeTmpDir();
    expect(findDistDir(empty)).toBeNull();
  });

  it('returns the first matching candidate when dist/dashboard/index.html exists', () => {
    const repo = makeTmpDir();
    const dist = join(repo, 'dist', 'dashboard');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<html></html>', 'utf-8');
    expect(findDistDir(repo)).toBe(dist);
  });

  it('falls through to src/dashboard/dist candidate when dist/dashboard is absent', () => {
    const repo = makeTmpDir();
    const dist = join(repo, 'src', 'dashboard', 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<html></html>', 'utf-8');
    expect(findDistDir(repo)).toBe(dist);
  });

  it('findLatestBundle returns the hashed bundle path or null', () => {
    const dist = makeTmpDir();
    expect(findLatestBundle(dist)).toBeNull();

    const assets = join(dist, 'assets');
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(assets, 'index-abc123.js'), '// bundle', 'utf-8');
    expect(findLatestBundle(dist)).toBe(join(assets, 'index-abc123.js'));
  });
});

// ─── 5. runSmoke — hermetic skip path ─────────────────────────────────────────

describe('runSmoke — dist-yok skip-guard (hermetic, no server boot)', () => {
  it('returns { skipped: true } when no dashboard dist exists under repoRoot', async () => {
    const empty = makeTmpDir();
    const result = await runSmoke({ repoRoot: empty });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/dashboard dist not built/);
  });

  it('returns { skipped: true } when dist exists but dist/api/server.js does not', async () => {
    const repo = makeTmpDir();
    const dist = join(repo, 'dist', 'dashboard');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<script src="/assets/index-x.js"></script>', 'utf-8');
    // No dist/api/server.js → second skip-guard fires
    const result = await runSmoke({ repoRoot: repo });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/server\.js missing/);
  });
});
