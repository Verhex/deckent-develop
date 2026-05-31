/**
 * Localhost auto-inject for the bearer auth middleware (Sprint 209 Task 209-006).
 *
 * Goal: the local dashboard must reach the API without setting the blanket
 * `DECKENT_API_AUTH_DISABLED=1` bypass. When opted in (config field or env
 * var `DECKENT_API_LOCALHOST_AUTO=1`), loopback callers without an
 * Authorization header pass through. Remote callers still require a token,
 * and a localhost caller that presents a wrong token still earns a 403.
 *
 * Unit-level tests with synthetic IncomingMessage/ServerResponse fakes — no
 * sockets, no real HTTP, no env mutation that leaks across cases.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { bearerAuthMiddleware, isLocalhostRequest } from '../../src/api/auth.js';

interface FakeReqOptions {
  authHeader?: string;
  remoteAddress?: string;
  url?: string;
}

function fakeReq(opts: FakeReqOptions = {}): IncomingMessage {
  return {
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
    url: opts.url ?? '/api/status',
    socket: { remoteAddress: opts.remoteAddress },
  } as unknown as IncomingMessage;
}

interface FakeRes {
  res: ServerResponse;
  status: number;
  body: string;
}

function fakeRes(): FakeRes {
  const captured: FakeRes = { res: undefined as unknown as ServerResponse, status: 0, body: '' };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res as unknown as ServerResponse;
    },
    end(body: string) {
      captured.body = body;
      return res as unknown as ServerResponse;
    },
  };
  captured.res = res as unknown as ServerResponse;
  return captured;
}

describe('Auth localhost auto-inject — disable-flag is now optional', () => {
  afterEach(() => {
    delete process.env['DECKENT_API_LOCALHOST_AUTO'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
    delete process.env['DECKENT_API_TOKEN'];
  });

  it('localhost caller without Authorization passes when allowLocalhostAutoInject=true', () => {
    const check = bearerAuthMiddleware({
      configToken: 'secret',
      allowLocalhostAutoInject: true,
    });
    const r = fakeRes();
    const req = fakeReq({ remoteAddress: '127.0.0.1' });

    expect(check(req, r.res)).toBe(true);
    // No response should have been written — the middleware silently passed.
    expect(r.status).toBe(0);
    expect(r.body).toBe('');
  });

  it('remote caller still requires a token even with localhost auto-inject enabled', () => {
    const check = bearerAuthMiddleware({
      configToken: 'secret',
      allowLocalhostAutoInject: true,
    });
    const r = fakeRes();
    const req = fakeReq({ remoteAddress: '192.0.2.1' }); // TEST-NET-1, definitely not loopback

    expect(check(req, r.res)).toBe(false);
    expect(r.status).toBe(401);
    expect(r.body).toContain('authentication required');
  });

  it('invalid Bearer token from localhost is still rejected with 403', () => {
    const check = bearerAuthMiddleware({
      configToken: 'right-token',
      allowLocalhostAutoInject: true,
    });
    const r = fakeRes();
    const req = fakeReq({
      remoteAddress: '127.0.0.1',
      authHeader: 'Bearer wrong-token',
    });

    // The auto-inject only fills a MISSING header. A present-but-wrong
    // header falls through to the normal verify path and earns a 403.
    expect(check(req, r.res)).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body).toContain('forbidden');
  });

  it('DECKENT_API_AUTH_DISABLED=1 remains optional — auto-inject does not require it', () => {
    // No auth-disabled flag, no auto-inject — request is rejected as expected
    // (proves the disable-flag is not a hidden dependency of the new path).
    const checkPlain = bearerAuthMiddleware({ configToken: 'secret' });
    const r1 = fakeRes();
    const req1 = fakeReq({ remoteAddress: '127.0.0.1' });
    expect(checkPlain(req1, r1.res)).toBe(false);
    expect(r1.status).toBe(401);

    // Disable-flag still works as the legacy escape hatch (backward compat).
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    const checkBypass = bearerAuthMiddleware({ configToken: 'secret' });
    const r2 = fakeRes();
    const req2 = fakeReq({ remoteAddress: '192.0.2.5' });
    expect(checkBypass(req2, r2.res)).toBe(true);
    stderrSpy.mockRestore();
  });

  it('DECKENT_API_LOCALHOST_AUTO=1 env var activates the same path as the config flag', () => {
    process.env['DECKENT_API_LOCALHOST_AUTO'] = '1';
    const check = bearerAuthMiddleware({ configToken: 'secret' }); // no config flag set
    const r = fakeRes();
    const req = fakeReq({ remoteAddress: '127.0.0.1' });

    expect(check(req, r.res)).toBe(true);
    expect(r.status).toBe(0);
  });

  it('auto-inject works when NO token is configured (dashboard dev mode)', () => {
    // Dashboard scenario: server boots without DECKENT_API_TOKEN, dashboard
    // hits it from 127.0.0.1, gets through without anyone touching env vars.
    const check = bearerAuthMiddleware({
      configToken: null,
      allowLocalhostAutoInject: true,
    });
    const r = fakeRes();
    const req = fakeReq({ remoteAddress: '127.0.0.1' });

    expect(check(req, r.res)).toBe(true);
  });

  it('isLocalhostRequest recognizes loopback and rejects everything else', () => {
    expect(
      isLocalhostRequest({ socket: { remoteAddress: '127.0.0.1' } } as unknown as IncomingMessage),
    ).toBe(true);
    expect(
      isLocalhostRequest({ socket: { remoteAddress: '::1' } } as unknown as IncomingMessage),
    ).toBe(true);
    expect(
      isLocalhostRequest({
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      } as unknown as IncomingMessage),
    ).toBe(true);
    expect(
      isLocalhostRequest({ socket: { remoteAddress: '192.0.2.1' } } as unknown as IncomingMessage),
    ).toBe(false);
    expect(
      isLocalhostRequest({ socket: { remoteAddress: '10.0.0.5' } } as unknown as IncomingMessage),
    ).toBe(false);
    // Synthetic req with no socket → treated as non-localhost (existing fakes
    // in `tests/api/server-auth.test.ts` rely on this fall-through behavior).
    expect(isLocalhostRequest({ socket: {} } as unknown as IncomingMessage)).toBe(false);
    expect(isLocalhostRequest({} as IncomingMessage)).toBe(false);
  });

  it('localhost auto-inject is OFF by default — no env, no config flag → 401', () => {
    // Confirms the new behavior is strictly opt-in. Critical for backward
    // compat with the e2e suites (auth.test.ts, server-auth.test.ts) that
    // expect 401 on a tokenless localhost call.
    const check = bearerAuthMiddleware({ configToken: null });
    const r = fakeRes();
    const req = fakeReq({ remoteAddress: '127.0.0.1' });

    expect(check(req, r.res)).toBe(false);
    expect(r.status).toBe(401);
  });
});
