import type { Server, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { WebSocketServer, type WebSocket } from 'ws';
import type { PtySessionManager } from './session-manager.js';
import type { AuthProvider } from './auth-provider.js';
import type { AuditEvent, TenantId } from './types.js';
import {
  matchPromptPatterns,
  formatGuardDetail,
  type GuardMatch,
} from './prompt-guard.js';
import type { OutboundLimiter } from './outbound-limiter.js';

export interface GatewayDeps {
  manager: PtySessionManager;
  auth: AuthProvider;
  audit: { record(ev: AuditEvent): void };
  /**
   * Optional per-tenant outbound byte limiter (W4-10, invariant I5).
   * When omitted, the gateway operates without quota enforcement so
   * existing tests keep passing.
   */
  limiter?: OutboundLimiter;
}

const PREFIX = 'deckent.';
const PATH = '/api/terminal/ws';
const BACKPRESSURE_LIMIT_BYTES = 1_000_000;
const APP_CLOSE_UNAUTHORIZED = 4401;
const APP_CLOSE_OUTBOUND_QUOTA = 4429;

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

    // mTLS seam (sub-project #3): detect client cert on TLS socket.
    const tlsSocket = socket as TLSSocket;
    if (typeof tlsSocket.getPeerCertificate === 'function') {
      const peerCert = tlsSocket.getPeerCertificate();
      if (peerCert && peerCert.raw) {
        if (!deps.auth.verifyClientCert) {
          console.warn('mTLS configured but not implemented — sub-project #3');
        }
        // Future (sub-project #3): await deps.auth.verifyClientCert(peerCert.raw)
        // and use the returned TenantId for session scoping.
      }
    }

    const header = req.headers['sec-websocket-protocol'];
    const protos = (Array.isArray(header) ? header.join(',') : header ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const tokenProto = protos.find((p) => p.startsWith(PREFIX));
    const token = tokenProto ? tokenProto.slice(PREFIX.length) : undefined;

    wss.handleUpgrade(req, socket, head, (ws) => {
      // Async-capable auth seam (Sprint 268): prefer `verifyAsync` when the
      // provider defines it (e.g. JWKS network key resolution), else the sync
      // `verify`. SECURITY: no data flows to or from the PTY while the async
      // verification is pending — the socket is paused (frames buffered, never
      // processed pre-auth) and `bridge()` (the only WS↔session pipe) is
      // reached strictly after an accept. The sync-provider path runs without
      // suspension, so its timing and deny flow are identical to before
      // (audit `auth.deny` + close 4401).
      void (async () => {
        let authorized = false;
        if (deps.auth.verifyAsync) {
          ws.pause();
          try {
            authorized = await deps.auth.verifyAsync(token);
          } catch {
            // A rejecting provider is a deny, never a bypass (fail closed).
            authorized = false;
          }
          // Resume on both outcomes: the deny path needs the read side live to
          // complete the close handshake.
          ws.resume();
        } else {
          authorized = deps.auth.verify(token);
        }
        if (!authorized) {
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
      })();
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
  let killed = false;
  const tenantOf = (): TenantId => {
    if (sessionId) {
      const meta = deps.manager.get(sessionId);
      if (meta) return meta.tenantId;
    }
    return 'local';
  };
  const onData = (d: string): void => {
    if (killed) return;
    if (ws.bufferedAmount > BACKPRESSURE_LIMIT_BYTES) return;
    if (deps.limiter) {
      const bytes = Buffer.byteLength(d, 'utf8');
      const r = deps.limiter.track(tenantOf(), bytes);
      if (r.action === 'kill') {
        killed = true;
        deps.audit.record({
          action: 'outbound.kill',
          tenantId: tenantOf(),
          sessionId: sessionId ?? undefined,
          detail: `used:${r.bytesUsed}:remaining:${r.bytesRemaining}`,
          at: new Date().toISOString(),
        });
        try {
          ws.send(
            JSON.stringify({ t: 'outbound_kill', bytesUsed: r.bytesUsed }),
          );
        } catch {
          // ignore — close path below
        }
        if (sessionId) deps.manager.kill(sessionId);
        try {
          ws.close(APP_CLOSE_OUTBOUND_QUOTA, 'outbound quota exceeded');
        } catch {
          // ignore
        }
        return;
      }
      if (r.action === 'warn') {
        deps.audit.record({
          action: 'outbound.warn',
          tenantId: tenantOf(),
          sessionId: sessionId ?? undefined,
          detail: `used:${r.bytesUsed}:remaining:${r.bytesRemaining}`,
          at: new Date().toISOString(),
        });
        ws.send(
          JSON.stringify({
            t: 'outbound_warn',
            bytesUsed: r.bytesUsed,
            bytesRemaining: r.bytesRemaining,
          }),
        );
      }
    }
    ws.send(JSON.stringify({ t: 'output', data: d }));
  };

  ws.on('message', (raw) => {
    if (killed) return;
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
        tenantId: tenantOf(),
        sessionId,
        detail: '',
        at: new Date().toISOString(),
      });
    } else if (msg.t === 'input' && sessionId && typeof msg.data === 'string') {
      const matches: GuardMatch[] = matchPromptPatterns(msg.data);
      if (matches.length > 0) {
        // I2: audit content is signal-only (pattern_id:offset). Raw bytes
        // are NEVER passed to the audit sink.
        for (const m of matches) {
          deps.audit.record({
            action: 'guard.block',
            tenantId: 'local',
            sessionId,
            detail: formatGuardDetail(m, 'blocked'),
            at: new Date().toISOString(),
          });
        }
        // I1: client is always notified (no silent drop). Frame carries the
        // same structural signal — pattern id + offset only.
        ws.send(
          JSON.stringify({
            t: 'guard_block',
            patterns: matches.map((m) => ({ patternId: m.patternId, offset: m.offset })),
          }),
        );
        return;
      }
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
