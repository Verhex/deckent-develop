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
import { registerAuthMeRoute, deriveRequestPrincipal } from '../../src/api/auth-me-endpoint.js';

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

/**
 * Forge an UNSIGNED ({alg:'none'}) JWT — the classic signature-bypass shape.
 * parseOidcClaims decodes the payload WITHOUT a signature check, so this is
 * exactly the attacker-controllable token the claimsVerified flag guards against.
 */
function makeUnsignedJwt(claims: Record<string, unknown>): string {
  const headerB64 = encodeSegment({ alg: 'none', typ: 'JWT' });
  const payloadB64 = encodeSegment(claims);
  return `${headerB64}.${payloadB64}.`; // empty signature segment (3 parts)
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

// ─── deriveRequestPrincipal — defense-in-depth (Sprint 289, audit MED) ─────────
//
// `deriveRequestPrincipal` decodes role/tenant from an UNVERIFIED JWT payload.
// The claimsVerified flag exists so a consumer never auto-trusts those claims
// unless the caller explicitly asserts the bearer passed the auth-gate.

describe('deriveRequestPrincipal — claimsVerified flag', () => {
  it('omits claimsVerified by default — runtime shape unchanged (fail-closed)', () => {
    const jwt = makeHs256(
      { sub: 'user-7', role: 'operator', tenant: 'acme', exp: nowSec() + 3600 },
      HS_SECRET,
    );
    const principal = deriveRequestPrincipal(fakeReq(`Bearer ${jwt}`));

    // Default call must be byte-identical to legacy behavior — no trust assertion.
    expect(principal.id).toBe('user-7');
    expect(principal.role).toBe('operator');
    expect(principal.tenantId).toBe('acme');
    expect(principal.claimsVerified).toBeUndefined();
    expect('claimsVerified' in principal).toBe(false);
  });

  it('stamps claimsVerified:true ONLY when the caller asserts authGateVerified', () => {
    const jwt = makeHs256(
      { sub: 'user-7', role: 'operator', tenant: 'acme', exp: nowSec() + 3600 },
      HS_SECRET,
    );
    const principal = deriveRequestPrincipal(fakeReq(`Bearer ${jwt}`), {
      authGateVerified: true,
    });

    expect(principal.claimsVerified).toBe(true);
    expect(principal.role).toBe('operator');
    expect(principal.tenantId).toBe('acme');
  });

  it('authGateVerified:false leaves the flag unset (explicit untrusted)', () => {
    const jwt = makeHs256({ sub: 'u', exp: nowSec() + 3600 }, HS_SECRET);
    const principal = deriveRequestPrincipal(fakeReq(`Bearer ${jwt}`), {
      authGateVerified: false,
    });

    expect(principal.claimsVerified).toBeUndefined();
  });

  it('static / no-bearer principal carries the flag only when asserted', () => {
    expect(deriveRequestPrincipal(fakeReq()).claimsVerified).toBeUndefined();
    expect(
      deriveRequestPrincipal(fakeReq(), { authGateVerified: true }).claimsVerified,
    ).toBe(true);

    const opaque = deriveRequestPrincipal(fakeReq('Bearer opaque-static-token'));
    expect(opaque.id).toBe('api-static');
    expect(opaque.claimsVerified).toBeUndefined();
  });

  it('SECURITY: a forged {alg:none} token decodes role/tenant but is NEVER auto-trusted', () => {
    // The audit probe: a forged unsigned bearer claiming admin + the victim tenant.
    const forged = makeUnsignedJwt({ sub: 'attacker', role: 'admin', tenant: 'victim-tenant' });
    const principal = deriveRequestPrincipal(fakeReq(`Bearer ${forged}`));

    // parseOidcClaims (no signature check) still surfaces the attacker's claims …
    expect(principal.role).toBe('admin');
    expect(principal.tenantId).toBe('victim-tenant');

    // … but absent an auth-gate assertion the trust flag is NOT set, so a
    // flag-checking consumer (`principal.claimsVerified === true`) fails closed.
    expect(principal.claimsVerified).toBeUndefined();
    const consumerWouldTrust = principal.claimsVerified === true;
    expect(consumerWouldTrust).toBe(false);

    // Even an explicit gate assertion does not "bless" a forged token's claims as
    // genuine — the flag only records that the caller's code path is gate-guarded;
    // the auth-gate itself is what rejects an unsigned bearer before this point.
    const ifGated = deriveRequestPrincipal(fakeReq(`Bearer ${forged}`), { authGateVerified: true });
    expect(ifGated.claimsVerified).toBe(true); // caller asserted gate context
  });
});
