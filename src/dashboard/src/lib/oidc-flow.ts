/**
 * oidc-flow.ts — Dashboard OIDC Authorization-Code + PKCE flow primitives
 * (ENT-5 dashboard SSO, Sprint 277 Task 277-006).
 *
 * PURE, security-critical, **zero network calls** — this module only builds
 * URLs, derives PKCE values, parses callback query strings and validates the
 * CSRF `state`. The actual browser redirect (`window.location`) lives in the
 * dashboard wire (Task 277-008) and the `code` → token exchange happens
 * server-side (Task 277-007, `src/api/oidc-callback-endpoint.ts`). Nothing here
 * touches `fetch`.
 *
 * Browser-only globals (DOM lib): Web Crypto (`crypto.subtle` / `getRandomValues`),
 * `TextEncoder`, `btoa`, `URL`, `URLSearchParams`, `sessionStorage`. No imports →
 * zero runtime dependencies (ADR-010).
 *
 * i18n: failure signals are stable snake_case machine CODES (the project's
 * typed-error `code` pattern — mirrors `core/auth-oidc.ts`), NOT user-facing
 * prose. A caller maps a code to a localized message; this module stays
 * string-free.
 *
 * Security:
 *  - PKCE uses S256 only (`code_challenge_method=S256`) — `plain` is never emitted.
 *  - The verifier is 32 bytes of CSPRNG output (`getRandomValues`), base64url
 *    encoded → a 43-char RFC 7636 high-entropy verifier in the unreserved set.
 *  - `validateState` compares in constant time to deny a CSRF state timing oracle.
 *  - The verifier / state / nonce live in `sessionStorage` (cleared on tab close —
 *    a narrower XSS surface than `localStorage`) only long enough to survive the
 *    redirect round-trip; `clearFlowSession()` wipes them after the callback.
 *
 * Backward-safe: new file, zero callers until Task 277-008 wires it.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** A PKCE verifier/challenge pair (S256). */
export interface PkcePair {
  /** High-entropy secret kept client-side; sent at token-exchange time. */
  verifier: string;
  /** base64url(SHA-256(verifier)) — sent on the authorize request. */
  challenge: string;
}

/**
 * Configuration for {@link buildAuthorizeUrl}. The IdP's **resolved**
 * authorization endpoint is required — this pure module cannot perform OIDC
 * discovery (no network); the caller (Task 277-008) resolves it from config /
 * discovery and passes it in.
 */
export interface OidcAuthorizeConfig {
  /** The IdP authorization endpoint URL (e.g. `https://idp/authorize`). */
  authorizationEndpoint: string;
  /** OAuth client id. */
  clientId: string;
  /** Redirect URI registered with the IdP (the dashboard `/auth/callback`). */
  redirectUri: string;
  /** OIDC scope. Defaults to `openid profile email` when omitted. */
  scope?: string;
}

/** Per-request transient values for {@link buildAuthorizeUrl}. */
export interface AuthorizeParams {
  /** CSRF anti-forgery token (also persisted for callback validation). */
  state: string;
  /** Replay-protection nonce (echoed back in the id_token). */
  nonce: string;
  /** The PKCE code challenge from {@link generatePkce}. */
  challenge: string;
}

/**
 * Result of {@link parseCallbackParams}: either the authorization `code` plus
 * the returned `state`, or an `error` code (IdP-supplied, e.g. `access_denied`,
 * or our `invalid_callback` when `code`/`state` are missing).
 */
export type CallbackResult =
  | { code: string; state: string; error?: undefined }
  | { error: string; errorDescription?: string; code?: undefined };

/** The transient flow secrets persisted across the redirect round-trip. */
export interface OidcFlowSession {
  verifier: string;
  state: string;
  nonce: string;
}

/** Typed error with a stable machine-readable `code` (string-free, i18n-safe). */
export class OidcFlowError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'OidcFlowError';
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** sessionStorage keys — namespaced; cleared after the callback. */
const PKCE_VERIFIER_KEY = 'deckent.oidc.pkce_verifier';
const STATE_KEY = 'deckent.oidc.state';
const NONCE_KEY = 'deckent.oidc.nonce';

const DEFAULT_SCOPE = 'openid profile email';
/** Verifier entropy: 32 bytes → 43-char base64url (RFC 7636 §4.1: 43–128 chars). */
const VERIFIER_BYTES = 32;

/** The Web Crypto provider, or throw `crypto_unavailable` when absent. */
function resolveCrypto(provided?: Crypto): Crypto {
  const c = provided ?? (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new OidcFlowError('crypto_unavailable');
  }
  return c;
}

