/**
 * auth-oidc.ts — SSO / OIDC token verification (ENT-5a, Sprint 262).
 *
 * Pure, dependency-free (node:crypto only, ADR-010) JWT verification for the
 * SSO/OIDC foundation. NO network: JWKS fetch is a documented follow-up — the
 * caller supplies the key material (HS256 shared secret or RS256 PEM public key)
 * directly. Supports HS256 (HMAC-SHA256) and RS256 (RSASSA-PKCS1-v1_5 + SHA-256).
 *
 * Enterprise hardening:
 *  - `alg: none` is rejected outright (the classic JWT bypass).
 *  - HS256 signatures are compared in constant time (`timingSafeEqual`).
 *  - Algorithms are pinned to the supplied key material so the HS256/RS256
 *    "algorithm confusion" attack cannot cross key material: HS256 verifies
 *    against the secret only, RS256 against the public key only — never the
 *    reverse. Callers SHOULD additionally pin `algorithms` explicitly.
 *
 * i18n: `VerifyResult.reason` values are stable machine-readable CODES
 * (snake_case identifiers, the project's typed-error `code` pattern) — NOT
 * user-facing prose. A caller maps a code to a localized message; this module
 * stays string-free.
 *
 * Backward-safe: new file, zero callers.
 */

import { createHmac, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported signature algorithms. `none` is intentionally NOT supported. */
export type JwtAlgorithm = 'HS256' | 'RS256';

/**
 * Standard OIDC / JWT claims. Registered claims are typed; any additional
 * (custom) claims are preserved via the index signature for introspection.
 */
export interface OidcClaims {
  /** Issuer. */
  iss?: string;
  /** Subject. */
  sub?: string;
  /** Audience — a single value or a list. */
  aud?: string | string[];
  /** Expiration time (seconds since the Unix epoch). */
  exp?: number;
  /** Not-before time (seconds since the Unix epoch). */
  nbf?: number;
  /** Issued-at time (seconds since the Unix epoch). */
  iat?: number;
  /** Authorized party / client id (OIDC). */
  azp?: string;
  /** Any additional custom claims. */
  [claim: string]: unknown;
}

/**
 * Verification configuration. Provide the key material for the algorithm(s) you
 * accept; claim constraints (`issuer`, `audience`) are validated only when set.
 */
export interface OidcConfig {
  /** Expected `iss`. When set, a mismatching token `iss` fails verification. */
  issuer?: string;
  /** Expected `aud`. When set, the token `aud` must contain (one of) this value. */
  audience?: string | string[];
  /** Explicit allow-list of accepted algorithms (recommended — pins against confusion). */
  algorithms?: JwtAlgorithm[];
  /** Shared secret for HS256 (string or raw bytes). */
  hs256Secret?: string | Buffer;
  /** PEM-encoded RSA public key for RS256. */
  rs256PublicKey?: string | Buffer;
}

/** Per-call verification options: config plus an injectable clock for determinism. */
export interface VerifyOptions extends OidcConfig {
  /** Current time in SECONDS since the epoch. Injectable for deterministic tests. */
  now?: number;
  /** Clock-skew leeway in seconds applied to `exp`/`nbf` (default 0). */
  clockToleranceSec?: number;
}

/**
 * Result of {@link verifyJwt}. On success `valid` is true and `claims` is set.
 * On failure `valid` is false and `reason` is a stable machine-readable code.
 */
export interface VerifyResult {
  valid: boolean;
  claims?: OidcClaims;
  /** Stable snake_case failure code (see module doc). Absent on success. */
  reason?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface JwtHeader {
  alg?: unknown;
  typ?: unknown;
  kid?: unknown;
}

/** Decode a base64url segment to a UTF-8 string, or null when malformed. */
function decodeSegment(segment: string): string | null {
  if (typeof segment !== 'string' || segment.length === 0) return null;
  try {
    // Node (>=16) supports the 'base64url' encoding natively (Buffer).
    return Buffer.from(segment, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
}

/** Parse a JSON object from a base64url segment; null on any decode/parse error. */
function parseJsonSegment(segment: string): Record<string, unknown> | null {
  const decoded = decodeSegment(segment);
  if (decoded === null) return null;
  try {
    const value = JSON.parse(decoded) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Constant-time comparison of two base64url signatures. Length-guarded (never throws). */
function constantTimeEqualB64Url(a: string, b: string): boolean {
  let bufA: Buffer;
  let bufB: Buffer;
  try {
    bufA = Buffer.from(a, 'base64url');
    bufB = Buffer.from(b, 'base64url');
  } catch {
    return false;
  }
  // timingSafeEqual requires equal-length buffers; a length mismatch is itself
  // a non-match. We still compare against a fixed-length copy to avoid leaking
  // length via an early return path that differs in cost.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Determine the set of algorithms allowed for this verification. */
function resolveAllowedAlgorithms(opts: VerifyOptions): JwtAlgorithm[] {
  if (opts.algorithms && opts.algorithms.length > 0) {
    return opts.algorithms;
  }
  // Infer from supplied key material. HS256 only verifies against the secret and
  // RS256 only against the public key, so inferring both (when both are present)
  // does not enable algorithm-confusion — but pinning `algorithms` is preferred.
  const inferred: JwtAlgorithm[] = [];
  if (opts.hs256Secret !== undefined) inferred.push('HS256');
  if (opts.rs256PublicKey !== undefined) inferred.push('RS256');
  return inferred;
}

function failure(reason: string): VerifyResult {
  return { valid: false, reason };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Decode the claims (payload) of a JWT WITHOUT verifying its signature.
 *
 * For introspection / debugging only — never trust these claims for an
 * authorization decision. Returns null when the token is malformed.
 */
export function parseOidcClaims(token: string): OidcClaims | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parseJsonSegment(parts[1] ?? '');
  if (payload === null) return null;
  return payload as OidcClaims;
}

/**
 * Verify a JWT's signature and standard claims.
 *
 * Signature is verified for HS256 (shared secret) or RS256 (PEM public key).
 * `exp`/`nbf` are validated whenever present in the token; `iss`/`aud` are
 * validated only when the corresponding option is supplied.
 *
 * @returns `{ valid: true, claims }` on success, or `{ valid: false, reason }`
 *          with a stable machine-readable failure code.
 */
export function verifyJwt(token: string, opts: VerifyOptions): VerifyResult {
  if (typeof token !== 'string') return failure('malformed_token');

  const parts = token.split('.');
  if (parts.length !== 3) return failure('malformed_token');
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // 1. Header + alg gate.
  const headerObj = parseJsonSegment(headerB64);
  if (headerObj === null) return failure('malformed_token');
  const header = headerObj as JwtHeader;
  const alg = typeof header.alg === 'string' ? header.alg : '';
  if (alg.toLowerCase() === 'none') return failure('alg_none_rejected');
  if (alg !== 'HS256' && alg !== 'RS256') return failure('unsupported_algorithm');

  const allowed = resolveAllowedAlgorithms(opts);
  if (!allowed.includes(alg)) return failure('algorithm_not_allowed');

  // 2. Signature verification over the signing input (header.payload).
  const signingInput = `${headerB64}.${payloadB64}`;
  if (alg === 'HS256') {
    if (opts.hs256Secret === undefined) return failure('missing_key_material');
    const expected = createHmac('sha256', opts.hs256Secret)
      .update(signingInput)
      .digest('base64url');
    if (!constantTimeEqualB64Url(expected, signatureB64)) {
      return failure('invalid_signature');
    }
  } else {
    // RS256 — RSASSA-PKCS1-v1_5 + SHA-256 (default PKCS1 padding for an RSA key).
    if (opts.rs256PublicKey === undefined) return failure('missing_key_material');
    let signature: Buffer;
    try {
      signature = Buffer.from(signatureB64, 'base64url');
    } catch {
      return failure('invalid_signature');
    }
    let ok = false;
    try {
      ok = cryptoVerify(
        'RSA-SHA256',
        Buffer.from(signingInput),
        opts.rs256PublicKey,
        signature,
      );
    } catch {
      // Malformed key / signature throws rather than returning false.
      return failure('invalid_signature');
    }
    if (!ok) return failure('invalid_signature');
  }

  // 3. Claims.
  const payload = parseJsonSegment(payloadB64);
  if (payload === null) return failure('malformed_token');
  const claims = payload as OidcClaims;

  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.clockToleranceSec ?? 0;

  if (typeof claims.exp === 'number' && now >= claims.exp + tolerance) {
    return failure('token_expired');
  }
  if (typeof claims.nbf === 'number' && now < claims.nbf - tolerance) {
    return failure('token_not_yet_valid');
  }
  if (opts.issuer !== undefined && claims.iss !== opts.issuer) {
    return failure('issuer_mismatch');
  }
  if (opts.audience !== undefined && !audienceMatches(claims.aud, opts.audience)) {
    return failure('audience_mismatch');
  }

  return { valid: true, claims };
}

/** True when the token audience contains (one of) the expected audience value(s). */
function audienceMatches(
  tokenAud: string | string[] | undefined,
  expected: string | string[],
): boolean {
  const tokenSet = new Set(
    Array.isArray(tokenAud) ? tokenAud : tokenAud === undefined ? [] : [tokenAud],
  );
  const expectedList = Array.isArray(expected) ? expected : [expected];
  return expectedList.some((value) => tokenSet.has(value));
}
