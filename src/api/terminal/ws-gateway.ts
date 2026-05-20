import type { Server, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PtySessionManager } from './session-manager.js';
import type { AuthProvider } from './auth-provider.js';
import type { AuditEvent } from './types.js';

export interface GatewayDeps {
  manager: PtySessionManager;
  auth: AuthProvider;
  audit: { record(ev: AuditEvent): void };
}

const PREFIX = 'deckent.';
const PATH = '/api/terminal/ws';
const BACKPRESSURE_LIMIT_BYTES = 1_000_000;
const APP_CLOSE_UNAUTHORIZED = 4401;

/**
 * Attaches the terminal WS gateway. Token is read from `Sec-WebSocket-Protocol`
 * (browsers cannot set Authorization on WebSocket — spec §1c.2). Auth is verified
 * BEFORE any session bridge, independent of DECKENT_API_AUTH_DISABLED.
 */
export function attachTerminalGateway(server: Server, deps: GatewayDeps): void {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (set: Set<string>): string | false => {
      for (const p of set) if (p.startsWith(PREFIX)) return p;
      return false;
    },
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url ?? '';
    if (!url.startsWith(PATH)) return;

    const header = req.headers['sec-websocket-protocol'];
    const protos = (Array.isArray(header) ? header.join(',') : header ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const tokenProto = protos.find((p) => p.startsWith(PREFIX));
    const token = tokenProto ? tokenProto.slice(PREFIX.length) : undefined;

    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!deps.auth.verify(token)) {
        deps.audit.record({
          action: 'auth.deny',
          tenantId: 'local',
          detail: 'ws upgrade rejected',
          at: new Date().toISOString(),
        });
        ws.close(APP_CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
      deps.audit.record({
        action: 'auth.ok',
        tenantId: 'local',
        detail: 'ws upgrade accepted',
        at: new Date().toISOString(),
      });
      bridge(ws, deps);
    });
  });
}

interface ClientMessage {
  t: string;
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

function bridge(ws: WebSocket, deps: GatewayDeps): void {
  let sessionId: string | null = null;
  const onData = (d: string): void => {
    if (ws.bufferedAmount > BACKPRESSURE_LIMIT_BYTES) return;
    ws.send(JSON.stringify({ t: 'output', data: d }));
  };

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (msg.t === 'attach' && typeof msg.sessionId === 'string') {
      if (sessionId) deps.manager.detach(sessionId, onData);
      sessionId = msg.sessionId;
      const replayBuf = deps.manager.replay(sessionId);
      if (replayBuf.length > 0) {
        ws.send(JSON.stringify({ t: 'output', data: replayBuf }));
      }
      deps.manager.attach(sessionId, onData);
      deps.audit.record({
        action: 'session.attach',
        tenantId: 'local',
        sessionId,
        detail: '',
        at: new Date().toISOString(),
      });
    } else if (msg.t === 'input' && sessionId && typeof msg.data === 'string') {
      deps.manager.write(sessionId, msg.data);
    } else if (
      msg.t === 'resize' &&
      sessionId &&
      typeof msg.cols === 'number' &&
      typeof msg.rows === 'number'
    ) {
      deps.manager.resize(sessionId, msg.cols, msg.rows);
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      deps.manager.detach(sessionId, onData); // detach ≠ kill (tmux-like)
      deps.audit.record({
        action: 'session.detach',
        tenantId: 'local',
        sessionId,
        detail: '',
        at: new Date().toISOString(),
      });
    }
  });
}
