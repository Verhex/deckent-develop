/**
 * SERVER-LEVEL tenant-scope wiring regression (A1/A2 — anti-IDOR).
 *
 * The existing unit suites for /api/autonomous/lineage and /api/enterprise/missions-audit
 * boot their OWN minimal HTTP server that passes `req` to registerAutonomousRoutes /
 * registerEnterpriseRoutes *directly*. They therefore stay GREEN even when the production
 * handler in src/api/server.ts omits `req` — which is exactly how the cross-tenant audit
 * IDOR shipped live (fix b525d679 became dead code: server.ts called the register fns
 * without the 5th/6th `req` argument).
 *
 * This test drives the REAL createHttpServer handler end-to-end through the OIDC bearer
 * gate. It only passes when server.ts threads `req` to BOTH register functions. With the
 * pre-fix code (req omitted) the lineage branch falls to its `else` (full chain) and
 * missions-audit computes `seeAll = (claims === null)` → both leak cross-tenant rows and
 * the length assertions below fail. This is the regression lock the unit suites cannot be.
 *
 * Hermetic: tmpdir project root; HS256 OIDC gate with an in-test secret; torn down per-test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { writeAuditEvent, _resetChainHead } from '../../src/core/audit-writer.js';
import { auditMissionLifecycle } from '../../src/orchestra/autonomous/mission-store/mission-audit-bridge.js';
/**
 * Server-level command-guard host wiring (A8).
 *
 * The command guard (deny-list for remote `shell` sessions, invariant I3) only
 * fires when the session manager's host is non-localhost. createHttpServer built
 * the PtySessionManager WITHOUT passing the server's bind host, so host defaulted
 * to 'localhost' and the guard was exempt for EVERY session — even on a remote
 * bind. The session-manager unit tests pass a host directly, so they never
 * exercised this wiring (the bug lived only at the server construction site).
 *
 * This drives createHttpServer end-to-end via the test-exposed terminalManager:
 * on a remote bind (0.0.0.0) a denied command must be blocked; on a loopback bind
 * it passes through. Only passes when server.ts threads `host` into the manager.
 *
 * Hermetic: tmpdir projectRoot + injected fake backend; torn down per-test.
 */
import { vi } from "vitest";
import { createHttpServer as createHttpServer__wire_007, type HttpApi as HttpApi__wire_007 } from "../../src/api/server.js";
import type { SessionBackend, BackendHandle } from "../../src/api/terminal/session-backend.js";

const OIDC_SECRET = 'server-wire-test-hs256-secret-key';
const OIDC_ISSUER = 'https://test-issuer.local';
const CORR_ID = 'corr-server-wire-001';

function b64url(s: string): string {
  return Buffer.from(s).toString('base64url');
}

/** Mint a valid HS256 OIDC JWT carrying tenant/role claims (passes the server gate AND deriveRequestPrincipal). */
function mintJwt(claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: OIDC_ISSUER, iat: now, exp: now + 3600, ...claims }));
  const signingInput = `${header}.${payload}`;
  const sig = createHmac('sha256', OIDC_SECRET).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-server-wire-'));
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