/** Encode raw bytes as URL-safe base64 without padding (RFC 4648 §5). */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Read a sessionStorage key, returning undefined when storage is unavailable. */
function safeRead(key: string): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  return sessionStorage.getItem(key) ?? undefined;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a fresh CSPRNG token, base64url-encoded. Used for the `state` and
 * `nonce` parameters. 32 bytes by default (~256 bits of entropy).
 *
 * @param byteLength Number of random bytes (default {@link VERIFIER_BYTES}).
 * @param cryptoImpl Injectable Web Crypto provider (defaults to `globalThis.crypto`).
 */
export function randomToken(byteLength: number = VERIFIER_BYTES, cryptoImpl?: Crypto): string {
  const c = resolveCrypto(cryptoImpl);
  const bytes = new Uint8Array(byteLength);
  c.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Generate a PKCE verifier/challenge pair using S256.
 *
 * The verifier is 32 bytes of CSPRNG output (base64url → 43 chars, all in the
 * RFC 7636 unreserved set). The challenge is `base64url(SHA-256(verifier))`.
 * Non-deterministic by design — tests assert FORMAT (and DETERMINISM only when
 * an injected mock crypto is supplied).
 *
 * @param cryptoImpl Injectable Web Crypto provider (defaults to `globalThis.crypto`).
 * @throws {OidcFlowError} `crypto_unavailable` when Web Crypto (or `subtle`) is missing.
 */
export async function generatePkce(cryptoImpl?: Crypto): Promise<PkcePair> {
  const c = resolveCrypto(cryptoImpl);
  if (!c.subtle || typeof c.subtle.digest !== 'function') {
    throw new OidcFlowError('crypto_unavailable');
  }
  const verifier = randomToken(VERIFIER_BYTES, c);
  const digest = await c.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = bytesToBase64Url(new Uint8Array(digest));
  return { verifier, challenge };
}

/**
 * Build the OIDC authorization-code + PKCE authorize URL.
 *
 * Emits `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`,
 * `nonce`, `code_challenge` and `code_challenge_method=S256`. Pre-existing query
 * parameters on the authorization endpoint are preserved.
 *
 * @throws {OidcFlowError} `invalid_authorization_endpoint` when the endpoint is
 *         not a valid absolute URL.
 */
export function buildAuthorizeUrl(cfg: OidcAuthorizeConfig, params: AuthorizeParams): string {
  let url: URL;
  try {
    url = new URL(cfg.authorizationEndpoint);
  } catch {
    throw new OidcFlowError('invalid_authorization_endpoint');
  }
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('scope', cfg.scope ?? DEFAULT_SCOPE);
  url.searchParams.set('state', params.state);
  url.searchParams.set('nonce', params.nonce);
  url.searchParams.set('code_challenge', params.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/**
 * Parse the OIDC redirect callback query string.
 *
 * Accepts a raw search string with or without a leading `?`. Returns the IdP
 * `error` (with optional `error_description`) when present, otherwise the
 * `code` + `state`. A response missing either `code` or `state` is reported as
 * `invalid_callback`.
 */
export function parseCallbackParams(search: string): CallbackResult {
  const query = new URLSearchParams(typeof search === 'string' ? search : '');

  const error = query.get('error');
  if (error) {
    const description = query.get('error_description');
    return description ? { error, errorDescription: description } : { error };
  }

  const code = query.get('code');
  const state = query.get('state');
  if (!code || !state) {
    return { error: 'invalid_callback' };
  }
  return { code, state };
}

/**
 * Validate the returned CSRF `state` against the value persisted before the
 * redirect. Compared in constant time (length + XOR fold) to deny a timing
 * oracle. Empty / non-string / length-mismatched inputs are a non-match.
 */
export function validateState(
  returned: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (typeof returned !== 'string' || typeof stored !== 'string') return false;
  if (returned.length === 0 || stored.length === 0) return false;
  if (returned.length !== stored.length) return false;
  let mismatch = 0;
  for (let i = 0; i < returned.length; i++) {
    mismatch |= returned.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── sessionStorage round-trip helpers ──────────────────────────────────────────

/**
 * Persist the transient flow secrets (verifier, state, nonce) so they survive
 * the IdP redirect. No-op when `sessionStorage` is unavailable (SSR / Node).
 */
export function persistFlowSession(session: OidcFlowSession): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PKCE_VERIFIER_KEY, session.verifier);
  sessionStorage.setItem(STATE_KEY, session.state);
  sessionStorage.setItem(NONCE_KEY, session.nonce);
}

/**
 * Load the flow secrets persisted by {@link persistFlowSession}. Missing fields
 * are `undefined` (e.g. on a fresh tab or after {@link clearFlowSession}).
 */
export function loadFlowSession(): Partial<OidcFlowSession> {
  return {
    verifier: safeRead(PKCE_VERIFIER_KEY),
    state: safeRead(STATE_KEY),
    nonce: safeRead(NONCE_KEY),
  };
}

/** Clear all persisted flow secrets. Call after the callback is handled. */
export function clearFlowSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(NONCE_KEY);
}
