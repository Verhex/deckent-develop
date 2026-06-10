import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyJwt, type JwtAlgorithm, type VerifyOptions } from '../core/auth-oidc.js';
import { extractTokenFromQuery } from './middleware/token.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AuthConfig {
  /** Bearer token from config.api_auth_token */
  configToken?: string | null;
  /** Paths that bypass authentication (e.g. '/health', '/api/health') */
  exemptPaths?: string[];
  /**
   * Paths that may authenticate via `?token=...` query parameter when no
   * Authorization header is present. Intended for transports that cannot
   * send headers (e.g. `EventSource` / SSE). The query-token still goes
   * through the same constant-time SHA-256 compare as the Bearer header,
   * so the security properties are identical.
   */
  queryTokenPaths?: string[];
  /**
   * When true (or env var `DECKENT_API_LOCALHOST_AUTO=1` is set), requests
   * arriving from a loopback address (127.0.0.1 / ::1 / ::ffff:127.0.0.1)
   * with NO `Authorization` header are treated as authenticated. Lets the
   * local dashboard reach the API without setting `DECKENT_API_AUTH_DISABLED=1`
   * — the latter is a blanket bypass that also lets remote callers through.
   *
   * Prod-safe: remote callers still require a valid Bearer token. A localhost
   * request that *does* present an Authorization header is verified normally
   * (a bad token still gets 403), so this only fills the missing-header gap.
   */
  allowLocalhostAutoInject?: boolean;
  /**
   * OIDC JWT verification (config.api_oidc, Sprint 267). When set, a Bearer
   * value is checked against the static token FIRST (constant-time compare,
   * unchanged); on mismatch it is verified as a JWT via `verifyJwt`
   * (src/core/auth-oidc.ts — single source of truth). Key material is routed
   * exclusively to the slot matching the pinned `algorithm`, so the
   * HS256/RS256 algorithm-confusion attack cannot cross key material.
   *
   * Activation semantics: configuring `oidc` WITHOUT a static token ACTIVATES
   * auth — a valid Bearer JWT becomes mandatory for non-exempt requests
   * (missing header → 401, failed verification → 403). The "auth disabled"
   * default-deny message path applies only when NEITHER mechanism is
   * configured. Exempt-path / query-token / localhost-auto semantics are
   * unchanged.
   */
  oidc?: {
    /** Expected `iss` claim — tokens from any other issuer are rejected. */
    issuer: string;
    /** Expected `aud` claim. When set, tokens without a matching `aud` are rejected. */
    audience?: string;
    /** Pinned signature algorithm. Tokens signed with any other alg are rejected. */
    algorithm: JwtAlgorithm;
    /** Key material matching `algorithm`: HS256 shared secret or RS256 PEM public key. */
    key: string;
  };
}

// ─── Localhost Detection ────────────────────────────────────────────

const LOOPBACK_ADDRESSES = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

/**
 * Returns true when `req.socket.remoteAddress` is a loopback address.
 *
 * Covers IPv4 (127.0.0.1), IPv6 (::1), and the IPv6-mapped IPv4 form
 * (::ffff:127.0.0.1) that Node emits when a dual-stack server accepts
 * a v4 connection. Requests with no socket (synthetic test fakes) are
 * treated as non-localhost so existing unit tests keep their semantics.
 */
export function isLocalhostRequest(req: IncomingMessage): boolean {
  const addr = req.socket?.remoteAddress;
  if (!addr) return false;
  return LOOPBACK_ADDRESSES.has(addr);
}

// ─── Token Resolution ───────────────────────────────────────────────

/**
 * Resolve the active auth token from config or environment.
 * Priority: config.api_auth_token > DECKENT_API_TOKEN env var > null (disabled).
 */
export function resolveAuthToken(configToken?: string | null): string | null {
  if (configToken) return configToken;
  const envToken = process.env['DECKENT_API_TOKEN'];
  if (envToken) return envToken;
  return null;
}

// ─── Token Verification ─────────────────────────────────────────────

/**
 * Hash a token with SHA-256 so timingSafeEqual always compares equal-length buffers.
 * Prevents length-based timing side-channels.
 */
function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/**
 * Extract the raw Bearer value from the Authorization header, or null when
 * absent/malformed. Same parsing rules as {@link verifyBearerToken}'s
 * 'missing' classification.
 */
function extractBearerValue(req: IncomingMessage): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;
  const [scheme, value] = authHeader.split(' ', 2);
  if (scheme !== 'Bearer' || value === undefined || value === '') return null;
  return value;
}

/**
 * Extract and verify Bearer token from Authorization header.
 * Returns: 'ok' | 'missing' | 'invalid'
 */
export function verifyBearerToken(
  req: IncomingMessage,
  expectedToken: string,
): 'ok' | 'missing' | 'invalid' {
  const value = extractBearerValue(req);
  if (value === null) return 'missing';

  const expected = hashToken(expectedToken);
  const actual = hashToken(value);
  return timingSafeEqual(actual, expected) ? 'ok' : 'invalid';
}

