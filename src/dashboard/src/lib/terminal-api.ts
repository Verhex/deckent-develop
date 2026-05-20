/**
 * Terminal HTTP control + bootstrap token helpers.
 *
 * Token wire (spec §1c.2): the server injects `window.__DECKENT_TERMINAL_TOKEN__`
 * into the served index.html for localhost callers only. The SPA reads it and
 * passes it both:
 *   - on the WebSocket `Sec-WebSocket-Protocol` subprotocol (see useTerminalSocket)
 *   - on HTTP fetches via `Authorization: Bearer ${token}` (the server-side check
 *     at `src/api/server.ts` terminal-routes block extracts via the same header).
 *
 * Without the Bearer header the terminal HTTP endpoint 401s every request — this
 * holds regardless of `DECKENT_API_AUTH_DISABLED`, by deliberate design (bypass-
 * independence: a dev convenience must never silently open a remote shell).
 */

export interface SessionMeta {
  id: string;
  kind: string;
  status: string;
}

export function getBootstrapToken(): string | undefined {
  return (window as unknown as { __DECKENT_TERMINAL_TOKEN__?: string }).__DECKENT_TERMINAL_TOKEN__;
}

/** Build a header map with the bootstrap token attached as Bearer when present. */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getBootstrapToken();
  const base: Record<string, string> = {};
  if (token) base['Authorization'] = `Bearer ${token}`;
  if (extra) Object.assign(base, extra);
  return base;
}

export async function createSession(input: {
  kind: string;
  tool?: string;
  args?: string[];
}): Promise<SessionMeta> {
  const res = await fetch('/api/terminal/sessions', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json() as Promise<SessionMeta>;
}

export async function listSessions(): Promise<SessionMeta[]> {
  const res = await fetch('/api/terminal/sessions', { headers: authHeaders() });
  return res.ok ? (res.json() as Promise<SessionMeta[]>) : [];
}

export async function killSession(id: string): Promise<void> {
  await fetch(`/api/terminal/sessions/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}
