/**
 * Token bootstrap helpers for the non-terminal HTTP API.
 *
 * Wire (Sprint 191 Task 191-010):
 *   1. `resolveBootstrapApiToken(configToken)` returns the active token
 *      (explicit > env > null), mirroring `resolveAuthToken` from auth.ts.
 *   2. `injectApiTokenIntoHtml(html, token)` rewrites the served index.html
 *      to expose `window.__DECKENT_API_TOKEN__` for localhost callers only.
 *      The dashboard's `lib/api.ts` reads it and attaches it as
 *      `Authorization: Bearer ...` on every HTTP fetch.
 *   3. `extractTokenFromQuery(rawUrl)` reads the `?token=...` query parameter
 *      from a request URL — used by SSE endpoints (`EventSource` cannot send
 *      a custom Authorization header, so the bootstrap token is appended as
 *      a query param instead).
 *
 * Security invariants (preserved from auth.ts):
 *   - The bootstrap script is ONLY injected when the caller's remote address
 *     is loopback (127.0.0.1 / ::1). Non-localhost requests receive the
 *     unmodified HTML — the dashboard then has no token and the API returns
 *     401, which is the correct secure-by-default behaviour.
 *   - The query-token fallback applies ONLY to the paths the server opts in
 *     via `queryTokenPaths` — by default that is just `/api/events`.
 *   - Header-based Bearer auth is still preferred; the query-param token is a
 *     pure fallback for transports that cannot set headers.
 */

import { resolveAuthToken } from '../auth.js';

const BOOTSTRAP_SCRIPT_OPEN = '<script>window.__DECKENT_API_TOKEN__ = ';
const BOOTSTRAP_SCRIPT_CLOSE = ';</script>';

/**
 * Resolve the active token for the bootstrap inject. Thin wrapper around
 * `resolveAuthToken` so the inject path and the auth-verify path always agree
 * on which token wins (explicit config > DECKENT_API_TOKEN env > null).
 */
export function resolveBootstrapApiToken(configToken?: string | null): string | null {
  return resolveAuthToken(configToken);
}

/**
 * Rewrite served HTML so the dashboard SPA can read the API token from
 * `window.__DECKENT_API_TOKEN__`. The script tag is inserted immediately
 * before `</head>`. If the HTML has no `</head>` (malformed), the original
 * string is returned unchanged — the caller decides how to handle that.
 */
export function injectApiTokenIntoHtml(html: string, token: string): string {
  if (!token) return html;
  if (!html.includes('</head>')) return html;
  const inject = BOOTSTRAP_SCRIPT_OPEN + JSON.stringify(token) + BOOTSTRAP_SCRIPT_CLOSE;
  return html.replace('</head>', inject + '</head>');
}

/**
 * Pull the `token` query parameter out of a request URL.
 *
 * Returns `null` when the URL has no query string, no `token` key, or an
 * empty value. The caller is expected to feed the result back through the
 * same constant-time comparator used for Bearer headers — this helper does
 * NOT perform any verification on its own.
 */
export function extractTokenFromQuery(rawUrl: string): string | null {
  const queryStart = rawUrl.indexOf('?');
  if (queryStart === -1) return null;
  const query = rawUrl.slice(queryStart + 1);
  if (!query) return null;
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    if (key !== 'token') continue;
    const value = decodeURIComponent(part.slice(eq + 1));
    return value.length > 0 ? value : null;
  }
  return null;
}

/**
 * `true` when a remote address belongs to the loopback set
 * (127.0.0.1 / IPv6 ::1 / IPv4-mapped IPv6 ::ffff:127.0.0.1). The bootstrap
 * inject MUST only fire for these — exposing the API token to a non-local
 * caller would defeat the whole auth mechanism.
 */
export function isLoopbackRemote(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}
