/**
 * auth-jwks.ts — JWKS fetch + RS256 key resolution (ENT-5 follow-up, Sprint 265).
 *
 * Closes the "JWKS fetch is a documented follow-up" note in `auth-oidc.ts`:
 * fetches a JWKS document from an HTTPS endpoint, resolves a token's `kid` to a
 * PEM (spki) RSA public key, and verifies the token by DELEGATING to
 * {@link verifyJwt} — auth-oidc.ts stays the single source of truth for JWT
 * verification; nothing is re-implemented here.
 *
 * Enterprise hardening (consistent with auth-oidc.ts):
 *  - HTTPS-only JWKS URLs — key material is never fetched over plaintext.
 *  - Only `kty: "RSA"` keys whose `alg` is absent or `"RS256"` are eligible
 *    (algorithm-confusion guard, mirroring auth-oidc's key/alg pinning).
 *  - `verifyJwtWithJwks` pins `algorithms: ['RS256']` and rejects `alg: none`
 *    and HS256 tokens outright — a JWKS-resolved key is asymmetric by definition.
 *  - Key resolution failures FAIL CLOSED: an unresolvable key yields an invalid
 *    verification result, never a bypass.
 *
 * Network I/O is injectable (`fetchImpl`) so tests stay hermetic; the default
 * implementation is the Node built-in `globalThis.fetch` (ADR-010 — no new
 * runtime dependency; node:crypto + built-in fetch only).
 *
 * i18n: thrown {@link JwksError}s carry stable machine-readable `code`s and
 * {@link VerifyResult} failures use stable snake_case `reason` codes (the same
 * pattern as auth-oidc.ts) — NOT user-facing prose. New reason codes introduced
 * by this module: `missing_kid`, `jwks_key_resolution_failed`.
 *
 * Backward-safe: new file, zero callers.
 */

import { createPublicKey, type webcrypto } from 'node:crypto';
import { verifyJwt, type VerifyOptions, type VerifyResult } from './auth-oidc.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A single JSON Web Key as served by a JWKS endpoint. Extends the node:crypto
 * JWK shape (so it feeds `createPublicKey({ format: 'jwk' })` without casts);
 * arbitrary additional RFC 7517 members are preserved via the index signature.
 */
export interface Jwk extends webcrypto.JsonWebKey {
  /** Key id used to match a JWT header `kid`. */
  kid?: string;
  [member: string]: unknown;
}

/** A parsed JWKS document (RFC 7517 §5). */
export interface JwksDocument {
  keys: Jwk[];
}

/**
 * Minimal structural fetch contract — satisfied by the built-in `fetch` and
 * trivially mockable in hermetic tests.
 */
export type JwksFetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export type JwksErrorCode =
  | 'JWKS_URL_INVALID'
  | 'JWKS_URL_NOT_HTTPS'
  | 'JWKS_FETCH_UNAVAILABLE'
  | 'JWKS_FETCH_FAILED'
  | 'JWKS_INVALID_DOCUMENT'
  | 'JWKS_UNKNOWN_KID';

/** Thrown on JWKS fetch / key-resolution failure. Resolution is fail-closed. */
export class JwksError extends Error {
  readonly code: JwksErrorCode;
  constructor(code: JwksErrorCode, message: string) {
    super(message);
    this.name = 'JwksError';
    this.code = code;
  }
}

export interface JwksKeyResolverOptions {
  /** HTTPS URL of the JWKS document (e.g. the OIDC `jwks_uri`). */
  jwksUrl: string;
  /** Injectable fetch for hermetic tests. Default: built-in `globalThis.fetch`. */
  fetchImpl?: JwksFetch;
  /** JWKS cache TTL in milliseconds (default 300_000 = 5 minutes). */
  cacheTtlMs?: number;
  /** Millisecond clock, injectable for deterministic tests (default `Date.now`). */
  clock?: () => number;
}

export interface JwksKeyResolver {
  /**
   * Resolve a JWT header `kid` to a PEM (spki) RSA public key string — the
   * exact key shape {@link verifyJwt} expects in `rs256PublicKey`.
   * Throws {@link JwksError} (`JWKS_UNKNOWN_KID`) when no eligible key matches.
   */
  resolve(kid: string): Promise<string>;
}

/**
 * Options for {@link verifyJwtWithJwks}: the claim constraints of
 * {@link VerifyOptions} with key material replaced by a JWKS resolver.
 * The algorithm is pinned to RS256 internally and is not configurable.
 */
export interface JwksVerifyOptions
  extends Omit<VerifyOptions, 'hs256Secret' | 'rs256PublicKey' | 'algorithms'> {
  resolver: JwksKeyResolver;
}

// ─── JWKS fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch and validate a JWKS document.
 *
 * HTTPS-only: an `http:` (or any non-`https:`) URL is rejected — public key
 * material must not transit plaintext where a MITM could substitute keys.
 * Throws {@link JwksError} on invalid URL, missing fetch implementation,
 * non-2xx response, malformed JSON, or a body without a `keys` array.
 */
