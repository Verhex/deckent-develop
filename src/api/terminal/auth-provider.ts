import { createHash, timingSafeEqual } from 'node:crypto';
import { verifyJwt } from '../../core/auth-oidc.js';
import type { JwtAlgorithm, VerifyOptions } from '../../core/auth-oidc.js';
import type { TenantId } from './types.js';

/**
 * Pluggable auth for the embedded terminal WebSocket gateway.
 *
 * V1 ships a single implementation (LocalTokenAuthProvider). Future enterprise
 * impls (OIDC, SSO, mTLS) plug in behind the same interface — see spec §1d.
 */
export interface AuthProvider {
  /** @returns true iff the presented credential is valid. */
  verify(presented: string | undefined): boolean;

  /**
   * Optional mTLS client-certificate verification hook (sub-project #3 seam).
   * If defined, the WS gateway will call this during TLS upgrade when the client
   * presents a certificate. Returns the TenantId for the cert, or null to deny.
   * Absence of this method signals that mTLS is not configured.
   */
  verifyClientCert?(cert: Buffer): Promise<TenantId | null>;
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

/**
 * Local single-token provider.
 *
 * Security invariant (spec §1c.2, aligns with Sprint-171 B-022 hardening):
 * this provider DELIBERATELY ignores `DECKENT_API_AUTH_DISABLED`. The global
 * read-only-dashboard dev bypass must never silently open a remote shell.
 * A terminal session ALWAYS requires the correct token — even when the rest
 * of the HTTP API has its bearer middleware disabled for local development.
 *
 * Comparison is constant-time via `timingSafeEqual` over fixed-length SHA-256
 * digests, which also avoids a timing/length oracle on the raw token bytes.
 */
export class LocalTokenAuthProvider implements AuthProvider {
  private readonly expected: Buffer;

  constructor(token: string) {
    if (!token) {
      throw new Error('LocalTokenAuthProvider requires a non-empty token');
    }
    this.expected = sha256(token);
  }

  verify(presented: string | undefined): boolean {
    if (!presented) return false;
    const actual = sha256(presented);
    return timingSafeEqual(actual, this.expected);
  }
}

/**
 * Options for {@link OidcAuthProvider}.
 *
 * The key material is STATIC: the {@link AuthProvider} `verify` contract is
 * synchronous, so no network key fetch (JWKS) can happen on the verify path.
 * The async JWKS-resolver flow is a documented follow-up behind a future
 * async seam — it is deliberately NOT wired here.
 */
export interface OidcAuthProviderOptions {
  /** Expected `iss` claim — tokens from any other issuer are rejected. */
  issuer: string;
  /** Expected `aud` claim. When set, tokens without a matching `aud` are rejected. */
  audience?: string;
  /** Pinned signature algorithm. Tokens signed with any other alg are rejected. */
  algorithm: JwtAlgorithm;
  /** Key material matching `algorithm`: HS256 shared secret or RS256 PEM public key. */
  key: string;
  /**
   * Injectable clock returning SECONDS since the Unix epoch (the JWT
   * `exp`/`nbf` unit, mapped 1:1 to `VerifyOptions.now`). Defaults to the
   * system clock. Inject for deterministic expiry tests.
   */
  clock?: () => number;
}

/**
 * OIDC / JWT bearer provider for the embedded terminal (spec §1d reserved slot).
 *
 * Security invariant (spec §1c.2, same as {@link LocalTokenAuthProvider}):
 * this provider DELIBERATELY ignores `DECKENT_API_AUTH_DISABLED`. The global
 * read-only-dashboard dev bypass must never silently open a remote shell — a
 * terminal session ALWAYS requires a verifiable token.
 *
 * Verification delegates to {@link verifyJwt} (src/core/auth-oidc.ts — single
 * source of truth): signature (HS256/RS256, `alg: none` rejected), `exp`/`nbf`,
 * `iss`, and optional `aud`. The algorithm is pinned and the key material is
 * routed exclusively to the slot matching that algorithm, so the HS256/RS256
 * "algorithm confusion" attack cannot cross key material.
 */
export class OidcAuthProvider implements AuthProvider {
  private readonly verifyOptions: VerifyOptions;
  private readonly clock: (() => number) | undefined;

  constructor(opts: OidcAuthProviderOptions) {
    if (!opts.issuer) {
      throw new Error('OidcAuthProvider requires a non-empty issuer');
    }
    if (!opts.key) {
      throw new Error('OidcAuthProvider requires non-empty key material');
    }
    this.clock = opts.clock;
    this.verifyOptions = {
      issuer: opts.issuer,
      ...(opts.audience !== undefined ? { audience: opts.audience } : {}),
      algorithms: [opts.algorithm],
      ...(opts.algorithm === 'HS256'
        ? { hs256Secret: opts.key }
        : { rs256PublicKey: opts.key }),
    };
  }

  verify(presented: string | undefined): boolean {
    if (!presented) return false;
    const result = verifyJwt(presented, {
      ...this.verifyOptions,
      ...(this.clock ? { now: this.clock() } : {}),
    });
    return result.valid === true;
  }
}
