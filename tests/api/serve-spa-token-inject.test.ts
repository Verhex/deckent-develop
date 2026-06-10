/**
 * Sprint 269 Task 269-001 — SPA-fallback token-inject (audit finding A1) +
 * single token-resolution order (A4) + chat-stream adapter wire (B-ChatStream)
 * + output-stream eager init (B-OutputStream).
 *
 * A1 root cause: the inline inject block only matched `urlPath === '/' ||
 * '/index.html'`, so a deep-link entry or browser refresh on `/enterprise`,
 * `/status`, … served index.html through the SPA fallback WITHOUT
 * `window.__DECKENT_API_TOKEN__` — every subsequent dashboard /api/* call
 * returned 401. The fix extracts one `serveIndexWithTokenInject` helper and
 * routes BOTH paths (root + SPA fallback) through it; loopback-only semantics
 * are preserved (no token in HTML when no token exists / non-loopback).
 *
 * All tests boot the REAL HTTP server (no mocked routing) against tmpdir
 * fixtures — hermetic, model: serve-localhost-token-inject.test.ts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createHttpServer,
  setChatStreamAdapter,
  type HttpApi,
} from '../../src/api/server.js';

const INDEX_HTML =
  '<html><head><title>x</title></head><body>SPA</body></html>';
const TOKEN_RE = /window\.__DECKENT_API_TOKEN__ = "([^"]+)";/;

function makeStaticDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-spa-static-'));
  writeFileSync(join(dir, 'index.html'), INDEX_HTML, 'utf-8');
  return dir;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-spa-proj-'));
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

describe('serve — SPA-fallback token inject (A1) + token resolution (A4) + stream wires', () => {
  let staticDir: string | undefined;
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;
  const envTokenBefore = process.env['DECKENT_API_TOKEN'];
  const envDisableBefore = process.env['DECKENT_API_AUTH_DISABLED'];

  afterEach(async () => {
    setChatStreamAdapter(null);
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

  // ─── A1 — SPA-fallback inject ──────────────────────────────────────

  // 1. Root path sanity — the refactored helper still injects on `/`.
  it('injects the token on the root path /', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'tok-a1-root', staticDir, projectRoot });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.match(TOKEN_RE)?.[1]).toBe('tok-a1-root');
  });

  // 2. THE A1 fix: a deep-link entry (`/enterprise` — no such static file)
  //    rides the SPA fallback and MUST carry the injected token.
  it('injects the token on a deep-link SPA route (/enterprise)', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'tok-a1-deep', staticDir, projectRoot });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/enterprise`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<body>SPA</body>');
    expect(html.match(TOKEN_RE)?.[1]).toBe('tok-a1-deep');
  });

  // 3. Same for a second SPA route — refresh on /status must not lose the token.
  it('injects the token on a /status deep-link refresh', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'tok-a1-status', staticDir, projectRoot });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/status`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.match(TOKEN_RE)?.[1]).toBe('tok-a1-status');
  });

  // 4. End-to-end A1 round-trip: the token carried by deep-link HTML is the
  //    ACTIVE bearer token — /api/status returns 200 with it (the 401 cascade
  //    the audit observed is gone).
  it('deep-link injected token authenticates /api/status (200)', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ staticDir, projectRoot }); // loopback auto-mint
    api = booted.api;

    const html = await (await fetch(`${booted.baseUrl}/enterprise`)).text();
    const minted = html.match(TOKEN_RE)?.[1];
    expect(minted).toBeTruthy();

    const statusRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: `Bearer ${minted}` },
    });
    expect(statusRes.status).toBe(200);
  });

  // 5. No token exists (auth explicitly disabled) → deep-link HTML carries NO
  //    token literal but the SPA still renders.
  it('serves deep-link HTML without a token when auth is disabled', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ staticDir, projectRoot });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/enterprise`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('window.__DECKENT_API_TOKEN__');
    expect(html).toContain('<body>SPA</body>');
  });

  // 6. Remote bind (0.0.0.0) with no configured token: auto-mint is loopback-
  //    bind-only, so no token exists and the deep-link HTML must NOT contain a
  //    token literal — nothing to leak across the network.
  it('does not inject on a remote bind with no configured token', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ staticDir, projectRoot, host: '0.0.0.0' });
    api = booted.api;

    const res = await fetch(`${booted.baseUrl}/enterprise`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('window.__DECKENT_API_TOKEN__');
  });

  // ─── A4 — single token-resolution order ───────────────────────────
  // explicit param > env DECKENT_API_TOKEN > config api_auth_token > auto-mint

  // 7. Explicit param beats the env var — and the env value is NOT accepted
  //    by the bearer middleware (one active token, not two).
  it('explicit apiToken wins over DECKENT_API_TOKEN env', async () => {
    process.env['DECKENT_API_TOKEN'] = 'env-tok-269';
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'explicit-tok-269', staticDir, projectRoot });
    api = booted.api;

    const html = await (await fetch(`${booted.baseUrl}/`)).text();
    expect(html.match(TOKEN_RE)?.[1]).toBe('explicit-tok-269');

    const okRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: 'Bearer explicit-tok-269' },
    });
    expect(okRes.status).toBe(200);
    // Present-but-wrong token → 403 (the middleware reserves 401 for a
    // missing token). The env value must NOT be a second active token.
    const envRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: 'Bearer env-tok-269' },
    });
    expect(envRes.status).toBe(403);
  });

  // 8. Env var wins when no explicit param is given.
  it('DECKENT_API_TOKEN env is used when no explicit token is passed', async () => {
    process.env['DECKENT_API_TOKEN'] = 'env-only-tok-269';
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ staticDir, projectRoot });
    api = booted.api;

    const html = await (await fetch(`${booted.baseUrl}/`)).text();
    expect(html.match(TOKEN_RE)?.[1]).toBe('env-only-tok-269');
  });

  // 9. config api_auth_token fills the third slot (previously dead — serve
  //    never forwarded it) when neither explicit nor env is set, and beats
  //    the localhost auto-mint.
  it('config api_auth_token is used when no explicit/env token exists', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    writeFileSync(
      join(projectRoot, '.deckent', 'config.json'),
      JSON.stringify({ api_auth_token: 'config-tok-269' }),
      'utf-8',
    );
    const booted = await bootServer({ staticDir, projectRoot });
    api = booted.api;

    const html = await (await fetch(`${booted.baseUrl}/`)).text();
    expect(html.match(TOKEN_RE)?.[1]).toBe('config-tok-269');

    const okRes = await fetch(`${booted.baseUrl}/api/status`, {
      headers: { Authorization: 'Bearer config-tok-269' },
    });
    expect(okRes.status).toBe(200);
  });

  // ─── B-ChatStream — adapter-bound SSE flow ─────────────────────────

  // 10. With an adapter bound (seam wins over the config-driven fallback),
  //     /api/chat/stream emits chunk + done SSE events end-to-end.
  it('streams chunk + done SSE events when a chat adapter is bound', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'tok-chat-269', staticDir, projectRoot });
    api = booted.api;

    setChatStreamAdapter({
      send: async () => ({ text: 'hello stream', stopReason: 'end_turn' as const }),
    });

    const res = await fetch(`${booted.baseUrl}/api/chat/stream?message=hi`, {
      headers: { Authorization: 'Bearer tok-chat-269' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');
    const body = await res.text(); // server ends the stream after `done`
    expect(body).toContain('"type":"chunk"');
    expect(body).toContain('hello stream');
    expect(body).toContain('"type":"done"');
  });

  // 11. Adapter failure keeps the honest SSE-error contract — the thrown
  //     message surfaces as a `{type:'error'}` event, never a hang or a 500.
  it('emits an honest SSE error event when the adapter throws', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'tok-chat-err', staticDir, projectRoot });
    api = booted.api;

    setChatStreamAdapter({
      send: async () => { throw new Error('provider exploded'); },
    });

    const res = await fetch(`${booted.baseUrl}/api/chat/stream?message=hi`, {
      headers: { Authorization: 'Bearer tok-chat-err' },
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"type":"error"');
    expect(body).toContain('provider exploded');
  });

  // ─── B-OutputStream — eager collector ──────────────────────────────

  // 12. The very first SSE request — before ANY worker attaches — gets a 200
  //     event-stream with an (empty) snapshot instead of a lazy-init race.
  it('serves /api/output-stream on the first request before workers attach', async () => {
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    staticDir = makeStaticDir();
    projectRoot = makeProjectRoot();
    const booted = await bootServer({ apiToken: 'tok-out-269', staticDir, projectRoot });
    api = booted.api;

    const ctrl = new AbortController();
    const res = await fetch(`${booted.baseUrl}/api/output-stream?taskId=t-early`, {
      headers: { Authorization: 'Bearer tok-out-269' },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');

    // The stream stays open (live SSE) — read until the initial snapshot
    // event arrives, then abort the connection.
    const reader = res.body?.getReader();
    expect(reader).toBeTruthy();
    let text = '';
    const decoder = new TextDecoder();
    for (let i = 0; i < 5 && !text.includes('snapshot'); i++) {
      const { value, done } = await reader!.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain('event: snapshot');
    expect(text).toContain('t-early');
    ctrl.abort();
  });
});