export async function fetchJwks(url: string, fetchImpl?: JwksFetch): Promise<JwksDocument> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new JwksError('JWKS_URL_INVALID', `JWKS URL is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new JwksError(
      'JWKS_URL_NOT_HTTPS',
      `JWKS URL must use https — key material is never fetched over plaintext: ${url}`,
    );
  }

  const impl = fetchImpl ?? (globalThis.fetch as JwksFetch | undefined);
  if (typeof impl !== 'function') {
    throw new JwksError(
      'JWKS_FETCH_UNAVAILABLE',
      'no fetch implementation: pass fetchImpl or run on Node >= 18 (built-in fetch)',
    );
  }

  const res = await impl(url);
  if (!res.ok) {
    throw new JwksError('JWKS_FETCH_FAILED', `JWKS endpoint responded HTTP ${res.status}: ${url}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new JwksError('JWKS_INVALID_DOCUMENT', `JWKS endpoint returned malformed JSON: ${url}`);
  }
  if (
    body === null ||
    typeof body !== 'object' ||
    !Array.isArray((body as { keys?: unknown }).keys)
  ) {
    throw new JwksError('JWKS_INVALID_DOCUMENT', `JWKS document has no "keys" array: ${url}`);
  }

  // Keep only object-shaped entries; member-level eligibility (kty/alg/kid) is
  // the resolver's concern, not the fetcher's.
  const keys = (body as { keys: unknown[] }).keys.filter(
    (k): k is Jwk => k !== null && typeof k === 'object' && !Array.isArray(k),
  );
  return { keys };
}

// ─── Key resolver ─────────────────────────────────────────────────────────────

/**
 * Create a TTL-cached `kid` → PEM resolver over a JWKS endpoint.
 *
 * Eligibility (algorithm-confusion guard, consistent with auth-oidc.ts):
 * a JWK is resolvable only when `kty === 'RSA'`, `alg` is absent or `'RS256'`,
 * and `kid` is a non-empty string. Eligible JWKs are converted to PEM (spki)
 * via `node:crypto` `createPublicKey({ format: 'jwk' })` — the key shape
 * {@link verifyJwt} consumes as `rs256PublicKey`.
 *
 * Key rotation: when a `kid` is missing from a cache that this call did NOT
 * just populate, the JWKS is re-fetched ONCE and the lookup retried; a `kid`
 * still missing after a fresh fetch throws `JWKS_UNKNOWN_KID`.
 */
export function createJwksKeyResolver(opts: JwksKeyResolverOptions): JwksKeyResolver {
  const ttlMs = opts.cacheTtlMs ?? 300_000;
  const clock = opts.clock ?? Date.now;

  let cache: { fetchedAt: number; byKid: Map<string, string> } | null = null;

  async function refresh(): Promise<Map<string, string>> {
    const doc = await fetchJwks(opts.jwksUrl, opts.fetchImpl);
    const byKid = new Map<string, string>();
    for (const jwk of doc.keys) {
      if (jwk.kty !== 'RSA') continue;
      if (jwk.alg !== undefined && jwk.alg !== 'RS256') continue;
      if (typeof jwk.kid !== 'string' || jwk.kid.length === 0) continue;
      try {
        // PEM export with format 'pem' is typed (and documented) to return a string.
        const pem = createPublicKey({ key: jwk, format: 'jwk' }).export({
          type: 'spki',
          format: 'pem',
        });
        byKid.set(jwk.kid, pem);
      } catch {
        // A single malformed JWK must not poison resolution of the valid keys.
        continue;
      }
    }
    cache = { fetchedAt: clock(), byKid };
    return byKid;
  }

  return {
    async resolve(kid: string): Promise<string> {
      let byKid: Map<string, string>;
      let fetchedThisCall = false;
      if (cache === null || clock() - cache.fetchedAt >= ttlMs) {
        byKid = await refresh();
        fetchedThisCall = true;
      } else {
        byKid = cache.byKid;
      }

      let pem = byKid.get(kid);
      if (pem !== undefined) return pem;

      if (!fetchedThisCall) {
        // Fresh cache without this kid — upstream key rotation. Re-fetch ONCE.
        pem = (await refresh()).get(kid);
        if (pem !== undefined) return pem;
      }
      throw new JwksError(
        'JWKS_UNKNOWN_KID',
        `no eligible RS256/RSA key with kid "${kid}" in JWKS document: ${opts.jwksUrl}`,
      );
    },
  };
}

// ─── JWKS-backed verification ─────────────────────────────────────────────────

function failure(reason: string): VerifyResult {
  return { valid: false, reason };
}

/** Parse the JWT header segment; null on any decode/parse error. */
function parseHeader(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const decoded = Buffer.from(parts[0] ?? '', 'base64url').toString('utf-8');
    const value = JSON.parse(decoded) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Verify a JWT against a JWKS endpoint: parse `kid` from the token header,
 * resolve it to an RSA public key, then DELEGATE to {@link verifyJwt} with
 * `algorithms` pinned to `['RS256']` (SSOT — no verification logic here).
 *
 * Pre-resolution gates (stable failure codes, never throws):
 *  - malformed token / header        → `malformed_token`
 *  - `alg: none` (case-insensitive)  → `alg_none_rejected`
 *  - any non-RS256 alg (HS256 incl.) → `algorithm_not_allowed`
 *  - absent / empty `kid`            → `missing_kid`
 *  - resolver failure (unknown kid, fetch error) → `jwks_key_resolution_failed`
 *    — fail closed: a key we cannot resolve is a token we cannot trust.
 */
export async function verifyJwtWithJwks(
  token: string,
  opts: JwksVerifyOptions,
): Promise<VerifyResult> {
  if (typeof token !== 'string') return failure('malformed_token');
  const header = parseHeader(token);
  if (header === null) return failure('malformed_token');

  const alg = typeof header['alg'] === 'string' ? header['alg'] : '';
  if (alg.toLowerCase() === 'none') return failure('alg_none_rejected');
  if (alg !== 'RS256') return failure('algorithm_not_allowed');

  const kid = header['kid'];
  if (typeof kid !== 'string' || kid.length === 0) return failure('missing_kid');

  const { resolver, ...claimOpts } = opts;
  let publicKeyPem: string;
  try {
    publicKeyPem = await resolver.resolve(kid);
  } catch {
    return failure('jwks_key_resolution_failed');
  }

  return verifyJwt(token, {
    ...claimOpts,
    algorithms: ['RS256'],
    rs256PublicKey: publicKeyPem,
  });
}
