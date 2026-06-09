import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPairSync,
  createHmac,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import {
  verifyJwt,
  parseOidcClaims,
  type OidcClaims,
  type JwtAlgorithm,
} from '../../src/core/auth-oidc.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

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

/** Build an RS256 JWT signed with `privateKey`. Signs with the SAME algorithm
 *  string the module verifies with — making this test the arbiter of correctness. */
function makeRs256(claims: OidcClaims, privateKey: KeyObject, header?: Record<string, unknown>): string {
  const headerB64 = encodeSegment({ alg: 'RS256', typ: 'JWT', ...header });
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

const HS_SECRET = 'super-secret-shared-key-for-tests';
const NOW = 1_700_000_000; // fixed injected clock (seconds)

let rsaPublicKey: KeyObject;
let rsaPrivateKey: KeyObject;
let otherPublicKey: KeyObject;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  rsaPublicKey = pair.publicKey;
  rsaPrivateKey = pair.privateKey;
  otherPublicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('verifyJwt — HS256', () => {
  it('accepts a valid HS256 token', () => {
    const token = makeHs256({ sub: 'user-1', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, { hs256Secret: HS_SECRET, now: NOW });
    expect(result.valid).toBe(true);
    expect(result.claims?.sub).toBe('user-1');
    expect(result.reason).toBeUndefined();
  });

  it('rejects a tampered (bad-sig) HS256 token', () => {
    const token = makeHs256({ sub: 'user-1', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, { hs256Secret: 'wrong-secret', now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects when the algorithm is not in the explicit allow-list', () => {
    const token = makeHs256({ sub: 'user-1', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, {
      hs256Secret: HS_SECRET,
      algorithms: ['RS256'],
      now: NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('algorithm_not_allowed');
  });

  it('rejects when no key material is supplied', () => {
    const token = makeHs256({ sub: 'user-1', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, { algorithms: ['HS256'], now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_key_material');
  });
});

describe('verifyJwt — RS256', () => {
  it('accepts a valid RS256 token (round-trip validates the algorithm string)', () => {
    const token = makeRs256({ sub: 'user-2', exp: NOW + 3600 }, rsaPrivateKey);
    const result = verifyJwt(token, { rs256PublicKey: rsaPublicKey, now: NOW });
    expect(result.valid).toBe(true);
    expect(result.claims?.sub).toBe('user-2');
  });

  it('rejects an RS256 token signed by a different key', () => {
    const token = makeRs256({ sub: 'user-2', exp: NOW + 3600 }, rsaPrivateKey);
    const result = verifyJwt(token, { rs256PublicKey: otherPublicKey, now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });

  it('rejects when an RS256 token is presented but no public key is supplied', () => {
    const token = makeRs256({ sub: 'user-2', exp: NOW + 3600 }, rsaPrivateKey);
    const result = verifyJwt(token, { algorithms: ['RS256'], now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_key_material');
  });

  it('returns invalid_signature for a garbage signature segment', () => {
    const token = makeRs256({ sub: 'user-2', exp: NOW + 3600 }, rsaPrivateKey);
    const tampered = `${token.split('.').slice(0, 2).join('.')}.not-a-real-signature`;
    const result = verifyJwt(tampered, { rs256PublicKey: rsaPublicKey, now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_signature');
  });
});

describe('verifyJwt — alg:none rejection', () => {
  it('rejects an alg:none token even when key material is present', () => {
    const token = makeAlgNone({ sub: 'attacker', exp: NOW + 3600 });
    const result = verifyJwt(token, { hs256Secret: HS_SECRET, now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('alg_none_rejected');
  });

  it('rejects alg:none case-insensitively (NoNe)', () => {
    const headerB64 = encodeSegment({ alg: 'NoNe', typ: 'JWT' });
    const payloadB64 = encodeSegment({ sub: 'attacker' });
    const token = `${headerB64}.${payloadB64}.`;
    const result = verifyJwt(token, { hs256Secret: HS_SECRET, now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('alg_none_rejected');
  });
});

describe('verifyJwt — claim validation', () => {
  it('rejects an expired token', () => {
    const token = makeHs256({ sub: 'user-1', exp: NOW - 10 }, HS_SECRET);
    const result = verifyJwt(token, { hs256Secret: HS_SECRET, now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_expired');
  });

  it('honors clock tolerance for a just-expired token', () => {
    const token = makeHs256({ sub: 'user-1', exp: NOW - 10 }, HS_SECRET);
    const result = verifyJwt(token, {
      hs256Secret: HS_SECRET,
      now: NOW,
      clockToleranceSec: 30,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects a not-yet-valid (nbf) token', () => {
    const token = makeHs256({ sub: 'user-1', nbf: NOW + 60, exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, { hs256Secret: HS_SECRET, now: NOW });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('token_not_yet_valid');
  });

  it('rejects an issuer mismatch', () => {
    const token = makeHs256({ iss: 'https://evil.example', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, {
      hs256Secret: HS_SECRET,
      issuer: 'https://idp.example',
      now: NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('issuer_mismatch');
  });

  it('accepts a matching issuer', () => {
    const token = makeHs256({ iss: 'https://idp.example', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, {
      hs256Secret: HS_SECRET,
      issuer: 'https://idp.example',
      now: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects an audience mismatch', () => {
    const token = makeHs256({ aud: 'other-app', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, {
      hs256Secret: HS_SECRET,
      audience: 'my-app',
      now: NOW,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('audience_mismatch');
  });

  it('accepts when the token aud array contains the expected audience', () => {
    const token = makeHs256({ aud: ['my-app', 'other'], exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, {
      hs256Secret: HS_SECRET,
      audience: 'my-app',
      now: NOW,
    });
    expect(result.valid).toBe(true);
  });

  it('does not enforce iss/aud when the options are absent', () => {
    const token = makeHs256({ iss: 'whatever', aud: 'whoever', exp: NOW + 3600 }, HS_SECRET);
    const result = verifyJwt(token, { hs256Secret: HS_SECRET, now: NOW });
    expect(result.valid).toBe(true);
  });
});

describe('verifyJwt — malformed input', () => {
  it('rejects a token without three segments', () => {
    expect(verifyJwt('only.two', { hs256Secret: HS_SECRET }).reason).toBe('malformed_token');
  });

  it('rejects a non-string token', () => {
    expect(verifyJwt(undefined as unknown as string, { hs256Secret: HS_SECRET }).reason).toBe(
      'malformed_token',
    );
  });

  it('rejects an unsupported algorithm', () => {
    const headerB64 = encodeSegment({ alg: 'ES256', typ: 'JWT' });
    const payloadB64 = encodeSegment({ sub: 'x' });
    const token = `${headerB64}.${payloadB64}.sig`;
    expect(verifyJwt(token, { hs256Secret: HS_SECRET }).reason).toBe('unsupported_algorithm');
  });
});

describe('parseOidcClaims', () => {
  it('decodes claims without verifying the signature', () => {
    const token = makeHs256({ sub: 'introspect-me', custom: 42 }, 'irrelevant');
    const claims = parseOidcClaims(token);
    expect(claims?.sub).toBe('introspect-me');
    expect(claims?.['custom']).toBe(42);
  });

  it('decodes claims even for an alg:none token (introspection only)', () => {
    const token = makeAlgNone({ sub: 'unsafe' });
    expect(parseOidcClaims(token)?.sub).toBe('unsafe');
  });

  it('returns null for a malformed token', () => {
    expect(parseOidcClaims('garbage')).toBeNull();
    expect(parseOidcClaims('a.!!!.c')).toBeNull();
  });
});

describe('type surface', () => {
  it('exposes the JwtAlgorithm union', () => {
    const algs: JwtAlgorithm[] = ['HS256', 'RS256'];
    expect(algs).toHaveLength(2);
  });
});
