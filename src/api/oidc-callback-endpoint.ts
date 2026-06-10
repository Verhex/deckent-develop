// oidc-callback-endpoint.ts — OIDC authorization-code token exchange (Sprint 277, ENT-5).
//
// POST /api/auth/oidc/exchange (EXEMPT — the login flow has no bearer yet):
//   body { code, code_verifier } →
//     1. IdP discovery: GET <issuer>/.well-known/openid-configuration
//        → { token_endpoint, jwks_uri }
//     2. token exchange: POST token_endpoint (authorization_code + PKCE verifier)
//        → { id_token }
//     3. verify id_token via the issuer's JWKS — DELEGATES to verifyJwtWithJwks
//        (auth-jwks.ts, the single source of truth: RS256-pinned, alg:none/HS256
//        rejected, fail-closed key resolution). Issuer + audience(=client_id) pinned.
//   valid → { token: id_token, claims } (the dashboard stores it in sessionStorage).
//
// Security invariants:
//   - config-gated default-off: a missing / disabled `dashboard_oidc` block → 404.
//   - the id_token audience MUST equal client_id and the issuer MUST equal the
//     configured issuer — both checked inside verifyJwtWithJwks (no trust shortcut).
//   - honest failures: stable machine-readable error CODES only. The
//     client_secret, the authorization code, and the id_token NEVER appear in a
//     response body and are NEVER logged.
//   - network I/O is injectable (fetchImpl) so tests stay hermetic (no real IdP).

import type { ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_CONFIG_PATH } from '../core/constants.js';
import { interpolateConfig } from '../core/deck-interpolation.js';
import { createJwksKeyResolver, verifyJwtWithJwks } from '../core/auth-jwks.js';
import type { OidcClaims } from '../core/auth-oidc.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Resolved (enabled + validated) dashboard OIDC config — the exchange inputs. */
export interface DashboardOidcResolved {
  issuer: string;
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
}

/**
 * Minimal structural fetch contract — satisfied by the built-in `fetch` and
 * trivially mockable in hermetic tests. Compatible with the JWKS `fetchImpl`
 * (which calls it with the URL only).
 */
export type OidcFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ExchangeDeps {
  /** Injectable fetch for hermetic tests. Default: built-in `globalThis.fetch`. */
  fetchImpl?: OidcFetch;
  /** Current time in SECONDS — forwarded to id_token exp validation (tests). */
  now?: number;
}

/** Stable machine-readable failure codes (the project's typed-error pattern). */
export type ExchangeErrorCode =
  | 'invalid_request'
  | 'fetch_unavailable'
  | 'discovery_failed'
  | 'token_exchange_failed'
  | 'id_token_missing'
  | 'id_token_invalid';

export type ExchangeResult =
  | { ok: true; token: string; claims: OidcClaims }
  | { ok: false; code: ExchangeErrorCode; reason?: string };

// ─── Config resolution ─────────────────────────────────────────────────────────

/**
 * Sync-read the project config's `dashboard_oidc` block (same pattern as the
 * server's `api_oidc` resolution). Returns the resolved config ONLY when the
 * block is `enabled: true` and structurally complete; otherwise null
 * (default-off / fail-closed). `client_secret` passes through deck-interpolation
 * so `$DECK:KEY` references resolve.
 */
export function resolveDashboardOidcConfig(projectRoot: string): DashboardOidcResolved | null {
  const cfgPath = join(projectRoot, PROJECT_CONFIG_PATH);
  if (!existsSync(cfgPath)) return null;

  let raw: { dashboard_oidc?: unknown };
  try {
    raw = JSON.parse(readFileSync(cfgPath, 'utf-8')) as { dashboard_oidc?: unknown };
  } catch {
    return null;
  }

  const block = interpolateConfig(raw.dashboard_oidc, projectRoot) as
    | {
        enabled?: unknown;
        issuer?: unknown;
        client_id?: unknown;
        client_secret?: unknown;
        redirect_uri?: unknown;
      }
    | undefined;

  if (
    block?.enabled === true &&
    typeof block.issuer === 'string' && block.issuer.length > 0 &&
    typeof block.client_id === 'string' && block.client_id.length > 0 &&
    typeof block.redirect_uri === 'string' && block.redirect_uri.length > 0
  ) {
    return {
      issuer: block.issuer,
      client_id: block.client_id,
      redirect_uri: block.redirect_uri,
      ...(typeof block.client_secret === 'string' && block.client_secret.length > 0
        ? { client_secret: block.client_secret }
        : {}),
    };
  }
  return null;
}

// ─── Discovery ──────────────────────────────────────────────────────────────────

/** Build the OIDC discovery URL, tolerating a trailing slash on the issuer. */
function wellKnownUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

interface DiscoveryDoc {
  tokenEndpoint: string;
  jwksUri: string;
}

