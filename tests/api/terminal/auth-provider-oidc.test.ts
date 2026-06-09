import { describe, it, expect, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { OidcAuthProvider } from '../../../src/api/terminal/auth-provider.js';

// ─── Hermetic HS256 JWT mint helper (node:crypto only — no network, no disk) ──

const SECRET = 'terminal-oidc-shared-secret';
const ISSUER = 'https://idp.example.com';
const AUDIENCE = 'deckent-terminal';

/** Fixed deterministic "now" (seconds since epoch) for clock-injected tests. */
const NOW = 1_750_000_000;

function b64url(value: object | string): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.from(raw).toString('base64url');
}

/** Mint a real HS256 JWT signed with `secret` (defaults to the test secret). */
function mintHs256(
  claims: Record<string, unknown>,
  opts: { secret?: string; header?: Record<string, unknown> } = {},
): string {
  const header = opts.header ?? { alg: 'HS256', typ: 'JWT' };
  const signingInput = `${b64url(header)}.${b64url(claims)}`;
  const signature = createHmac('sha256', opts.secret ?? SECRET)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

function makeProvider(overrides: Partial<ConstructorParameters<typeof OidcAuthProvider>[0]> = {}) {
  return new OidcAuthProvider({
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
    key: SECRET,
    clock: () => NOW,
    ...overrides,
  });
}

/** Baseline valid claims relative to the injected clock. */
function validClaims(): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'user-1',
    iat: NOW - 60,
    exp: NOW + 3600,
  };
}

describe('OidcAuthProvider', () => {
  afterEach(() => {
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  it('accepts a valid HS256 token (real HMAC signature)', () => {
    const p = makeProvider();
    expect(p.verify(mintHs256(validClaims()))).toBe(true);
  });

  it('rejects a token from the wrong issuer', () => {
    const p = makeProvider();
    const token = mintHs256({ ...validClaims(), iss: 'https://evil.example.com' });
    expect(p.verify(token)).toBe(false);
  });

  it('rejects a token with the wrong audience', () => {
    const p = makeProvider();
    const token = mintHs256({ ...validClaims(), aud: 'some-other-service' });
    expect(p.verify(token)).toBe(false);
  });

  it('rejects a token signed with the wrong secret', () => {
    const p = makeProvider();
    const token = mintHs256(validClaims(), { secret: 'not-the-real-secret' });
    expect(p.verify(token)).toBe(false);
  });

  it('rejects a tampered payload (signature no longer matches)', () => {
    const p = makeProvider();
    const token = mintHs256(validClaims());
    const [header, , signature] = token.split('.') as [string, string, string];
    const tampered = `${header}.${b64url({ ...validClaims(), sub: 'admin' })}.${signature}`;
    expect(p.verify(tampered)).toBe(false);
  });

  it('rejects undefined, empty, and malformed credentials', () => {
    const p = makeProvider();
    expect(p.verify(undefined)).toBe(false);
    expect(p.verify('')).toBe(false);
    expect(p.verify('not-a-jwt')).toBe(false);
  });

  it('rejects an expired token (exp in the past, injected clock)', () => {
    const p = makeProvider();
    const token = mintHs256({ ...validClaims(), exp: NOW - 1 });
    expect(p.verify(token)).toBe(false);
  });

  it('honors the injected clock — same token flips to expired when time advances', () => {
    const token = mintHs256({ ...validClaims(), exp: NOW + 100 });
    expect(makeProvider({ clock: () => NOW }).verify(token)).toBe(true);
    expect(makeProvider({ clock: () => NOW + 101 }).verify(token)).toBe(false);
  });

  it('rejects an alg:none token (signature bypass attempt)', () => {
    const p = makeProvider();
    const header = b64url({ alg: 'none', typ: 'JWT' });
    const token = `${header}.${b64url(validClaims())}.`;
    expect(p.verify(token)).toBe(false);
  });

  it('DELIBERATELY ignores DECKENT_API_AUTH_DISABLED — terminal is never bypassed', () => {
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    const p = makeProvider();
    // Spec §1c.2: the global dev bypass must never open a remote shell.
    expect(p.verify(undefined)).toBe(false);
    expect(p.verify('')).toBe(false);
    expect(p.verify(mintHs256(validClaims(), { secret: 'wrong' }))).toBe(false);
    // A genuinely valid token still works regardless of the flag.
    expect(p.verify(mintHs256(validClaims()))).toBe(true);
  });

  it('throws on construction with empty issuer or key (fail-fast)', () => {
    expect(
      () => new OidcAuthProvider({ issuer: '', algorithm: 'HS256', key: SECRET }),
    ).toThrow(/issuer/);
    expect(
      () => new OidcAuthProvider({ issuer: ISSUER, algorithm: 'HS256', key: '' }),
    ).toThrow(/key material/);
  });

  it('works without an audience constraint when audience is omitted', () => {
    const p = new OidcAuthProvider({
      issuer: ISSUER,
      algorithm: 'HS256',
      key: SECRET,
      clock: () => NOW,
    });
    // No `aud` claim and no expected audience — issuer + signature decide.
    const token = mintHs256({ iss: ISSUER, sub: 'user-1', exp: NOW + 3600 });
    expect(p.verify(token)).toBe(true);
  });
});
