/**
 * Task 214-004 (DIRECTIVES 214-003) — serve: API token inject.
 *
 * Verifies the `npx deckent serve` out-of-box flow:
 *   - When the HTTP server boots with `staticDir` + an API token, the served
 *     index.html embeds `window.__DECKENT_API_TOKEN__`. The dashboard's
 *     useApi hook reads it and attaches Authorization: Bearer ... on every
 *     POST, so the user no longer has to set DECKENT_API_AUTH_DISABLED=1 to
 *     escape 401s.
 *   - The inject is localhost-only — non-loopback callers receive the
 *     unmodified HTML so the bootstrap token never leaks across the network
 *     (`isLoopbackRemote` is the production guard).
 *   - When NO token is configured at all (auth-disabled OR missing token),
 *     the inject block is a no-op — the SPA shell loads untouched.
 *
 * Implementation lives in `src/api/server.ts:1081-1111` and the helper
 * `src/api/middleware/token.ts` (`injectApiTokenIntoHtml`,
 * `isLoopbackRemote`). The wire was added in Sprint 191 Task 191-010; this
 * file pins the user-facing contract (Sprint 214 user-working kanit —
 * "wired" alone is not enough).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import {
  injectApiTokenIntoHtml,
  isLoopbackRemote,
} from '../../src/api/middleware/token.js';

const INDEX_HTML = '<html><head><title>x</title></head><body>SPA</body></html>';

function makeStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-static-inject-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-proj-inject-'));
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

async function bootInjectServer(opts: {
  apiToken?: string;
  staticDir: string;
  projectRoot: string;
}): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(opts.projectRoot, {
    port: 0,
    apiToken: opts.apiToken,
    staticDir: opts.staticDir,
    host: '127.0.0.1',
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

describe('serve — window.__DECKENT_API_TOKEN__ inject', () => {
  let staticDir: string | undefined;
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;
  const envTokenBefore = process.env['DECKENT_API_TOKEN'];
  const envDisableBefore = process.env['DECKENT_API_AUTH_DISABLED'];

  afterEach(async () => {
    if (api) {
      await api.close();
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

  // 1. Localhost positive — happy path inject on GET /.
  it('injects window.__DECKENT_API_TOKEN__ into / for a localhost caller', async () => {
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    // Disable global API auth so the GET / request itself does not 401 before
    // it ever reaches the inject branch — the inject decision is independent
    // of the API auth gate (it inspects the resolved token, not the gate).
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';

    const booted = await bootInjectServer({
      apiToken: 'serve-token-LOCAL',
      staticDir,
      projectRoot,
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('window.__DECKENT_API_TOKEN__');
    // The bootstrap script must land before </head>, so the SPA reads the
    // global synchronously before any module import runs.
    expect(html.indexOf('window.__DECKENT_API_TOKEN__')).toBeLessThan(
      html.indexOf('</head>'),
    );
  });

  // 2. Token === finalToken (explicit param round-trips into the literal).
  it('injects the exact finalToken passed to createHttpServer (param path)', async () => {
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';

    const apiToken = 'serve-token-EXACT-123';
    const booted = await bootInjectServer({
      apiToken,
      staticDir,
      projectRoot,
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    const html = await res.text();
    // JSON.stringify wraps the token in double quotes — the dashboard does
    // `window.__DECKENT_API_TOKEN__` and gets the string back verbatim.
    expect(html).toContain(`window.__DECKENT_API_TOKEN__ = "${apiToken}"`);
    // Cross-check via the pure helper: same input must produce the same
    // injected line, proving server.ts is on the public contract.
    expect(html).toContain(
      injectApiTokenIntoHtml('<html><head></head></html>', apiToken).match(
        /window\.__DECKENT_API_TOKEN__ = ".*?";/,
      )?.[0],
    );
  });

  // 3. Token === finalToken (env-var resolution via resolveAuthToken).
  it('injects DECKENT_API_TOKEN when no explicit token is configured (env path)', async () => {
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    process.env['DECKENT_API_TOKEN'] = 'serve-token-FROM-ENV';

    const booted = await bootInjectServer({
      // no explicit apiToken — must fall back to env var via resolveAuthToken
      staticDir,
      projectRoot,
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(
      'window.__DECKENT_API_TOKEN__ = "serve-token-FROM-ENV"',
    );
  });

  // 4. Auth-disabled with NO token configured anywhere — inject is a no-op.
  it('does not inject when no token is configured (auth-disabled no-op)', async () => {
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    delete process.env['DECKENT_API_TOKEN'];

    const booted = await bootInjectServer({
      // no apiToken param, no env token — finalToken === null
      staticDir,
      projectRoot,
    });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('window.__DECKENT_API_TOKEN__');
    // The SPA shell still serves — the un-injected body is intact.
    expect(html).toContain('<body>SPA</body>');
  });

  // 5. Non-localhost guard surface — proves the gate rejects non-loopback
  //    callers. `isLoopbackRemote` is the production sentinel in
  //    server.ts:1092; if it returns false the inject branch is skipped and
  //    the request falls through to the static-file serve which returns the
  //    unmodified index.html.
  it('non-localhost remoteAddress fails the isLoopbackRemote gate', () => {
    expect(isLoopbackRemote('10.0.0.1')).toBe(false);
    expect(isLoopbackRemote('192.168.1.5')).toBe(false);
    expect(isLoopbackRemote('203.0.113.42')).toBe(false);
    // Loopback still accepted — the positive case in test #1.
    expect(isLoopbackRemote('127.0.0.1')).toBe(true);
    expect(isLoopbackRemote('::1')).toBe(true);
  });
});
