/**
 * Bearer middleware — api_oidc OIDC JWT extension (Sprint 267 T-267-001).
 *
 * Unit-level coverage of `bearerAuthMiddleware` with the `oidc` config:
 *
 *   - a Bearer value is checked against the STATIC token first (constant-time,
 *     unchanged), then — on mismatch — verified as a JWT via `verifyJwt`
 *     (src/core/auth-oidc.ts, single source of truth),
 *   - configuring `oidc` WITHOUT a static token ACTIVATES auth: a valid
 *     Bearer JWT becomes mandatory (missing header → 401, bad JWT → 403),
 *   - with NO `oidc` config the legacy behavior is bit-identical (regression),
 *   - exempt-path / query-token / localhost-auto semantics are unchanged.
 *
 * JWTs are built with node:crypto only (ADR-010) — the same builders as
 * tests/core/auth-oidc.test.ts. Expiry offsets are ±3600s relative to the
 * real clock; a unit test cannot straddle that window, so no fake timers.
 * NOTE (ADR-079): the real-binary `deckent serve` smoke runs at sprint end —
 * this file is the hermetic in-sprint proof.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import {
  generateKeyPairSync,
  createHmac,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import { bearerAuthMiddleware } from '../../src/api/auth.js';
import type { OidcClaims } from '../../src/core/auth-oidc.js';

// ─── JWT builders (mirrors tests/core/auth-oidc.test.ts) ────────────────────

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function encodeSegment(obj: Record<string, unknown>): string {
  return b64url(JSON.stringify(obj));
}

/** Build an HS256 JWT signed with `secret`. */
function makeHs256(claims: OidcClaims, secret: string, header?: Record<string, unknown>): string {
  const headerB64 = encodeSegment({ alg: 'HS256', typ: 'JWT', ...header });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

/** Build an RS256 JWT signed with `privateKey`. */
function makeRs256(claims: OidcClaims, privateKey: KeyObject): string {
  const headerB64 = encodeSegment({ alg: 'RS256', typ: 'JWT' });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

/** Build an unsigned `alg: none` token (the classic bypass attempt). */
function makeAlgNone(claims: OidcClaims): string {
  const headerB64 = encodeSegment({ alg: 'none', typ: 'JWT' });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  return `${headerB64}.${payloadB64}.`;
}

// ─── Fake req/res (same shape as tests/api/server-auth.test.ts units) ───────

function fakeReq(
  authHeader?: string,
  url = '/api/status',
  remoteAddress?: string,
): http.IncomingMessage {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    url,
    ...(remoteAddress ? { socket: { remoteAddress } } : {}),
  } as unknown as http.IncomingMessage;
}

function fakeRes(): { res: http.ServerResponse; status: () => number; body: () => string } {
  let writtenStatus = 0;
  let writtenBody = '';
  const res = {
    writeHead: (status: number) => { writtenStatus = status; },
    end: (body: string) => { writtenBody = body; },
  } as unknown as http.ServerResponse;
  return { res, status: () => writtenStatus, body: () => writtenBody };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STATIC_TOKEN = 'static-secret-token-267';
const HS_SECRET = 'hs256-shared-secret-for-api-oidc-tests';
const ISSUER = 'https://idp.example.test';
const AUDIENCE = 'deckent-api';

const nowSec = (): number => Math.floor(Date.now() / 1000);
/** Base claims: valid issuer, 1h of validity — deterministic for a unit test. */
const validClaims = (): OidcClaims => ({ iss: ISSUER, sub: 'user-1', exp: nowSec() + 3600 });

const HS_OIDC = { issuer: ISSUER, algorithm: 'HS256' as const, key: HS_SECRET };

let rsaPrivateKey: KeyObject;
let rsaPublicPem: string;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  rsaPrivateKey = pair.privateKey;
  rsaPublicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
});

beforeEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  delete process.env['DECKENT_API_LOCALHOST_AUTO'];
});

afterEach(() => {
  delete process.env['DECKENT_API_TOKEN'];
  delete process.env['DECKENT_API_AUTH_DISABLED'];
  delete process.env['DECKENT_API_LOCALHOST_AUTO'];
});

// ─── Static token + OIDC configured together ────────────────────────────────

