/**
 * Dashboard HTTP API client.
 *
 * Auth wire (Sprint 191 Task 191-010): the server injects
 * `window.__DECKENT_API_TOKEN__` into the served index.html for localhost
 * callers. We read it here and attach it as `Authorization: Bearer ...`
 * on every fetch — without this, non-terminal endpoints 401 whenever the
 * server has any API token configured.
 *
 * EventSource cannot send custom headers, so the SSE hook uses a `?token=`
 * query-parameter fallback (see `useSSE.ts`). The server-side middleware
 * applies the same constant-time compare to both transports.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Read the bootstrap API token injected by the server. Returns undefined in
 * dev mode (vite without the server inject) or on non-localhost callers.
 */
export function getBootstrapApiToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __DECKENT_API_TOKEN__?: string }).__DECKENT_API_TOKEN__;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getBootstrapApiToken();
  const base: Record<string, string> = {};
  if (token) base["Authorization"] = `Bearer ${token}`;
  if (extra) Object.assign(base, extra);
  return base;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${url} failed: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `POST ${url} failed: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Build an SSE URL with the bootstrap token attached as `?token=...` —
 * EventSource has no `headers` option, so the query-parameter fallback is
 * the only way to authenticate the stream. The server opts `/api/events`
 * into the query-token path explicitly.
 */
export function buildSseUrl(baseUrl: string): string {
  const token = getBootstrapApiToken();
  if (!token) return baseUrl;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}
