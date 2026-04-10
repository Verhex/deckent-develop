import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// ─── Types ──────────────────────────────────────────────────────────

export interface AuthConfig {
  /** Bearer token from config.api_auth_token */
  configToken?: string | null;
  /** Paths that bypass authentication (e.g. '/health', '/api/health') */
  exemptPaths?: string[];
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
 * Extract and verify Bearer token from Authorization header.
 * Returns: 'ok' | 'missing' | 'invalid'
 */
export function verifyBearerToken(
  req: IncomingMessage,
  expectedToken: string,
): 'ok' | 'missing' | 'invalid' {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return 'missing';

  const [scheme, value] = authHeader.split(' ', 2);
  if (scheme !== 'Bearer' || value === undefined || value === '') return 'missing';

  const expected = hashToken(expectedToken);
  const actual = hashToken(value);
  return timingSafeEqual(actual, expected) ? 'ok' : 'invalid';
}

// ─── Middleware ──────────────────────────────────────────────────────

/**
 * Bearer token authentication middleware for the HTTP API.
 *
 * - If no token is configured (config + env both empty), auth is **disabled** (backward-compatible).
 * - Exempt paths (e.g. /health) always pass through.
 * - Missing/malformed token → 401 Unauthorized
 * - Wrong token → 403 Forbidden
 */
export function bearerAuthMiddleware(config: AuthConfig) {
  const activeToken = resolveAuthToken(config.configToken);
  const exempt = new Set(config.exemptPaths ?? []);

  return function authCheck(
    req: IncomingMessage,
    res: ServerResponse,
  ): boolean {
    // If no token configured, auth is disabled (backward-compat)
    if (!activeToken) return true;

    // Check exempt paths
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? url;
    if (exempt.has(path)) return true;

    const result = verifyBearerToken(req, activeToken);

    if (result === 'ok') return true;

    if (result === 'missing') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'authentication required' }));
      return false;
    }

    // result === 'invalid'
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return false;
  };
}
