/**
 * chat-stream-auth — Sprint 282 Task 282-004 stream-path root-fix proof.
 *
 * ROOT (282-001, src/api/server.ts:1179): the auth-gate's `queryTokenPaths`
 * listed only `/api/events`; `/api/chat/stream` was OMITTED. EventSource cannot
 * send an Authorization header, so the dashboard rides its token on `?token=`
 * (chat-stream-client.ts:31-39). The query-token fallback (auth.ts:231) only
 * authenticates whitelisted paths, so a *valid* token on `/api/chat/stream?token=`
 * was rejected 401, the stream never opened, and ChatPage fell back to the
 * `buildChatReply` classifier → "Anlamadım".
 *
 * FIX (chosen = PRIMARY/auth): whitelist `/api/chat/stream` in `queryTokenPaths`,
 * bit-identical to `/api/events` (same constant-time SHA-256 compare). The
 * EventSource→fetch rewrite alternative is intentionally NOT taken — the client
 * already carries the token on `?token=`, so the one-line whitelist makes it work
 * with zero client change (Karpathy: simplicity + surgical).
 *
 * Three axes (task DoD): auth-yolu / hata-yolu / akış-yolu.
 *   - auth-yolu  — the real `bearerAuthMiddleware` (mirrored to the FIXED config)
 *                  authenticates a valid `?token=` on `/api/chat/stream`.
 *   - hata-yolu  — wrong token → 403, missing token → 401, the token never leaks
 *                  into a response body; a failing adapter surfaces an honest SSE
 *                  `error` event (never silent-empty).
 *   - akış-yolu  — a real server + seam-injected streaming adapter flows `data:`
 *                  frames over a HEADER-LESS query-token request.
 *
 * Fully hermetic: middleware-direct unit tests use synthetic req/res; the E2E
 * block boots `createHttpServer` on a random loopback port (no spawn, no network
 * egress, no gitignored state).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { bearerAuthMiddleware } from '../../src/api/auth.js';
import { setChatStreamAdapter } from '../../src/api/server.js';
import type {
  ChatProviderAdapter,
  StreamChunk,
} from '../../src/cli/commands/chat-native.js';
import { startTestServer, type TestServerHandle } from './test-server-helper.js';

const TOKEN = 'auth-token-282004';

// EXACT mirror of the FIXED serve auth-gate config (src/api/server.ts:1178-1179).
// The fix added '/api/chat/stream' next to '/api/events'.
const SERVE_EXEMPT_PATHS = ['/health', '/api/health', '/api/auth/oidc/exchange'];
const SERVE_QUERY_TOKEN_PATHS = ['/api/events', '/api/chat/stream'];

// ─── middleware-direct harness (mirror of chat-stream-live-repro.test.ts) ──────

/**
 * Minimal IncomingMessage fake. `socket: {}` has no remoteAddress, so
 * isLocalhostRequest() returns false — the strict secure-default gate is
 * exercised (no localhost auto-inject), exactly matching live behaviour.
 */
function fakeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, headers, socket: {} } as unknown as IncomingMessage;
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

/** Run the FIXED serve auth-gate against one synthetic request. */
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

// ─── E2E adapters ─────────────────────────────────────────────────────────────

/** Streaming adapter that emits a preset chunk sequence then a `done` marker. */
function streamingAdapter(chunks: string[]): ChatProviderAdapter {
  return {
    async send() {
      return { text: chunks.join(''), stopReason: 'end_turn' };
    },
    async *stream(): AsyncIterable<StreamChunk> {
      for (const piece of chunks) {
        yield { text: piece };
      }
      yield { done: { text: chunks.join(''), stopReason: 'end_turn' } };
    },
  };
}

/** Adapter whose stream/send always throws — exercises the honest SSE error path. */
function throwingAdapter(message: string): ChatProviderAdapter {
  return {
    async send() {
      throw new Error(message);
    },
    async *stream(): AsyncIterable<StreamChunk> {
      throw new Error(message);
      // unreachable, satisfies TS generator typing
      yield {} as StreamChunk;
    },
  };
}

/**
 * GET the chat-stream over a HEADER-LESS request (the EventSource transport):
 * the token rides only on the query string. A finite adapter ends the response,
 * so `res.text()` resolves with the full SSE body.
 */