async function boot(projectRoot: string): Promise<{ api: HttpApi; baseUrl: string }> {
  const api = createHttpServer(projectRoot, {
    port: 0,
    host: '127.0.0.1',
    oidc: { issuer: OIDC_ISSUER, algorithm: 'HS256', key: OIDC_SECRET },
  });
  await new Promise<void>((resolve) => api.server.once('listening', () => resolve()));
  const addr = api.server.address();
  if (!addr || typeof addr === 'string') {
    await api.close();
    throw new Error('Test server did not bind a port');
  }
  return { api, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe('server.ts threads req → tenant-scope (A1/A2 anti-IDOR, server-level)', () => {
  let projectRoot: string | undefined;
  let api: HttpApi | undefined;

  afterEach(async () => {
    if (api) { try { await api.close(); } catch { /* ignore */ } api = undefined; }
    if (projectRoot) { try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ } projectRoot = undefined; }
    _resetChainHead();
  });

  // A1 — GET /api/autonomous/lineage/:id : OIDC non-admin must NOT see another tenant's chain.
  it('A1 lineage: OIDC non-admin (globex) + acme-only events → scoped empty', async () => {
    projectRoot = makeProjectRoot();
    writeAuditEvent(projectRoot, 'autonomous', { tenantId: 'acme', actor: 'cli', action: 'autonomous:acme', correlationId: CORR_ID });
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-globex', role: 'viewer', tenant: 'globex' });
    const res = await fetch(`${booted.baseUrl}/api/autonomous/lineage/${CORR_ID}`, { headers: { Authorization: `Bearer ${jwt}` } });
    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; totalEvents: number };
    // req threaded → cross-tenant filtered out. Pre-fix (req omitted) returned the full chain (1).
    expect(body.totalEvents).toBe(0);
    expect(body.events).toHaveLength(0);
  });

  // A1 — admin still sees the full chain (proves filtering is principal-based, not a blanket block).
  it('A1 lineage: OIDC admin → full chain visible', async () => {
    projectRoot = makeProjectRoot();
    writeAuditEvent(projectRoot, 'autonomous', { tenantId: 'acme', actor: 'cli', action: 'autonomous:acme', correlationId: CORR_ID });
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-admin', role: 'admin' });
    const res = await fetch(`${booted.baseUrl}/api/autonomous/lineage/${CORR_ID}`, { headers: { Authorization: `Bearer ${jwt}` } });
    expect(res.status).toBe(200);
    const body = await res.json() as { totalEvents: number };
    expect(body.totalEvents).toBe(1);
  });

  // A2 — GET /api/enterprise/missions-audit : OIDC non-admin must NOT see another tenant's mission audit.
  it('A2 missions-audit: OIDC non-admin (globex) + acme-only events → scoped empty', async () => {
    projectRoot = makeProjectRoot();
    auditMissionLifecycle(projectRoot, { tenantId: 'acme', actor: 'cli', action: 'missions:create', missionId: 'm-1', metadata: { kind: 'list', title: 'T' } });
    const booted = await boot(projectRoot); api = booted.api;

    const jwt = mintJwt({ sub: 'u-globex', role: 'viewer', tenant: 'globex' });
    const res = await fetch(`${booted.baseUrl}/api/enterprise/missions-audit`, { headers: { Authorization: `Bearer ${jwt}` } });
    expect(res.status).toBe(200);
    const entries = await res.json() as unknown[];
    // req threaded → cross-tenant filtered out. Pre-fix (req omitted) → seeAll=(claims===null) leaked acme (1).
    expect(entries).toHaveLength(0);
  });
});

// WIRE-007: physically merged from tests/api/terminal/server-command-guard-wire.test.ts.
{
function fakeBackend(): {
    be: SessionBackend;
    handle: BackendHandle;
} {
    const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
    const be: SessionBackend = { spawn: () => handle };
    return { be, handle };
}

const DENIED = 'rm -rf /\n';

let api: HttpApi__wire_007 | undefined;

let projectRoot: string | undefined;

afterEach(async () => {
    if (api) {
        try {
            await api.close();
        }
        catch { /* ignore */ }
        api = undefined;
    }
    if (projectRoot) {
        try {
            rmSync(projectRoot, { recursive: true, force: true });
        }
        catch { /* ignore */ }
        projectRoot = undefined;
    }
});

function boot(host: string, backend: SessionBackend): HttpApi__wire_007 {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-cmdguard-'));
    return createHttpServer__wire_007(projectRoot, { port: 0, host, terminalBackend: backend });
}

describe('server command-guard host wiring (A8)', () => {
    it('remote bind (0.0.0.0): a denied command is blocked (guard enforces)', () => {
        const fb = fakeBackend();
        api = boot('0.0.0.0', fb.be);
        const mgr = api.terminalManager;
        expect(mgr).toBeTruthy();
        const sess = mgr!.create({ kind: 'shell' });
        mgr!.write(sess.id, DENIED);
        // Guard fired → the command never reached the PTY and the session was killed.
        // Pre-fix (host not threaded → defaulted localhost) the guard was exempt and
        // the command passed straight through.
        expect(fb.handle.write).not.toHaveBeenCalled();
        expect(mgr!.get(sess.id)).toBeUndefined();
    });
    it('loopback bind (127.0.0.1): the same command passes through (owner-trusted)', () => {
        const fb = fakeBackend();
        api = boot('127.0.0.1', fb.be);
        const mgr = api.terminalManager;
        const sess = mgr!.create({ kind: 'shell' });
        mgr!.write(sess.id, DENIED);
        // Loopback is exempt by design (invariant I3) → command reaches the PTY.
        expect(fb.handle.write).toHaveBeenCalledWith(DENIED);
    });
});
}
