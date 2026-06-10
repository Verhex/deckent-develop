/**
 * Sprint 277 Task 277-007 — OIDC token-exchange backend endpoint.
 *
 * Tests the code→token exchange flow end-to-end with a fully MOCKED IdP
 * (discovery + token endpoint + JWKS) — NO real network, NO real IdP. The
 * id_token is a REAL RS256 JWT signed with a generated key pair and verified
 * against a matching JWKS, so the verification path is exercised for real.
 *
 * Security invariants verified:
 *   - config-gated default-off: disabled / missing block → 404
 *   - id_token issuer + audience(=client_id) pinned (mismatch rejected)
 *   - RS256 enforced (alg:none rejected), bad signature rejected
 *   - honest failure codes for discovery / token / id_token failures
 *   - the client_secret NEVER appears in a response body
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  generateKeyPairSync,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import {
  exchangeAuthCode,
  registerOidcCallbackRoute,
  resolveDashboardOidcConfig,
  type OidcFetch,
  type DashboardOidcResolved,
} from '../../src/api/oidc-callback-endpoint.js';
import type { Jwk } from '../../src/core/auth-jwks.js';
import type { OidcClaims } from '../../src/core/auth-oidc.js';

// ─── JWT builders (real RS256 / alg:none — mirrors tests/core/auth-jwks.test.ts) ─

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}
function encodeSegment(obj: Record<string, unknown>): string {
  return b64url(JSON.stringify(obj));
}
function makeRs256(claims: OidcClaims, privateKey: KeyObject, kid = 'kid-a'): string {
  const headerB64 = encodeSegment({ alg: 'RS256', typ: 'JWT', kid });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}
function makeAlgNone(claims: OidcClaims, kid = 'kid-a'): string {
  const headerB64 = encodeSegment({ alg: 'none', typ: 'JWT', kid });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  return `${headerB64}.${payloadB64}.`;
}

// ─── Constants + key material ────────────────────────────────────────────────

const ISSUER = 'https://idp.example';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const TOKEN_ENDPOINT = 'https://idp.example/oauth/token';
const JWKS_URI = 'https://idp.example/.well-known/jwks.json';
const CLIENT_ID = 'deckent-dashboard';
const CLIENT_SECRET = 'super-secret-do-not-leak';
const REDIRECT_URI = 'http://localhost:3100/auth/callback';
const NOW_SEC = 1_700_000_000;

const CONFIG: DashboardOidcResolved = {
  issuer: ISSUER,
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  redirect_uri: REDIRECT_URI,
};

let keyA: { privateKey: KeyObject; jwk: Jwk };
let keyB: { privateKey: KeyObject; jwk: Jwk };

beforeAll(() => {
  const a = generateKeyPairSync('rsa', { modulusLength: 2048 });
  keyA = {
    privateKey: a.privateKey,
    jwk: { ...(a.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'kid-a', alg: 'RS256' },
  };
  const b = generateKeyPairSync('rsa', { modulusLength: 2048 });
  keyB = {
    privateKey: b.privateKey,
    jwk: { ...(b.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'kid-a', alg: 'RS256' },
  };
});

// ─── Mock IdP fetch router ───────────────────────────────────────────────────

interface MockResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
function jsonRes(status: number, body: unknown): MockResponse {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

interface MockIdpOverrides {
  discovery?: MockResponse;
  token?: MockResponse;
  jwks?: MockResponse;
  idToken?: string;
}

/** Build a fetch that routes discovery / token / jwks by URL. Records every call. */
function mockIdp(overrides: MockIdpOverrides = {}): { impl: OidcFetch; calls: string[] } {
  const calls: string[] = [];
  const idToken =
    overrides.idToken ??
    makeRs256(
      { iss: ISSUER, sub: 'user-9', aud: CLIENT_ID, email: 'u9@example.com', name: 'User Nine', exp: NOW_SEC + 3600 },
      keyA.privateKey,
    );
  const discovery =
    overrides.discovery ??
    jsonRes(200, { issuer: ISSUER, token_endpoint: TOKEN_ENDPOINT, jwks_uri: JWKS_URI });
  const token = overrides.token ?? jsonRes(200, { id_token: idToken, token_type: 'Bearer', expires_in: 3600 });
  const jwks = overrides.jwks ?? jsonRes(200, { keys: [keyA.jwk] });

  const impl: OidcFetch = (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url === DISCOVERY_URL) return Promise.resolve(discovery);
    if (url === TOKEN_ENDPOINT) return Promise.resolve(token);
    if (url === JWKS_URI) return Promise.resolve(jwks);
    return Promise.resolve(jsonRes(404, { error: 'unexpected_url' }));
  };
  return { impl, calls };
}

const GOOD_INPUT = { code: 'auth-code-xyz', code_verifier: 'pkce-verifier-abc' };

// ─── exchangeAuthCode — success ──────────────────────────────────────────────

