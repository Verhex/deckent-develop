/**
 * Sprint 214 Task 214-005/006 — serve localhost out-of-box smoke.
 *
 * Verifies the full user-facing flow: server starts with an API token
 * (no DECKENT_API_AUTH_DISABLED), the token is injected into index.html for
 * localhost callers, a POST with the Bearer token returns non-401, and a POST
 * without the token returns 401.
 *
 * Tests import helper functions from scripts/serve-localhost-smoke.mjs for
 * parsing + assertion and use createHttpServer from src/api/server.ts (Vitest
 * handles TS transpilation) so there is no dependency on a stale dist/.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { readTokenFromHtml, postProtected } from '../../scripts/serve-localhost-smoke.mjs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INDEX_HTML = '<html><head><title>deckent</title></head><body>SPA</body></html>';

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-test-proj-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function makeStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-serve-smoke-test-static-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

async function bootServer(token: string): Promise<{ api: HttpApi; baseUrl: string; projectRoot: string; staticDir: string }> {
  const projectRoot = makeProjectRoot();
  const staticDir = makeStaticDir();
  const api = createHttpServer(projectRoot, {
    port: 0,
    apiToken: token,
    staticDir,
    host: '127.0.0.1',
  });
  await new Promise<void>((resolve) => api.server.once('listening', () => resolve()));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}`, projectRoot, staticDir };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('serve-localhost-smoke — out-of-box auth flow (no DECKENT_API_AUTH_DISABLED)', () => {
  let api: HttpApi | undefined;
  let projectRoot: string | undefined;
  let staticDir: string | undefined;

  afterEach(async () => {
    if (api) {
      await api.close();
      api = undefined;
    }
    if (projectRoot) {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      projectRoot = undefined;
    }
    if (staticDir) {
      try { rmSync(staticDir, { recursive: true, force: true }); } catch { /* ignore */ }
      staticDir = undefined;
    }
  });

  // Test 1: token okunur — GET / returns injected token
  it('token okunur — GET / returns window.__DECKENT_API_TOKEN__ matching server token', async () => {
    const token = 'serve-smoke-read-token-xyz';
    const ctx = await bootServer(token);
    api = ctx.api;
    projectRoot = ctx.projectRoot;
    staticDir = ctx.staticDir;

    const extracted = await readTokenFromHtml(ctx.baseUrl);
    expect(extracted).toBe(token);
  });

  // Test 2: POST 200 — Bearer token accepted (not 401)
  it('POST 200 — POST /api/config with valid Bearer token returns non-401', async () => {
    const token = 'serve-smoke-post-200-token';
    const ctx = await bootServer(token);
    api = ctx.api;
    projectRoot = ctx.projectRoot;
    staticDir = ctx.staticDir;

    const status = await postProtected(ctx.baseUrl, token);
    expect(status).not.toBe(401);
  });

  // Test 3: token'sız 401 — no Authorization header returns 401
  it("token'sız 401 — POST /api/config without Bearer returns 401", async () => {
    const token = 'serve-smoke-no-token-test';
    const ctx = await bootServer(token);
    api = ctx.api;
    projectRoot = ctx.projectRoot;
    staticDir = ctx.staticDir;

    const status = await postProtected(ctx.baseUrl, null);
    expect(status).toBe(401);
  });

  // Test 4: server kapanır — api.close() resolves without hanging
  it('server kapanır — api.close() resolves cleanly', async () => {
    const token = 'serve-smoke-close-token';
    const ctx = await bootServer(token);
    projectRoot = ctx.projectRoot;
    staticDir = ctx.staticDir;

    // Close explicitly here; afterEach should not throw on already-closed server
    await expect(ctx.api.close()).resolves.toBeUndefined();
    // api stays undefined so afterEach does not try to close again
    api = undefined;
  });

  // Test 5: readTokenFromHtml returns null when no token is injected
  it('readTokenFromHtml returns null when HTML has no token injection', async () => {
    // No token → no injection; but we need a server to GET / from
    // Use DECKENT_API_AUTH_DISABLED to bypass auth so static files are served
    const savedDisabled = process.env['DECKENT_API_AUTH_DISABLED'];
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    try {
      const ctx = await bootServer(''); // empty string → resolveAuthToken returns null
      api = ctx.api;
      projectRoot = ctx.projectRoot;
      staticDir = ctx.staticDir;
      const extracted = await readTokenFromHtml(ctx.baseUrl);
      // With no token configured, injectApiTokenIntoHtml is not called → no injection
      expect(extracted).toBeNull();
    } finally {
      if (savedDisabled === undefined) {
        delete process.env['DECKENT_API_AUTH_DISABLED'];
      } else {
        process.env['DECKENT_API_AUTH_DISABLED'] = savedDisabled;
      }
    }
  });
});
