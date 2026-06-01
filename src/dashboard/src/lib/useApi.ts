import { useCallback } from "react";

/**
 * Read the bootstrap API token injected by the server for localhost callers.
 * Returns undefined when window is unavailable or token not injected.
 */
function getApiToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __DECKENT_API_TOKEN__?: string }).__DECKENT_API_TOKEN__;
}

/**
 * Hook providing token-aware GET and POST fetch helpers.
 * Attaches `Authorization: Bearer <token>` when `window.__DECKENT_API_TOKEN__`
 * is present; falls back to no auth header (backward-compatible for dev/vite).
 */
export function useApi() {
  const get = useCallback(async <T>(url: string): Promise<T> => {
    const token = getApiToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.statusText}`);
    return res.json() as Promise<T>;
  }, []);

  const post = useCallback(async <T>(url: string, body?: unknown): Promise<T> => {
    const token = getApiToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${url} failed: ${res.statusText}`);
    return res.json() as Promise<T>;
  }, []);

  return { get, post };
}