/** Fetch + validate the IdP discovery document. null on any failure (fail-closed). */
async function discoverIdp(issuer: string, fetchImpl: OidcFetch): Promise<DiscoveryDoc | null> {
  let res: Awaited<ReturnType<OidcFetch>>;
  try {
    res = await fetchImpl(wellKnownUrl(issuer));
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object') return null;

  const obj = body as Record<string, unknown>;
  const tokenEndpoint = obj['token_endpoint'];
  const jwksUri = obj['jwks_uri'];
  if (typeof tokenEndpoint !== 'string' || tokenEndpoint.length === 0) return null;
  if (typeof jwksUri !== 'string' || jwksUri.length === 0) return null;
  return { tokenEndpoint, jwksUri };
}

// ─── Token exchange ─────────────────────────────────────────────────────────────

type TokenResult =
  | { ok: true; idToken: string }
  | { ok: false; code: 'token_exchange_failed' | 'id_token_missing' };

/**
 * POST the authorization_code grant (+ PKCE verifier) to the IdP token endpoint
 * and extract the `id_token`. Returns honest failure codes; never echoes or
 * logs the request body (it carries the code + client_secret).
 */
async function exchangeToken(
  tokenEndpoint: string,
  config: DashboardOidcResolved,
  code: string,
  verifier: string,
  fetchImpl: OidcFetch,
): Promise<TokenResult> {
  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('code_verifier', verifier);
  params.set('client_id', config.client_id);
  if (config.client_secret) params.set('client_secret', config.client_secret);
  params.set('redirect_uri', config.redirect_uri);

  let res: Awaited<ReturnType<OidcFetch>>;
  try {
    res = await fetchImpl(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });
  } catch {
    return { ok: false, code: 'token_exchange_failed' };
  }
  if (!res.ok) return { ok: false, code: 'token_exchange_failed' };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: 'token_exchange_failed' };
  }
  if (body === null || typeof body !== 'object') return { ok: false, code: 'token_exchange_failed' };

  const idToken = (body as Record<string, unknown>)['id_token'];
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return { ok: false, code: 'id_token_missing' };
  }
  return { ok: true, idToken };
}

// ─── Core exchange flow ──────────────────────────────────────────────────────────

/**
 * Full OIDC code→token exchange: discovery → token exchange → id_token JWKS
 * verification. Pure (no req/res, no config I/O) and fully injectable — the
 * route wiring and the tests both drive it.
 */
export async function exchangeAuthCode(
  input: { code?: unknown; code_verifier?: unknown },
  config: DashboardOidcResolved,
  deps: ExchangeDeps = {},
): Promise<ExchangeResult> {
  const code = typeof input.code === 'string' && input.code.length > 0 ? input.code : null;
  const verifier =
    typeof input.code_verifier === 'string' && input.code_verifier.length > 0
      ? input.code_verifier
      : null;
  if (code === null || verifier === null) return { ok: false, code: 'invalid_request' };

  const fetchImpl = deps.fetchImpl ?? defaultFetch();
  if (fetchImpl === undefined) return { ok: false, code: 'fetch_unavailable' };

  // 1. Discovery.
  const discovery = await discoverIdp(config.issuer, fetchImpl);
  if (discovery === null) return { ok: false, code: 'discovery_failed' };

  // 2. Token exchange.
  const token = await exchangeToken(
    discovery.tokenEndpoint,
    config,
    code,
    verifier,
    fetchImpl,
  );
  if (!token.ok) return { ok: false, code: token.code };

  // 3. Verify the id_token via the discovered JWKS (SSOT). Issuer + audience
  //    (= client_id, per OIDC) are pinned so a token minted for another client
  //    or issuer is rejected. RS256 is enforced inside verifyJwtWithJwks.
  const resolver = createJwksKeyResolver({ jwksUrl: discovery.jwksUri, fetchImpl });
  const verifyResult = await verifyJwtWithJwks(token.idToken, {
    resolver,
    issuer: config.issuer,
    audience: config.client_id,
    ...(deps.now !== undefined ? { now: deps.now } : {}),
  });
  if (verifyResult.valid !== true) {
    return {
      ok: false,
      code: 'id_token_invalid',
      ...(verifyResult.reason !== undefined ? { reason: verifyResult.reason } : {}),
    };
  }

  return { ok: true, token: token.idToken, claims: verifyResult.claims ?? {} };
}

/** Wrap the Node built-in `fetch` as an {@link OidcFetch}, or undefined if absent. */
function defaultFetch(): OidcFetch | undefined {
  if (typeof globalThis.fetch !== 'function') return undefined;
  return (url, init) => globalThis.fetch(url, init);
}

// ─── Route wiring ────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/** HTTP status per failure code — upstream IdP errors are 502, bad input 400, bad token 401. */
const STATUS_BY_CODE: Record<ExchangeErrorCode, number> = {
  invalid_request: 400,
  fetch_unavailable: 500,
  discovery_failed: 502,
  token_exchange_failed: 502,
  id_token_missing: 502,
  id_token_invalid: 401,
};

/**
 * Handle POST /api/auth/oidc/exchange. Returns true when the route matched (and
 * a response was sent), false to fall through. This path is auth-EXEMPT (the
 * caller registers it in exemptPaths — the login flow has no bearer yet); when
 * `dashboard_oidc` is disabled the handler itself responds 404 (disabled).
 *
 * @param body the already-parsed JSON request body (server.ts parses POST bodies).
 */
export async function registerOidcCallbackRoute(
  url: string,
  method: string,
  res: ServerResponse,
  body: unknown,
  projectRoot: string,
  deps: ExchangeDeps = {},
): Promise<boolean> {
  const parsed = new URL(url, 'http://localhost');
  if (parsed.pathname !== '/api/auth/oidc/exchange') return false;
  if (method !== 'POST') return false;

  const config = resolveDashboardOidcConfig(projectRoot);
  if (config === null) {
    // Fail-closed: SSO not configured / disabled. 404 keeps the surface honest
    // without revealing whether the block exists at all.
    sendJson(res, { error: 'oidc_disabled' }, 404);
    return true;
  }

  const fields = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const result = await exchangeAuthCode(
    { code: fields['code'], code_verifier: fields['code_verifier'] },
    config,
    deps,
  );

  if (result.ok) {
    sendJson(res, { token: result.token, claims: result.claims });
    return true;
  }

  sendJson(
    res,
    { error: result.code, ...(result.reason !== undefined ? { reason: result.reason } : {}) },
    STATUS_BY_CODE[result.code],
  );
  return true;
}
