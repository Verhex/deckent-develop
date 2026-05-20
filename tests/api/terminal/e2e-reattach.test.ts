import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalGateway } from '../../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import { LocalPtyBackend } from '../../../src/api/terminal/session-backend.js';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';

/**
 * Sprint 175 Task W4.1 — E2E reattach integration.
 *
 * Real `node-pty` (LocalPtyBackend) + real `ws` + real gateway + real manager.
 * Validates the full pipeline contract (spec §1c, plan §Task 4.1):
 *   1. ws1 attaches → sends input → disconnects.
 *   2. While the client is absent, two markers are written directly to the
 *      manager (mgr.write) — they reach the PTY and the resulting echoes
 *      land in the bounded ring buffer.
 *   3. ws2 reconnects with the same subprotocol token and re-attaches.
 *   4. The replay frame (sent BEFORE the live listener is wired in the
 *      bridge) contains BOTH markers — reattach is resilient to a client
 *      disconnect (server-restart persistence is explicitly out of scope).
 *
 * Invariants asserted along the way:
 *   - detach ≠ kill: `mgr.get(id)` still defined after ws1 closes.
 *   - subprotocol auth path remains the only attach surface (no Authorization
 *     header is used for WS upgrade).
 */

const TOKEN = 'e2e-token';
const TEST_TIMEOUT_MS = 15_000;

interface OutputFrame {
  t: 'output';
  data: string;
}

function isOutputFrame(v: unknown): v is OutputFrame {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { t?: unknown; data?: unknown };
  return o.t === 'output' && typeof o.data === 'string';
}

interface Harness {
  server: Server;
  mgr: PtySessionManager;
  port: number;
}

async function makeHarness(): Promise<Harness> {
  const backend = new LocalPtyBackend();
  const mgr = new PtySessionManager(backend, {
    scrollbackBytes: 65_536,
    idleTimeoutMs: 0,
  });
  const auth = new LocalTokenAuthProvider(TOKEN);
  const audit = {
    record: (): void => {
      /* sink — audit content is covered by audit.test.ts */
    },
  };
  const server = createServer();
  attachTerminalGateway(server, { manager: mgr, auth, audit });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('server address unavailable');
  }
  return { server, mgr, port: addr.port };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function openWs(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, [`deckent.${token}`]);
    ws.once('open', () => resolve(ws));
    ws.once('error', (err) => reject(err));
  });
}

function awaitClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => ws.once('close', () => resolve()));
}

function safeClose(ws: WebSocket | undefined): void {
  if (!ws) return;
  try {
    ws.close();
  } catch {
    /* already closing */
  }
}

/** Accumulates `output` frame `data` until the predicate matches or the timeout elapses. */
function collectUntil(
  ws: WebSocket,
  predicate: (accumulated: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onMsg = (raw: unknown): void => {
      const text = (raw as Buffer | string).toString();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (!isOutputFrame(parsed)) return;
      buf += parsed.data;
      if (predicate(buf)) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(buf);
      }
    };
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`collectUntil timed out (${timeoutMs}ms). buffered=${JSON.stringify(buf)}`));
    }, timeoutMs);
    ws.on('message', onMsg);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('terminal e2e — reattach with replay (real pty + real ws)', () => {
  it(
    'ws1 attach→input→disconnect → mgr.write MARKER_ONE+TWO while detached → ws2 reattach replays both',
    async () => {
      const { server, mgr, port } = await makeHarness();
      let ws1: WebSocket | undefined;
      let ws2: WebSocket | undefined;
      let sessionId: string | undefined;
      try {
        const meta = mgr.create({ kind: 'shell' });
        sessionId = meta.id;

        // ── Phase A: ws1 attach + input ─────────────────────────────────
        ws1 = await openWs(port, TOKEN);
        ws1.send(JSON.stringify({ t: 'attach', sessionId: meta.id }));
        // let the shell prompt + attach listener settle
        await sleep(200);
        ws1.send(JSON.stringify({ t: 'input', data: 'true\r' }));
        await sleep(100);

        // ── Phase B: client disconnect (detach ≠ kill) ──────────────────
        const ws1Closed = awaitClose(ws1);
        ws1.close();
        await ws1Closed;
        ws1 = undefined;
        // give the server a beat to process its own 'close' → manager.detach
        await sleep(50);

        // Invariant: session survives the client disconnect.
        expect(mgr.get(meta.id)).toBeDefined();

        // ── Phase C: write markers WHILE no client is attached ──────────
        mgr.write(meta.id, 'echo MARKER_ONE\r');
        await sleep(80);
        mgr.write(meta.id, 'echo MARKER_TWO\r');
        // wait for pty echoes to settle into the bounded ring buffer
        await sleep(500);

        // Server-side sanity gate before pulling the same data through the wire
        const ringSnapshot = mgr.replay(meta.id);
        expect(ringSnapshot).toContain('MARKER_ONE');
        expect(ringSnapshot).toContain('MARKER_TWO');

        // ── Phase D: ws2 reconnect + reattach + replay ──────────────────
        ws2 = await openWs(port, TOKEN);
        const replayedBoth = collectUntil(
          ws2,
          (acc) => acc.includes('MARKER_ONE') && acc.includes('MARKER_TWO'),
          3_000,
        );
        ws2.send(JSON.stringify({ t: 'attach', sessionId: meta.id }));
        const collected = await replayedBoth;

        expect(collected).toContain('MARKER_ONE');
        expect(collected).toContain('MARKER_TWO');
      } finally {
        safeClose(ws1);
        safeClose(ws2);
        if (sessionId !== undefined) {
          try {
            mgr.kill(sessionId);
          } catch {
            /* already gone */
          }
        }
        await closeServer(server);
      }
    },
    TEST_TIMEOUT_MS,
  );
});