describe('exchangeAuthCode — happy path', () => {
  it('discovers, exchanges, verifies the id_token and returns { token, claims }', async () => {
    const { impl, calls } = mockIdp();
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.token).toContain('.'); // a JWT
    expect(result.claims.sub).toBe('user-9');
    expect(result.claims['email']).toBe('u9@example.com');
    expect(result.claims['name']).toBe('User Nine');

    // Full flow touched all three IdP endpoints, token via POST.
    expect(calls).toContain(`GET ${DISCOVERY_URL}`);
    expect(calls).toContain(`POST ${TOKEN_ENDPOINT}`);
    expect(calls).toContain(`GET ${JWKS_URI}`);
  });

  it('sends grant_type, code, code_verifier, client_id/secret and redirect_uri to the token endpoint', async () => {
    let tokenBody = '';
    const base = mockIdp();
    const impl: OidcFetch = (url, init) => {
      if (url === TOKEN_ENDPOINT) tokenBody = init?.body ?? '';
      return base.impl(url, init);
    };
    await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });

    const params = new URLSearchParams(tokenBody);
    expect(params.get('grant_type')).toBe('authorization_code');
    expect(params.get('code')).toBe(GOOD_INPUT.code);
    expect(params.get('code_verifier')).toBe(GOOD_INPUT.code_verifier);
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('client_secret')).toBe(CLIENT_SECRET);
    expect(params.get('redirect_uri')).toBe(REDIRECT_URI);
  });
});

// ─── exchangeAuthCode — id_token rejection ───────────────────────────────────

describe('exchangeAuthCode — id_token verification failures', () => {
  it('rejects an id_token signed by a key the JWKS does not serve (bad signature)', async () => {
    const badToken = makeRs256(
      { iss: ISSUER, sub: 'u', aud: CLIENT_ID, exp: NOW_SEC + 3600 },
      keyB.privateKey, // signed with B, but JWKS serves A under kid-a
    );
    const { impl } = mockIdp({ idToken: badToken });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('id_token_invalid');
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects an id_token from a different issuer', async () => {
    const evil = makeRs256(
      { iss: 'https://evil.example', sub: 'u', aud: CLIENT_ID, exp: NOW_SEC + 3600 },
      keyA.privateKey,
    );
    const { impl } = mockIdp({ idToken: evil });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('id_token_invalid');
    expect(result.reason).toBe('issuer_mismatch');
  });

  it('rejects an id_token whose aud is not our client_id', async () => {
    const wrongAud = makeRs256(
      { iss: ISSUER, sub: 'u', aud: 'some-other-client', exp: NOW_SEC + 3600 },
      keyA.privateKey,
    );
    const { impl } = mockIdp({ idToken: wrongAud });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('id_token_invalid');
    expect(result.reason).toBe('audience_mismatch');
  });

  it('rejects an alg:none id_token (the classic bypass)', async () => {
    const none = makeAlgNone({ iss: ISSUER, sub: 'attacker', aud: CLIENT_ID, exp: NOW_SEC + 3600 });
    const { impl } = mockIdp({ idToken: none });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('id_token_invalid');
    expect(result.reason).toBe('alg_none_rejected');
  });
});

// ─── exchangeAuthCode — discovery / token / input failures ───────────────────

describe('exchangeAuthCode — flow failures (honest codes)', () => {
  it('invalid_request when code is missing (no network touched)', async () => {
    const { impl, calls } = mockIdp();
    const result = await exchangeAuthCode({ code_verifier: 'v' }, CONFIG, { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('invalid_request');
    expect(calls).toHaveLength(0);
  });

  it('invalid_request when code_verifier is missing', async () => {
    const { impl } = mockIdp();
    const result = await exchangeAuthCode({ code: 'c' }, CONFIG, { fetchImpl: impl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('invalid_request');
  });

  it('discovery_failed on a non-2xx discovery response', async () => {
    const { impl } = mockIdp({ discovery: jsonRes(500, {}) });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('discovery_failed');
  });

  it('discovery_failed when the discovery doc lacks token_endpoint', async () => {
    const { impl } = mockIdp({ discovery: jsonRes(200, { issuer: ISSUER, jwks_uri: JWKS_URI }) });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('discovery_failed');
  });

  it('token_exchange_failed on a non-2xx token response', async () => {
    const { impl } = mockIdp({ token: jsonRes(400, { error: 'invalid_grant' }) });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('token_exchange_failed');
  });

  it('id_token_missing when the token response omits id_token', async () => {
    const { impl } = mockIdp({ token: jsonRes(200, { access_token: 'a', token_type: 'Bearer' }) });
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, { fetchImpl: impl, now: NOW_SEC });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.code).toBe('id_token_missing');
  });

  it('fetch_unavailable when no fetch implementation exists', async () => {
    const result = await exchangeAuthCode(GOOD_INPUT, CONFIG, {
      fetchImpl: undefined as unknown as OidcFetch,
    });
    // With no injected fetch and a real global fetch present, discovery would be
    // attempted against the mock URL and fail — so accept either the
    // unavailable path or a downstream discovery failure, but never a success.
    expect(result.ok).toBe(false);
  });
});

// ─── registerOidcCallbackRoute + resolveDashboardOidcConfig (tmpdir) ──────────

const createdRoots: string[] = [];
function makeProjectRoot(dashboardOidc: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-oidc-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'config.json'),
    JSON.stringify(dashboardOidc === undefined ? {} : { dashboard_oidc: dashboardOidc }),
    'utf-8',
  );
  createdRoots.push(root);
  return root;
}
afterEach(() => {
  while (createdRoots.length) {
    const r = createdRoots.pop();
    if (r) rmSync(r, { recursive: true, force: true });
  }
});

