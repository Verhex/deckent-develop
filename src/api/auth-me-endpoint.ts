// auth-me-endpoint.ts — GET /api/auth/me whoami (Sprint 277, ENT-5).
//
// Returns the identity of the authenticated caller derived from the bearer token.
// The auth-gate middleware has already verified the bearer — this endpoint only
// decodes the claims for display (no signature re-check, per parseOidcClaims contract).
//
// Response shapes:
//   OIDC JWT bearer → { authenticated: true, mode: 'oidc', sub, email?, name?, preferredUsername?, role? }
//   Static token     → { authenticated: true, mode: 'static' }
//
// Security invariants:
//   - The bearer token / secret NEVER appears in the response body.
//   - Role is taken from JWT claims only (never from an unauthenticated source).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseOidcClaims } from '../core/auth-oidc.js';
import { isValidRole } from '../core/rbac.js';
import type { Role } from '../core/rbac.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuthMeResponse {
  authenticated: true;
  mode: 'oidc' | 'static';
  sub?: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  role?: Role;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the raw Bearer value from the Authorization header (null if absent/malformed). */
function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers['authorization'];
  if (!header) return null;
  const [scheme, value] = header.split(' ', 2);
  if (scheme !== 'Bearer' || value === undefined || value === '') return null;
  return value;
}

/** Derive a Role from raw JWT claim values. Returns undefined when no valid role found. */
function roleFromClaims(claims: Record<string, unknown>): Role | undefined {
  const candidates = [
    claims['role'],
    claims['roles'],
    claims['https://deckent.io/role'],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isValidRole(c)) return c;
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string' && isValidRole(item)) return item;
      }
    }
  }
  return undefined;
}

/** The authenticated caller's server-derived identity — the ONLY trusted source
 *  for actor + tenant. Endpoints must derive this from the verified bearer rather
 *  than trusting client-supplied identity fields (anti-spoofing / anti-IDOR). */
export interface RequestPrincipal {
  id: string;
  role?: Role;
  tenantId?: string;
  /**
   * Defense-in-depth trust signal (Sprint 289 — ultracode-audit MED finding).
   *
   * `true` ONLY when the claims were derived in a context that KNOWS the bearer
   * has passed the upstream auth-gate (the caller asserted it via
   * {@link DeriveRequestPrincipalOptions.authGateVerified}). When the flag is
   * `false` / absent, the `role` and `tenantId` on this principal come from an
   * UNVERIFIED JWT payload — `parseOidcClaims` decodes the token WITHOUT a
   * signature check, so a forged `{alg:'none'}` (or any unsigned) bearer yields
   * whatever role/tenant the attacker chose.
   *
   * A consumer making a cross-tenant or role-based authorization decision MUST
   * treat a missing/false flag as "claims NOT trusted" and fail closed.
   */
  claimsVerified?: boolean;
}

/** Options for {@link deriveRequestPrincipal}. */
export interface DeriveRequestPrincipalOptions {
  /**
   * Assert that the bearer on this request has ALREADY been verified by the
   * upstream auth-gate middleware. Set `true` ONLY from a handler the auth-gate
   * guards (one an unauthenticated request could never reach). When `true`, the
   * returned principal carries `claimsVerified: true`; otherwise the claims are
   * treated as unverified (`claimsVerified` is omitted) and downstream
   * authorization decisions should fail closed.
   */
  authGateVerified?: boolean;
}

/**
 * Derive the caller's identity (actor id + role + tenant) from the request bearer.
 *
 * ⚠️ SECURITY CONTRACT: the returned `role` / `tenantId` are decoded from the JWT
 * payload via {@link parseOidcClaims} WITHOUT verifying the signature. They are
 * safe to trust for an authorization decision ONLY when the bearer has already
 * been verified by the upstream auth-gate — a forged `{alg:'none'}` (or any
 * unsigned) token decodes to whatever role/tenant the attacker chose. Defense-in-
 * depth: pass `{ authGateVerified: true }` from a gate-guarded handler so the
 * principal is stamped `claimsVerified: true`; cross-tenant / role-based consumers
 * gate on that flag and fail closed when it is missing. Calling this WITHOUT the
 * option (the default) NEVER marks the claims as verified — by design.
 *
 * OIDC JWT → { id: sub, role?, tenantId? from claims }. Static / opaque bearer (no
 * JWT claims) → a generic principal with no tenant (single-tenant operator).
 */
export function deriveRequestPrincipal(
  req: IncomingMessage,
  opts: DeriveRequestPrincipalOptions = {},
): RequestPrincipal {
  // Only an explicit auth-gate assertion marks the claims as trusted; absent it
  // the flag is omitted entirely so the principal's runtime shape is unchanged.
  const verified = opts.authGateVerified === true ? { claimsVerified: true } : {};
  const bearer = extractBearer(req);
  const claims = bearer ? parseOidcClaims(bearer) : null;
  if (!claims) return { id: 'api-static', ...verified };
  const c = claims as Record<string, unknown>;
  const sub = c['sub'];
  const id = typeof sub === 'string' && sub ? sub : 'api-oidc';
  const role = roleFromClaims(c);
  const tenantClaim = c['tenant'] ?? c['tenantId'] ?? c['https://deckent.io/tenant'];
  const tenantId = typeof tenantClaim === 'string' && tenantClaim ? tenantClaim : undefined;
  return { id, ...(role ? { role } : {}), ...(tenantId ? { tenantId } : {}), ...verified };
}

// ─── Route handler ────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Handle GET /api/auth/me.
 * Returns true when the route matched and a response was sent, false to fall through.
 * Caller (server.ts) ensures auth-gate has already passed for this request.
 */
export function registerAuthMeRoute(
  url: string,
  method: string,
  res: ServerResponse,
  req: IncomingMessage,
): boolean {
  if (method !== 'GET') return false;

  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/auth/me') return false;

  const bearer = extractBearer(req);

  // No bearer reachable here normally (auth middleware blocks unauthenticated),
  // but handle gracefully — treat as static mode with no bearer.
  if (!bearer) {
    sendJson(res, { authenticated: true, mode: 'static' } satisfies AuthMeResponse);
    return true;
  }

  // Attempt to decode JWT claims (display only — auth middleware already verified).
  const claims = parseOidcClaims(bearer);
  if (claims === null) {
    // Non-JWT bearer (static token / opaque token) — no claims to expose.
    sendJson(res, { authenticated: true, mode: 'static' } satisfies AuthMeResponse);
    return true;
  }

  // OIDC JWT: extract well-known display claims.
  const response: AuthMeResponse = { authenticated: true, mode: 'oidc' };

  if (typeof claims.sub === 'string' && claims.sub) response.sub = claims.sub;

  const email = claims['email'];
  if (typeof email === 'string' && email) response.email = email;

  const name = claims['name'];
  if (typeof name === 'string' && name) response.name = name;

  const preferredUsername = claims['preferred_username'];
  if (typeof preferredUsername === 'string' && preferredUsername) {
    response.preferredUsername = preferredUsername;
  }

  const role = roleFromClaims(claims as Record<string, unknown>);
  if (role !== undefined) response.role = role;

  sendJson(res, response);
  return true;
}
