/**
 * Sprint 277 Task 277-001 — GET /api/auth/me whoami endpoint.
 *
 * Tests the registerAuthMeRoute handler directly (unit) using fake req/res
 * objects, following the pattern from tests/api/nervous-endpoint.test.ts.
 *
 * Security invariants verified:
 *   - bearer token NEVER appears in response body
 *   - OIDC JWT → claims extracted (mode: 'oidc')
 *   - static/opaque token → mode: 'static', no claims
 *   - malformed/partial JWT → graceful mode: 'static'
 *   - role derived from JWT claims
 *   - preferred_username extracted
 */
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { registerAuthMeRoute } from '../../src/api/auth-me-endpoint.js';

// ─── JWT builder (HS256, no deps — mirrors tests/api/auth-oidc.test.ts) ────────

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function encodeSegment(obj: Record<string, unknown>): string {
  return b64url(JSON.stringify(obj));
}

function makeHs256(claims: Record<string, unknown>, secret: string): string {
  const headerB64 = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = encodeSegment(claims);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

// ─── Fake req/res helpers ────────────────────────────────────────────────────

function fakeReq(authHeader?: string, url = '/api/auth/me'): http.IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    url,
    method: 'GET',
  } as unknown as http.IncomingMessage;
}

function fakeRes(): {
  res: http.ServerResponse;
  status: () => number;
  body: () => string;
  json: () => unknown;
} {
  let writtenStatus = 200;
  let writtenBody = '';
  const res = {
    writeHead: (status: number) => { writtenStatus = status; },
    end: (body: string) => { writtenBody = body; },
  } as unknown as http.ServerResponse;
  return {
    res,
    status: () => writtenStatus,
    body: () => writtenBody,
    json: () => JSON.parse(writtenBody) as unknown,
  };
}

const HS_SECRET = 'test-secret-277-me-endpoint';
const nowSec = (): number => Math.floor(Date.now() / 1000);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerAuthMeRoute — OIDC JWT bearer', () => {
  it('extracts sub, email, name from a valid JWT', () => {
    const claims = {
      iss: 'https://idp.test',
      sub: 'user-42',
      email: 'user@example.com',
      name: 'Alice Test',
      exp: nowSec() + 3600,
    };
    const jwt = makeHs256(claims, HS_SECRET);
    const { res, json } = fakeRes();

    const handled = registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq(`Bearer ${jwt}`));

    expect(handled).toBe(true);
    const body = json() as Record<string, unknown>;
    expect(body['authenticated']).toBe(true);
    expect(body['mode']).toBe('oidc');
    expect(body['sub']).toBe('user-42');
    expect(body['email']).toBe('user@example.com');
    expect(body['name']).toBe('Alice Test');
    expect(body['role']).toBeUndefined();
  });

  it('extracts preferred_username claim', () => {
    const claims = {
      sub: 'u1',
      preferred_username: 'alice',
      exp: nowSec() + 3600,
    };
    const jwt = makeHs256(claims, HS_SECRET);
    const { res, json } = fakeRes();

    registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq(`Bearer ${jwt}`));

    const body = json() as Record<string, unknown>;
    expect(body['mode']).toBe('oidc');
    expect(body['preferredUsername']).toBe('alice');
  });

  it('extracts role from "role" claim (admin)', () => {
    const claims = { sub: 'u2', role: 'admin', exp: nowSec() + 3600 };
    const jwt = makeHs256(claims, HS_SECRET);
    const { res, json } = fakeRes();

    registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq(`Bearer ${jwt}`));

    const body = json() as Record<string, unknown>;
    expect(body['mode']).toBe('oidc');
    expect(body['role']).toBe('admin');
  });

  it('extracts role from namespaced claim (https://deckent.io/role)', () => {
    const claims = {
      sub: 'u3',
      'https://deckent.io/role': 'operator',
      exp: nowSec() + 3600,
    };
    const jwt = makeHs256(claims, HS_SECRET);
    const { res, json } = fakeRes();

    registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq(`Bearer ${jwt}`));

    const body = json() as Record<string, unknown>;
    expect(body['role']).toBe('operator');
  });

  it('omits role when not present in claims', () => {
    const claims = { sub: 'u4', exp: nowSec() + 3600 };
    const jwt = makeHs256(claims, HS_SECRET);
    const { res, json } = fakeRes();

    registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq(`Bearer ${jwt}`));

    const body = json() as Record<string, unknown>;
    expect(body['mode']).toBe('oidc');
    expect('role' in body).toBe(false);
  });

  it('does NOT include the token itself in the response body', () => {
    const claims = { sub: 'u5', exp: nowSec() + 3600 };
    const jwt = makeHs256(claims, HS_SECRET);
    const { res, body } = fakeRes();

    registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq(`Bearer ${jwt}`));

    expect(body()).not.toContain(jwt);
    expect(body()).not.toContain(HS_SECRET);
  });
});

describe('registerAuthMeRoute — static / opaque bearer', () => {
  it('returns mode:static for a non-JWT opaque token', () => {
    const { res, json } = fakeRes();

    const handled = registerAuthMeRoute(
      '/api/auth/me',
      'GET',
      res,
      fakeReq('Bearer static-opaque-token-abc123'),
    );

    expect(handled).toBe(true);
    const body = json() as Record<string, unknown>;
    expect(body['authenticated']).toBe(true);
    expect(body['mode']).toBe('static');
    expect('sub' in body).toBe(false);
    expect('email' in body).toBe(false);
  });

  it('returns mode:static for a malformed partial JWT (2 segments)', () => {
    const { res, json } = fakeRes();

    registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq('Bearer header.payload'));

    const body = json() as Record<string, unknown>;
    expect(body['mode']).toBe('static');
  });

  it('returns mode:static when no Authorization header (graceful)', () => {
    const { res, json } = fakeRes();

    const handled = registerAuthMeRoute('/api/auth/me', 'GET', res, fakeReq());

    expect(handled).toBe(true);
    const body = json() as Record<string, unknown>;
    expect(body['mode']).toBe('static');
  });
});

describe('registerAuthMeRoute — routing guards', () => {
  it('does not handle a different path (returns false)', () => {
    const { res } = fakeRes();
    const handled = registerAuthMeRoute('/api/status', 'GET', res, fakeReq());
    expect(handled).toBe(false);
  });

  it('does not handle POST /api/auth/me (returns false)', () => {
    const { res } = fakeRes();
    const req = { ...fakeReq(), method: 'POST' } as unknown as http.IncomingMessage;
    const handled = registerAuthMeRoute('/api/auth/me', 'POST', res, req);
    expect(handled).toBe(false);
  });
});
