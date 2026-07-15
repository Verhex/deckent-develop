/**
 * chat-stream-live-repro — Sprint 282 Task 282-001 root-cause repro (282-001-xfix).
 *
 * ROOT (file:line): the dashboard chat SSE stream rode its token on `?token=`
 * (EventSource cannot send an Authorization header —
 * src/dashboard/src/lib/chat-stream-client.ts:31-39), but the serve auth-gate's
 * `queryTokenPaths` whitelist OMITTED `/api/chat/stream`. The query-token
 * fallback (src/api/auth.ts:231) only authenticates whitelisted paths, so a
 * *valid* token on `/api/chat/stream?token=…` was rejected 401 (auth.ts:244-247),
 * the adapter was never reached, the stream was empty, and ChatPage fell back to
 * the `buildChatReply` classifier → "Anlamadım".
 *
 * ── FIX LANDED (282-004) ────────────────────────────────────────────────────
 * src/api/server.ts:1208 now builds the gate with
 *   queryTokenPaths: ['/api/events', '/api/chat/stream']
 * — bit-identical to the already-accepted `/api/events` mechanism (same
 * constant-time SHA-256 compare, auth.ts:231-242). The repro below is now a
 * PERMANENT-GREEN proof that the fix is live, and a drift-guard that flips RED
 * the moment `/api/chat/stream` is ever removed from the live whitelist.
 *
 * Drift-resistance (282-001-xfix): instead of hardcoding a SNAPSHOT of the serve
 * config (the original repro mirrored `['/api/events']` as a static literal,
 * which silently went stale once the fix landed), this file DERIVES the whitelist
 * from the real `src/api/server.ts` source. It still drives the REAL
 * `bearerAuthMiddleware` (src/api/auth.ts) — fully hermetic: no server boot, no
 * CLI spawn, no network, reading only git-tracked source.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { bearerAuthMiddleware } from '../../src/api/auth.js';

const TOKEN = 'repro-token-282001';

// ── Live config derivation ──────────────────────────────────────────────────
// Read the git-tracked serve source and extract the ACTUAL `queryTokenPaths`
// array literal passed to bearerAuthMiddleware. This binds the repro to reality:
// it cannot drift back to a stale snapshot, and it flips RED if the chat-stream
// path is ever dropped from the whitelist (the original DASH-UX-1 regression).
const SERVER_TS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/api/server.ts',
);
const serverSource = readFileSync(SERVER_TS, 'utf-8');

function liveQueryTokenPaths(): string[] {
  const m = serverSource.match(/queryTokenPaths:\s*\[([^\]]*)\]/);
  if (!m) {
    throw new Error(
      'queryTokenPaths array literal not found in src/api/server.ts — ' +
        'the serve auth-gate shape changed; update this repro to match.',
    );
  }
  return [...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1] ?? '');
}

// EXACT serve auth-gate config — exemptPaths mirror src/api/server.ts:1207,
// queryTokenPaths derived live from src/api/server.ts:1208 (see above).
const SERVE_EXEMPT_PATHS = ['/health', '/api/health', '/api/auth/oidc/exchange'];
const SERVE_QUERY_TOKEN_PATHS = liveQueryTokenPaths();

/**
 * Minimal IncomingMessage fake. `socket: {}` has no remoteAddress, so
 * isLocalhostRequest() returns false — this exercises the strict secure-default
 * gate (no localhost auto-inject), exactly matching the live 401 behaviour.
 */
function fakeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { method: 'GET', url, headers, socket: {} } as unknown as IncomingMessage;
}

interface ResCapture {
  status: number | null;
  body: string;
}

function fakeRes(): { res: ServerResponse; cap: ResCapture } {
  const cap: ResCapture = { status: null, body: '' };
  const res = {
    writeHead(code: number) {
      cap.status = code;
      return res;
    },
    end(chunk?: unknown) {
      if (typeof chunk === 'string') cap.body += chunk;
      return res;
    },
  } as unknown as ServerResponse;
  return { res, cap };
}

/** Run the real serve auth-gate against one synthetic request. */
function runGate(
  url: string,
  headers: Record<string, string> = {},
): { allowed: boolean; status: number | null; body: string } {
  const mw = bearerAuthMiddleware({
    configToken: TOKEN,
    exemptPaths: SERVE_EXEMPT_PATHS,
    queryTokenPaths: SERVE_QUERY_TOKEN_PATHS,
  });
  const { res, cap } = fakeRes();
  const allowed = mw(fakeReq(url, headers), res);
  return { allowed, status: cap.status, body: cap.body };
}

describe('282-001 chat-stream auth-gate root-cause repro', () => {
  // Keep env deterministic — neither auth-disable nor localhost-auto may leak in
  // (both are read at middleware construction time and would mask the gate).
  const ENV_KEYS = [
    'DECKENT_API_AUTH_DISABLED',
    'DECKENT_API_LOCALHOST_AUTO',
    'DECKENT_API_TOKEN',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  // ── Drift-guard: bind the repro to the live serve config. If the chat-stream
  //    path is ever dropped from queryTokenPaths, the DASH-UX-1 regression is
  //    back — this fails first, with a pointer to the exact root location. ──
  it('live serve config whitelists /api/chat/stream for query-token auth (server.ts:1208)', () => {
    expect(SERVE_QUERY_TOKEN_PATHS).toContain('/api/events'); // dashboard event stream
    expect(SERVE_QUERY_TOKEN_PATHS).toContain('/api/chat/stream'); // 282-004 root-fix
  });

  // ── Controls: prove the mechanism works AND that the header transport for
  //    /api/chat/stream is unaffected (green before and after the fix). ──

  it('control: /api/events query-token authenticates (the SSE query-token mechanism works)', () => {
    const r = runGate(`/api/events?token=${TOKEN}`);
    expect(r.allowed).toBe(true);
  });

  it('control: /api/chat/stream WITH Authorization header authenticates (header transport unaffected)', () => {
    const r = runGate('/api/chat/stream?message=hi', {
      authorization: `Bearer ${TOKEN}`,
    });
    expect(r.allowed).toBe(true);
    expect(r.status).toBeNull(); // auth passed — no error response written
  });

  // ── REPRO (now permanent-green): the EventSource transport. A VALID token on
  //    ?token= authenticates the SSE stream — the behaviour the fix restored.
  //    Was 401 before 282-004; this assertion is what flips RED on regression. ──

  it('REPRO: /api/chat/stream?token=<valid> authenticates — the EventSource transport now works (was 401, DASH-UX-1)', () => {
    const r = runGate(`/api/chat/stream?message=hi&token=${TOKEN}`);
    expect(r.allowed).toBe(true);
    expect(r.status).toBeNull(); // auth passed — stream block runs, not a 401 short-circuit
  });

  // ── Security: the fix does NOT weaken auth. A WRONG query token on the now-
  //    whitelisted path is a 403 (same shape as a Bearer mismatch), not a bypass. ──

  it('security: wrong /api/chat/stream?token= is rejected 403 (fix does not weaken auth)', () => {
    const r = runGate('/api/chat/stream?message=hi&token=not-the-real-token');
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body).not.toContain('not-the-real-token'); // token never echoed back
  });
});