describe('bearerAuthMiddleware — static token + api_oidc together', () => {
  const check = (): ReturnType<typeof bearerAuthMiddleware> =>
    bearerAuthMiddleware({ configToken: STATIC_TOKEN, oidc: HS_OIDC });

  it('valid HS256 JWT passes after the static compare misses (200-path)', () => {
    const jwt = makeHs256(validClaims(), HS_SECRET);
    const { res } = fakeRes();
    expect(check()(fakeReq(`Bearer ${jwt}`), res)).toBe(true);
  });

  it('static token still authenticates when oidc is configured', () => {
    const { res } = fakeRes();
    expect(check()(fakeReq(`Bearer ${STATIC_TOKEN}`), res)).toBe(true);
  });

  it('expired JWT → 403', () => {
    const jwt = makeHs256({ ...validClaims(), exp: nowSec() - 3600 }, HS_SECRET);
    const { res, status, body } = fakeRes();
    expect(check()(fakeReq(`Bearer ${jwt}`), res)).toBe(false);
    expect(status()).toBe(403);
    expect(body()).toContain('forbidden');
  });

  it('wrong issuer → 403', () => {
    const jwt = makeHs256({ ...validClaims(), iss: 'https://evil.example.test' }, HS_SECRET);
    const { res, status } = fakeRes();
    expect(check()(fakeReq(`Bearer ${jwt}`), res)).toBe(false);
    expect(status()).toBe(403);
  });

  it('wrong signature (signed with a different secret) → 403', () => {
    const jwt = makeHs256(validClaims(), 'some-other-secret');
    const { res, status } = fakeRes();
    expect(check()(fakeReq(`Bearer ${jwt}`), res)).toBe(false);
    expect(status()).toBe(403);
  });

  it('alg:none token → 403 (bypass attempt rejected)', () => {
    const jwt = makeAlgNone(validClaims());
    const { res, status } = fakeRes();
    expect(check()(fakeReq(`Bearer ${jwt}`), res)).toBe(false);
    expect(status()).toBe(403);
  });

  it('audience mismatch → 403; matching audience passes', () => {
    const checkAud = bearerAuthMiddleware({
      configToken: STATIC_TOKEN,
      oidc: { ...HS_OIDC, audience: AUDIENCE },
    });

    const wrongAud = makeHs256({ ...validClaims(), aud: 'other-api' }, HS_SECRET);
    const wrong = fakeRes();
    expect(checkAud(fakeReq(`Bearer ${wrongAud}`), wrong.res)).toBe(false);
    expect(wrong.status()).toBe(403);

    const rightAud = makeHs256({ ...validClaims(), aud: AUDIENCE }, HS_SECRET);
    const right = fakeRes();
    expect(checkAud(fakeReq(`Bearer ${rightAud}`), right.res)).toBe(true);
  });

  it('missing Authorization header still → 401 (unchanged)', () => {
    const { res, status } = fakeRes();
    expect(check()(fakeReq(), res)).toBe(false);
    expect(status()).toBe(401);
  });
});

// ─── OIDC-only: token-yok + oidc-var → auth ACTIVE, JWT mandatory ────────────

describe('bearerAuthMiddleware — oidc-only (no static token) activates auth', () => {
  const check = (): ReturnType<typeof bearerAuthMiddleware> =>
    bearerAuthMiddleware({ configToken: null, oidc: HS_OIDC });

  it('no Authorization header → 401 (JWT is mandatory)', () => {
    const { res, status, body } = fakeRes();
    expect(check()(fakeReq(), res)).toBe(false);
    expect(status()).toBe(401);
    expect(body()).toContain('authentication required');
    // The legacy "auth disabled" hint must NOT appear — auth is ACTIVE here.
    expect(body()).not.toContain('DECKENT_API_AUTH_DISABLED');
  });

  it('valid HS256 JWT → passes', () => {
    const jwt = makeHs256(validClaims(), HS_SECRET);
    const { res } = fakeRes();
    expect(check()(fakeReq(`Bearer ${jwt}`), res)).toBe(true);
  });

  it('garbage Bearer value → 403', () => {
    const { res, status } = fakeRes();
    expect(check()(fakeReq('Bearer not-a-jwt'), res)).toBe(false);
    expect(status()).toBe(403);
  });

  it('exempt path passes without any credentials', () => {
    const exemptCheck = bearerAuthMiddleware({
      configToken: null,
      oidc: HS_OIDC,
      exemptPaths: ['/health'],
    });
    const { res } = fakeRes();
    expect(exemptCheck(fakeReq(undefined, '/health'), res)).toBe(true);
  });

  it('localhost auto-inject (opt-in) still passes a header-less loopback request', () => {
    const localCheck = bearerAuthMiddleware({
      configToken: null,
      oidc: HS_OIDC,
      allowLocalhostAutoInject: true,
    });
    const { res } = fakeRes();
    expect(localCheck(fakeReq(undefined, '/api/status', '127.0.0.1'), res)).toBe(true);
  });
});