// ─── Middleware ──────────────────────────────────────────────────────

/**
 * Bearer token authentication middleware for the HTTP API.
 *
 * - Default secure: if no token configured → 401 for all non-exempt requests.
 * - Explicit bypass: set DECKENT_API_AUTH_DISABLED=1 to disable auth (with stderr warning).
 * - Localhost auto-inject (opt-in): when `allowLocalhostAutoInject` is true (or
 *   `DECKENT_API_LOCALHOST_AUTO=1` env var is set), loopback callers without an
 *   Authorization header pass through. Remote callers still require a token.
 * - Exempt paths (e.g. /health) always pass through.
 * - Missing/malformed token → 401 Unauthorized
 * - Wrong token → 403 Forbidden
 */
export function bearerAuthMiddleware(config: AuthConfig) {
  const activeToken = resolveAuthToken(config.configToken);
  const exempt = new Set(config.exemptPaths ?? []);
  const queryTokenPaths = new Set(config.queryTokenPaths ?? []);
  // OIDC verify options built once — algorithm pinned, key material routed
  // only to the matching slot (same discipline as terminal OidcAuthProvider).
  const oidcVerifyOptions: VerifyOptions | null = config.oidc
    ? {
        issuer: config.oidc.issuer,
        ...(config.oidc.audience !== undefined ? { audience: config.oidc.audience } : {}),
        algorithms: [config.oidc.algorithm],
        ...(config.oidc.algorithm === 'HS256'
          ? { hs256Secret: config.oidc.key }
          : { rs256PublicKey: config.oidc.key }),
      }
    : null;
  const allowLocalhostAuto =
    config.allowLocalhostAutoInject === true ||
    process.env['DECKENT_API_LOCALHOST_AUTO'] === '1';

  // Check explicit auth bypass via env var
  const authDisabled = process.env['DECKENT_API_AUTH_DISABLED'] === '1';
  if (authDisabled) {
    process.stderr.write(
      '[deckent:security] WARNING: API authentication is DISABLED via DECKENT_API_AUTH_DISABLED=1. All requests will bypass auth. This is insecure — do NOT use in production.\n',
    );
  }

  return function authCheck(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    // Explicit bypass via env var (development only)
    if (authDisabled) return true;

    // Check exempt paths
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? url;
    if (exempt.has(path)) return true;

    // Localhost auto-inject (opt-in): loopback callers with no Authorization
    // header pass through. A localhost request that DOES present an
    // Authorization header falls through to the normal verify path — a wrong
    // token from localhost still earns a 403.
    if (
      allowLocalhostAuto &&
      isLocalhostRequest(req) &&
      !req.headers['authorization']
    ) {
      return true;
    }

    // No static token configured.
    if (!activeToken) {
      // OIDC-only mode: configuring `oidc` alone ACTIVATES auth — a valid
      // Bearer JWT is mandatory. Status shapes mirror the static-token path:
      // missing/malformed header → 401, failed verification → 403. Responses
      // stay generic — no claim/key material ever leaks into the body.
      if (oidcVerifyOptions) {
        const bearerValue = extractBearerValue(req);
        if (bearerValue === null) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'authentication required' }));
          return false;
        }
        if (verifyJwt(bearerValue, oidcVerifyOptions).valid === true) return true;
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return false;
      }
      // Neither static token nor OIDC → default deny (secure by default)
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'authentication required — configure DECKENT_API_TOKEN or set DECKENT_API_AUTH_DISABLED=1 to bypass' }));
      return false;
    }

    const headerResult = verifyBearerToken(req, activeToken);

    if (headerResult === 'ok') return true;

    // Query-token fallback for transports that cannot set headers (SSE).
    // Only the paths the server explicitly opted in (e.g. /api/events) are
    // eligible, and the same constant-time compare is reused.
    if (headerResult === 'missing' && queryTokenPaths.has(path)) {
      const queryToken = extractTokenFromQuery(url);
      if (queryToken !== null) {
        const expected = hashToken(activeToken);
        const actual = hashToken(queryToken);
        if (timingSafeEqual(actual, expected)) return true;
        // Wrong query token is a 403 — same shape as Bearer mismatch.
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return false;
      }
    }

    if (headerResult === 'missing') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'authentication required' }));
      return false;
    }

    // headerResult === 'invalid' — the static constant-time compare failed.
    // When OIDC is configured the Bearer value gets a second chance as a JWT
    // (static token FIRST, JWT second — the static path is bit-identical).
    if (oidcVerifyOptions) {
      const bearerValue = extractBearerValue(req);
      if (bearerValue !== null && verifyJwt(bearerValue, oidcVerifyOptions).valid === true) {
        return true;
      }
    }
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return false;
  };
}
