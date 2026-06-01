#!/usr/bin/env node
// serve-localhost-smoke.mjs — validates serve out-of-box localhost token flow.
//
// Tests: server starts with token (no DECKENT_API_AUTH_DISABLED), token is
// injected into index.html for localhost callers, POST with Bearer → not-401,
// POST without Bearer → 401, server closes cleanly.
//
// Run directly: node scripts/serve-localhost-smoke.mjs → PASS or FAIL
// Import in tests: import { readTokenFromHtml, postProtected, runSmoke } from ...

import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

const INDEX_HTML = '<html><head><title>deckent</title></head><body>SPA</body></html>';

// ─── Directory helpers ────────────────────────────────────────────────────────

function makeProjectRoot() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-proj-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function makeStaticDir() {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-static-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

// ─── HTTP helpers (exported for unit testing) ─────────────────────────────────

/**
 * Fetch GET / and extract window.__DECKENT_API_TOKEN__ from the HTML.
 * Returns the token string or null if not found.
 */
export async function readTokenFromHtml(baseUrl) {
  const res = await fetch(`${baseUrl}/`);
  const html = await res.text();
  const match = html.match(/window\.__DECKENT_API_TOKEN__\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * POST to a protected API endpoint.
 * When `token` is non-null, attaches `Authorization: Bearer <token>`.
 * Returns the HTTP status code.
 */
export async function postProtected(baseUrl, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token !== null && token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}/api/config`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return res.status;
}

// ─── Smoke scenarios ──────────────────────────────────────────────────────────

/**
 * Run 4 serve-localhost-smoke scenarios and return pass/fail report.
 * Lazily imports createHttpServer from dist/api/server.js.
 *
 * @returns {Promise<{pass: boolean, reason?: string, scenarios: string[]}>}
 */
export async function runSmoke() {
  const passed = [];
  const failed = [];

  const { createHttpServer } = await import(
    new URL('../dist/api/server.js', import.meta.url).href
  );

  const token = 'smoke-serve-token-fixed-abc123';
  const projectRoot = makeProjectRoot();
  const staticDir = makeStaticDir();
  let api;

  try {
    api = createHttpServer(projectRoot, {
      port: 0,
      apiToken: token,
      staticDir,
      host: '127.0.0.1',
    });

    await new Promise((resolve) => api.server.once('listening', resolve));
    const addr = api.server.address();
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Scenario 1: token okunur — GET / returns HTML with injected token
    try {
      const extracted = await readTokenFromHtml(baseUrl);
      if (!extracted) throw new Error('Token not found in injected HTML');
      if (extracted !== token) throw new Error(`Token mismatch: got "${extracted}"`);
      passed.push('token-injected-in-html');
    } catch (err) {
      failed.push(`token-injected-in-html: ${err.message}`);
    }

    // Scenario 2: POST 200 — Bearer token accepted (not 401)
    try {
      const status = await postProtected(baseUrl, token);
      if (status === 401) throw new Error(`Expected non-401, got 401 with valid token`);
      passed.push(`post-with-token-not-401 (status=${status})`);
    } catch (err) {
      failed.push(`post-with-token-not-401: ${err.message}`);
    }

    // Scenario 3: token'sız 401 — missing Bearer returns 401
    try {
      const status = await postProtected(baseUrl, null);
      if (status !== 401) throw new Error(`Expected 401, got ${status} without token`);
      passed.push('post-without-token-is-401');
    } catch (err) {
      failed.push(`post-without-token-is-401: ${err.message}`);
    }

    // Scenario 4: server kapanır — server.close() resolves without hanging
    try {
      await api.close();
      api = null;
      passed.push('server-closes-cleanly');
    } catch (err) {
      failed.push(`server-closes-cleanly: ${err.message}`);
    }
  } finally {
    if (api) {
      try { await api.close(); } catch { /* ignore */ }
    }
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    try { rmSync(staticDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  return {
    pass: failed.length === 0,
    reason: failed.length > 0 ? failed.join('; ') : undefined,
    scenarios: [
      ...passed.map((s) => `PASS ${s}`),
      ...failed.map((s) => `FAIL ${s}`),
    ],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === __filename) {
  runSmoke()
    .then((result) => {
      for (const line of result.scenarios) process.stdout.write(line + '\n');
      if (result.pass) {
        process.stdout.write('PASS\n');
        process.exit(0);
      } else {
        process.stderr.write(`FAIL: ${result.reason}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`FAIL: ${err.message}\n`);
      process.exit(1);
    });
}