// ─── RS256 pinning ───────────────────────────────────────────────────────────

describe('bearerAuthMiddleware — RS256', () => {
  it('valid RS256 JWT passes (oidc-only, RS256 pinned)', () => {
    const check = bearerAuthMiddleware({
      configToken: null,
      oidc: { issuer: ISSUER, algorithm: 'RS256', key: rsaPublicPem },
    });
    const jwt = makeRs256(validClaims(), rsaPrivateKey);
    const { res } = fakeRes();
    expect(check(fakeReq(`Bearer ${jwt}`), res)).toBe(true);
  });

  it('HS256 token is rejected when RS256 is pinned (no algorithm confusion)', () => {
    const check = bearerAuthMiddleware({
      configToken: null,
      oidc: { issuer: ISSUER, algorithm: 'RS256', key: rsaPublicPem },
    });
    // Sign an HS256 token using the PUBLIC PEM as the HMAC secret — the
    // classic RS256→HS256 confusion attack. Must be rejected.
    const jwt = makeHs256(validClaims(), rsaPublicPem);
    const { res, status } = fakeRes();
    expect(check(fakeReq(`Bearer ${jwt}`), res)).toBe(false);
    expect(status()).toBe(403);
  });
});

// ─── Regression: NO oidc config — legacy behavior bit-identical ──────────────

describe('bearerAuthMiddleware — regression without oidc (legacy path)', () => {
  it('no token + no oidc → legacy 401 with the configure-hint message', () => {
    const check = bearerAuthMiddleware({ configToken: null });
    const { res, status, body } = fakeRes();
    expect(check(fakeReq(), res)).toBe(false);
    expect(status()).toBe(401);
    expect(body()).toContain('configure DECKENT_API_TOKEN');
    expect(body()).toContain('DECKENT_API_AUTH_DISABLED');
  });

  it('static token + wrong bearer → 403 with no JWT second chance', () => {
    const check = bearerAuthMiddleware({ configToken: STATIC_TOKEN });
    // A perfectly valid JWT must NOT pass when oidc is not configured.
    const jwt = makeHs256(validClaims(), HS_SECRET);
    const { res, status, body } = fakeRes();
    expect(check(fakeReq(`Bearer ${jwt}`), res)).toBe(false);
    expect(status()).toBe(403);
    expect(body()).toContain('forbidden');
  });

  it('static token correct bearer → passes (unchanged)', () => {
    const check = bearerAuthMiddleware({ configToken: STATIC_TOKEN });
    const { res } = fakeRes();
    expect(check(fakeReq(`Bearer ${STATIC_TOKEN}`), res)).toBe(true);
  });
});

// ─── Regression: query-token fallback unchanged with oidc configured ─────────

describe('bearerAuthMiddleware — query-token fallback with oidc configured', () => {
  it('?token= on an opted-in path still authenticates via the static token', () => {
    const check = bearerAuthMiddleware({
      configToken: STATIC_TOKEN,
      oidc: HS_OIDC,
      queryTokenPaths: ['/api/events'],
    });
    const { res } = fakeRes();
    const req = fakeReq(undefined, `/api/events?token=${STATIC_TOKEN}`);
    expect(check(req, res)).toBe(true);
  });

  it('wrong ?token= on an opted-in path → 403 (unchanged)', () => {
    const check = bearerAuthMiddleware({
      configToken: STATIC_TOKEN,
      oidc: HS_OIDC,
      queryTokenPaths: ['/api/events'],
    });
    const { res, status } = fakeRes();
    const req = fakeReq(undefined, '/api/events?token=wrong-token');
    expect(check(req, res)).toBe(false);
    expect(status()).toBe(403);
  });
});
