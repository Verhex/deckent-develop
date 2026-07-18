/**
 * 583/N3 «Makine Dairesi» — the terminal WS wire contract as a PURE module.
 *
 * The daemon's ws-gateway (src/api/terminal/ws-gateway.ts, ADR-G-029) speaks
 * newline-less JSON frames: `{t:'attach',sessionId}` (client→server, once per
 * connection), `{t:'input',data}` / `{t:'resize',cols,rows}` (client→server),
 * `{t:'output',data}` (server→client). The dashboard embeds this contract as
 * inline JSON literals (useTerminalSocket.ts); the Desktop shell instead
 * routes every frame through this codec so the contract is hermetically
 * pinned (tests/terminal-frames.test.ts) and cannot drift silently.
 *
 * Also here (pure, unit-pinned): the ws URL derivation (http→ws, https→wss —
 * mirrors buildLocalRendererCsp's twin rule) and the token subprotocol
 * (`deckent.<token>`, ADR-G-029 inv#2 — the ONLY place the token appears on
 * the wire; never a query string).
 */
import type { DaemonSession } from '../../shared/desktop-api.js';

/** `Sec-WebSocket-Protocol` prefix the gateway strips (ws-gateway.ts PREFIX). */
export const TERMINAL_WS_PROTOCOL_PREFIX = 'deckent.';

/** Wire path of the terminal gateway (ws-gateway.ts PATH). */
export const TERMINAL_WS_PATH = '/api/terminal/ws';

export function buildTerminalWsUrl(session: Pick<DaemonSession, 'url'>): string {
  const url = new URL(TERMINAL_WS_PATH, session.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** The subprotocol entry carrying the TERMINAL token (never the API token). */
export function terminalWsProtocol(terminalToken: string): string {
  return `${TERMINAL_WS_PROTOCOL_PREFIX}${terminalToken}`;
}

export function encodeAttach(sessionId: string): string {
  return JSON.stringify({ t: 'attach', sessionId });
}

export function encodeInput(data: string): string {
  return JSON.stringify({ t: 'input', data });
}

export function encodeResize(cols: number, rows: number): string {
  return JSON.stringify({ t: 'resize', cols, rows });
}

/**
 * Decode a server frame. Returns the output payload, or null for anything
 * that is not a well-formed output frame (unknown type, binary, malformed
 * JSON) — the caller ignores nulls, mirroring the dashboard's tolerant read.
 */
export function decodeOutputFrame(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const frame = JSON.parse(raw) as { t?: unknown; data?: unknown };
    if (frame.t === 'output' && typeof frame.data === 'string') return frame.data;
    return null;
  } catch {
    return null;
  }
}

/** Reconnect backoff (dashboard parity): 1s·attempt, capped at 5s. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(Math.max(attempt, 1), 5) * 1000;
}
