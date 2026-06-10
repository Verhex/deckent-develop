import { createHash, timingSafeEqual } from 'node:crypto';
import { verifyJwt } from '../../core/auth-oidc.js';
import type { JwtAlgorithm, VerifyOptions } from '../../core/auth-oidc.js';
import { createJwksKeyResolver, verifyJwtWithJwks } from '../../core/auth-jwks.js';
import type { JwksFetch, JwksKeyResolver } from '../../core/auth-jwks.js';
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
   * Optional ASYNC credential verification (Sprint 268 — the "future async
   * seam" promised by the {@link OidcAuthProviderOptions} doc note). When
   * defined, consumers (ws-gateway, terminal HTTP routes) MUST prefer it over
   * the sync `verify` — it enables verification flows that require I/O, such
   * as JWKS key resolution ({@link JwksAuthProvider}). Additive and optional:
   * existing sync-only providers (LocalToken, Oidc) are unaffected.
   */
  verifyAsync?(presented: string | undefined): Promise<boolean>;

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

/** Options for {@link JwksAuthProvider}. */
export interface JwksAuthProviderOptions {
  /** Expected `iss` claim — tokens from any other issuer are rejected. */
  issuer: string;
  /** Expected `aud` claim. When set, tokens without a matching `aud` are rejected. */
  audience?: string;
  /** HTTPS URL of the IdP's JWKS document (the OIDC `jwks_uri`). */
  jwksUrl: string;
  /**
   * Injectable fetch for hermetic tests (no real network). Default: the Node
   * built-in `globalThis.fetch` via {@link createJwksKeyResolver} (ADR-010).
   */
  fetchImpl?: JwksFetch;
  /**
   * Injectable clock returning SECONDS since the Unix epoch (the JWT
   * `exp`/`nbf` unit). Defaults to the system clock. Inject for deterministic
   * expiry tests. (The JWKS cache TTL uses its own internal ms clock.)
   */
  clock?: () => number;
}

/**
 * JWKS-backed OIDC bearer provider for the embedded terminal (Sprint 268 —
 * opens the async seam documented in {@link OidcAuthProviderOptions}).
 *
 * Verification happens EXCLUSIVELY on {@link verifyAsync}: it delegates to
 * {@link verifyJwtWithJwks} (src/core/auth-jwks.ts — single source of truth:
 * RS256-pinned, `alg: none`/HS256 rejected, TTL-cached `kid` resolution with
 * one rotation re-fetch, fail-closed on any resolution failure). Nothing is
 * re-implemented here.
 *
 * The sync {@link verify} ALWAYS returns false: JWKS verification requires
 * network key resolution, which is impossible on a synchronous path — denying
 * is the only fail-closed answer. Consumers that support this provider MUST
 * route through `verifyAsync`.
 *
 * Security invariants (spec §1c.2, same as the other terminal providers):
 *  - DELIBERATELY ignores `DECKENT_API_AUTH_DISABLED` — the global dev bypass
 *    must never silently open a remote shell.
 *  - Returns booleans only; key material, tokens, and resolver failure details
 *    never surface in errors (verifyJwtWithJwks maps them to internal reason
 *    codes and never throws).
 */
export class JwksAuthProvider implements AuthProvider {
  private readonly issuer: string;
  private readonly audience: string | undefined;
  private readonly resolver: JwksKeyResolver;
  private readonly clock: (() => number) | undefined;

  constructor(opts: JwksAuthProviderOptions) {
    if (!opts.issuer) {
      throw new Error('JwksAuthProvider requires a non-empty issuer');
    }
    if (!opts.jwksUrl) {
      throw new Error('JwksAuthProvider requires a non-empty jwksUrl');
    }
    this.issuer = opts.issuer;
    this.audience = opts.audience;
    this.clock = opts.clock;
    this.resolver = createJwksKeyResolver({
      jwksUrl: opts.jwksUrl,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
  }

  /**
   * Sync verification is IMPOSSIBLE for JWKS: resolving the token's `kid` to
   * key material is async network I/O. Fail closed — always deny.
   */
  verify(_presented: string | undefined): boolean {
    return false;
  }

  async verifyAsync(presented: string | undefined): Promise<boolean> {
    if (!presented) return false;
    const result = await verifyJwtWithJwks(presented, {
      issuer: this.issuer,
      ...(this.audience !== undefined ? { audience: this.audience } : {}),
      ...(this.clock ? { now: this.clock() } : {}),
      resolver: this.resolver,
    });
    return result.valid === true;
  }
}
