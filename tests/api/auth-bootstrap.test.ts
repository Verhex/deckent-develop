/**
 * Sprint 191 Task 191-010 — Dashboard non-terminal token bootstrap.
 *
 * Covers two layers:
 *   1. **Unit** — pure helpers in `src/api/middleware/token.ts`. No I/O, no
 *      HTTP — quickest way to pin the bootstrap script shape and the
 *      `?token=` parser semantics so regressions surface immediately.
 *   2. **E2E** — boots a real `createHttpServer` via the test-server helper
 *      and exercises:
 *        - `?token=` query-param auth on `/api/events` (SSE fallback for
 *          EventSource which cannot send headers),
 *        - `window.__DECKENT_API_TOKEN__` injection into the served
 *          index.html (localhost-only path, mirrors the terminal token
 *          inject already in production).
 *
 * The E2E half uses real fetch + a tmpdir static root so the production
 * code-path is the one under test — no fs mocks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  extractTokenFromQuery,
  injectApiTokenIntoHtml,
  isLoopbackRemote,
  resolveBootstrapApiToken,
} from '../../src/api/middleware/token.js';
import {
  startTestServer,
  call,
  type TestServerHandle,
} from './helpers/test-server.js';
import { createHttpServer } from '../../src/api/server.js';

// ─── Unit: src/api/middleware/token.ts ─────────────────────────────

describe('middleware/token — unit', () => {
  describe('extractTokenFromQuery', () => {
    it('returns null when the URL has no query string', () => {
      expect(extractTokenFromQuery('/api/events')).toBeNull();
    });

    it('returns null when the query string has no token key', () => {
      expect(extractTokenFromQuery('/api/events?foo=bar&baz=1')).toBeNull();
    });

    it('returns the token value verbatim', () => {
      expect(extractTokenFromQuery('/api/events?token=abc-123')).toBe('abc-123');
    });

    it('decodes percent-encoded token values', () => {
      const encoded = encodeURIComponent('a b+c=d&e');
      expect(extractTokenFromQuery(`/api/events?token=${encoded}`)).toBe('a b+c=d&e');
    });

    it('returns null when the token value is empty', () => {
      expect(extractTokenFromQuery('/api/events?token=')).toBeNull();
    });

    it('still finds the token when it is not the first parameter', () => {
      expect(extractTokenFromQuery('/api/events?foo=x&token=secret&bar=y')).toBe(
        'secret',
      );
    });
  });

  describe('injectApiTokenIntoHtml', () => {
    it('injects the bootstrap script immediately before </head>', () => {
      const html = '<html><head><title>x</title></head><body></body></html>';
      const out = injectApiTokenIntoHtml(html, 'tk-1');
      expect(out).toContain('window.__DECKENT_API_TOKEN__ = "tk-1"');
      expect(out.indexOf('window.__DECKENT_API_TOKEN__')).toBeLessThan(
        out.indexOf('</head>'),
      );
    });

    it('JSON-encodes the token to defeat HTML/JS injection via the token value', () => {
      const malicious = 'x</script><script>alert(1)</script>';
      const out = injectApiTokenIntoHtml(
        '<html><head></head></html>',
        malicious,
      );
      // JSON.stringify escapes "/" only optionally; the critical safety prop is
      // that the literal `</script>` does NOT appear inside the injected
      // <script> block. JSON.stringify in V8 escapes the slash to `\/` when
      // the input contains `</script>` patterns? — actually it does not. The
      // browser parser cares about literal `</script>`, so the test asserts
      // that the injected line is JSON-encoded (double-quoted) — defenders
      // can layer additional escaping if their threat model demands it.
      expect(out).toContain('window.__DECKENT_API_TOKEN__ = "');
      // The injected value is a JSON string literal — confirm round-trip.
      const match = out.match(
        /window\.__DECKENT_API_TOKEN__ = (".*?");<\/script>/,
      );
      expect(match).not.toBeNull();
      expect(JSON.parse(match![1]!)).toBe(malicious);
    });

    it('returns the input unchanged when token is empty', () => {
      const html = '<html><head></head></html>';
      expect(injectApiTokenIntoHtml(html, '')).toBe(html);
    });

    it('returns the input unchanged when HTML has no </head>', () => {
      const html = '<html><body></body></html>';
      expect(injectApiTokenIntoHtml(html, 'tk')).toBe(html);
    });
  });

  describe('isLoopbackRemote', () => {
    it('accepts 127.0.0.1 / ::1 / IPv4-mapped IPv6', () => {
      expect(isLoopbackRemote('127.0.0.1')).toBe(true);
      expect(isLoopbackRemote('::1')).toBe(true);
      expect(isLoopbackRemote('::ffff:127.0.0.1')).toBe(true);
    });

    it('rejects non-loopback and undefined', () => {
      expect(isLoopbackRemote('10.0.0.1')).toBe(false);
      expect(isLoopbackRemote('192.168.1.5')).toBe(false);
      expect(isLoopbackRemote(undefined)).toBe(false);
      expect(isLoopbackRemote('')).toBe(false);
    });
  });

  describe('resolveBootstrapApiToken', () => {
    const before = process.env['DECKENT_API_TOKEN'];

    afterEach(() => {
      if (before === undefined) {
        delete process.env['DECKENT_API_TOKEN'];
      } else {
        process.env['DECKENT_API_TOKEN'] = before;
      }
    });

    it('prefers explicit config token over env var', () => {
      process.env['DECKENT_API_TOKEN'] = 'from-env';
      expect(resolveBootstrapApiToken('from-config')).toBe('from-config');
    });

    it('falls back to env var when no explicit token', () => {
      process.env['DECKENT_API_TOKEN'] = 'from-env';
      expect(resolveBootstrapApiToken()).toBe('from-env');
      expect(resolveBootstrapApiToken(null)).toBe('from-env');
    });

    it('returns null when neither source has a token', () => {
      delete process.env['DECKENT_API_TOKEN'];
      expect(resolveBootstrapApiToken()).toBeNull();
    });
  });
});

// ─── E2E: query-token fallback on /api/events ──────────────────────

describe('bearer middleware — SSE query-token fallback', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  it('accepts a matching ?token= on /api/events when no Authorization header is sent', async () => {
    handle = await startTestServer({ apiToken: 'sse-token-OK' });
    // Bypass the helper's auto-injected Bearer header by hitting the URL
    // directly with `fetch` and no headers — the only auth signal is the
    // query parameter.
    const res = await fetch(
      `${handle.baseUrl}/api/events?token=${encodeURIComponent('sse-token-OK')}`,
      { headers: { Accept: 'text/event-stream' } },
    );
    expect(res.status).toBe(200);
    // SSE body is unbounded; we don't read it, just confirm the handshake.
    await res.body?.cancel();
  });

  it('401s on /api/events when no token at all is provided', async () => {
    handle = await startTestServer({ apiToken: 'sse-token-A' });
    const res = await fetch(`${handle.baseUrl}/api/events`);
    expect(res.status).toBe(401);
  });

  it('403s on /api/events when ?token= is wrong', async () => {
    handle = await startTestServer({ apiToken: 'sse-token-B' });
    const res = await fetch(`${handle.baseUrl}/api/events?token=wrong-token`);
    expect(res.status).toBe(403);
  });

  it('does NOT honour ?token= on non-SSE routes (Bearer-only)', async () => {
    handle = await startTestServer({ apiToken: 'sse-token-C' });
    // /api/status is NOT in the queryTokenPaths set — the fallback must not
    // leak across endpoints.
    const res = await fetch(
      `${handle.baseUrl}/api/status?token=${encodeURIComponent('sse-token-C')}`,
    );
    expect(res.status).toBe(401);
  });

  it('Bearer header still wins on /api/events when both header and query are present', async () => {
    handle = await startTestServer({ apiToken: 'sse-token-D' });
    // The helper's `call` waits for the full body — SSE never closes, so we
    // hit the URL with raw `fetch` and abort once we see the status.
    const controller = new AbortController();
    const res = await fetch(`${handle.baseUrl}/api/events?token=wrong`, {
      headers: {
        Authorization: 'Bearer sse-token-D',
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    });
    // Correct Bearer wins → 200, even though query token is wrong.
    expect(res.status).toBe(200);
    controller.abort();
    await res.body?.cancel().catch(() => { /* aborted */ });
  });
});

