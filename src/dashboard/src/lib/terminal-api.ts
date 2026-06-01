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

/** Client-side multi-session registry — tracks open sessions in the SPA. */
export class SessionRegistry {
  private sessions: Map<string, SessionMeta> = new Map();

  add(meta: SessionMeta): void {
    this.sessions.set(meta.id, meta);
  }

  remove(id: string): void {
    this.sessions.delete(id);
  }

  list(): SessionMeta[] {
    return Array.from(this.sessions.values());
  }

  get(id: string): SessionMeta | undefined {
    return this.sessions.get(id);
  }
}

/** Per-session command history with up/down navigation (like shell readline). */
export class CommandHistory {
  private entries: string[] = [];
  private cursor = -1;

  push(cmd: string): void {
    if (cmd && cmd !== this.entries[0]) this.entries.unshift(cmd);
    this.cursor = -1;
  }

  navigate(direction: 'up' | 'down'): string | undefined {
    if (direction === 'up') {
      if (this.cursor < this.entries.length - 1) this.cursor++;
    } else {
      if (this.cursor > -1) this.cursor--;
    }
    return this.cursor === -1 ? undefined : this.entries[this.cursor];
  }

  getAll(): string[] {
    return [...this.entries];
  }

  reset(): void {
    this.cursor = -1;
  }
}

/** Per-session output buffer — accumulates PTY output chunks for scrollback replay. */
export class SessionBuffer {
  private buffers: Map<string, string[]> = new Map();

  append(sessionId: string, data: string): void {
    if (!this.buffers.has(sessionId)) this.buffers.set(sessionId, []);
    this.buffers.get(sessionId)!.push(data);
  }

  get(sessionId: string): string {
    return (this.buffers.get(sessionId) ?? []).join('');
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }
}
