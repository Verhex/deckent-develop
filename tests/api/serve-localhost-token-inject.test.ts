/**
 * Sprint 216 Task 216-006 — serve localhost API-token AUTO-MINT.
 *
 * Closes the Sprint 214 hollow-DONE gap: `npx deckent serve` on localhost
 * served the dashboard fine, but with no API token configured the browser
 * had nothing to send in `Authorization: Bearer ...` and every /api/* call
 * returned 401. Sprint 214's mocked test asserted the inject helper worked
 * in isolation; this file asserts the **real HTTP path** mints a token and
 * the served HTML carries it, so `/api/status` returns 200 with that token.
 *
 * Implementation: `src/api/server.ts:921-935` (the auto-mint branch right
 * after `resolveAuthToken`). The bearer auth middleware (built right after,
 * line 940) accepts the same minted token, so an end-to-end mint→inject→
 * verify→200 round-trip is possible without any environment overrides.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';

const INDEX_HTML =
  '<html><head><title>x</title></head><body>SPA</body></html>';
const TOKEN_RE = /window\.__DECKENT_API_TOKEN__ = "([^"]+)";/;

function makeStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-mint-static-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-mint-proj-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

async function bootServer(opts: {
  apiToken?: string;
  staticDir: string;
  projectRoot: string;
  host?: string;
}): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(opts.projectRoot, {
    port: 0,
    apiToken: opts.apiToken,
    staticDir: opts.staticDir,
    host: opts.host ?? '127.0.0.1',
  });
  await new Promise<void>((resolve) =>
    api.server.once('listening', () => resolve()),
  );
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe('serve — localhost API token auto-mint', () => {
  let staticDir: string | undefined;
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;
  const envTokenBefore = process.env['DECKENT_API_TOKEN'];
  const envDisableBefore = process.env['DECKENT_API_AUTH_DISABLED'];

  afterEach(async () => {
    if (api) {
      try { await api.close(); } catch { /* ignore */ }
      api = undefined;
    }
    if (staticDir) {
      try { rmSync(staticDir, { recursive: true, force: true }); } catch { /* ignore */ }
      staticDir = undefined;
    }
    if (projectRoot) {
      try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
      projectRoot = undefined;
    }
    if (envTokenBefore === undefined) {
      delete process.env['DECKENT_API_TOKEN'];
    } else {
      process.env['DECKENT_API_TOKEN'] = envTokenBefore;
    }
    if (envDisableBefore === undefined) {
      delete process.env['DECKENT_API_AUTH_DISABLED'];
    } else {
      process.env['DECKENT_API_AUTH_DISABLED'] = envDisableBefore;
    }
  });

  // 1. Happy path: localhost host + no token configured + auth not disabled.
  //    Server must mint a token, inject it into the served HTML, AND accept
  //    that exact token via `Authorization: Bearer ...` on /api/status. Proves
  //    the full round-trip from mint → inject → bearer verify → 200.
  it('mints a token and serves /api/status=200 when none is configured', async () => {
    // Ensure a clean slate — no env-fallback token and auth NOT disabled.
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const booted = await bootServer({
      // no apiToken — must auto-mint because host is loopback
      staticDir,
      projectRoot,
      host: '127.0.0.1',
    });
    api = booted.api;

    const indexRes = await fetch(`${booted.baseUrl}/`);
    expect(indexRes.status).toBe(200);
    const html = await indexRes.text();
    expect(html).toContain('window.__DECKENT_API_TOKEN__');

    const match = html.match(TOKEN_RE);
    expect(match).not.toBeNull();
    const mintedToken = match?.[1];
    expect(mintedToken).toBeTruthy();

    const statusRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: `Bearer ${mintedToken}` },
    });
    expect(statusRes.status).toBe(200);
  });

  // 2. The minted value is a 64-char hex string — proves it came from
  //    `randomBytes(32).toString('hex')`, not from an env leak or a UUID.
  it('emits a 64-char hex token (randomBytes(32).toString("hex"))', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const booted = await bootServer({
      staticDir,
      projectRoot,
      host: '127.0.0.1',
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    const html = await res.text();
    const match = html.match(TOKEN_RE);
    expect(match).not.toBeNull();
    const token = match?.[1] ?? '';
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  // 3. Explicit token wins — when the caller passes `apiToken: 'explicit-X'`
  //    the auto-mint branch is a no-op and the served HTML carries the
  //    explicit value verbatim. Regression guard against double-mint.
  it('does not override an explicitly configured token', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const explicitToken = 'explicit-token-216-006';
    const booted = await bootServer({
      apiToken: explicitToken,
      staticDir,
      projectRoot,
      host: '127.0.0.1',
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    const html = await res.text();
    expect(html).toContain(`window.__DECKENT_API_TOKEN__ = "${explicitToken}"`);
    // The explicit token is short — make sure it was NOT shadowed by a
    // 64-char hex mint.
    const match = html.match(TOKEN_RE);
    expect(match?.[1]).toBe(explicitToken);

    // And the bearer middleware still accepts the explicit value.
    const statusRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: `Bearer ${explicitToken}` },
    });
    expect(statusRes.status).toBe(200);
  });

  // 4. Auth explicitly disabled — the user opted into bypass via the
  //    `DECKENT_API_AUTH_DISABLED=1` env var, so the auto-mint branch is
  //    intentionally skipped. The served HTML carries no token literal
  //    (`isLoopbackHost` is true but the env flag short-circuits the mint).
  it('does not mint when DECKENT_API_AUTH_DISABLED=1', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';

    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();

    const booted = await bootServer({
      staticDir,
      projectRoot,
      host: '127.0.0.1',
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('window.__DECKENT_API_TOKEN__');
    expect(html).toContain('<body>SPA</body>');
  });
});
