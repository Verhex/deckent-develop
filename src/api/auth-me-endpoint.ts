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
}

/**
 * Derive the caller's identity (actor id + role + tenant) from the request bearer.
 * The auth-gate middleware has already verified the bearer, so this is trusted.
 * OIDC JWT → { id: sub, role?, tenantId? from claims }. Static / opaque bearer (no
 * JWT claims) → a generic principal with no tenant (single-tenant operator).
 */
export function deriveRequestPrincipal(req: IncomingMessage): RequestPrincipal {
  const bearer = extractBearer(req);
  const claims = bearer ? parseOidcClaims(bearer) : null;
  if (!claims) return { id: 'api-static' };
  const c = claims as Record<string, unknown>;
  const sub = c['sub'];
  const id = typeof sub === 'string' && sub ? sub : 'api-oidc';
  const role = roleFromClaims(c);
  const tenantClaim = c['tenant'] ?? c['tenantId'] ?? c['https://deckent.io/tenant'];
  const tenantId = typeof tenantClaim === 'string' && tenantClaim ? tenantClaim : undefined;
  return { id, ...(role ? { role } : {}), ...(tenantId ? { tenantId } : {}) };
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