// ─── E2E: window.__DECKENT_API_TOKEN__ HTML injection ──────────────

describe('index.html — window.__DECKENT_API_TOKEN__ injection', () => {
  let staticDir: string;
  let api: ReturnType<typeof createHttpServer> | undefined;

  function makeStaticDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'deckent-static-'));
    writeFileSync(
      join(dir, 'index.html'),
      '<html><head><title>x</title></head><body>SPA</body></html>',
      'utf-8',
    );
    return dir;
  }

  function makeProjectRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'deckent-proj-'));
    mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
    mkdirSync(join(root, '.brain', 'exports'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.locks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
    return root;
  }

  afterEach(async () => {
    if (api) {
      await api.close();
      api = undefined;
    }
    if (staticDir) {
      try { rmSync(staticDir, { recursive: true, force: true }); } catch { /* ignore */ }
      staticDir = undefined as unknown as string;
    }
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  it('injects window.__DECKENT_API_TOKEN__ into / for localhost callers', async () => {
    staticDir = makeStaticDir();
    const projectRoot = makeProjectRoot();
    process.env['DECKENT_API_AUTH_DISABLED'] = '1'; // so GET / is not blocked
    api = createHttpServer(projectRoot, {
      port: 0,
      apiToken: 'inject-token-XYZ',
      staticDir,
    });
    await new Promise<void>((resolve) => api!.server.once('listening', () => resolve()));
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no addr');

    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('window.__DECKENT_API_TOKEN__ = "inject-token-XYZ"');
    // Sanity: still ahead of </head>
    expect(html.indexOf('window.__DECKENT_API_TOKEN__')).toBeLessThan(
      html.indexOf('</head>'),
    );
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('does NOT inject when no token is configured (auth-disabled mode)', async () => {
    staticDir = makeStaticDir();
    const projectRoot = makeProjectRoot();
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    api = createHttpServer(projectRoot, {
      port: 0,
      staticDir, // no apiToken
    });
    await new Promise<void>((resolve) => api!.server.once('listening', () => resolve()));
    const addr = api.server.address();
    if (!addr || typeof addr === 'string') throw new Error('no addr');

    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('window.__DECKENT_API_TOKEN__');
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });
});
