/**
 * Token-aware fetch wrapper with 401 banner signaling.
 *
 * Extends the api.ts pattern (Sprint 191 / Sprint 216-007):
 * - reads window.__DECKENT_API_TOKEN__ injected by the server for localhost callers
 * - attaches Authorization: Bearer <token> to every request
 * - on 401 dispatches 'deckent:unauthorized' CustomEvent so the UI can show a banner
 */

import { ApiError } from './api.js';
export { ApiError };

/** Read the bootstrap API token injected into window.__DECKENT_API_TOKEN__ by the server. */
export function getBootstrapApiToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __DECKENT_API_TOKEN__?: string }).__DECKENT_API_TOKEN__;
}

/** Dispatch 'deckent:unauthorized' so a top-level component can show a 401 banner. */
function signal401(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('deckent:unauthorized'));
  }
}

/** GET with Authorization: Bearer token; dispatches 'deckent:unauthorized' on 401. */
export async function fetchJson<T>(url: string): Promise<T> {
  const token = getBootstrapApiToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 401) {
    signal401();
    throw new ApiError(401, `GET ${url} unauthorized`);
  }
  if (!res.ok) throw new ApiError(res.status, `GET ${url} failed: ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** POST with Authorization: Bearer token; dispatches 'deckent:unauthorized' on 401. */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const token = getBootstrapApiToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    signal401();
    throw new ApiError(401, `POST ${url} unauthorized`);
  }
  if (!res.ok) throw new ApiError(res.status, `POST ${url} failed: ${res.statusText}`);
  return res.json() as Promise<T>;
}