async function getChatStream(
  handle: TestServerHandle,
  query: string,
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${handle.baseUrl}/api/chat/stream?${query}`);
  const body = await res.text();
  return { status: res.status, body };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('282-004 chat-stream auth-gate fix', () => {
  // Keep env deterministic for the whole file — neither auth-disable nor
  // localhost-auto may leak in (both would mask the query-token gate, especially
  // for the E2E block which runs over real loopback sockets).
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

  // ── auth-yolu: the fix — a valid ?token= now authenticates the chat stream ──
  describe('auth-yolu (middleware-direct)', () => {
    it('FIX: /api/chat/stream?token=<valid> authenticates (the 282-001 root is closed)', () => {
      const r = runGate(`/api/chat/stream?message=hi&token=${TOKEN}`);
      expect(r.allowed).toBe(true);
      expect(r.status).toBeNull(); // auth passed — no error response written
    });

    it('control: /api/events?token=<valid> still authenticates (no regression)', () => {
      const r = runGate(`/api/events?token=${TOKEN}`);
      expect(r.allowed).toBe(true);
    });

    it('control: /api/chat/stream WITH Authorization header still authenticates (header path unaffected)', () => {
      const r = runGate('/api/chat/stream?message=hi', {
        authorization: `Bearer ${TOKEN}`,
      });
      expect(r.allowed).toBe(true);
      expect(r.status).toBeNull();
    });
  });

  // ── hata-yolu: rejection is honest and never leaks the token ──
  describe('hata-yolu (middleware-direct)', () => {
    it('wrong ?token= → 403 forbidden (not a silent pass)', () => {
      const r = runGate('/api/chat/stream?message=hi&token=not-the-token');
      expect(r.allowed).toBe(false);
      expect(r.status).toBe(403);
      expect(r.body).toContain('forbidden');
    });

    it('missing token (no header, no ?token=) → 401', () => {
      const r = runGate('/api/chat/stream?message=hi');
      expect(r.allowed).toBe(false);
      expect(r.status).toBe(401);
    });

    it('the configured token never appears in a rejection body (no leak)', () => {
      const wrong = runGate('/api/chat/stream?message=hi&token=not-the-token');
      const missing = runGate('/api/chat/stream?message=hi');
      expect(wrong.body).not.toContain(TOKEN);
      expect(missing.body).not.toContain(TOKEN);
    });
  });

  // ── akış-yolu + honest-error: real server, header-less query-token transport ──
  describe('akış-yolu + honest-error (E2E real server)', () => {
    let handle: TestServerHandle | null = null;

    afterEach(async () => {
      setChatStreamAdapter(null); // reset module-level seam between tests
      if (handle) {
        await handle.close();
        handle = null;
      }
    });

    it('flows data: chunk + done frames over a header-less ?token= request', async () => {
      setChatStreamAdapter(streamingAdapter(['Hel', 'lo,', ' world']));
      handle = await startTestServer({ apiToken: TOKEN });

      const { status, body } = await getChatStream(
        handle,
        `message=hi&token=${TOKEN}`,
      );

      expect(status).toBe(200);
      expect(body).toContain('data:');
      expect(body).toContain('"type":"chunk"');
      expect(body).toContain('"type":"done"');
      expect(body).toContain('Hello, world'); // accumulated reply
    });

    it('surfaces an HONEST SSE error event (never silent-empty) when the adapter throws', async () => {
      setChatStreamAdapter(throwingAdapter('provider boom 282004'));
      handle = await startTestServer({ apiToken: TOKEN });

      const { status, body } = await getChatStream(
        handle,
        `message=hi&token=${TOKEN}`,
      );

      expect(status).toBe(200); // the stream OPENED (auth passed)
      expect(body).toContain('"type":"error"');
      expect(body).toContain('provider boom 282004');
    });

    it('rejects a wrong query-token with 403 at the real server (no silent stream)', async () => {
      setChatStreamAdapter(streamingAdapter(['should-not-appear']));
      handle = await startTestServer({ apiToken: TOKEN });

      const { status, body } = await getChatStream(
        handle,
        'message=hi&token=wrong-token',
      );

      expect(status).toBe(403);
      expect(body).not.toContain('should-not-appear'); // adapter never reached
      expect(body).not.toContain(TOKEN); // token not echoed
    });

    it('does not leak the token into the streamed body', async () => {
      setChatStreamAdapter(streamingAdapter(['ok']));
      handle = await startTestServer({ apiToken: TOKEN });

      const { status, body } = await getChatStream(
        handle,
        `message=hi&token=${TOKEN}`,
      );

      expect(status).toBe(200);
      expect(body).not.toContain(TOKEN);
    });
  });
});
