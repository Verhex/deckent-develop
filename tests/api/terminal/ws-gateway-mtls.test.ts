/**
 * mTLS fail-CLOSED enforcement at the WS gateway (A3 — anti fail-open).
 *
 * The pre-fix gateway detected a presented client certificate, warned
 * ("mTLS configured but not implemented"), then fell through to token auth —
 * so a wired verifyClientCert verifier was NEVER invoked (latent fail-open:
 * the day someone configures mTLS, certs would silently not be enforced). The
 * existing auth-provider-mtls.test.ts only checks the interface shape, never
 * that the gateway calls the verifier — classic test theater (audit R8).
 *
 * This drives attachTerminalGateway end-to-end. A client cert is injected onto
 * the server-side socket via the 'connection' event (fires before 'upgrade',
 * same socket object the gateway reads). It proves the gateway now:
 *   - calls verifyClientCert when a cert is presented + verifier wired,
 *   - rejects the upgrade (close 4401, no spawn) when the verifier denies (null),
 *   - accepts + bridges when the verifier returns a TenantId,
 *   - leaves the no-verifier path (mTLS not configured) on token auth alone.
 *
 * Hermetic: ephemeral loopback HTTP server, torn down per-test. Async only.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalGateway } from '../../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import type { SessionBackend, BackendHandle, SpawnSpec } from '../../../src/api/terminal/session-backend.js';
import type { AuthProvider } from '../../../src/api/terminal/auth-provider.js';
import type { TenantId } from '../../../src/api/terminal/types.js';

class FakeBackend implements SessionBackend {
  public spawned: SpawnSpec[] = [];
  spawn(spec: SpawnSpec, _onData: (d: string) => void, _onExit: (code: number) => void): BackendHandle {
    this.spawned.push(spec);
    return { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  }
}

interface Setup { server: Server; backend: FakeBackend; audit: { record: ReturnType<typeof vi.fn> }; port: number; }

/** Boot a gateway whose server-side sockets present a (fake) client cert. */
async function setup(auth: AuthProvider, certRaw: Buffer | null): Promise<Setup> {
  const backend = new FakeBackend();
  const mgr = new PtySessionManager(backend, { scrollbackBytes: 65536, idleTimeoutMs: 0 });
  const audit = { record: vi.fn() };
  const server = createServer();
  // Inject a peer-cert on every accepted socket BEFORE the upgrade handler reads it.
  if (certRaw) {
    server.on('connection', (socket) => {
      (socket as unknown as { getPeerCertificate: () => { raw: Buffer } }).getPeerCertificate = () => ({ raw: certRaw });
    });
  }
  attachTerminalGateway(server, { manager: mgr, auth, audit });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { server, backend, audit, port };
}

/** The gateway records `auth.ok` right before bridging and `auth.deny` on reject. */
function authActions(audit: { record: ReturnType<typeof vi.fn> }): string[] {
  return audit.record.mock.calls
    .map((c) => (c[0] as { action?: string }).action ?? '')
    .filter((a) => a === 'auth.ok' || a === 'auth.deny');
}

const ctx: { server?: Server } = {};
afterEach(async () => {
  if (ctx.server) { await new Promise<void>((r) => ctx.server!.close(() => r())); ctx.server = undefined; }
});

/** Connect, then resolve with the close code (or null if still open after settle). */
function connect(port: number): Promise<{ closedCode: number | null; ws: WebSocket }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/ws`, ['deckent.tok']);
    let settled = false;
    ws.on('close', (code) => { if (!settled) { settled = true; resolve({ closedCode: code, ws }); } });
    ws.on('error', () => { if (!settled) { settled = true; resolve({ closedCode: -1, ws }); } });
    // Accept path never closes — settle as "open" after a short delay.
    setTimeout(() => { if (!settled) { settled = true; resolve({ closedCode: null, ws }); } }, 200);
  });
}

describe('ws-gateway mTLS fail-closed (A3)', () => {
  // Verifier wired + cert presented + verifier DENIES (null) → reject, no spawn.
  it('denies upgrade when verifyClientCert returns null (presented cert rejected)', async () => {
    const auth: AuthProvider = { verify: () => true, verifyClientCert: async (): Promise<TenantId | null> => null };
    const s = await setup(auth, Buffer.from('bad-cert'));
    ctx.server = s.server;

    const { closedCode, ws } = await connect(s.port);
    ws.close();
    expect(closedCode).toBe(4401);
    // pre-fix: verifier never called → token auth alone records 'auth.ok' and bridges.
    expect(authActions(s.audit)).toContain('auth.deny');
    expect(authActions(s.audit)).not.toContain('auth.ok');
  });

  // Verifier wired + cert presented + verifier ACCEPTS (TenantId) → bridge + spawn.
  it('accepts + bridges when verifyClientCert returns a TenantId', async () => {
    const auth: AuthProvider = { verify: () => true, verifyClientCert: async (): Promise<TenantId | null> => 'tenant-mtls' };
    const s = await setup(auth, Buffer.from('good-cert'));
    ctx.server = s.server;

    const { closedCode, ws } = await connect(s.port);
    ws.close();
    expect(closedCode).toBeNull(); // not closed → accepted
    expect(authActions(s.audit)).toContain('auth.ok');
  });

  // No verifier wired (mTLS not configured) + cert presented → token auth stands alone (accept).
  it('ignores a presented cert when no verifier is wired (token auth stands)', async () => {
    const auth: AuthProvider = { verify: () => true };
    const s = await setup(auth, Buffer.from('some-cert'));
    ctx.server = s.server;

    const { closedCode, ws } = await connect(s.port);
    ws.close();
    expect(closedCode).toBeNull();
    expect(authActions(s.audit)).toContain('auth.ok');
  });

  // Verifier that THROWS is a deny (fail-closed), never a bypass.
  it('treats a throwing verifyClientCert as deny (fail-closed)', async () => {
    const auth: AuthProvider = { verify: () => true, verifyClientCert: async (): Promise<TenantId | null> => { throw new Error('verifier down'); } };
    const s = await setup(auth, Buffer.from('cert'));
    ctx.server = s.server;

    const { closedCode, ws } = await connect(s.port);
    ws.close();
    expect(closedCode).toBe(4401);
    expect(authActions(s.audit)).toContain('auth.deny');
    expect(authActions(s.audit)).not.toContain('auth.ok');
  });
});
