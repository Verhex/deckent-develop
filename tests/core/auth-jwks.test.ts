import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPairSync,
  createHmac,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import {
  fetchJwks,
  createJwksKeyResolver,
  verifyJwtWithJwks,
  JwksError,
  type Jwk,
  type JwksFetch,
} from '../../src/core/auth-jwks.js';
import { verifyJwt, type OidcClaims } from '../../src/core/auth-oidc.js';

// ─── Test helpers (hermetic — real crypto, mock network) ─────────────────────

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function encodeSegment(obj: Record<string, unknown>): string {
  return b64url(JSON.stringify(obj));
}

/** Build a REAL RS256 JWT signed with `privateKey` (header carries `kid`). */
function makeRs256(
  claims: OidcClaims,
  privateKey: KeyObject,
  header?: Record<string, unknown>,
): string {
  const headerB64 = encodeSegment({ alg: 'RS256', typ: 'JWT', ...header });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${sig}`;
}

/** Build an HS256 JWT (for the symmetric-alg rejection test). */
function makeHs256(claims: OidcClaims, secret: string): string {
  const headerB64 = encodeSegment({ alg: 'HS256', typ: 'JWT', kid: 'kid-a' });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

/** Build an unsigned `alg: none` token (the classic bypass attempt). */
function makeAlgNone(claims: OidcClaims): string {
  const headerB64 = encodeSegment({ alg: 'none', typ: 'JWT', kid: 'kid-a' });
  const payloadB64 = encodeSegment(claims as Record<string, unknown>);
  return `${headerB64}.${payloadB64}.`;
}

/**
 * Sequential mock fetch: call N serves docs[N] (last doc repeats). Never touches
 * the network; exposes the call count so cache behavior can be asserted.
 */
function mockJwksFetch(docs: unknown[]): { impl: JwksFetch; calls: () => number } {
  let n = 0;
  const impl: JwksFetch = (_url: string) => {
    const doc = docs[Math.min(n, docs.length - 1)];
    n += 1;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(doc) });
  };
  return { impl, calls: () => n };
}

const JWKS_URL = 'https://idp.example/.well-known/jwks.json';
const NOW_SEC = 1_700_000_000; // injected verifyJwt clock (seconds)
const NOW_MS = NOW_SEC * 1000; // injected resolver clock (milliseconds)

let keyA: { privateKey: KeyObject; jwk: Jwk };
let keyB: { privateKey: KeyObject; jwk: Jwk };
let ecJwk: Jwk;

beforeAll(() => {
  const pairA = generateKeyPairSync('rsa', { modulusLength: 2048 });
  keyA = {
    privateKey: pairA.privateKey,
    jwk: { ...(pairA.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'kid-a', alg: 'RS256' },
  };
  const pairB = generateKeyPairSync('rsa', { modulusLength: 2048 });
  keyB = {
    privateKey: pairB.privateKey,
    jwk: { ...(pairB.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'kid-b', alg: 'RS256' },
  };
  const ecPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  ecJwk = { ...(ecPair.publicKey.export({ format: 'jwk' }) as Jwk), kid: 'kid-ec', alg: 'ES256' };
});

// ─── fetchJwks ────────────────────────────────────────────────────────────────

describe('fetchJwks', () => {
  it('rejects an http URL without ever calling fetch (HTTPS-only)', async () => {
    const { impl, calls } = mockJwksFetch([{ keys: [] }]);
    await expect(fetchJwks('http://idp.example/jwks.json', impl)).rejects.toMatchObject({
      name: 'JwksError',
      code: 'JWKS_URL_NOT_HTTPS',
    });
    expect(calls()).toBe(0);
  });

  it('rejects a malformed URL', async () => {
    const { impl } = mockJwksFetch([{ keys: [] }]);
    await expect(fetchJwks('not a url at all', impl)).rejects.toMatchObject({
      code: 'JWKS_URL_INVALID',
    });
  });

  it('throws on a non-2xx response with the status in the message', async () => {
    const impl: JwksFetch = () =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    await expect(fetchJwks(JWKS_URL, impl)).rejects.toMatchObject({ code: 'JWKS_FETCH_FAILED' });
    await expect(fetchJwks(JWKS_URL, impl)).rejects.toThrow(/503/);
  });

  it('throws on malformed JSON', async () => {
    const impl: JwksFetch = () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('bad json')) });
    await expect(fetchJwks(JWKS_URL, impl)).rejects.toMatchObject({
      code: 'JWKS_INVALID_DOCUMENT',
    });
  });

  it('throws when the body has no keys array', async () => {
    const { impl } = mockJwksFetch([{ nope: true }]);
    await expect(fetchJwks(JWKS_URL, impl)).rejects.toMatchObject({
      code: 'JWKS_INVALID_DOCUMENT',
    });
  });

  it('returns the keys of a valid document, dropping non-object entries', async () => {
    const { impl } = mockJwksFetch([{ keys: [keyA.jwk, 'garbage', null, 42] }]);
    const doc = await fetchJwks(JWKS_URL, impl);
    expect(doc.keys).toHaveLength(1);
    expect(doc.keys[0]?.kid).toBe('kid-a');
  });
});

// ─── createJwksKeyResolver ────────────────────────────────────────────────────

describe('createJwksKeyResolver', () => {
  it('resolves a kid to a PEM spki key that verifyJwt accepts (round-trip)', async () => {
    const { impl } = mockJwksFetch([{ keys: [keyA.jwk] }]);
    const resolver = createJwksKeyResolver({ jwksUrl: JWKS_URL, fetchImpl: impl });
    const pem = await resolver.resolve('kid-a');
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');

    const token = makeRs256({ sub: 'user-1', exp: NOW_SEC + 3600 }, keyA.privateKey, {
      kid: 'kid-a',
    });
    const result = verifyJwt(token, { rs256PublicKey: pem, now: NOW_SEC });
    expect(result.valid).toBe(true);
    expect(result.claims?.sub).toBe('user-1');
  });

  it('serves a second resolve from the TTL cache — fetch is NOT called again', async () => {
    const { impl, calls } = mockJwksFetch([{ keys: [keyA.jwk] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      cacheTtlMs: 300_000,
      clock: () => NOW_MS, // frozen clock — cache can never expire
    });
    await resolver.resolve('kid-a');
    await resolver.resolve('kid-a');
    expect(calls()).toBe(1);
  });

  it('re-fetches once the TTL has elapsed (injected clock)', async () => {
    let now = NOW_MS;
    const { impl, calls } = mockJwksFetch([{ keys: [keyA.jwk] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      cacheTtlMs: 300_000,
      clock: () => now,
    });
    await resolver.resolve('kid-a');
    now += 300_000; // exactly TTL — stale
    await resolver.resolve('kid-a');
    expect(calls()).toBe(2);
  });

  it('handles key rotation: unknown kid on a fresh cache triggers exactly one re-fetch', async () => {
    // Fetch 1 serves only kid-a; fetch 2 serves the rotated set with kid-b.
    const { impl, calls } = mockJwksFetch([{ keys: [keyA.jwk] }, { keys: [keyA.jwk, keyB.jwk] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      clock: () => NOW_MS,
    });
    await resolver.resolve('kid-a'); // warm the cache (fetch 1)
    const pemB = await resolver.resolve('kid-b'); // rotation → re-fetch (fetch 2)
    expect(pemB).toContain('-----BEGIN PUBLIC KEY-----');
    expect(calls()).toBe(2);
  });

  it('throws JWKS_UNKNOWN_KID after the single rotation re-fetch still misses', async () => {
    const { impl, calls } = mockJwksFetch([{ keys: [keyA.jwk] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      clock: () => NOW_MS,
    });
    await resolver.resolve('kid-a'); // warm the cache (fetch 1)
    await expect(resolver.resolve('kid-nope')).rejects.toMatchObject({
      name: 'JwksError',
      code: 'JWKS_UNKNOWN_KID',
    });
    expect(calls()).toBe(2); // exactly ONE rotation re-fetch — not a retry loop
  });

  it('does not double-fetch when the kid is missing right after a fresh fetch', async () => {
    const { impl, calls } = mockJwksFetch([{ keys: [keyA.jwk] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      clock: () => NOW_MS,
    });
    // Cold cache: this resolve itself fetched — a second fetch would be pointless.
    await expect(resolver.resolve('kid-nope')).rejects.toMatchObject({
      code: 'JWKS_UNKNOWN_KID',
    });
    expect(calls()).toBe(1);
  });

  it('filters out non-RSA and non-RS256 keys (algorithm-confusion guard)', async () => {
    const wrongAlg: Jwk = { ...keyB.jwk, kid: 'kid-wrong-alg', alg: 'RS512' };
    const { impl } = mockJwksFetch([{ keys: [ecJwk, wrongAlg, keyA.jwk] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      clock: () => NOW_MS,
    });
    await expect(resolver.resolve('kid-ec')).rejects.toMatchObject({ code: 'JWKS_UNKNOWN_KID' });
    await expect(resolver.resolve('kid-wrong-alg')).rejects.toMatchObject({
      code: 'JWKS_UNKNOWN_KID',
    });
    await expect(resolver.resolve('kid-a')).resolves.toContain('-----BEGIN PUBLIC KEY-----');
  });

  it('exposes JwksError instances (typed error surface)', async () => {
    const { impl } = mockJwksFetch([{ keys: [] }]);
    const resolver = createJwksKeyResolver({
      jwksUrl: JWKS_URL,
      fetchImpl: impl,
      clock: () => NOW_MS,
    });
    await expect(resolver.resolve('kid-a')).rejects.toBeInstanceOf(JwksError);
  });
});

// ─── verifyJwtWithJwks ────────────────────────────────────────────────────────

describe('verifyJwtWithJwks', () => {
  function makeResolver(docs?: unknown[]): { resolver: ReturnType<typeof createJwksKeyResolver> } {
    const { impl } = mockJwksFetch(docs ?? [{ keys: [keyA.jwk, keyB.jwk] }]);
    return {
      resolver: createJwksKeyResolver({ jwksUrl: JWKS_URL, fetchImpl: impl, clock: () => NOW_MS }),
    };
  }

  it('verifies a real RS256 token end-to-end via the resolver', async () => {
    const { resolver } = makeResolver();
    const token = makeRs256({ sub: 'user-7', exp: NOW_SEC + 3600 }, keyA.privateKey, {
      kid: 'kid-a',
    });
    const result = await verifyJwtWithJwks(token, { resolver, now: NOW_SEC });
    expect(result.valid).toBe(true);
    expect(result.claims?.sub).toBe('user-7');
    expect(result.reason).toBeUndefined();
  });

  it('rejects an HS256 token outright (JWKS keys are asymmetric only)', async () => {
    const { resolver } = makeResolver();
    const token = makeHs256({ sub: 'user-7', exp: NOW_SEC + 3600 }, 'shared-secret');
    const result = await verifyJwtWithJwks(token, { resolver, now: NOW_SEC });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('algorithm_not_allowed');
  });

  it('rejects an alg:none token', async () => {
    const { resolver } = makeResolver();
    const result = await verifyJwtWithJwks(makeAlgNone({ sub: 'attacker' }), {
      resolver,
      now: NOW_SEC,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('alg_none_rejected');
  });

  it('rejects an RS256 token without a kid header', async () => {
    const { resolver } = makeResolver();
    const token = makeRs256({ sub: 'user-7', exp: NOW_SEC + 3600 }, keyA.privateKey); // no kid
    const result = await verifyJwtWithJwks(token, { resolver, now: NOW_SEC });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_kid');
  });

  it('fails CLOSED when the kid cannot be resolved', async () => {
    const { resolver } = makeResolver([{ keys: [] }]);
    const token = makeRs256({ sub: 'user-7', exp: NOW_SEC + 3600 }, keyA.privateKey, {
      kid: 'kid-a',
    });
    const result = await verifyJwtWithJwks(token, { resolver, now: NOW_SEC });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('jwks_key_resolution_failed');
  });

  it('forwards claim constraints to verifyJwt (issuer mismatch surfaces)', async () => {
    const { resolver } = makeResolver();
    const token = makeRs256(
      { iss: 'https://evil.example', sub: 'user-7', exp: NOW_SEC + 3600 },
      keyA.privateKey,
      { kid: 'kid-a' },
    );
    const result = await verifyJwtWithJwks(token, {
      resolver,
      issuer: 'https://idp.example',
      now: NOW_SEC,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('issuer_mismatch');
  });

  it('rejects a token signed by a key OTHER than the one the kid resolves to', async () => {
    const { resolver } = makeResolver();
    // Signed with key B but claims kid-a — resolved key A must refuse the signature.
    const token = makeRs256({ sub: 'user-7', exp: NOW_SEC + 3600 }, keyB.privateKey, {
      kid: 'kid-a',
    });
    const result = await verifyJwtWithJwks(token, { resolver, now: NOW_SEC });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('returns malformed_token for garbage input', async () => {
    const { resolver } = makeResolver();
    expect((await verifyJwtWithJwks('garbage', { resolver })).reason).toBe('malformed_token');
    expect((await verifyJwtWithJwks('a.b', { resolver })).reason).toBe('malformed_token');
    expect(
      (await verifyJwtWithJwks(undefined as unknown as string, { resolver })).reason,
    ).toBe('malformed_token');
  });
});