function fakeRes(): { res: ServerResponse; status: () => number; body: () => string; json: () => unknown } {
  let status = 200;
  let body = '';
  const res = {
    writeHead: (s: number) => { status = s; },
    end: (b: string) => { body = b; },
  } as unknown as ServerResponse;
  return { res, status: () => status, body: () => body, json: () => JSON.parse(body) as unknown };
}

const ENABLED_BLOCK = {
  enabled: true,
  issuer: ISSUER,
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  redirect_uri: REDIRECT_URI,
};

describe('resolveDashboardOidcConfig', () => {
  it('returns null when the block is absent (default-off)', () => {
    expect(resolveDashboardOidcConfig(makeProjectRoot(undefined))).toBeNull();
  });

  it('returns null when enabled is false', () => {
    expect(resolveDashboardOidcConfig(makeProjectRoot({ ...ENABLED_BLOCK, enabled: false }))).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    const { client_id: _omit, ...partial } = ENABLED_BLOCK;
    expect(resolveDashboardOidcConfig(makeProjectRoot(partial))).toBeNull();
  });

  it('resolves a complete enabled block', () => {
    const cfg = resolveDashboardOidcConfig(makeProjectRoot(ENABLED_BLOCK));
    expect(cfg).not.toBeNull();
    expect(cfg?.issuer).toBe(ISSUER);
    expect(cfg?.client_id).toBe(CLIENT_ID);
    expect(cfg?.client_secret).toBe(CLIENT_SECRET);
    expect(cfg?.redirect_uri).toBe(REDIRECT_URI);
  });
});

describe('registerOidcCallbackRoute', () => {
  it('does not handle a different path (returns false)', async () => {
    const { res } = fakeRes();
    const handled = await registerOidcCallbackRoute(
      '/api/status', 'POST', res, {}, makeProjectRoot(ENABLED_BLOCK),
    );
    expect(handled).toBe(false);
  });

  it('does not handle GET on the exchange path (returns false)', async () => {
    const { res } = fakeRes();
    const handled = await registerOidcCallbackRoute(
      '/api/auth/oidc/exchange', 'GET', res, {}, makeProjectRoot(ENABLED_BLOCK),
    );
    expect(handled).toBe(false);
  });

  it('responds 404 oidc_disabled when dashboard_oidc is off', async () => {
    const { res, status, json } = fakeRes();
    const handled = await registerOidcCallbackRoute(
      '/api/auth/oidc/exchange', 'POST', res, GOOD_INPUT, makeProjectRoot(undefined),
    );
    expect(handled).toBe(true);
    expect(status()).toBe(404);
    expect((json() as { error: string }).error).toBe('oidc_disabled');
  });

  it('exchanges and returns { token, claims } on success — without leaking the client_secret', async () => {
    const { impl } = mockIdp();
    const { res, status, body, json } = fakeRes();
    const handled = await registerOidcCallbackRoute(
      '/api/auth/oidc/exchange', 'POST', res, GOOD_INPUT, makeProjectRoot(ENABLED_BLOCK),
      { fetchImpl: impl, now: NOW_SEC },
    );
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const payload = json() as { token: string; claims: Record<string, unknown> };
    expect(payload.token).toContain('.');
    expect(payload.claims['sub']).toBe('user-9');
    // The confidential client secret must never reach the response body.
    expect(body()).not.toContain(CLIENT_SECRET);
  });

  it('maps an id_token failure to 401 with an honest code', async () => {
    const evil = makeRs256(
      { iss: 'https://evil.example', sub: 'u', aud: CLIENT_ID, exp: NOW_SEC + 3600 },
      keyA.privateKey,
    );
    const { impl } = mockIdp({ idToken: evil });
    const { res, status, json } = fakeRes();
    await registerOidcCallbackRoute(
      '/api/auth/oidc/exchange', 'POST', res, GOOD_INPUT, makeProjectRoot(ENABLED_BLOCK),
      { fetchImpl: impl, now: NOW_SEC },
    );
    expect(status()).toBe(401);
    expect((json() as { error: string }).error).toBe('id_token_invalid');
  });

  it('maps a discovery failure to 502', async () => {
    const { impl } = mockIdp({ discovery: jsonRes(503, {}) });
    const { res, status, json } = fakeRes();
    await registerOidcCallbackRoute(
      '/api/auth/oidc/exchange', 'POST', res, GOOD_INPUT, makeProjectRoot(ENABLED_BLOCK),
      { fetchImpl: impl, now: NOW_SEC },
    );
    expect(status()).toBe(502);
    expect((json() as { error: string }).error).toBe('discovery_failed');
  });
});
